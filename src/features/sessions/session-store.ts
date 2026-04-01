/**
 * @file Read/write session markdown files in .claude/sessions/.
 *
 * Provides a high-level API for persisting and retrieving full {@link Session}
 * records as vault notes with YAML frontmatter.
 */

import { Vault, normalizePath } from "obsidian";
import { Session, ConversationMessage } from "../../core/types";
import { parseFrontmatter, stringifyFrontmatter } from "../../utils/frontmatter";

const SESSIONS_ROOT = ".claude/sessions";

/**
 * Formats a timestamp string as "h:mm A" (e.g., "4:32 PM").
 */
function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  if (hours === 0) hours = 12;
  const mm = minutes.toString().padStart(2, "0");
  return `${hours}:${mm} ${ampm}`;
}

/**
 * Manages persistence of session notes in the vault's `.claude/sessions/` folder.
 */
export class SessionStore {
  /**
   * @param vault - The Obsidian Vault instance used for file I/O.
   */
  constructor(private readonly vault: Vault) {}

  /**
   * Renders a full session record to a markdown string with YAML frontmatter
   * and a human-readable conversation transcript.
   *
   * @param session - The session to render.
   * @returns A complete markdown string ready to be written to disk.
   */
  renderTranscript(session: Session): string {
    const frontmatter: Record<string, unknown> = {
      session_id: session.sessionId,
      agent: session.agent || "default",
      title: session.title,
      created: session.created,
      updated: session.updated,
      model: session.model,
      tokens_used: session.tokensUsed,
      message_count: session.messageCount,
      status: session.status,
      output_files: session.outputFiles,
      tags: session.tags,
    };

    const messageParts: string[] = [];
    for (const msg of session.messages) {
      const role = msg.role === "user" ? "User" : "Assistant";
      const time = formatTime(msg.timestamp);
      messageParts.push(`## ${role} (${time})\n${msg.content}`);
    }

    const title = `# ${session.title}`;
    const body =
      messageParts.length > 0
        ? `${title}\n\n${messageParts.join("\n\n")}\n`
        : `${title}\n`;

    return stringifyFrontmatter(frontmatter, body);
  }

  /**
   * Parses a markdown transcript body back into an ordered array of
   * {@link ConversationMessage} objects.
   *
   * @param body - The markdown body text (everything after the frontmatter fence).
   * @returns Parsed messages with role, content, and timestamp.
   */
  parseTranscript(body: string): ConversationMessage[] {
    const messages: ConversationMessage[] = [];

    // Split on ## User or ## Assistant headings
    const headingRe = /^## (User|Assistant) \(([^)]+)\)/m;
    const parts = body.split(/^(?=## (?:User|Assistant) \()/m);

    for (const part of parts) {
      const match = part.match(headingRe);
      if (!match) continue;

      const roleLabel = match[1];
      const timeLabel = match[2];
      const role: "user" | "assistant" = roleLabel === "User" ? "user" : "assistant";

      // Content is everything after the heading line
      const afterHeading = part.slice(match[0].length);
      const content = afterHeading.trim();

      // Reconstruct a timestamp from the time label -- store as-is since we
      // cannot reliably recover a full ISO-8601 string from "h:mm A" alone.
      messages.push({ role, content, timestamp: timeLabel });
    }

    return messages;
  }

  /**
   * Persists a session record as a markdown note under
   * `.claude/sessions/{agent}/{sessionId}.md`.
   *
   * @param session - The session to save.
   */
  async saveSession(session: Session): Promise<void> {
    try {
      const agentFolder = session.agent || "default";
      const folderPath = normalizePath(`${SESSIONS_ROOT}/${agentFolder}`);
      const filePath = normalizePath(`${folderPath}/${session.sessionId}.md`);

      const folderExists = await this.vault.adapter.exists(folderPath);
      if (!folderExists) {
        await this.vault.createFolder(folderPath);
      }

      const content = this.renderTranscript(session);
      await this.vault.adapter.write(filePath, content);
    } catch (err) {
      throw new Error(
        `SessionStore.saveSession failed for session "${session.sessionId}": ${String(err)}`
      );
    }
  }

  /**
   * Loads a session record from a vault-relative path.
   *
   * @param path - Vault-relative path to the session note.
   * @returns The parsed {@link Session} object.
   */
  async loadSession(path: string): Promise<Session> {
    const normalised = normalizePath(path);
    const raw = await this.vault.adapter.read(normalised);
    const { frontmatter, body } = parseFrontmatter(raw);

    const fm = frontmatter as Record<string, unknown>;

    const messages = this.parseTranscript(body);

    const session: Session = {
      sessionId: String(fm["session_id"] ?? ""),
      agent: String(fm["agent"] ?? ""),
      title: String(fm["title"] ?? ""),
      created: String(fm["created"] ?? ""),
      updated: String(fm["updated"] ?? ""),
      model: String(fm["model"] ?? ""),
      tokensUsed: typeof fm["tokens_used"] === "number" ? fm["tokens_used"] : 0,
      messageCount: typeof fm["message_count"] === "number" ? fm["message_count"] : 0,
      status: (["active", "completed", "paused"].includes(String(fm["status"]))
        ? fm["status"]
        : "active") as "active" | "completed" | "paused",
      outputFiles: Array.isArray(fm["output_files"])
        ? (fm["output_files"] as string[]).map(String)
        : [],
      tags: Array.isArray(fm["tags"]) ? (fm["tags"] as string[]).map(String) : [],
      messages,
    };

    return session;
  }

  /**
   * Lists all session records stored in the vault, optionally filtered by agent.
   *
   * Files are loaded concurrently and sorted by `updated` timestamp descending
   * (most recent first). Files that fail to parse are silently skipped.
   *
   * @param agent - If provided, only sessions belonging to this agent are returned.
   * @returns Array of sessions sorted newest-first.
   */
  async listSessions(agent?: string): Promise<Session[]> {
    try {
      const searchRoot = agent
        ? normalizePath(`${SESSIONS_ROOT}/${agent}`)
        : normalizePath(SESSIONS_ROOT);

      const rootExists = await this.vault.adapter.exists(searchRoot);
      if (!rootExists) return [];

      const listed = await this.vault.adapter.list(searchRoot);

      // Collect .md file paths -- also recurse into subdirectories when no
      // agent filter is specified.
      const mdPaths: string[] = [];

      const collectFiles = async (dir: string): Promise<void> => {
        const result = await this.vault.adapter.list(dir);
        for (const file of result.files) {
          if (file.endsWith(".md")) {
            mdPaths.push(file);
          }
        }
        for (const folder of result.folders) {
          await collectFiles(folder);
        }
      };

      // If agent is provided the search root is already the leaf folder so we
      // only need to collect its direct files.  Without an agent filter we
      // must recurse into every agent subfolder.
      if (agent) {
        for (const file of listed.files) {
          if (file.endsWith(".md")) {
            mdPaths.push(file);
          }
        }
      } else {
        await collectFiles(searchRoot);
      }

      const results = await Promise.allSettled(
        mdPaths.map((p) => this.loadSession(p))
      );

      const sessions: Session[] = [];
      for (const result of results) {
        if (result.status === "fulfilled") {
          sessions.push(result.value);
        }
        // silently skip rejected (failed-to-parse) files
      }

      sessions.sort((a, b) => {
        const ta = a.updated ? new Date(a.updated).getTime() : 0;
        const tb = b.updated ? new Date(b.updated).getTime() : 0;
        return tb - ta;
      });

      return sessions;
    } catch {
      return [];
    }
  }
}
