# Chimera Nexus: Architecture Reference v1.0

**A vault-native agentic platform for Obsidian.**

Everything is markdown. Everything is local. Everything is yours.

---

## 1. Vision and Principles

Chimera Nexus transforms an Obsidian vault into a living workspace where autonomous agents remember, learn, and work on your behalf. It wraps the Claude Agent SDK and is fully compatible with Claude Code's project configuration -- skills, agents, commands, hooks, plugins, and settings defined in `.claude/` work in both Claude Code CLI and Chimera Nexus.

### Design Principles

1. **The vault is the platform.** Memory, tasks, agents, sessions, logs, and coordination are all markdown files in `.claude/`. Searchable, linkable, version-tracked.
2. **Full Claude Code compatibility.** One `.claude/` directory, two interfaces. Share a vault via git and collaborators get the complete agentic workspace.
3. **Zero external dependencies** for core features. Only Claude Code CLI or an API key.
4. **Progressive disclosure.** Filetree and frontmatter descriptions are always in context. Full contents loaded on demand by the agent.
5. **General-purpose tools for memory.** Agents read/write memory with the same file tools they use for vault notes. No specialized memory API. Stays in-distribution for the model.
6. **Transparency over magic.** Every action produces a visible vault artifact.

---

## 2. System Architecture

```
+------------------------------------------------------------------+
|                       Chimera Nexus Plugin                        |
|                                                                    |
|  Chat Interface        Agent Session Manager        Settings UI   |
|  (sidebar view)        (pool, queue, concurrency)   (all config)  |
|  - Agent selector      - Priority scheduling                      |
|  - Session history      - Tool enforcement                         |
|  - @mention dropdown    - Template resolution                      |
|  - Status bar           - Memory injection                         |
|  - Completion cards                                                |
|                                                                    |
|  Claude Compat Layer    Task Scheduler    Background Agent Manager |
|  - Skill loader         - /loop (session) - Foreground delegation  |
|  - Command loader       - Persistent cron - Background pool        |
|  - Agent loader         - Missed runs     - Swarm runner           |
|  - Hook manager         - Dream cycle                              |
|  - Settings merger                                                 |
|  - Plugin loader                                                   |
|  - Rules loader                                                    |
|                                                                    |
|  Session Store          Memory System (MemFS)                      |
|  - MD files per agent   - Pinned / Indexed / On-demand             |
|  - JSON index cache     - Auto-memory extraction                   |
|  - Resume / search      - Dream consolidation                      |
+------------------------------------------------------------------+
|                                                                    |
|  .claude/  (Vault filesystem -- standard CC project directory)     |
+------------------------------------------------------------------+
```

### Session Priority Queue

| Priority | Source | Behavior |
|---|---|---|
| 1 (highest) | User chat | Always immediate, never queued |
| 2 | `/loop` tasks | Fire between user turns |
| 3 | Scheduled tasks | Queued behind active chat |
| 4 | Background agents | Queued behind scheduled tasks |
| 5 (lowest) | Dream cycle | Only when everything else is idle |

Concurrent session limit: configurable, default 2 (one reserved for user chat).

---

## 3. Claude Code Compatibility Layer

### What Chimera Nexus Reads from `.claude/`

| Resource | Location | CC Standard? | How Chimera Uses It |
|---|---|---|---|
| settings.json | `.claude/settings.json` | Yes | Permissions, hooks, env vars |
| Skills | `.claude/skills/` | Yes | Auto-invoked by LLM routing |
| Agents | `.claude/agents/` | Yes | Agent selector + @mention |
| Commands | `.claude/commands/` | Yes | Slash commands in chat |
| Plugins | `.claude/plugins/` | Yes | Bundled skills/agents/hooks |
| Hooks | `.claude/hooks/` | Yes | Lifecycle event scripts |
| Rules | `.claude/rules/` | Yes | File-pattern instructions |
| Output styles | `.claude/output-styles/` | Yes | Response formatting |
| CLAUDE.md | vault root | Yes | Project context in system prompt |

User-level resources from `~/.claude/` are also discovered and merged following CC's hierarchy: project overrides user. Deny rules always win.

### Skills

Skills are directories containing SKILL.md with optional bundled scripts, references, and assets. Chimera discovers them from `.claude/skills/`, `~/.claude/skills/`, and installed plugins. SKILL.md frontmatter (name, description) is added to the system prompt for LLM-based routing. Full content loads on demand when Claude invokes the skill.

Skills can define hooks in their frontmatter that fire during the skill's execution.

### Agents

Agents are markdown files with YAML frontmatter defining persona, model, tools, and constraints. See Section 8 for the full format.

### Commands

Commands are markdown files with optional frontmatter (description, argument-hint). Vault commands register as `/command-name`. User commands register as `/user:command-name`.

### Hooks

Hooks are defined in settings.json and execute at lifecycle events. Chimera supports all 12 Claude Code hook events with 4 handler types:

**Events:** Setup, SessionStart, SessionEnd, UserPromptSubmit, PreToolUse (can block), PostToolUse, PostToolUseFailure, PermissionRequest, Stop, StopFailure, SubagentStart, SubagentStop, PreCompact, Notification, FileChanged

**Handler types:** command (shell script), http (webhook POST), prompt (LLM judge), agent (subagent evaluation)

**Exit codes:** 0 = proceed, 2 = block (PreToolUse only), other = log warning but proceed.

Hook scripts live in `.claude/hooks/` and are shared via git.

### Settings Merge

Precedence: managed (enterprise) > project (`.claude/settings.json`) > user (`~/.claude/settings.json`). Deny always wins. Allow and array settings merge additively.

---

## 4. Authentication

**Path A: CLI wrapper (default).** User has Claude Code installed and logged in. Chimera spawns `claude` processes. Users keep their Pro/Max subscription.

**Path B: Agent SDK direct.** User provides ANTHROPIC_API_KEY (or Bedrock/Vertex/Foundry credentials). Chimera uses the SDK npm package. Pay-per-token.

Anthropic prohibits third-party OAuth login via the Agent SDK. Chimera does not implement OAuth -- Path A delegates to the user's own CC installation.

---

## 5. Agent Selector and Conversation History

### Agent Selector

A dropdown at the top of the sidebar lists all agents from `.claude/agents/` and `~/.claude/agents/`. The first entry is always "Default Chimera" (general-purpose). Selecting an agent changes the session to use that agent's system prompt, model, tools, and per-agent memory.

```
+--------------------------------------------------+
| [Agent: @research-agent v] [Session v]    [+ New] |
+--------------------------------------------------+
|  [Chat messages for this agent/session]           |
+--------------------------------------------------+
|  [Input: @mention dropdown]              [Send]   |
+--------------------------------------------------+
|  Status: @vault-explorer (bg, 2m) | 1 completed  |
+--------------------------------------------------+
```

Each agent shows a status indicator: Active, Background (with timer), Idle, or Scheduled (next run time).

### @Mention Delegation

Type `@` in the input to see a dropdown of agents. Select one to delegate a task.

**Foreground (default):** Results stream inline. User waits.

```
You: @research-agent Find latest CRDT benchmarks

Chimera: [@research-agent] Searching...
         [completed in 3m 12s]
         Key findings: CRDTs outperform OT...
         Full results: [[Research/crdt-benchmarks.md]]
```

**Background:** Add `(bg)` or click "Run in background."

```
You: @research-agent (bg) Research quantum computing for my digest

Chimera: Starting @research-agent in background.
         What else can I help with?
```

Completion card appears when done with View/Summary/Dismiss actions.

**Delegation depth limit:** 3 levels. Only `type: orchestrator` agents can delegate to other agents.

### Conversation History

Sessions are stored as markdown files in `.claude/sessions/{agent-name}/`:

```markdown
---
session_id: "a1b2c3d4"
agent: research-agent
title: "CRDT vs OT Benchmarks"
created: 2026-03-31T16:32:00Z
updated: 2026-03-31T16:47:22Z
model: sonnet
tokens_used: 8420
message_count: 12
status: completed
output_files:
  - Research/crdt-vs-ot-2026.md
tags:
  - chimera/session
  - research
---

# CRDT vs OT Benchmarks

## User (4:32 PM)
Find the latest benchmarks comparing CRDTs vs operational transform.

## Assistant (4:32 PM)
I'll research this topic...
```

**Why markdown:** Searchable in Obsidian, linkable via `[[wikilinks]]`, queryable with Dataview, visible in graph view, tracked in git.

**Session index:** `.claude/sessions/index.json` is a JSON cache for fast UI rendering. Markdown files are the source of truth (index is rebuilt on plugin load).

**Session list:** The sidebar shows previous sessions for the selected agent, sorted by most recent. Click to resume with full context. A full-screen session browser shows all sessions grouped by agent.

**Quick agent switch:** Switch agents mid-conversation without losing context. Previous session is paused, not closed. Switch back to resume.

---

## 6. Memory System (MemFS)

### Rationale

Letta's MemFS benchmark proved plain filesystem memory (74% on LoCoMo) outperforms specialized memory tools (Mem0: 68.5%). Obsidian already IS a filesystem of markdown with git, search, wikilinks, and graph view. The vault is the memory substrate. No Hindsight, no vector DB, no external dependencies.

### Directory Structure

```
.claude/memory/
  system/                     # Tier 1: PINNED (always fully loaded)
    identity.md               # Agent persona, working style
    human.md                  # User facts: name, role, preferences
    vault-conventions.md      # Structure rules, naming, tag taxonomy
    active-projects.md        # Current projects and status
  knowledge/                  # Tier 2: INDEXED (filetree visible, read on demand)
    architecture-decisions.md
    tools-and-workflows.md
    contacts-and-roles.md
    domain-glossary.md
  reflections/                # Dream-generated weekly insights
    2026-W14-reflection.md
  sessions/                   # Compressed session summaries (for memory, not chat history)
    2026-03-31-morning.md
```

### Memory File Format

```markdown
---
description: "Key architectural decisions and their rationale"
memtype: knowledge
created: 2026-03-15
updated: 2026-03-31
pinned: false
tags:
  - chimera/memory
  - decisions
---

# Architecture Decisions

## Vault Structure
- Daily notes in `Daily/` with format `YYYY-MM-DD`
- [[MOC - Vault Organization]] documents the full structure

## Integration Patterns
- MCP servers connected: Google Calendar, Gmail
- [[Projects/Agentic Teams/README|Current focus project]]
```

### Memory Injection (System Prompt Construction)

```
Layer 1: Base system prompt                     ~500 tokens
Layer 2: CLAUDE.md from vault root              variable
Layer 3: Pinned memory (system/ + pinned:true)  ~2000 tokens (cap)
Layer 4: Memory filetree index                  ~500 tokens
Layer 5: Available skills (names + descriptions) ~300 tokens
Layer 6: Available agents (names + descriptions) ~200 tokens
Layer 7: Active rules                            ~200 tokens
Layer 8: Permission mode instructions            ~200 tokens
```

Total system context: ~4000 tokens. Leaves maximum room for conversation.

### Auto-Memory

The agent writes memory using standard file tools (instructed via system prompt). No specialized API. Post-session, Chimera runs a lightweight extraction pass to catch signals the agent missed: corrections, decisions, new facts, repeated patterns. A compressed session summary is written to `memory/sessions/`.

### Dream Cycle (Memory Consolidation)

Implemented as a scheduled task. Sandboxed subagent with restricted tools (memory dir only, no bash, no MCP). Runs four phases:

1. **Inventory:** Read memory tree, assess file counts and staleness
2. **Extract:** Review session summaries since last dream for missed patterns
3. **Consolidate:** Remove stale entries, merge duplicates, resolve contradictions, verify wikilinks
4. **Reorganize:** Split large files, merge sparse files, maintain 15-25 knowledge files, update frontmatter

**Trigger:** 24h since last dream AND 5+ sessions. **Model:** Haiku (configurable). **Safety:** Lock file, pre-dream snapshot, 10-minute timeout, post-dream notification with diff summary.

### Git Integration

Memory mutations committed via Obsidian Git plugin (if installed):
```
[chimera-dream] Consolidated 8 sessions, pruned 3 stale entries
```
Users can `git diff`, `git revert`, `git log .claude/memory/`.

---

## 7. Scheduled Tasks

### Three Tiers

| Tier | Scope | Durability | Use Case |
|---|---|---|---|
| `/loop` | Current session | Dies on close | Quick polling, reminders |
| Persistent tasks | Across sessions | Survives restarts | Daily briefings, reviews |
| Cron export | OS-level | Runs when app closed | Advanced users |

### Tier 1: Session Loops

```
/loop 10m check if any notes tagged #urgent were modified
/loop in 2 hours remind me to review the PR
/loop list
/loop cancel [id]
```

Fires between user turns. 3-day auto-expiry. Max 50 per session.

### Tier 2: Persistent Tasks

Markdown files in `.claude/tasks/`:

```markdown
---
id: daily-briefing
name: Morning Briefing
enabled: true
schedule: "0 8 * * 1-5"
schedule_human: "Weekdays at 8:00 AM"
model: sonnet
agent: default
permission_mode: safe
max_duration_seconds: 300
created: 2026-03-15
last_run: 2026-03-31T08:00:12Z
next_run: 2026-04-01T08:00:00Z
tags:
  - chimera/task
---

# Morning Briefing

## Prompt
Read yesterday's daily note at `Daily/{{yesterday}}.md`.
Check calendar via Google Calendar MCP.
Create today's daily note at `Daily/{{today}}.md`.

## Tool Access
- file_read
- file_write
- mcp:google-calendar
```

Tasks can specify which agent to use via the `agent` field. Execution logs written to `.claude/task-logs/` as markdown notes with frontmatter (queryable with Dataview).

**Template variables:** `{{today}}`, `{{yesterday}}`, `{{tomorrow}}`, `{{now}}`, `{{week}}`, `{{modified_since:Xh}}`, `{{notes_with_tag:name}}`, `{{random_note}}`, `{{inbox_count}}`

**Missed runs:** On plugin load, checks last 7 days. Configurable: always run, skip, or ask.

**Commands:** `/schedule`, `/schedule list`, `/schedule run [name]`, `/schedule pause [name]`, `/schedule history [name]`

**The dream cycle is a built-in scheduled task.** One scheduler, one execution model.

### Tier 3: Cron Export

`/schedule export-cron [name]` generates a crontab entry using `claude -p` for headless execution when Obsidian is closed.

### Example Task Library

Morning Briefing (weekdays 8am, Sonnet), Weekly Review (Friday 5pm, Sonnet), Inbox Processor (every 4h, Haiku), Orphan Finder (Monday 9am, Haiku), Spaced Repetition (daily 10am, Haiku), Research Digest (Mon/Thu 7am, Sonnet), Meeting Prep (weekdays 7am, Sonnet), Memory Dream (daily 3am, Haiku).

---

## 8. Agent Definitions

### Format

Markdown files with YAML frontmatter in `.claude/agents/` (vault) or `~/.claude/agents/` (global):

```markdown
---
name: research-agent
description: "Deep research using web search and vault context"
model: sonnet
type: standard
allowed_tools:
  - Read
  - Write
  - Grep
  - Glob
  - WebFetch
  - WebSearch
denied_tools:
  - Bash
isolation: none
memory: user
timeout_seconds: 300
output_format: vault_note
output_path: "Research/{{topic_slug}}-research.md"
color: "#4CAF50"
tags:
  - chimera/agent
---

# Research Agent

You are a research specialist working within an Obsidian vault.
When given a topic, conduct thorough research using web search
and vault context. Output structured vault notes with wikilinks.
```

### Key Fields

| Field | Purpose |
|---|---|
| `name` | Identifier for `@name` mentions and selector |
| `description` | LLM routing + UI display |
| `model` | haiku, sonnet, opus |
| `type` | `standard` or `orchestrator` (can spawn agents) |
| `allowed_tools` / `denied_tools` | Tool restrictions |
| `memory` | `none`, `vault` (shared), `user` (per-agent at `.claude/agent-memory/`) |
| `output_format` | `chat` or `vault_note` |
| `output_path` | Template for vault note location |
| `color` | UI indicator color |

### Per-Agent Memory

Agents with `memory: user` get `.claude/agent-memory/{name}/` with persistent files the agent maintains across sessions. Corrections detected when users edit agent outputs are written here for self-improvement.

### Built-in Agent Library

vault-explorer (Haiku), research-agent (Sonnet), note-formatter (Haiku), inbox-processor (Haiku), meeting-prep (Sonnet), connection-finder (Haiku), weekly-reviewer (Sonnet), content-expander (Sonnet).

---

## 9. Background Agents and Swarms

### Background Agents

Non-blocking execution with priority queue. Agent runs while user keeps chatting. Status bar shows progress. Completion card appears with results and link to output note.

**Commands:** `/agents status`, `/agents cancel [id]`, `/agents result [id]`, `/agents list`, `/agents history`

### Agent Teams (Swarms)

Multiple agents working in parallel on independent tasks, coordinated through vault files. Each agent writes output to a designated file. Orchestrator reads outputs between dependency waves and synthesizes.

```
.claude/swarm-runs/
  2026-03-31-inbox-processing/
    _manifest.json         # Plan: agents, inputs, outputs, dependencies
    tagger-output.md       # Agent A
    linker-output.md       # Agent B
    sorter-output.md       # Agent C
    _synthesis.md          # Orchestrator final output
```

**Dependency waves:** Topological sort by `depends_on`. All agents in a wave run in parallel. Next wave starts after previous completes.

**Advantages over Claude Desktop:** Full transparency (every intermediate file is readable), resumability (restart from failure), human-in-the-loop (edit between waves), composability (outputs are vault notes).

---

## 10. Security Model

**Default mode: Safe** (approval prompts). Plan mode and YOLO available.

Background execution safeguards: tool restriction enforcement, bash rate limiting (10/min default), command blocklist (regex), vault confinement, max duration timeouts, token budgets per agent, dream sandboxing (memory dir only).

Pre-execution snapshots to `.claude/backups/` (configurable).

All writes through Obsidian's Vault API (never direct `fs`) to ensure proper event firing and sync.

---

## 11. User Experience

### First-Run Onboarding

3-step wizard: CLI detection (with platform-specific fix instructions), auth setup (CLI or API key), memory bootstrap (generate starter files).

### Slash Commands

`/help`, `/loop`, `/schedule`, `/agents`, `/memory`, `/dream` -- plus all commands discovered from `.claude/commands/`.

### Settings Sections

Authentication, Memory (budgets, dream schedule, health), Scheduled Tasks (list, toggles, history, missed run policy), Agents (list, model overrides, concurrency), Security (mode, blocklist, backup), Cost Dashboard (token usage by feature).

---

## 12. Vault Directory Structure (Complete)

```
{vault}/
  CLAUDE.md

  .claude/
    settings.json

    # --- CC STANDARD (portable, shared via git) ---
    skills/
    agents/
    commands/
    plugins/
    hooks/
    rules/
    output-styles/

    # --- CHIMERA EXTENSIONS ---
    memory/
      system/
        identity.md
        human.md
        vault-conventions.md
        active-projects.md
      knowledge/
      reflections/
      sessions/
    sessions/
      index.json
      default/
      {agent-name}/
    tasks/
    task-logs/
    agent-memory/
      {agent-name}/
    swarm-runs/
      {swarm-id}/
    backups/
    dream.lock
```

### .gitignore for Shared Vaults

```gitignore
# Share: skills, agents, commands, hooks, settings, shared memory
# Personal: sessions, reflections, task logs, agent memory
.claude/memory/sessions/
.claude/memory/reflections/
.claude/sessions/
.claude/agent-memory/
.claude/task-logs/
.claude/swarm-runs/
.claude/backups/
.claude/dream.lock
```

---

## 13. Dependencies

| Dependency | Required? | Purpose |
|---|---|---|
| Obsidian v1.8.9+ | Yes | Plugin host (desktop only) |
| Claude Code CLI | Yes (Path A) | Agent runtime + auth |
| Node.js v18+ | Yes (Path A) | CC requires it in PATH |
| ANTHROPIC_API_KEY | Yes (Path B) | Direct API access |
| Obsidian Git plugin | Optional | Memory versioning |

---

## 14. Implementation Roadmap

### Phase 1: Foundation (Weeks 1-4)

Plugin scaffold, Claude Code compatibility layer, agent selector, session history, memory system, basic chat.

### Phase 2: Scheduling (Weeks 4-6)

/loop, persistent tasks, missed runs, dream cycle, template variables.

### Phase 3: Background Agents (Weeks 6-8)

Foreground delegation, background pool, agent status UI, per-agent memory.

### Phase 4: Swarms (Weeks 8-10)

Manifest format, dependency waves, vault-file coordination, orchestrator type.

### Phase 5: Polish (Weeks 10-12)

Cost dashboard, example libraries, documentation, security audit.

---

## 15. Why This Is Better Than Claude Desktop

| Capability | Claude Desktop | Chimera Nexus |
|---|---|---|
| Memory storage | Hidden internal files | Vault notes (searchable, linkable) |
| Memory versioning | None | Git |
| Memory visualization | None | Graph view |
| Cross-memory linking | None | `[[wikilinks]]` |
| Task outputs | Trapped in sessions | First-class vault notes |
| Task definitions | App-internal | Editable markdown |
| Task history | Session list | Dataview-queryable logs |
| Conversation history | Internal DB | Markdown per agent |
| Agent coordination | In-process IPC | Vault files (transparent) |
| Cross-project context | Siloed projects | Vault-wide linking |
| Portability | None | Git clone = full workspace |
| Data ownership | Anthropic-managed | Your vault, your git |
| Search | Limited | Obsidian + Dataview + tags |
| Ecosystem | Plugin marketplace | CC plugins + vault skills |

---

*Chimera Nexus v1.0 Architecture Reference*
