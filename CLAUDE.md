# CLAUDE.md - Chimera Nexus

## Project Identity

Chimera Nexus is a vault-native agentic platform for Obsidian. It wraps the Claude Agent SDK to provide persistent memory, scheduled tasks, background agents, multi-agent swarms, and per-agent conversation history -- all stored as markdown files in the vault's standard `.claude/` directory.

The vault's `.claude/` folder is a full Claude Code project. Skills, agents, commands, hooks, plugins, rules, and settings defined here work in both Claude Code CLI and Chimera Nexus. Share a vault via git and collaborators get the complete agentic workspace ready to use.

**Zero external dependencies. Everything is markdown. Everything is yours.**

## Tech Stack

- TypeScript (strict mode)
- Obsidian Plugin API (v1.8.9+, desktop only)
- esbuild for bundling
- @anthropic-ai/claude-agent-sdk (npm)
- Jest for testing
- ESLint for linting

## Source Structure

```
chimera-nexus/
  CLAUDE.md
  docs/
    architecture-reference.md      # Full architecture spec (THE reference)
  src/
    main.ts                        # Plugin entry (extends Plugin)
    core/
      runtime/
        session-manager.ts         # Session pool, priority queue, concurrency
        sdk-wrapper.ts             # Claude Agent SDK wrapper
        tool-enforcer.ts           # Tool restriction enforcement
        template-resolver.ts       # {{variable}} resolution
      memory/
        memory-injector.ts         # System prompt injection (tiers 1-3)
        memory-extractor.ts        # Post-session memory extraction
        session-summarizer.ts      # Compressed session summaries
        dream-runner.ts            # Dream cycle (4-phase consolidation)
      scheduler/
        loop-scheduler.ts          # /loop session-scoped tasks
        task-scheduler.ts          # Persistent cron tasks
        cron-parser.ts             # 5-field cron evaluator
        missed-run-handler.ts      # Missed run recovery
      agents/
        agent-loader.ts            # Load from .claude/agents/ + ~/.claude/agents/
        foreground-runner.ts       # Blocking inline delegation
        background-manager.ts      # Non-blocking background pool
        swarm-runner.ts            # Multi-agent orchestration
      claude-compat/
        skill-loader.ts            # .claude/skills/ (CC format)
        command-loader.ts          # .claude/commands/ (CC format)
        hook-manager.ts            # settings.json hooks (12 events, 4 types)
        settings-loader.ts         # Merge managed > project > user
        plugin-loader.ts           # .claude/plugins/
        rules-loader.ts            # .claude/rules/
      types/
        index.ts                   # All shared type definitions
    features/
      chat/
        chat-view.ts               # Sidebar chat (ItemView)
        chat-renderer.ts           # Message rendering
        agent-selector.ts          # Agent dropdown + session list
        mention-detector.ts        # @agent-name parsing
        status-bar.ts              # Background agent status
        completion-card.ts         # Agent completion cards
      sessions/
        session-store.ts           # Read/write session markdown files
        session-index.ts           # JSON index cache
      settings/
        settings-tab.ts            # All settings sections
        auth-settings.ts           # CLI / API key configuration
      onboarding/
        onboarding-wizard.ts       # First-run setup
    commands/
      slash-commands.ts            # /loop /schedule /agents /memory /help /dream
    i18n/
      en.ts
    utils/
      frontmatter.ts              # YAML frontmatter parse/write
      vault-helpers.ts             # Obsidian Vault API utilities
      cron-utils.ts                # Cron matching + next-run
      token-counter.ts             # Approximate token counting
  styles/
    styles.css
  manifest.json
  package.json
  tsconfig.json
  esbuild.config.mjs
  jest.config.js
  .eslintrc.cjs
```

## Vault `.claude/` Directory

The vault's `.claude/` follows the Claude Code project standard. Chimera Nexus extends it with memory, tasks, sessions, and orchestration subdirectories.

```
{vault}/
  CLAUDE.md                          # Project context (CC standard)
  .claude/
    settings.json                    # Permissions, hooks, env (CC standard)
    skills/                          # CC standard: auto-invoked modules
    agents/                          # CC standard: subagent definitions
    commands/                        # CC standard: slash commands
    plugins/                         # CC standard: plugin registry
    hooks/                           # CC standard: hook scripts
    rules/                           # CC standard: file-pattern rules
    output-styles/                   # CC standard: output formatting
    memory/                          # Chimera: MemFS (vault-native memory)
      system/                        #   Tier 1: Pinned (always in context)
      knowledge/                     #   Tier 2: Indexed (filetree + on-demand)
      reflections/                   #   Dream-generated insights
      sessions/                      #   Compressed session summaries (memory)
    sessions/                        # Chimera: conversation history
      index.json                     #   Session registry cache
      default/                       #   Default agent sessions
      {agent-name}/                  #   Per-agent session folders
    tasks/                           # Chimera: scheduled task definitions
    task-logs/                       # Chimera: execution logs
    agent-memory/                    # Chimera: per-agent learning
    swarm-runs/                      # Chimera: coordination artifacts
    backups/                         # Chimera: pre-dream snapshots
```

**Portability:** Git clone a vault and get skills, agents, commands, hooks, settings, and shared memory. Personal data (sessions, reflections, task-logs) is gitignored.

## Architecture Principles

1. THE VAULT IS THE PLATFORM. All data in `.claude/` as markdown.
2. FULL CLAUDE CODE COMPATIBILITY. One `.claude/`, two interfaces.
3. ZERO EXTERNAL DEPENDENCIES. Claude Code CLI or API key only.
4. PROGRESSIVE DISCLOSURE. Filetree visible, contents on demand.
5. GENERAL-PURPOSE TOOLS for memory. No specialized memory API.
6. TRANSPARENCY. Every action produces a visible vault artifact.
7. PORTABILITY. Git clone = complete agentic workspace.

## Authentication

**Path A: CLI wrapper (default)** -- User has Claude Code installed and logged in. Chimera spawns `claude` processes. Users keep their Pro/Max subscription. Requires CC CLI in PATH.

**Path B: Agent SDK direct (API key)** -- User provides ANTHROPIC_API_KEY. Chimera uses the SDK npm package directly. Pay-per-token. Also supports Bedrock/Vertex/Foundry.

Anthropic does not allow third-party OAuth login via the Agent SDK. Chimera delegates auth to the user's own CC installation (Path A) or their API key (Path B).

## Key Design Decisions

- Memory: vault-native MemFS (Letta benchmarked filesystem at 74% vs specialized tools at 68.5%)
- Memory injection: configurable token budget (2000 pinned, 500 filetree)
- Session priority: Chat(1) > Loop(2) > Scheduled(3) > Background(4) > Dream(5)
- Concurrent sessions: 2 default (one reserved for chat)
- Dream trigger: 24h + 5 sessions, sandboxed (memory dir only), Haiku default
- Scheduled tasks: 5-field cron + template variables
- Background agents: outputs as vault notes
- Swarms: vault-file coordination, dependency waves
- Sessions stored as markdown with frontmatter, per-agent folders
- Agent selector: dropdown in sidebar header, session list per agent
- @mention delegation: foreground default, (bg) flag for background
- Default permission mode: Safe (not YOLO)
- Skills/agents/commands/hooks: Claude Code format exactly
- Hooks: 12 events, 4 handler types (command, http, prompt, agent)

## Coding Conventions

- TypeScript strict mode, no `any` except SDK interfaces
- TSDoc on all public interfaces
- Discriminated unions for tool/agent types
- File I/O through `this.app.vault`, never `fs`
- `this.registerInterval()` for timers, `this.registerEvent()` for events
- try/catch on all async, never swallow errors
- `Notice` class for user notifications
- Never use emdashes
- Follow CC naming for shared resources

## Current Phase: Phase 1 (Foundation)

- [ ] Plugin scaffold (entry, settings, sidebar, .claude/ creation)
- [ ] Claude compat layer (skill/command/agent/hook/settings/plugin/rules loaders)
- [ ] Agent selector dropdown + session list in sidebar header
- [ ] Session storage as markdown in .claude/sessions/
- [ ] @mention detection and delegation (foreground + background)
- [ ] Memory file format with frontmatter schema
- [ ] System prompt: CLAUDE.md + pinned memory + filetree + skills + agents
- [ ] SDK wrapper with streaming chat
- [ ] Post-session memory extraction + session summarizer
- [ ] /memory, /help slash commands
- [ ] First-run onboarding wizard
- [ ] Unit tests for frontmatter, token counter, cron parser, settings merge

DO NOT build scheduling, swarms, or dream cycle yet. Get chat, agents, sessions, and memory working first.

## Reference

Full architecture specification: `docs/architecture-reference.md`
