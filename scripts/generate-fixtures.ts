import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PursuitService } from "../server/pursuit.ts";
import type { AutoplayFixture } from "../src/types.ts";

const clues = [
  "It can die, but it isn't an animal.",
  "People often keep one close to a window.",
  "It grows quietly and turns toward the light.",
  "You might water it more often than you talk to it.",
];

if (!process.env.TYPESAFE_API_KEY?.trim()) {
  throw new Error("TYPESAFE_API_KEY is required to record autoplay fixtures.");
}

const service = new PursuitService();
const snapshots = [];

for (let index = 0; index < clues.length; index += 1) {
  const snapshot = await service.evaluate({
    clues: clues.slice(0, index + 1),
    requestId: `recorded-${index + 1}`,
  });
  snapshots.push(snapshot);
  console.log(
    `Step ${index + 1}: ${snapshot.selected.label} ${(snapshot.selected.probability * 100).toFixed(1)}% · ${snapshot.latencyMs} ms · ${snapshot.usage.inputTokens} tokens`,
  );
}

const fixture: AutoplayFixture = {
  recordedAt: new Date().toISOString(),
  model: snapshots.at(-1)?.model ?? "jev-latest",
  targetId: "houseplant",
  clues,
  snapshots,
};

const publicDirectory = resolve("public");
await mkdir(publicDirectory, { recursive: true });
await writeFile(
  resolve(publicDirectory, "autoplay-houseplant.json"),
  `${JSON.stringify(fixture, null, 2)}\n`,
  "utf8",
);

const totalCost = snapshots.reduce((sum, snapshot) => sum + snapshot.usage.estimatedCostUsd, 0);
console.log(`Recorded ${snapshots.length} steps. Estimated Jev cost: $${totalCost.toFixed(6)}`);
