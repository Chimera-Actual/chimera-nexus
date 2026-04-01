/**
 * @file Scans .claude/agents/ for agent definition markdown files.
 *
 * Discovers agent definitions stored as markdown notes under `.claude/agents/`
 * and parses their YAML frontmatter into {@link AgentDefinition} objects.
 */

import { normalizePath, Vault } from "obsidian";
import { AgentDefinition } from "../types";
import { parseFrontmatter } from "../../utils/frontmatter";

const AGENTS_BASE = ".claude/agents";

/**
 * Discovers agent definitions from the vault's `.claude/agents/` folder.
 *
 * Each `.md` file in the folder is parsed as an agent definition. Frontmatter
 * fields (snake_case in YAML) are mapped to the camelCase fields of
 * {@link AgentDefinition}. The markdown body after the frontmatter block
 * becomes the agent's `systemPrompt`. Sensible defaults are applied for every
 * optional field so that callers always receive a fully-populated object.
 *
 * Missing directories and unreadable files are handled gracefully.
 */
export class AgentLoader {
  /**
   * @param vault - The Obsidian Vault instance used to traverse folders.
   */
  constructor(private readonly vault: Vault) {}

  /**
   * Scans `.claude/agents/` and returns a definition for each agent note found.
   *
   * If the directory does not exist an empty array is returned. Files that
   * cannot be read or parsed are logged with `console.warn` and skipped so
   * that a single bad entry never blocks the rest.
   *
   * @returns Array of parsed agent definitions.
   */
  async loadAgents(): Promise<AgentDefinition[]> {
    const baseExists = await this.vault.adapter.exists(AGENTS_BASE);
    if (!baseExists) {
      return [];
    }

    let listing: { files: string[]; folders: string[] };
    try {
      listing = await this.vault.adapter.list(AGENTS_BASE);
    } catch (err) {
      console.warn(`[AgentLoader] Failed to list ${AGENTS_BASE}:`, err);
      return [];
    }

    const agents: AgentDefinition[] = [];

    for (const filePath of listing.files) {
      if (!filePath.endsWith(".md")) {
        continue;
      }

      try {
        const normalized = normalizePath(filePath);
        const content = await this.vault.adapter.read(normalized);
        const { frontmatter, body } = parseFrontmatter(content);

        // Derive the agent name from the file stem as a fallback.
        const stem = filePath.split("/").pop() ?? filePath;
        const stemName = stem.endsWith(".md") ? stem.slice(0, -3) : stem;

        const name =
          typeof frontmatter["name"] === "string" && frontmatter["name"].trim() !== ""
            ? frontmatter["name"].trim()
            : stemName;

        const description =
          typeof frontmatter["description"] === "string"
            ? frontmatter["description"]
            : "";

        const model =
          typeof frontmatter["model"] === "string" && frontmatter["model"].trim() !== ""
            ? frontmatter["model"].trim()
            : "sonnet";

        const rawType = frontmatter["type"];
        const type: "standard" | "orchestrator" =
          rawType === "orchestrator" ? "orchestrator" : "standard";

        const allowedTools = toStringArray(frontmatter["allowed_tools"]);
        const deniedTools = toStringArray(frontmatter["denied_tools"]);

        const rawIsolation = frontmatter["isolation"];
        const isolation: "none" | "worktree" =
          rawIsolation === "worktree" ? "worktree" : "none";

        const rawMemory = frontmatter["memory"];
        const memory: "none" | "vault" | "user" =
          rawMemory === "none" ? "none" : rawMemory === "user" ? "user" : "vault";

        const rawMaxTokens = frontmatter["max_tokens"];
        const maxTokens: number | undefined =
          typeof rawMaxTokens === "number" ? rawMaxTokens : undefined;

        const rawTimeout = frontmatter["timeout_seconds"];
        const timeoutSeconds: number =
          typeof rawTimeout === "number" ? rawTimeout : 300;

        const rawOutputFormat = frontmatter["output_format"];
        const outputFormat: "chat" | "vault_note" =
          rawOutputFormat === "vault_note" ? "vault_note" : "chat";

        const outputPath: string | undefined =
          typeof frontmatter["output_path"] === "string"
            ? frontmatter["output_path"]
            : undefined;

        const color: string | undefined =
          typeof frontmatter["color"] === "string"
            ? frontmatter["color"]
            : undefined;

        const tags = toStringArray(frontmatter["tags"]);

        const systemPrompt = body.trim();

        agents.push({
          name,
          description,
          model,
          type,
          allowedTools,
          deniedTools,
          isolation,
          memory,
          maxTokens,
          timeoutSeconds,
          outputFormat,
          outputPath,
          color,
          systemPrompt,
          tags,
        });
      } catch (err) {
        console.warn(`[AgentLoader] Error loading agent at "${filePath}":`, err);
      }
    }

    return agents;
  }
}

/**
 * Coerces an unknown frontmatter value to a `string[]`.
 *
 * Accepts an existing `string[]`, a single string (returned as a one-element
 * array), or any other value (returned as an empty array).
 *
 * @param value - Raw value from the frontmatter record.
 * @returns A (possibly empty) array of strings.
 */
function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  if (typeof value === "string") {
    return [value];
  }
  return [];
}
