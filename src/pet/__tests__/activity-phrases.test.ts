/**
 * activity-phrases.test.ts — toolPhrase mapping, extension hints, determinism.
 * Pure logic, no DOM.
 */

import { describe, it, expect } from "vitest";
import { toolPhrase } from "../activity-phrases.js";

describe("toolPhrase", () => {
  it("maps tools to their category pool", () => {
    const running = ["Compiling…", "Building…", "Executing…", "Running it…", "Crunching…"];
    const reading = ["Inspecting…", "Reviewing…", "Parsing…", "Auditing…", "Skimming…"];
    expect(running).toContain(toolPhrase("Bash", undefined, "s1"));
    expect(reading).toContain(toolPhrase("Read", undefined, "s1"));
  });

  it("never echoes the raw tool name", () => {
    expect(toolPhrase("Bash", undefined, "s1")).not.toBe("Bash");
  });

  it("uses file-type hints over the generic pool", () => {
    expect(toolPhrase("Edit", "src/foo.test.ts", "s1")).toBe("Refining tests…");
    expect(toolPhrase("Read", "src/foo.spec.tsx", "s1")).toBe("Reviewing tests…");
    expect(toolPhrase("Write", "README.md", "s1")).toBe("Updating the docs…");
    expect(toolPhrase("Read", "CHANGELOG.md", "s1")).toBe("Reading the docs…");
  });

  it("ignores doc/test hints for non read/write tools", () => {
    // A Bash command that merely mentions a .md file must not become a doc hint.
    const running = ["Compiling…", "Building…", "Executing…", "Running it…", "Crunching…"];
    expect(running).toContain(toolPhrase("Bash", "cat README.md", "s1"));
  });

  it("is deterministic for the same (seed, tool)", () => {
    expect(toolPhrase("Bash", undefined, "sessX")).toBe(toolPhrase("Bash", undefined, "sessX"));
  });

  it("varies the pick across different seeds", () => {
    // Across many seeds the running pool (size 5) must yield >1 distinct phrase.
    const seen = new Set(Array.from({ length: 20 }, (_, i) => toolPhrase("Bash", undefined, `s${i}`)));
    expect(seen.size).toBeGreaterThan(1);
  });

  it("falls back to a generic phrase for unknown or empty tools", () => {
    const generic = ["Working…", "Tinkering…", "On it…", "Doing the thing…"];
    expect(generic).toContain(toolPhrase("SomeMcpTool", undefined, "s1"));
    expect(generic).toContain(toolPhrase("", undefined, "s1"));
  });
});
