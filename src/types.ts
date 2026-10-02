export const FAMILIES = [
  "living",
  "object",
  "food",
  "technology",
  "place",
  "phenomenon",
  "activity",
  "abstract",
] as const;

export const SIGNALS = [
  "living",
  "manufactured",
  "portable",
  "indoor",
  "edible",
  "electronic",
  "place",
  "creature",
] as const;

export type Family = (typeof FAMILIES)[number];
export type Signal = (typeof SIGNALS)[number];

export interface Candidate {
  id: string;
  label: string;
  family: Family;
  description: string;
  glyph: string;
  color: string;
}

export interface ScoreDistribution {
  score: number;
  confidence: number;
  probabilities: Record<string, number>;
}

export interface PursuitSnapshot {
  requestId: string;
  clues: string[];
  model: string;
  selected: {
    id: string;
    label: string;
    probability: number;
    confidence: number;
  };
  probabilities: {
    candidates: Record<string, number>;
    families: Record<Family, number>;
  };
  signals: Record<Signal, number>;
  contradiction: number;
  sufficiency: ScoreDistribution;
  latencyMs: number;
  usage: {
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
  };
  cacheHit: boolean;
}

export interface PursuitRequest {
  clues: string[];
  draft?: string;
  requestId: string;
}

export interface PursuitResponse {
  snapshot: PursuitSnapshot;
}

export interface AutoplayFixture {
  recordedAt: string;
  model: string;
  targetId: string;
  clues: string[];
  snapshots: PursuitSnapshot[];
}
