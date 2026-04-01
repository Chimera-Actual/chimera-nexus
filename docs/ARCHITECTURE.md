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
|  |  Settings UI              |  |  Dream Runner (planned)     |   |
|  |  MCP Integration          |  |  Task Scheduler (planned)   |   |
|  |  Inline Editing           |  |  Background Manager (plan)  |   |
|  |  Plugin Discovery         |  |  Swarm Runner (planned)     |   |
|  +---------------------------+  +-----------------------------+   |
|                    |                        |                     |
|                    +--- Bridge Layer -------+                     |
|                    |                                              |
|  +----------------------------------------------------------+    |
|  |  ChimeraManager    |  Settings Bridge  |  Session Bridge  |    |
|  +----------------------------------------------------------+    |
+------------------------------------------------------------------+
                              |
                    .claude/memory/
                    (vault filesystem)
```

## Module Inventory

### Chimera Modules (`src/chimera/`)

| Module | File | Purpose |
|--------|------|---------|
| Memory Injector | `memory/memory-injector.ts` | Reads `.claude/memory/` and builds context string for system prompt |
| Memory Extractor | `memory/memory-extractor.ts` | Scans conversation messages for signals (corrections, decisions, facts) |
| Session Summarizer | `memory/session-summarizer.ts` | Creates compressed session summaries for long-term recall |
| Chimera Manager | `bridge/chimera-manager.ts` | Central coordinator: initializes modules, routes lifecycle events |
| Settings Bridge | `bridge/settings-bridge.ts` | Adds Chimera settings section to Claudian's settings UI |
| Frontmatter | `utils/frontmatter.ts` | YAML frontmatter parser for memory files |
| Token Counter | `utils/token-counter.ts` | Approximate token estimation for budget enforcement |
| Types | `types.ts` | MemoryFile, Session, ChimeraMemorySettings, enums |

### Vault Structure (`.claude/memory/`)

```
.claude/memory/
  system/                    Tier 1: Pinned (always in context)
    identity.md                Agent persona and working style
    human.md                   Facts about the user
    vault-conventions.md       Vault structure and naming rules
  knowledge/                 Tier 2: Indexed (filetree + on-demand)
  reflections/               Dream-generated insights
  sessions/                  Compressed session summaries
```

## Data Flow

### Memory Injection (every query)

```
User sends message
       |
       v
ClaudianService builds query options
       |
       v
[CHIMERA PATCH] ChimeraManager.getActiveMemoryContext()
       |
       v
MemoryInjector reads .claude/memory/ files
  - Pinned files: loaded fully (up to memoryPinnedBudget tokens)
  - Indexed files: directory listing only (up to memoryTreeBudget tokens)
       |
       v
Memory context string returned
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
       |
       v
MemoryExtractor scans messages for:
  - Corrections ("no, actually...")
  - Decisions ("let's go with...")
  - User facts ("I work at...")
       |
       v
Extracted signals appended to memory files
       |
       v
SessionSummarizer creates compressed summary
       |
       v
Summary saved to .claude/memory/sessions/
```

## Patch Map

All patches to Claudian upstream code are marked with `// CHIMERA PATCH:` comments and documented in `patches/README.md`.

| # | File | Lines | What it does |
|---|------|-------|-------------|
| 1 | `core/prompts/mainAgent.ts` | ~5 | Adds `memoryContext` param to system prompt builder |
| 2 | `core/agent/QueryOptionsBuilder.ts` | ~4 | Passes memoryContext through to prompt builder |
| 3 | `core/agent/ClaudianService.ts` | ~5 | Fetches memory context when building query options |
| 4 | `main.ts` | ~8 | Initializes ChimeraManager on plugin load |
| 5 | `features/chat/controllers/ConversationController.ts` | ~5 | Post-session memory extraction hook |
| 6 | `features/settings/ClaudianSettings.ts` | ~3 | Renders Chimera settings section |

## Memory Types

```typescript
enum MemoryTier {
  Pinned    // Always included regardless of budget
  Indexed   // Included when budget allows
  OnDemand  // Loaded only when explicitly requested
}

interface MemoryFile {
  path: string          // Vault-relative path
  description: string   // From frontmatter
  memtype: string       // system, knowledge, user
  tier: MemoryTier
  pinned: boolean
  tags: string[]
  content?: string      // Only populated after load
}

interface ChimeraMemorySettings {
  memoryEnabled: boolean        // default: true
  memoryPinnedBudget: number    // default: 2000
  memoryTreeBudget: number      // default: 500
  autoMemory: boolean           // default: true
  dreamEnabled: boolean         // default: true
}
```

## Design Principles

1. **The vault is the platform.** All data lives in `.claude/` as markdown files.
2. **Minimal patches.** Chimera connects to Claudian through 6 small, documented patches.
3. **Bridge isolation.** Only `src/chimera/bridge/` imports from both Claudian and Chimera zones.
4. **Fail gracefully.** Every Chimera operation is wrapped in try/catch. If memory fails, chat still works.
5. **Budget enforcement.** Token budgets prevent memory from consuming the entire context window.
