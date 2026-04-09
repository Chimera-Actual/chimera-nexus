# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chimera Nexus — A fork of [Claudian](https://github.com/YishenTu/claudian) (an Obsidian plugin that embeds Claude Code as a sidebar chat). Adds a vault-native memory system that learns from conversations, with facts/decisions/corrections automatically extracted and stored as markdown in `.claude/memory/`. Memory context is injected into every conversation's system prompt.

## Commands

```bash
npm run dev        # Development (watch mode)
npm run build      # Production build
npm run typecheck  # Type check
npm run lint       # Lint code
npm run lint:fix   # Lint and auto-fix
npm run test       # Run tests
npm run test:watch # Run tests in watch mode
```

## Architecture

| Layer | Purpose | Details |
|-------|---------|---------|
| **core** | Infrastructure (no feature deps) | See [`src/core/CLAUDE.md`](src/core/CLAUDE.md) |
| **features/chat** | Main sidebar interface | See [`src/features/chat/CLAUDE.md`](src/features/chat/CLAUDE.md) |
| **features/inline-edit** | Inline edit modal | `InlineEditService`, read-only tools |
| **features/settings** | Settings tab | UI components for all settings |
| **shared** | Reusable UI | Dropdowns, instruction modal, fork target modal, @-mention, icons |
| **i18n** | Internationalization | 10 locales |
| **utils** | Utility functions | date, path, env, editor, session, markdown, diff, context, sdkSession, frontmatter, slashCommand, mcp, claudeCli, externalContext, externalContextScanner, fileLink, imageEmbed, inlineEdit |
| **style** | Modular CSS | See [`src/style/CLAUDE.md`](src/style/CLAUDE.md) |

## Tests

```bash
npm run test -- --selectProjects unit        # Run unit tests
npm run test -- --selectProjects integration # Run integration tests
npm run test -- --selectProjects chimera     # Run Chimera-specific tests
npm run test:coverage -- --selectProjects unit # Unit coverage
npm run test -- --selectProjects unit --testPathPattern <pattern> # Single test
```

Tests mirror `src/` structure: `tests/unit/`, `tests/integration/`, `tests/chimera/`.

### Path Aliases

`@/*` → `src/*`, `@test/*` → `tests/*` (configured in tsconfig and jest moduleNameMapper). External deps (`obsidian`, `@anthropic-ai/claude-agent-sdk`) are mocked in `tests/__mocks__/`.

## Storage

| File | Contents |
|------|----------|
| `.claude/settings.json` | CC-compatible: permissions, env, enabledPlugins |
| `.claude/claudian-settings.json` | Claudian-specific settings (model, UI, etc.) |
| `.claude/settings.local.json` | Local overrides (gitignored) |
| `.claude/mcp.json` | MCP server configs |
| `.claude/commands/*.md` | Slash commands (YAML frontmatter) |
| `.claude/agents/*.md` | Custom agents (YAML frontmatter) |
| `.claude/skills/*/SKILL.md` | Skill definitions |
| `.claude/sessions/*.meta.json` | Session metadata |
| `~/.claude/projects/{vault}/*.jsonl` | SDK-native session messages |

## Development Notes

- **SDK-first**: Proactively use native Claude SDK features over custom implementations. If the SDK provides a capability, use it — do not reinvent it. This ensures compatibility with Claude Code.
- **SDK exploration**: When developing SDK-related features, write a throwaway test script (e.g., in `dev/`) that calls the real SDK to observe actual response shapes, event sequences, and edge cases. Real output lands in `~/.claude/` or `{vault}/.claude/` — inspect those files to understand patterns and formats. Run this before writing implementation or tests — real output beats guessing at types and formats. This is the default first step for any SDK integration work.
- **Comments**: Only comment WHY, not WHAT. No JSDoc that restates the function name (`/** Get servers. */` on `getServers()`), no narrating inline comments (`// Create the channel` before `new Channel()`), no module-level docs on barrel `index.ts` files. Keep JSDoc only when it adds non-obvious context (edge cases, constraints, surprising behavior).
- **TDD workflow**: For new functions/modules and bug fixes, follow red-green-refactor:
  1. Write a failing test first in the mirrored path under `tests/unit/` (or `tests/integration/`)
  2. Run it with `npm run test -- --selectProjects unit --testPathPattern <pattern>` to confirm it fails
  3. Write the minimal implementation to make it pass
  4. Refactor, keeping tests green
  - For bug fixes, write a test that reproduces the bug before fixing it
  - Test behavior and public API, not internal implementation details
  - Skip TDD for trivial changes (renaming, moving files, config tweaks) — but still verify existing tests pass
- Run `npm run typecheck && npm run lint && npm run test && npm run build` after editing
- No `console.*` in production code 
  - use Obsidian's notification system if user should be notified
  - use `console.log` for debugging, but remove it before committing
- Generated docs/test scripts go in `dev/`.

## Chimera Nexus Extensions

This repository is a fork of Claudian with Chimera Nexus extensions.

### 3-Zone Architecture
- `src/` -- Claudian upstream code (minimal patches, tracked in patches/)
- `src/chimera/` -- Chimera modules (memory, utils, bridge)
- `src/chimera/bridge/` -- Boundary layer connecting both zones

### Chimera Modules
- `src/chimera/memory/memory-injector.ts` -- Builds memory context for system prompt (TTL-cached 5 min, 4-layer assembly)
- `src/chimera/memory/memory-extractor.ts` -- Extracts signals from conversations (debounced 10s, scans last 20 messages)
- `src/chimera/memory/session-summarizer.ts` -- Creates compressed session summaries
- `src/chimera/memory/dream-runner.ts` -- Periodic memory consolidation (inventory → extract → consolidate → reorganize)
- `src/chimera/bridge/chimera-manager.ts` -- Central coordinator
- `src/chimera/bridge/settings-bridge.ts` -- Adds settings to Claudian UI
- `src/chimera/bridge/config-transfer.ts` -- Config export/import
- `src/chimera/bridge/skill-marketplace.ts` -- Skill discovery and install
- `src/chimera/types.ts` -- Memory-specific type definitions
- `src/chimera/utils/frontmatter.ts` -- YAML frontmatter parser
- `src/chimera/utils/token-counter.ts` -- Token estimation

### Patches (6 surgical patches, ~30 lines total)

Each patch is in `patches/` with docs. Every patched line has a `// CHIMERA PATCH:` comment.

| # | File | What |
|---|------|------|
| 01 | `src/core/prompts/mainAgent.ts` | Adds `memoryContext` to system prompt |
| 02 | `src/core/agent/QueryOptionsBuilder.ts` | Threads `memoryContext` through query options |
| 03 | `src/main.ts` | Initializes/cleans up `ChimeraManager` |
| 04 | `src/core/agent/ClaudianService.ts` | Makes `buildQueryOptionsContext` async, fetches memory |
| 05 | `src/features/chat/controllers/ConversationController.ts` | Fire-and-forget memory extraction after conversation |
| 06 | `src/features/settings/ClaudianSettings.ts` | Renders Chimera settings section |

### Upstream Merges

Claudian upstream is tracked via the `upstream` remote. Process: fetch → merge --no-commit → check conflicts against patches → re-apply patches → test → smoke test. See `patches/README.md`.

### Coding Conventions (Chimera additions)
- All Chimera code in `src/chimera/` -- never import Claudian internals directly
- Bridge files are the ONLY place that imports from both zones
- Every patch has a `// CHIMERA PATCH:` comment
