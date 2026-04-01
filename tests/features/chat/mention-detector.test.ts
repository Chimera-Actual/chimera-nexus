/**
 * @file Tests for detectMention (mention-detector)
 */

import { detectMention } from "../../../src/features/chat/mention-detector";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("detectMention", () => {
  const knownAgents = ["Atlas", "Nexus", "ResearchBot"];

  // 1. Detects @agent-name mention
  it("detects a basic @agent-name mention", () => {
    const result = detectMention("@Atlas do the thing", knownAgents);
    expect(result).not.toBeNull();
  });

  // 2. Returns correct agent name (canonical case)
  it("returns the canonical agent name from the agentNames array", () => {
    const result = detectMention("@atlas do the thing", knownAgents);
    expect(result).not.toBeNull();
    expect(result!.agentName).toBe("Atlas"); // canonical casing
  });

  // 3. Detects (bg) flag
  it("detects (bg) background flag", () => {
    const result = detectMention("@Atlas (bg) run in background", knownAgents);
    expect(result).not.toBeNull();
    expect(result!.background).toBe(true);
  });

  // 4. Detects (background) flag
  it("detects (background) background flag", () => {
    const result = detectMention("@Atlas (background) run in background", knownAgents);
    expect(result).not.toBeNull();
    expect(result!.background).toBe(true);
  });

  // 5. Strips mention and flags from task
  it("strips the @mention and background flag from the task text", () => {
    const result = detectMention("@Atlas (bg) summarize this doc", knownAgents);
    expect(result).not.toBeNull();
    expect(result!.task).toBe("summarize this doc");
    expect(result!.task).not.toContain("@Atlas");
    expect(result!.task).not.toContain("(bg)");
  });

  it("strips just the @mention when no background flag is present", () => {
    const result = detectMention("@Atlas summarize this doc", knownAgents);
    expect(result).not.toBeNull();
    expect(result!.task).toBe("summarize this doc");
    expect(result!.task).not.toContain("@Atlas");
  });

  // 6. Returns null for unknown agent
  it("returns null when the @mention names an unknown agent", () => {
    const result = detectMention("@UnknownAgent do stuff", knownAgents);
    expect(result).toBeNull();
  });

  // 7. Returns null when no mention
  it("returns null when the message contains no @mention", () => {
    const result = detectMention("just a plain message", knownAgents);
    expect(result).toBeNull();
  });

  // 8. Returns null for empty message
  it("returns null for an empty message string", () => {
    const result = detectMention("", knownAgents);
    expect(result).toBeNull();
  });

  // 9. Case-insensitive matching
  it("matches the @mention case-insensitively", () => {
    expect(detectMention("@ATLAS do it", knownAgents)).not.toBeNull();
    expect(detectMention("@atlas do it", knownAgents)).not.toBeNull();
    expect(detectMention("@AtLaS do it", knownAgents)).not.toBeNull();

    const result = detectMention("@ATLAS do it", knownAgents);
    expect(result!.agentName).toBe("Atlas");
  });

  // 10. Handles mention at start of message
  it("detects mention at the very start of the message", () => {
    const result = detectMention("@Nexus please help", knownAgents);
    expect(result).not.toBeNull();
    expect(result!.agentName).toBe("Nexus");
    expect(result!.task).toBe("please help");
  });

  // originalMessage is preserved
  it("preserves the original message in the result", () => {
    const msg = "@Atlas (bg) do the thing";
    const result = detectMention(msg, knownAgents);
    expect(result).not.toBeNull();
    expect(result!.originalMessage).toBe(msg);
  });

  // background is false when no flag
  it("returns background=false when no flag is present", () => {
    const result = detectMention("@Atlas run this", knownAgents);
    expect(result).not.toBeNull();
    expect(result!.background).toBe(false);
  });

  // Works with multi-word agent names that contain hyphens
  it("matches agent names with hyphens like ResearchBot", () => {
    const result = detectMention("@ResearchBot find papers", knownAgents);
    expect(result).not.toBeNull();
    expect(result!.agentName).toBe("ResearchBot");
    expect(result!.task).toBe("find papers");
  });

  // Returns null when agentNames list is empty
  it("returns null when agentNames array is empty", () => {
    const result = detectMention("@Atlas do stuff", []);
    expect(result).toBeNull();
  });

  // mention in the middle of a message (after whitespace) is still detected
  it("detects mention that appears after leading whitespace text", () => {
    const result = detectMention("hey @Atlas do stuff", knownAgents);
    expect(result).not.toBeNull();
    expect(result!.agentName).toBe("Atlas");
  });
});
