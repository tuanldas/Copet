/**
 * pet-status.test.ts — companion mood label from the 4 core stats.
 */

import { describe, it, expect } from "vitest";
import { petStatusLabel } from "../pet-status.js";
import type { Stats } from "../../../tamagotchi/types.js";

const base: Stats = { hunger: 80, energy: 80, happiness: 80, hygiene: 80 };

describe("petStatusLabel", () => {
  it("all-healthy → 'No căng' (good)", () => {
    expect(petStatusLabel(base)).toEqual({ text: "No căng", tone: "good" });
  });

  it("critical lowest stat names the specific need (bad)", () => {
    expect(petStatusLabel({ ...base, hunger: 20 })).toEqual({ text: "Đói", tone: "bad" });
    expect(petStatusLabel({ ...base, energy: 10 })).toEqual({ text: "Mệt", tone: "bad" });
    expect(petStatusLabel({ ...base, hygiene: 5 })).toEqual({ text: "Cần tắm", tone: "bad" });
    expect(petStatusLabel({ ...base, happiness: 0 })).toEqual({ text: "Buồn", tone: "bad" });
  });

  it("middling lowest → 'Ổn' (warn)", () => {
    expect(petStatusLabel({ ...base, energy: 50 })).toEqual({ text: "Ổn", tone: "warn" });
  });

  it("thresholds: <30 bad, [30,60) warn, >=60 good", () => {
    expect(petStatusLabel({ ...base, hunger: 29 }).tone).toBe("bad");
    expect(petStatusLabel({ ...base, hunger: 30 }).tone).toBe("warn");
    expect(petStatusLabel({ ...base, hunger: 59 }).tone).toBe("warn");
    expect(petStatusLabel({ ...base, hunger: 60 }).tone).toBe("good");
  });

  it("ties resolve to the first-listed stat (hunger before energy)", () => {
    expect(petStatusLabel({ ...base, hunger: 10, energy: 10 }).text).toBe("Đói");
  });
});
