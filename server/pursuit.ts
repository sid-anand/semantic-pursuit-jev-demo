import { choice, noul, score, TypeSafeClient } from "@typesafe-ai/sdk";
import { CANDIDATES, CANDIDATE_BY_ID, FAMILY_LABELS } from "../src/catalog.ts";
import {
  FAMILIES,
  SIGNALS,
  type Family,
  type PursuitRequest,
  type PursuitSnapshot,
  type Signal,
} from "../src/types.ts";

const INPUT_PRICE_PER_MILLION = 0.042;
const MAX_CLUES = 10;
const MAX_CLUE_LENGTH = 180;
const MAX_TOTAL_LENGTH = 1_200;

const candidateCriteria = Object.fromEntries(
  CANDIDATES.map(({ id, description }) => [id, description]),
);

const PURSUIT_QUESTIONS = {
  candidate: choice(
    "Which candidate best matches all clues together? Treat negations, metaphors, relationships, and later corrections as meaningful. Pick the best available candidate even when evidence is incomplete.",
    candidateCriteria,
  ),
  family: choice(
    "Which broad family best matches the thing described by all clues?",
    FAMILY_LABELS,
  ),
  living: noul("Is the described thing biologically alive?"),
  manufactured: noul("Is the described thing primarily manufactured or constructed by people?"),
  portable: noul("Can a person ordinarily pick up and carry the described thing?"),
  indoor: noul("Is the described thing ordinarily found or performed indoors?"),
  edible: noul("Is the described thing ordinarily eaten or drunk by people?"),
  electronic: noul("Does the described thing fundamentally depend on electronic components?"),
  place: noul("Is the described thing a location that a person can physically enter or visit?"),
  creature: noul("Is the described thing an animal or animal-like creature?"),
  contradiction: noul(
    "Do the clues materially conflict such that they cannot all naturally describe one thing?",
  ),
  sufficiency: score("How sufficient are the clues to identify one candidate over the alternatives?", [
    "No useful evidence; nearly every candidate remains plausible",
    "A broad family may be apparent, but many candidates remain plausible",
    "Several clues narrow the field, but multiple candidates still fit well",
    "One candidate is strongly favored, with only a few credible alternatives",
    "The clues identify one candidate clearly and distinctively",
  ]),
} as const;

export interface PursuitEvaluator {
  (request: PursuitRequest): Promise<PursuitSnapshot>;
}

export function normalizeRequest(input: unknown): PursuitRequest {
  if (!input || typeof input !== "object") throw new Error("Request body must be an object.");
  const value = input as Partial<PursuitRequest>;
  if (!Array.isArray(value.clues)) throw new Error("Clues must be an array.");
  if (value.clues.length > MAX_CLUES) throw new Error(`Use no more than ${MAX_CLUES} clues.`);

  const clues = value.clues.map((clue) => {
    if (typeof clue !== "string") throw new Error("Every clue must be text.");
    const normalized = clue.trim().replace(/\s+/g, " ");
    if (!normalized || normalized.length > MAX_CLUE_LENGTH) {
      throw new Error(`Each clue must contain 1 to ${MAX_CLUE_LENGTH} characters.`);
    }
    return normalized;
  });

  let draft: string | undefined;
  if (typeof value.draft === "string" && value.draft.trim()) {
    draft = value.draft.trim().replace(/\s+/g, " ");
    if (draft.length > MAX_CLUE_LENGTH) {
      throw new Error(`A draft clue cannot exceed ${MAX_CLUE_LENGTH} characters.`);
    }
  }

  const totalLength = clues.join(" ").length + (draft?.length ?? 0);
  if (totalLength === 0) throw new Error("Add at least one clue.");
  if (totalLength > MAX_TOTAL_LENGTH) throw new Error("The clue history is too long.");

  const requestId = typeof value.requestId === "string" && value.requestId.length <= 80
    ? value.requestId
    : crypto.randomUUID();

  return { clues, ...(draft ? { draft } : {}), requestId };
}

export function requestCacheKey(request: PursuitRequest): string {
  const activeClues = request.draft ? [...request.clues, request.draft] : request.clues;
  return JSON.stringify(activeClues.map((clue) => clue.toLocaleLowerCase()));
}

export function estimatedCost(inputTokens: number): number {
  return inputTokens / 1_000_000 * INPUT_PRICE_PER_MILLION;
}

function recordFor<T extends string>(
  labels: readonly T[],
  values: Readonly<Record<string, number>>,
): Record<T, number> {
  return Object.fromEntries(labels.map((label) => [label, values[label] ?? 0])) as Record<T, number>;
}

export async function evaluateWithJev(request: PursuitRequest): Promise<PursuitSnapshot> {
  if (!process.env.TYPESAFE_API_KEY?.trim()) {
    throw new Error("TYPESAFE_API_KEY is not configured.");
  }

  const startedAt = performance.now();
  const client = new TypeSafeClient();
  const activeClues = request.draft ? [...request.clues, request.draft] : request.clues;
  const response = await client.systemOne({
    model: "jev-latest",
    state: {
      clue_history: activeClues.map((text, index) => ({
        order: index + 1,
        text,
      })),
      task: "Infer the single hidden concept described by the accumulated clues.",
    },
    questions: PURSUIT_QUESTIONS,
  });

  const answers = response.answers;
  const candidateId = answers.candidate.choice;
  const selected = CANDIDATE_BY_ID[candidateId];
  if (!selected) throw new Error(`Jev returned an unknown candidate: ${candidateId}`);

  const candidateProbabilities = recordFor(
    CANDIDATES.map(({ id }) => id),
    answers.candidate.probabilities,
  );
  const signals = Object.fromEntries(
    SIGNALS.map((signal) => [signal, answers[signal].noul]),
  ) as Record<Signal, number>;

  return {
    requestId: request.requestId,
    clues: activeClues,
    model: response.model,
    selected: {
      id: selected.id,
      label: selected.label,
      probability: candidateProbabilities[selected.id] ?? 0,
      confidence: answers.candidate.confidence,
    },
    probabilities: {
      candidates: candidateProbabilities,
      families: recordFor(FAMILIES, answers.family.probabilities) as Record<Family, number>,
    },
    signals,
    contradiction: answers.contradiction.noul,
    sufficiency: {
      score: answers.sufficiency.score / 4,
      confidence: answers.sufficiency.confidence,
      probabilities: { ...answers.sufficiency.probabilities },
    },
    latencyMs: Math.round(performance.now() - startedAt),
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      estimatedCostUsd: estimatedCost(response.usage.input_tokens),
    },
    cacheHit: false,
  };
}

export class PursuitService {
  private readonly cache = new Map<string, PursuitSnapshot>();

  constructor(private readonly evaluator: PursuitEvaluator = evaluateWithJev) {}

  async evaluate(input: unknown): Promise<PursuitSnapshot> {
    const request = normalizeRequest(input);
    const key = requestCacheKey(request);
    const cached = this.cache.get(key);
    if (cached) {
      return {
        ...structuredClone(cached),
        requestId: request.requestId,
        latencyMs: 0,
        cacheHit: true,
      };
    }

    const snapshot = await this.evaluator(request);
    this.cache.set(key, structuredClone(snapshot));
    return snapshot;
  }

  clear(): void {
    this.cache.clear();
  }
}
