# Chimera Nexus -- Claude Code Kickoff

## Setup

```bash
mkdir chimera-nexus && cd chimera-nexus
# Place CLAUDE.md in root
# Place architecture-reference.md in docs/
mkdir -p docs
# Then:
claude
```

---

## Session 1 Prompt

```
Read CLAUDE.md and docs/architecture-reference.md thoroughly before doing anything.

You are building Chimera Nexus, a vault-native agentic platform for Obsidian. Phase 1: Foundation. Work through each task in order. Stop after each for my review.

===== TASK 1: SCAFFOLD =====

Create the full project from scratch:

package.json:
- name: chimera-nexus
- dependencies: obsidian (latest), @anthropic-ai/claude-agent-sdk (^0.2.76)
- devDependencies: typescript (^5.x), esbuild, @types/node (^20.x), jest (^29.x), ts-jest (^29.x), eslint (^8.x), @typescript-eslint/parser, @typescript-eslint/eslint-plugin, builtin-modules
- scripts: dev (esbuild watch), build (esbuild prod), lint, test

tsconfig.json: strict, ES2021 target, ESNext modules, declaration true

esbuild.config.mjs: Obsidian plugin bundling, externals (obsidian, electron, @codemirror/*, @lezer/*)

manifest.json: id "chimera-nexus", name "Chimera Nexus", minAppVersion "1.8.9", isDesktopOnly true, version "0.1.0"

versions.json, jest.config.js, .eslintrc.cjs, .gitignore (include patterns from CLAUDE.md)

Create the FULL src/ directory structure from CLAUDE.md. For modules not built yet (scheduler/*, agents/swarm-runner, etc.), create stub files with a TODO comment and the module's purpose as a TSDoc comment.

Create src/core/types/index.ts with ALL type definitions:
- MemoryFile, MemoryTier enum (Pinned, Indexed, OnDemand)
- SessionSummary (memory), ConversationMessage, Session (chat history)
- SessionIndexEntry, SessionIndex
- ScheduledTask, LoopTask (stub interfaces)
- AgentDefinition (name, description, model, type, allowedTools, deniedTools, isolation, memory, maxTokens, timeoutSeconds, outputFormat, outputPath, color, systemPrompt)
- SkillDefinition (name, description, path, hasScripts, hasReferences)
- CommandDefinition (name, description, argumentHint, path)
- HookEvent enum (all 12+: Setup, SessionStart, SessionEnd, UserPromptSubmit, PreToolUse, PostToolUse, PostToolUseFailure, PermissionRequest, Stop, StopFailure, SubagentStart, SubagentStop, PreCompact, Notification, FileChanged)
- HookHandler (type: command|http|prompt|agent, command?, url?, async?)
- HookDefinition (event, matcher, handlers)
- MentionResult (agentName, task, background, originalMessage)
- PermissionMode enum (Safe, Plan, YOLO)
- AuthMethod enum (CLI, APIKey)
- ChimeraSettings (all settings with defaults: authMethod, apiKey, cliPath, permissionMode, memoryPinnedBudget: 2000, memoryTreeBudget: 500, maxConcurrentSessions: 2, dreamEnabled: true, autoMemory: true, userName, excludedTags)

Create src/main.ts:
- Extends Plugin
- onload: register ribbon icon ("bot"), register command "Open Chimera Nexus", load settings, call initVaultStructure(), init compat loaders, init memory injector, register sidebar view
- onunload: clean up
- initVaultStructure(): create .claude/ subdirectories if missing, generate starter memory files on first run (identity.md, human.md, vault-conventions.md). NEVER overwrite existing files.
- loadSettings/saveSettings using this.loadData()/this.saveData()

Create src/features/settings/settings-tab.ts:
- Sections: Authentication (CLI vs API key dropdown, key field, CLI path), Memory (toggles, budgets), Agents (list), Security (permission mode), Advanced
- Real settings bound to ChimeraSettings

Create src/features/chat/chat-view.ts:
- ItemView, viewType "chimera-nexus-chat", icon "bot"
- Layout: agent selector dropdown at top, session list below it, message area, input with send button
- Placeholder status bar at bottom

Stop here for review.

===== TASK 2: CLAUDE CODE COMPAT LAYER =====

Create src/core/claude-compat/settings-loader.ts:
- Reads .claude/settings.json + ~/.claude/settings.json
- Merges: project overrides user
- Extracts permissions (allow/deny/ask arrays), hooks, env vars
- Returns typed resolved settings object

Create src/core/claude-compat/skill-loader.ts:
- Scan .claude/skills/ and ~/.claude/skills/ for dirs with SKILL.md
- Parse SKILL.md frontmatter (name, description)
- Return SkillDefinition[] (lazy -- don't load full content)

Create src/core/claude-compat/command-loader.ts:
- Scan .claude/commands/ and ~/.claude/commands/ for .md files
- Parse frontmatter (description, argument-hint)
- Return CommandDefinition[]

Create src/core/claude-compat/agent-loader.ts:
- Scan .claude/agents/ and ~/.claude/agents/ for .md files
- Parse YAML frontmatter (all AgentDefinition fields)
- Parse body as systemPrompt
- Return AgentDefinition[]

Create src/core/claude-compat/hook-manager.ts:
- Read hooks from resolved settings
- Store handlers indexed by event
- fireHook(event, input): find matching handlers, execute
- Command type: spawn shell, JSON on stdin, handle exit codes (0=proceed, 2=block)
- Http/prompt/agent types: stub with TODO
- Return hook result (proceed/block/modified input)

Create src/core/claude-compat/rules-loader.ts:
- Scan .claude/rules/ for .md files
- Return array of {pattern, content} for system prompt injection

Write unit tests for settings merge logic and skill SKILL.md parsing.

Stop here for review.

===== TASK 3: AGENT SELECTOR + SESSION STORE =====

Create src/features/chat/agent-selector.ts:
- Component that renders agent dropdown + session list
- Dropdown populated from agent-loader results + "Default Chimera" first entry
- On agent change: filter session list, emit event
- Session list: show recent sessions for selected agent from index
- Click session to emit resume event

Create src/features/chat/mention-detector.ts:
- detectMention(message, agentNames): parse @agent-name from user input
- Return MentionResult or null
- Detect (bg)/(background) flag
- Strip mention and flags from task text

Create src/features/sessions/session-store.ts:
- saveSession(session): write markdown to .claude/sessions/{agent}/
- loadSession(path): read markdown, parse frontmatter + transcript
- listSessions(agent?): read from index, filter by agent
- renderTranscript(session): format messages as ## User / ## Assistant sections
- parseTranscript(body): parse back to ConversationMessage[]

Create src/features/sessions/session-index.ts:
- Lightweight JSON at .claude/sessions/index.json
- addSession / updateSession / removeSession
- rebuildIndex(): scan all session markdown files, rebuild cache
- Call rebuildIndex() on plugin load

Stop here for review.

===== TASK 4: MEMORY SYSTEM =====

Create src/utils/frontmatter.ts:
- parseFrontmatter(content): extract YAML between --- delimiters
- stringifyFrontmatter(frontmatter, body): render back
- Handle: no frontmatter, empty body, special chars

Create src/utils/token-counter.ts:
- estimateTokens(text): chars / 4
- truncateToTokenBudget(text, budget): truncate at sentence boundary

Create src/core/memory/memory-injector.ts:
- readMemoryTree(): list all files in .claude/memory/ recursively
- classifyMemory(files): split into Pinned vs Indexed
- buildPinnedContext(pinned, budget): concatenate full contents, truncate
- buildTreeIndex(indexed): compact listing of path + description
- buildSystemPromptContext(): assemble all layers (CLAUDE.md + pinned + tree + skills + agents + rules + permissions)

Write unit tests for frontmatter and token counter.

Stop here for review.

===== CONSTRAINTS =====
- Obsidian Vault API for ALL file I/O, never fs
- this.registerInterval() for timers
- this.registerEvent() for events
- TypeScript strict, no any except SDK interfaces
- TSDoc on every public function and interface
- Never use emdashes in any string
- When creating .claude/ in existing vaults, NEVER overwrite existing files
- Session markdown is source of truth, JSON index is a cache
```

---

## Session 2 Plan

- SDK wrapper (talk to Claude via CLI or API key)
- System prompt assembly calling memory-injector.buildSystemPromptContext()
- Streaming chat in sidebar view
- Post-session memory extraction + session summarizer
- Hook firing on PreToolUse/PostToolUse/Stop events
- Wire agent selector: switching agents creates new session with agent config
- Wire @mention: detect, delegate to foreground/background runner stubs

## Session 3 Plan

- /memory slash command (view/edit from chat)
- /help command
- Claude Code commands registered as slash commands
- Auto-commit via Obsidian Git (if available)
- Resume session from session list (load transcript, rebuild context)

## Phase 2 (Sessions 4-6): Scheduling

- /loop, persistent tasks, cron parser, template variables, missed runs, dream cycle

## Phase 3 (Sessions 7-9): Background Agents

- Foreground/background runners, status bar, completion cards, per-agent memory

## Phase 4 (Sessions 10-11): Swarms

- Manifest, dependency waves, vault-file coordination, orchestrator type

## Phase 5 (Session 12): Polish

- Cost dashboard, example agent/task libraries, onboarding wizard, docs
