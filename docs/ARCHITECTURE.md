# Chimera Nexus Architecture

## System Overview

```
+------------------------------------------------------------------+
|                       Chimera Nexus Plugin                        |
|                                                                   |
|  +---------------------------+  +-----------------------------+   |
|  |    Claudian (upstream)    |  |   Chimera (our modules)     |   |
|  |                           |  |                             |   |
|  |  Chat UI (ClaudianView)  |  |  Memory Injector            |   |
|  |  SDK Integration          |  |  Memory Extractor           |   |
|  |  Tool Rendering           |  |  Session Summarizer         |   |
|  |  Settings UI              |  |  Dream Runner               |   |
|  |  MCP Integration          |  |  Task Scheduler             |   |
|  |  Inline Editing           |  |  Loop Scheduler             |   |
|  |  Plugin Discovery         |  |  Background Manager         |   |
|  |                           |  |  Swarm Runner               |   |
|  |                           |  |  Session Manager            |   |
|  |                           |  |  Plugin Loader              |   |
|  +---------------------------+  +-----------------------------+   |
|                    |                        |                     |
|                    +--- Bridge Layer -------+                     |
|                    |                                              |
|  +----------------------------------------------------------+    |
|  | ChimeraManager | Settings Bridge | Config Transfer        |    |
|  +----------------------------------------------------------+    |
+------------------------------------------------------------------+
                              |
                    .claude/memory/
                    (vault filesystem)
```

## 3-Zone Architecture

Chimera Nexus uses a strict 3-zone model to minimize upstream merge friction:

| Zone | Path | Rule |
|------|------|------|
| **Claudian upstream** | `src/` (excluding `chimera/`) | Minimal patches only, tracked in `patches/` |
| **Chimera modules** | `src/chimera/` | All Chimera-specific code lives here |
| **Bridge layer** | `src/chimera/bridge/` | Only place that imports from both zones |

## Module Inventory

### Memory (`src/chimera/memory/`)

| Module | File | Purpose |
|--------|------|---------|
| Memory Injector | `memory-injector.ts` | Reads `.claude/memory/` and builds context string for system prompt |
| Memory Extractor | `memory-extractor.ts` | Scans conversation messages for signals (corrections, decisions, facts) |
| Session Summarizer | `session-summarizer.ts` | Creates compressed session summaries for long-term recall |
| Dream Runner | `dream-runner.ts` | 4-phase memory consolidation cycle (inventory, extract, consolidate, reorganize) |

### Bridge (`src/chimera/bridge/`)

| Module | File | Purpose |
|--------|------|---------|
| Chimera Manager | `chimera-manager.ts` | Central coordinator: initializes modules, routes lifecycle events |
| Settings Bridge | `settings-bridge.ts` | Adds Chimera settings sections to Claudian's settings UI |
| Config Transfer | `config-transfer.ts` | Export/Import configuration with selective categories |
| Skill Marketplace | `skill-marketplace.ts` | Curated community skill installer |

### Scheduler (`src/chimera/scheduler/`)

| Module | File | Purpose |
|--------|------|---------|
| Task Scheduler | `task-scheduler.ts` | Cron-based persistent task execution from `.claude/tasks/*.md` |
| Loop Scheduler | `loop-scheduler.ts` | Session-scoped repeating tasks on millisecond intervals |
| Cron Parser | `cron-parser.ts` | 5-field cron expression parser and evaluator |
| Missed Run Handler | `missed-run-handler.ts` | Detects tasks that missed execution during shutdown |

### Runtime (`src/chimera/runtime/`)

| Module | File | Purpose |
|--------|------|---------|
| Session Manager | `session-manager.ts` | Priority-queue concurrency control for Claude sessions |
| Template Resolver | `template-resolver.ts` | Resolves `{{variable}}` templates in task prompts |
| Tool Enforcer | `tool-enforcer.ts` | Validates tool calls against allow/deny/ask permission lists |

### Agents (`src/chimera/agents/`)

| Module | File | Purpose |
|--------|------|---------|
| Background Manager | `background-manager.ts` | Non-blocking background agent execution with job queue |
| Foreground Runner | `foreground-runner.ts` | Interactive agent execution in chat UI |
| Swarm Runner | `swarm-runner.ts` | Multi-agent orchestration with dependency waves |

### Compat (`src/chimera/compat/`)

| Module | File | Purpose |
|--------|------|---------|
| Plugin Loader | `plugin-loader.ts` | Discovers and loads `.claude/plugins/` (CC-compatible) |
| Plugin Command | `plugin-command.ts` | `/plugin` slash command handler |
| Marketplace Loader | `marketplace-loader.ts` | Fetches and parses marketplace indices |

### Utils (`src/chimera/utils/`)

| Module | File | Purpose |
|--------|------|---------|
| Frontmatter | `frontmatter.ts` | YAML frontmatter parser (no external deps) |
| Token Counter | `token-counter.ts` | Approximate token estimation (chars / 4) and budget truncation |

### Types

| File | Purpose |
|------|---------|
| `types.ts` | MemoryFile, MemoryTier, PermissionMode, SessionSummary, AgentDefinition, ChimeraMemorySettings, and all Chimera-specific type definitions |

## Vault Structure (`.claude/memory/`)

```
.claude/memory/
  system/                    Tier 1: Pinned (always in context)
    identity.md                Agent persona and working style
    human.md                   Facts about the user
    vault-conventions.md       Vault structure and naming rules
  knowledge/                 Tier 2: Indexed (filetree + on-demand)
    corrections.md             Auto-extracted corrections
    decisions.md               Auto-extracted decisions
  reflections/               Dream-generated insights
  sessions/                  Compressed session summaries
  .dream-state.json          Dream cycle eligibility state
```

## Data Flow

### Memory Injection (every query)

```
User sends message
       |
       v
ClaudianService builds query options (async)
       |
       v
[CHIMERA PATCH] ChimeraManager.getActiveMemoryContext()
       |                           (TTL-cached 5 min)
       v
MemoryInjector reads .claude/memory/ files
  - Pinned files: loaded fully (up to memoryPinnedBudget tokens)
  - Indexed files: directory listing only (up to memoryTreeBudget tokens)
       |
       v
4-layer context assembled:
  1. Base system prompt
  2. CLAUDE.md from vault root
  3. Pinned memory content
  4. Memory file tree index
       |
       v
QueryOptionsBuilder injects into system prompt
       |
       v
SDK sends query to Claude with memory context
```

### Post-Session Extraction (after each conversation save)

```
ConversationController.save() completes
       |
       v
[CHIMERA PATCH] ChimeraManager.extractAndStoreMemory()
       |                           (debounced 10 sec)
       v
MemoryExtractor scans last 20 messages for:
  - Corrections ("no, actually...")  --> knowledge/corrections.md
  - Decisions ("let's go with...")   --> knowledge/decisions.md
  - User facts ("I work at...")      --> system/human.md
  - Repeated topics (3+ mentions)    --> knowledge/decisions.md
       |
       v
SessionSummarizer creates heuristic summary:
  - Top 5 key topics (word frequency)
  - Decision patterns
  - Token count estimate
       |
       v
Summary saved to .claude/memory/sessions/{date}-{id}.md
       |
       v
Memory cache invalidated
```

### Dream Cycle (periodic background)

```
Timer fires every dreamIntervalHours (default 1h, min 15m)
       |
       v
Eligibility check:
  - 24h+ since last dream?
  - 5+ new session files?
  - No dream.lock?
       |  (all pass)
       v
Phase 1: Inventory
  - Catalog all memory/session files
  - Detect stale entries (>30 days untouched)
       |
       v
Phase 2: Extract
  - Pull unprocessed signals from session summaries
       |
       v
Phase 3: Consolidate
  - Merge small files (<100 tokens)
  - Split oversized files (>2000 tokens)
       |
       v
Phase 4: Reorganize
  - Rewrite for optimal retrieval structure
       |
       v
Update .dream-state.json
Release dream.lock
```

### Session Concurrency

```
Session request arrives
       |
       v
SessionManager checks priority:
  1. User chat (highest)
  2. Loop tasks
  3. Scheduled tasks
  4. Background agents
  5. Dream cycle (lowest)
       |
       v
Slot available? --> yes --> Grant session
       |                         |
       no                        v
       |                    Execute agent
       v                         |
Queue request                    v
(promoted when              releaseSession()
 slot frees)                     |
                                 v
                            Next from queue promoted
```

## Patch Map

All patches to Claudian upstream are marked with `// CHIMERA PATCH:` comments.

| # | File | Lines | What it does |
|---|------|-------|-------------|
| 1 | `core/prompts/mainAgent.ts` | ~5 | Adds `memoryContext` param to system prompt builder |
| 2 | `core/agent/QueryOptionsBuilder.ts` | ~4 | Passes memoryContext through to prompt builder |
| 3 | `core/agent/ClaudianService.ts` | ~5 | Makes buildQueryOptionsContext async, calls chimeraManager.getActiveMemoryContext() |
| 4 | `main.ts` | ~8 | Instantiates ChimeraManager on load, cleanup on unload |
| 5 | `features/chat/controllers/ConversationController.ts` | ~5 | Post-session hook calls extractAndStoreMemory() |
| 6 | `features/settings/ClaudianSettings.ts` | ~3 | Renders Chimera settings section |

Total: ~30 lines of patches across 6 files.

## Memory Types

```typescript
enum MemoryTier {
  Pinned     // Always included in context (up to budget)
  Indexed    // Listed in file tree, content on demand
  OnDemand   // Never auto-loaded
}

enum PermissionMode {
  AskBeforeEdits
  EditAutomatically
  Plan
  BypassPermissions
}

interface MemoryFile {
  path: string
  name: string
  description: string
  memtype: string         // system, knowledge, user, session
  tier: MemoryTier
  pinned: boolean
  tags: string[]
  created: string
  updated: string
  content?: string        // Only populated after full load
}

interface ChimeraMemorySettings {
  memoryEnabled: boolean        // default: true
  memoryPinnedBudget: number    // default: 2000
  memoryTreeBudget: number      // default: 500
  autoMemory: boolean           // default: true
  dreamEnabled: boolean         // default: true
  dreamIntervalHours: number    // default: 1
}

interface AgentDefinition {
  name: string
  type: 'standard' | 'orchestrator'
  description: string
  model: string
  permissionMode: PermissionMode
  memory: boolean
  isolation: boolean
  outputFormat: string
}
```

## Design Principles

1. **The vault is the platform.** All data lives in `.claude/` as markdown files. No external databases.
2. **Minimal patches.** Chimera connects to Claudian through 6 small, documented patches (~30 lines).
3. **Bridge isolation.** Only `src/chimera/bridge/` imports from both Claudian and Chimera zones.
4. **Fail gracefully.** Every Chimera operation is wrapped in try/catch. If memory fails, chat still works.
5. **Budget enforcement.** Token budgets prevent memory from consuming the entire context window.
6. **Heuristic-first.** Use fast heuristics (word frequency, pattern matching, chars/4) over expensive LLM calls for background operations.
7. **File-lock safety.** Concurrent operations (dream cycle, task execution) use lock files to prevent conflicts.
