import "./style.css";
import { CANDIDATES, CANDIDATE_BY_ID, FAMILY_LABELS } from "./catalog";
import { RaceRenderer } from "./race";
import { RequestGate } from "./request-gate";
import {
  SIGNALS,
  type AutoplayFixture,
  type PursuitResponse,
  type PursuitSnapshot,
  type Signal,
} from "./types";

const $ = <T extends Element>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing interface element: ${selector}`);
  return element;
};

const elements = {
  latency: $<HTMLElement>("#latency"),
  callCount: $<HTMLElement>("#call-count"),
  tokenCount: $<HTMLElement>("#token-count"),
  costCount: $<HTMLElement>("#cost-count"),
  enginePill: $<HTMLElement>("#engine-pill"),
  engineLabel: $<HTMLElement>("#engine-label"),
  targetButton: $<HTMLButtonElement>("#target-button"),
  targetGlyph: $<HTMLElement>("#target-glyph"),
  targetLabel: $<HTMLElement>("#target-label"),
  clueList: $<HTMLOListElement>("#clue-list"),
  clueForm: $<HTMLFormElement>("#clue-form"),
  clueInput: $<HTMLTextAreaElement>("#clue-input"),
  sendButton: $<HTMLButtonElement>("#send-button"),
  clearButton: $<HTMLButtonElement>("#clear-button"),
  newRoundButton: $<HTMLButtonElement>("#new-round-button"),
  autoplayButton: $<HTMLButtonElement>("#autoplay-button"),
  revealButton: $<HTMLButtonElement>("#reveal-button"),
  resultCard: $<HTMLElement>("#result-card"),
  resultTitle: $<HTMLElement>("#result-title"),
  resultCopy: $<HTMLElement>("#result-copy"),
  turningPoints: $<HTMLElement>("#turning-points"),
  modeBadge: $<HTMLElement>("#mode-badge"),
  raceHeading: $<HTMLElement>("#race-heading"),
  leaderGlyph: $<HTMLElement>("#leader-glyph"),
  leaderLabel: $<HTMLElement>("#leader-label"),
  leaderProbability: $<HTMLElement>("#leader-probability"),
  confidenceBar: $<HTMLElement>("#confidence-bar"),
  confidenceValue: $<HTMLElement>("#confidence-value"),
  rankList: $<HTMLElement>("#rank-list"),
  distributionList: $<HTMLElement>("#distribution-list"),
  signalGrid: $<HTMLElement>("#signal-grid"),
  sufficiencyValue: $<HTMLElement>("#sufficiency-value"),
  sufficiencyBar: $<HTMLElement>("#sufficiency-bar"),
  contradictionValue: $<HTMLElement>("#contradiction-value"),
  contradictionBar: $<HTMLElement>("#contradiction-bar"),
  modelLabel: $<HTMLElement>("#model-label"),
  cacheLabel: $<HTMLElement>("#cache-label"),
  targetDialog: $<HTMLDialogElement>("#target-dialog"),
  targetGrid: $<HTMLElement>("#target-grid"),
  blockingState: $<HTMLElement>("#blocking-state"),
  toast: $<HTMLElement>("#toast"),
};

const renderer = new RaceRenderer($<HTMLElement>("#race-field"));
const MIN_REQUEST_INTERVAL_MS = 500;

let targetId: string | null = null;
let clues: string[] = [];
let snapshots: PursuitSnapshot[] = [];
let latestSnapshot: PursuitSnapshot | null = null;
const requestGate = new RequestGate();
let evaluating = false;
let pendingEvaluation = false;
let queuedDraft: string | undefined;
let debounceTimer = 0;
let lastRequestAt = 0;
let autoplayTimer = 0;
let jevCalls = 0;
let totalTokens = 0;
let totalCost = 0;
let toastTimer = 0;

function percent(value: number, precision = 0): string {
  return `${(value * 100).toFixed(precision)}%`;
}

function showToast(message: string): void {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  toastTimer = window.setTimeout(() => elements.toast.classList.remove("visible"), 4200);
}

function renderTargetPicker(): void {
  const groups = new Map<string, HTMLElement>();
  for (const candidate of CANDIDATES) {
    let group = groups.get(candidate.family);
    if (!group) {
      group = document.createElement("section");
      group.className = "target-group";
      group.innerHTML = `<h3>${FAMILY_LABELS[candidate.family]}</h3><div></div>`;
      groups.set(candidate.family, group);
      elements.targetGrid.append(group);
    }

    const button = document.createElement("button");
    button.type = "button";
    button.dataset.targetId = candidate.id;
    button.style.setProperty("--candidate-color", candidate.color);
    button.innerHTML = `<i>${candidate.glyph}</i><span>${candidate.label}</span>`;
    group.querySelector("div")!.append(button);
  }
}

function renderClues(draft?: string): void {
  elements.clueList.replaceChildren();
  if (clues.length === 0 && !draft) {
    const empty = document.createElement("li");
    empty.className = "empty-clue";
    empty.textContent = "No clues yet. Be indirect.";
    elements.clueList.append(empty);
    return;
  }

  for (const [index, clue] of clues.entries()) {
    const item = document.createElement("li");
    item.innerHTML = `<span>${String(index + 1).padStart(2, "0")}</span><p>${escapeHtml(clue)}</p>`;
    elements.clueList.append(item);
  }

  if (draft) {
    const item = document.createElement("li");
    item.className = "draft";
    item.innerHTML = `<span>··</span><p>${escapeHtml(draft)}</p><i>live</i>`;
    elements.clueList.append(item);
  }
  elements.clueList.scrollTop = elements.clueList.scrollHeight;
}

function escapeHtml(value: string): string {
  const node = document.createElement("span");
  node.textContent = value;
  return node.innerHTML;
}

function updateTelemetry(snapshot?: PursuitSnapshot): void {
  elements.latency.textContent = snapshot
    ? snapshot.cacheHit ? "cache" : `${snapshot.latencyMs} ms`
    : "—";
  elements.callCount.textContent = String(jevCalls);
  elements.tokenCount.textContent = `${totalTokens.toLocaleString()} tok`;
  elements.costCount.textContent = `$${totalCost.toFixed(6)}`;
}

function resetTelemetry(): void {
  jevCalls = 0;
  totalTokens = 0;
  totalCost = 0;
  updateTelemetry();
}

function sortedCandidates(snapshot: PursuitSnapshot): Array<[string, number]> {
  return Object.entries(snapshot.probabilities.candidates).sort((a, b) => b[1] - a[1]);
}

function deltaFor(id: string, probability: number): number {
  const prior = snapshots.at(-2)?.probabilities.candidates[id] ?? 0;
  return probability - prior;
}

function renderSnapshot(snapshot: PursuitSnapshot): void {
  const previous = latestSnapshot?.probabilities.candidates;
  latestSnapshot = snapshot;
  snapshots.push(snapshot);
  renderer.update(snapshot.probabilities.candidates, previous);
  updateTelemetry(snapshot);

  const selected = CANDIDATE_BY_ID[snapshot.selected.id]!;
  elements.leaderGlyph.textContent = selected.glyph;
  elements.leaderGlyph.style.color = selected.color;
  elements.leaderLabel.textContent = selected.label;
  elements.leaderProbability.textContent = percent(snapshot.selected.probability, 1);
  elements.confidenceValue.textContent = percent(snapshot.selected.confidence);
  elements.confidenceBar.style.width = percent(snapshot.selected.confidence);
  elements.raceHeading.textContent = snapshot.selected.confidence > 0.7
    ? "The field is converging."
    : "Every clue moves the field.";
  elements.modelLabel.textContent = snapshot.model;
  elements.cacheLabel.textContent = snapshot.cacheHit ? "cached state" : `${snapshot.usage.inputTokens} input tokens`;

  const ranked = sortedCandidates(snapshot).slice(0, 10);
  elements.rankList.replaceChildren(...ranked.map(([id, probability], index) => {
    const candidate = CANDIDATE_BY_ID[id]!;
    const delta = deltaFor(id, probability);
    const item = document.createElement("div");
    item.className = `rank-item ${index === 0 ? "leader" : ""}`;
    item.innerHTML = `
      <span>${String(index + 1).padStart(2, "0")}</span>
      <i style="color:${candidate.color}">${candidate.glyph}</i>
      <strong>${candidate.label}</strong>
      <em class="${delta > 0.001 ? "up" : delta < -0.001 ? "down" : ""}">
        ${Math.abs(delta) < 0.001 ? "—" : `${delta > 0 ? "+" : ""}${percent(delta, 1)}`}
      </em>
    `;
    return item;
  }));

  const peak = ranked[0]?.[1] ?? 1;
  elements.distributionList.replaceChildren(...ranked.slice(0, 7).map(([id, probability], index) => {
    const candidate = CANDIDATE_BY_ID[id]!;
    const delta = deltaFor(id, probability);
    const row = document.createElement("div");
    row.className = "distribution-row";
    row.innerHTML = `
      <span class="distribution-rank">${index + 1}</span>
      <span class="distribution-name">${candidate.label}</span>
      <div class="distribution-track"><i style="width:${percent(probability / Math.max(peak, 0.001))};background:${candidate.color}"></i></div>
      <b>${percent(probability, 1)}</b>
      <em class="${delta > 0.001 ? "up" : delta < -0.001 ? "down" : ""}">
        ${Math.abs(delta) < 0.001 ? "—" : `${delta > 0 ? "+" : ""}${percent(delta, 1)}`}
      </em>
    `;
    return row;
  }));

  elements.signalGrid.replaceChildren(...SIGNALS.map((signal) => renderSignal(signal, snapshot.signals[signal])));
  elements.sufficiencyValue.textContent = percent(snapshot.sufficiency.score);
  elements.sufficiencyBar.style.width = percent(snapshot.sufficiency.score);
  elements.contradictionValue.textContent = percent(snapshot.contradiction);
  elements.contradictionBar.style.width = percent(snapshot.contradiction);
}

function renderSignal(signal: Signal, value: number): HTMLElement {
  const item = document.createElement("div");
  item.className = "signal";
  item.innerHTML = `
    <div><span>${signal}</span><b>${percent(value)}</b></div>
    <div class="signal-track"><i style="width:${percent(value)}"></i></div>
  `;
  return item;
}

function setTarget(id: string): void {
  const candidate = CANDIDATE_BY_ID[id];
  if (!candidate) return;
  targetId = id;
  resetRound();
  elements.targetGlyph.textContent = candidate.glyph;
  elements.targetGlyph.style.color = candidate.color;
  elements.targetLabel.textContent = candidate.label;
  elements.clueInput.disabled = false;
  elements.sendButton.disabled = false;
  elements.modeBadge.textContent = "Live Jev pursuit";
  elements.targetDialog.close();
  elements.clueInput.focus();
}

function resetRound(): void {
  clues = [];
  snapshots = [];
  latestSnapshot = null;
  // Invalidates any in-flight evaluation so the previous round cannot render into this one.
  requestGate.next("round");
  pendingEvaluation = false;
  queuedDraft = undefined;
  clearTimeout(debounceTimer);
  elements.clueInput.value = "";
  elements.resultCard.hidden = true;
  elements.revealButton.disabled = true;
  resetTelemetry();
  renderer.reset();
  renderClues();
  clearEvidence();
}

function clearEvidence(): void {
  elements.leaderGlyph.textContent = "—";
  elements.leaderLabel.textContent = "Waiting for a clue";
  elements.leaderProbability.textContent = "—";
  elements.confidenceValue.textContent = "—";
  elements.confidenceBar.style.width = "0";
  elements.rankList.replaceChildren();
  elements.distributionList.innerHTML = `<p class="empty-state">Probabilities appear with the first clue.</p>`;
  elements.signalGrid.replaceChildren();
  elements.sufficiencyValue.textContent = "—";
  elements.sufficiencyBar.style.width = "0";
  elements.contradictionValue.textContent = "—";
  elements.contradictionBar.style.width = "0";
  elements.raceHeading.textContent = "Every clue moves the field.";
  elements.cacheLabel.textContent = "";
}

function queueEvaluation(draft?: string): void {
  if (clues.length === 0 && (!draft || draft.trim().length < 3)) return;
  queuedDraft = draft?.trim() || undefined;
  pendingEvaluation = true;
  requestGate.next();
  void drainEvaluationQueue();
}

async function drainEvaluationQueue(): Promise<void> {
  if (evaluating) return;
  evaluating = true;

  while (pendingEvaluation) {
    pendingEvaluation = false;
    const draft = queuedDraft;
    queuedDraft = undefined;
    const requestId = requestGate.next("state");
    const wait = Math.max(0, MIN_REQUEST_INTERVAL_MS - (performance.now() - lastRequestAt));
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    lastRequestAt = performance.now();
    elements.modeBadge.textContent = "Jev evaluating…";

    try {
      const response = await fetch("/api/pursuit/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clues, ...(draft ? { draft } : {}), requestId }),
      });
      const body = await response.json() as PursuitResponse & { error?: string };
      if (!response.ok || !body.snapshot) throw new Error(body.error ?? "Jev could not evaluate the clues.");
      if (!requestGate.isCurrent(body.snapshot.requestId)) continue;

      if (!body.snapshot.cacheHit) {
        jevCalls += 1;
        totalTokens += body.snapshot.usage.inputTokens;
        totalCost += body.snapshot.usage.estimatedCostUsd;
      }
      renderSnapshot(body.snapshot);
      elements.modeBadge.textContent = body.snapshot.cacheHit ? "Cached Jev state" : "Live Jev pursuit";
      elements.revealButton.disabled = !targetId;
    } catch (error) {
      elements.modeBadge.textContent = "Evaluation paused";
      showToast(error instanceof Error ? error.message : "Jev could not evaluate the clues.");
    }

  }
  evaluating = false;
}

function commitClue(): void {
  const clue = elements.clueInput.value.trim();
  if (!targetId) {
    elements.targetDialog.showModal();
    return;
  }
  if (!clue || clues.length >= 10) return;
  clues.push(clue);
  elements.clueInput.value = "";
  renderClues();
  queueEvaluation();
}

function reveal(): void {
  if (!targetId || !latestSnapshot) return;
  const ranking = sortedCandidates(latestSnapshot);
  const rank = ranking.findIndex(([id]) => id === targetId) + 1;
  const target = CANDIDATE_BY_ID[targetId]!;
  const finalProbability = latestSnapshot.probabilities.candidates[targetId] ?? 0;
  elements.resultCard.hidden = false;
  elements.resultTitle.textContent = rank === 1 ? "Jev found it." : `${target.label} finished #${rank}.`;
  elements.resultCopy.textContent = rank === 1
    ? `${target.label} reached the lead at ${percent(finalProbability, 1)} after ${clues.length} clue${clues.length === 1 ? "" : "s"}.`
    : `Jev's final probability for ${target.label} was ${percent(finalProbability, 1)}. Its top pick was ${latestSnapshot.selected.label}.`;

  elements.turningPoints.replaceChildren(...snapshots.map((snapshot, index) => {
    const probability = snapshot.probabilities.candidates[targetId!] ?? 0;
    const item = document.createElement("div");
    item.innerHTML = `<span>${index + 1}</span><i style="height:${Math.max(3, probability * 44)}px"></i><b>${percent(probability, 0)}</b>`;
    return item;
  }));
  elements.resultCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function autoplay(): Promise<void> {
  clearTimeout(autoplayTimer);
  resetRound();
  targetId = null;
  elements.clueInput.disabled = true;
  elements.sendButton.disabled = true;
  elements.targetLabel.textContent = "Hidden during replay";
  elements.targetGlyph.textContent = "●";
  elements.targetGlyph.style.color = "#9cff8b";
  elements.modeBadge.textContent = "Recorded Jev run";

  try {
    const response = await fetch("/autoplay-houseplant.json");
    if (!response.ok) throw new Error("Recorded demo is unavailable.");
    const fixture = await response.json() as AutoplayFixture;
    jevCalls = fixture.snapshots.length;
    totalTokens = fixture.snapshots.reduce((sum, snapshot) => sum + snapshot.usage.inputTokens, 0);
    totalCost = fixture.snapshots.reduce((sum, snapshot) => sum + snapshot.usage.estimatedCostUsd, 0);
    for (let index = 0; index < fixture.snapshots.length; index += 1) {
      clues = fixture.clues.slice(0, index + 1);
      renderClues();
      renderSnapshot(fixture.snapshots[index]!);
      elements.modeBadge.textContent = "Recorded Jev run";
      if (index < fixture.snapshots.length - 1) {
        await new Promise<void>((resolve) => {
          autoplayTimer = window.setTimeout(resolve, 1_050);
        });
      }
    }
    elements.targetLabel.textContent = "Houseplant";
    elements.raceHeading.textContent = "Four clues. One clear answer.";
  } catch (error) {
    showToast(error instanceof Error ? error.message : "The recorded demo could not load.");
    elements.newRoundButton.focus();
  }
}

async function checkStatus(): Promise<void> {
  try {
    const response = await fetch("/api/status");
    const status = await response.json() as { ready: boolean; model: string | null };
    elements.enginePill.dataset.ready = String(status.ready);
    elements.engineLabel.textContent = status.ready ? "Jev live" : "Jev key required";
    elements.blockingState.hidden = status.ready;
    if (status.ready) await autoplay();
  } catch {
    elements.engineLabel.textContent = "Server unavailable";
    elements.blockingState.hidden = false;
  }
}

renderTargetPicker();
clearEvidence();
updateTelemetry();

elements.targetButton.addEventListener("click", () => elements.targetDialog.showModal());
elements.newRoundButton.addEventListener("click", () => elements.targetDialog.showModal());
elements.autoplayButton.addEventListener("click", () => void autoplay());
elements.clearButton.addEventListener("click", resetRound);
elements.revealButton.addEventListener("click", reveal);

elements.targetGrid.addEventListener("click", (event) => {
  const button = (event.target as Element).closest<HTMLButtonElement>("[data-target-id]");
  if (button?.dataset.targetId) setTarget(button.dataset.targetId);
});

elements.clueForm.addEventListener("submit", (event) => {
  event.preventDefault();
  commitClue();
});

elements.clueInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    commitClue();
  }
});

elements.clueInput.addEventListener("input", () => {
  clearTimeout(debounceTimer);
  const draft = elements.clueInput.value.trim();
  renderClues(draft || undefined);
  debounceTimer = window.setTimeout(() => queueEvaluation(draft), 450);
});

void checkStatus();
