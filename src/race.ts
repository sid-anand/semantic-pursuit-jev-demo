import { CANDIDATES, CANDIDATE_BY_ID } from "./catalog";

export class RaceRenderer {
  private readonly runners = new Map<string, HTMLDivElement>();

  constructor(private readonly field: HTMLElement) {
    for (const [index, candidate] of CANDIDATES.entries()) {
      const runner = document.createElement("div");
      runner.className = "runner";
      runner.setAttribute("role", "listitem");
      runner.dataset.id = candidate.id;
      runner.style.setProperty("--runner-color", candidate.color);
      runner.style.setProperty("--lane", `${((index * 37) % 64) / 64}`);
      runner.innerHTML = `
        <span class="runner-trail"></span>
        <span class="runner-dot">${candidate.glyph}</span>
        <span class="runner-name">${candidate.label}</span>
      `;
      this.field.append(runner);
      this.runners.set(candidate.id, runner);
    }
  }

  update(probabilities: Record<string, number>, previous: Record<string, number> = {}): void {
    const ranked = Object.entries(probabilities).sort((a, b) => b[1] - a[1]);
    const peak = Math.max(ranked[0]?.[1] ?? 0.01, 0.01);
    const top = new Set(ranked.slice(0, 9).map(([id]) => id));

    for (const [index, [id, probability]] of ranked.entries()) {
      const runner = this.runners.get(id);
      if (!runner) continue;
      const relative = Math.sqrt(probability / peak);
      const position = 3 + relative * 88;
      const delta = probability - (previous[id] ?? 0);
      runner.style.setProperty("--position", `${position}%`);
      runner.style.setProperty("--scale", `${0.7 + relative * 0.42}`);
      runner.style.zIndex = String(80 - Math.min(index, 70));
      runner.classList.toggle("front-runner", index === 0);
      runner.classList.toggle("contender", top.has(id));
      runner.classList.toggle("rising", delta > 0.015);
      runner.classList.toggle("falling", delta < -0.015);
      runner.setAttribute(
        "aria-label",
        `${CANDIDATE_BY_ID[id]?.label ?? id}, ${(probability * 100).toFixed(1)} percent`,
      );
    }
  }

  reset(): void {
    for (const runner of this.runners.values()) {
      runner.style.setProperty("--position", "3%");
      runner.style.setProperty("--scale", "0.72");
      runner.className = "runner";
    }
  }
}
