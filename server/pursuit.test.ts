import { describe, expect, it, vi } from "vitest";
import { CANDIDATES } from "../src/catalog.ts";
import { RequestGate } from "../src/request-gate.ts";
import { FAMILIES, SIGNALS, type PursuitSnapshot } from "../src/types.ts";
import {
  estimatedCost,
  normalizeRequest,
  PursuitService,
  requestCacheKey,
} from "./pursuit.ts";

function fakeSnapshot(requestId: string): PursuitSnapshot {
  return {
    requestId,
    clues: ["It is alive"],
    model: "jev-test",
    selected: {
      id: "houseplant",
      label: "Houseplant",
      probability: 0.7,
      confidence: 0.6,
    },
    probabilities: {
      candidates: Object.fromEntries(CANDIDATES.map(({ id }) => [id, id === "houseplant" ? 0.7 : 0.3 / 63])),
      families: Object.fromEntries(FAMILIES.map((family) => [family, family === "living" ? 0.8 : 0.2 / 7])) as PursuitSnapshot["probabilities"]["families"],
    },
    signals: Object.fromEntries(SIGNALS.map((signal) => [signal, signal === "living" ? 0.95 : 0.1])) as PursuitSnapshot["signals"],
    contradiction: 0.02,
    sufficiency: { score: 0.5, confidence: 0.4, probabilities: { "0": 0, "1": 0.1, "2": 0.8, "3": 0.1, "4": 0 } },
    latencyMs: 140,
    usage: { inputTokens: 800, outputTokens: 200, estimatedCostUsd: estimatedCost(800) },
    cacheHit: false,
  };
}

describe("pursuit request validation", () => {
  it("normalizes whitespace and does not retain a browser-only target", () => {
    const result = normalizeRequest({
      clues: ["  It   can die. "],
      draft: " Not an animal ",
      requestId: "request-1",
      targetId: "houseplant",
    });

    expect(result).toEqual({
      clues: ["It can die."],
      draft: "Not an animal",
      requestId: "request-1",
    });
    expect("targetId" in result).toBe(false);
  });

  it("rejects empty or oversized clue sets", () => {
    expect(() => normalizeRequest({ clues: [], requestId: "x" })).toThrow("Add at least one clue");
    expect(() => normalizeRequest({ clues: Array(11).fill("clue"), requestId: "x" })).toThrow("no more than 10");
  });

  it("uses normalized clues for cache identity", () => {
    const first = normalizeRequest({ clues: ["Turns toward LIGHT"], requestId: "a" });
    const second = normalizeRequest({ clues: [" turns  toward light "], requestId: "b" });
    expect(requestCacheKey(first)).toBe(requestCacheKey(second));
  });

  it("treats a live draft and the same committed clue as one semantic state", () => {
    const draft = normalizeRequest({ clues: [], draft: "It grows", requestId: "a" });
    const committed = normalizeRequest({ clues: ["It grows"], requestId: "b" });
    expect(requestCacheKey(draft)).toBe(requestCacheKey(committed));
  });
});

describe("pursuit service", () => {
  it("caches repeated semantic states without counting another live evaluation", async () => {
    const evaluator = vi.fn(async (request) => fakeSnapshot(request.requestId));
    const service = new PursuitService(evaluator);

    const first = await service.evaluate({ clues: ["It is alive"], requestId: "first" });
    const second = await service.evaluate({ clues: ["IT IS ALIVE"], requestId: "second" });

    expect(evaluator).toHaveBeenCalledTimes(1);
    expect(first.cacheHit).toBe(false);
    expect(second.cacheHit).toBe(true);
    expect(second.requestId).toBe("second");
    expect(second.latencyMs).toBe(0);
  });
});

describe("telemetry helpers", () => {
  it("calculates input cost at the documented Jev rate", () => {
    expect(estimatedCost(1_000_000)).toBe(0.042);
    expect(estimatedCost(1_000)).toBeCloseTo(0.000042);
  });

  it("identifies stale responses", () => {
    const gate = new RequestGate();
    const oldRequest = gate.next();
    const currentRequest = gate.next();
    expect(gate.isCurrent(oldRequest)).toBe(false);
    expect(gate.isCurrent(currentRequest)).toBe(true);
  });
});
