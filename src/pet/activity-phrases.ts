/**
 * activity-phrases.ts — maps a raw tool name to a friendly "activity" phrase
 * ("Bash" → "Compiling…") for the pet's working line. A trimmed, single-theme
 * port of agentpet's ClaudeActivityFormatter.
 *
 * Pure + deterministic: the phrase is picked by a djb2 hash of (seed + tool), so
 * a given session+tool always renders the same phrase (stable across re-renders
 * and unit tests) while different sessions vary. No Math.random / Date — those
 * would make renders non-deterministic.
 */

/** Phrase pools keyed by tool category (one theme; structure allows more later). */
const POOLS: Record<string, string[]> = {
  reading: ["Inspecting…", "Reviewing…", "Parsing…", "Auditing…", "Skimming…"],
  writing: ["Refactoring…", "Implementing…", "Patching…", "Scaffolding…", "Polishing…"],
  running: ["Compiling…", "Building…", "Executing…", "Running it…", "Crunching…"],
  searching: ["Scanning…", "Grepping…", "Indexing…", "Tracing…", "Hunting…"],
  delegating: ["Spawning a task…", "Dispatching…", "Delegating…", "Rounding up help…"],
  generic: ["Working…", "Tinkering…", "On it…", "Doing the thing…"],
};

/** Map a tool name to its phrase pool. */
function poolFor(tool: string): string[] {
  switch (tool) {
    case "Read":
      return POOLS.reading;
    case "Edit":
    case "Write":
    case "MultiEdit":
      return POOLS.writing;
    case "Bash":
      return POOLS.running;
    case "Glob":
    case "Grep":
    case "WebSearch":
    case "WebFetch":
      return POOLS.searching;
    case "Task":
    case "Agent":
      return POOLS.delegating;
    default:
      return POOLS.generic;
  }
}

/**
 * File-type hints that beat the generic tool pool (e.g. editing a test file →
 * "Refining tests…"). `file` is the condensed tool input (often a basename).
 */
function extensionHint(tool: string, file: string | undefined): string | null {
  if (!file) return null;
  const f = file.toLowerCase();
  const isTest =
    /\.(test|spec)\.[jt]sx?$/.test(f) || f.includes("__tests__") || f.includes("tests/");
  const isDoc = f.endsWith(".md") || f.endsWith(".txt") || f.endsWith(".rst");
  const isRead = tool === "Read";
  const isWrite = tool === "Edit" || tool === "Write" || tool === "MultiEdit";
  if (isTest && isRead) return "Reviewing tests…";
  if (isTest && isWrite) return "Refining tests…";
  if (isDoc && isRead) return "Reading the docs…";
  if (isDoc && isWrite) return "Updating the docs…";
  return null;
}

/** Stable djb2 hash → non-negative int, for a deterministic pool pick. */
function hash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 33) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Friendly phrase for a tool. A matching file-type hint wins; otherwise a
 * deterministic pick from the tool's pool (seeded by `seed`, e.g. the session
 * id, so it's stable per session). Empty/unknown tool → a generic phrase.
 */
export function toolPhrase(tool: string, file?: string, seed = ""): string {
  if (!tool) return POOLS.generic[0];
  const hint = extensionHint(tool, file);
  if (hint) return hint;
  const pool = poolFor(tool);
  return pool[hash(seed + tool) % pool.length];
}
