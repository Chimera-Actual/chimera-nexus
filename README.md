# Chimera Nexus

A vault-native agentic platform for Obsidian. Built on [Claudian](https://github.com/YishenTu/claudian) with persistent memory, scheduling, and multi-agent orchestration.

> Everything Claudian does, plus your vault remembers.

## What is Chimera Nexus?

Chimera Nexus wraps Claude Code inside Obsidian -- like Claudian -- but adds a vault-native memory system that learns from your conversations. Facts, decisions, corrections, and patterns are automatically extracted and stored as markdown files in your vault's `.claude/memory/` directory. This context is injected into every conversation, making Claude smarter about your project over time.

## Features

### From Claudian (inherited)
- Polished chat UI with multi-tab support
- Full tool call rendering (Bash, Read, Write, Edit, Grep, etc.)
- Thinking block display with duration
- Model selector (Haiku/Sonnet/Opus + 1M variants)
- Effort level selector (Low/Med/High/Max)
- 4 permission modes (Ask/Auto-edit/Plan/Bypass)
- MCP server management
- Plugin discovery and management
- Slash command system with autocomplete
- Inline editing
- File/image context with @mentions
- Session history with search
- Auto-title generation
- Comprehensive settings (9+ sections)
- i18n (10 languages)

### Chimera Nexus Additions
- **Vault-Native Memory** -- Pinned and indexed memory tiers stored as markdown in `.claude/memory/`
- **Auto-Memory Extraction** -- Facts, corrections, and decisions extracted from every conversation
- **Session Summarization** -- Compressed session summaries for long-term recall
- **Memory Context Injection** -- Memory context injected into every system prompt automatically
- **Dream Cycle** -- Periodic memory consolidation (removes stale entries, merges duplicates)
- **Starter Memory Files** -- identity.md, human.md, vault-conventions.md created on first run
- **Skill Marketplace** -- (Coming soon) Curated one-click install of community skills

### Planned Features
- Scheduled tasks (cron-based persistent tasks)
- Background agent manager with priority queue
- Swarm orchestration (multi-agent dependency waves)
- Template variables ({{today}}, {{date:FORMAT}})
- Auto-commit via Obsidian Git

## Installation

### Via BRAT (recommended)
1. Install [BRAT](https://github.com/TfTHacker/obsidian42-brat)
2. Add beta plugin: `Chimera-Actual/chimera-nexus`
3. Select version `1.0.0-beta.2` or later
4. Enable Chimera Nexus in Community Plugins

### Manual
1. Download `main.js`, `manifest.json`, `styles.css` from the [latest release](https://github.com/Chimera-Actual/chimera-nexus/releases)
2. Create folder: `{vault}/.obsidian/plugins/chimera-nexus/`
3. Copy the 3 files into that folder
4. Enable in Obsidian Settings > Community Plugins

## Setup

### Authentication
Chimera Nexus uses Claude Code CLI for authentication. You need:
1. [Claude Code CLI](https://claude.ai/code) installed and logged in (`claude auth login`)
2. The CLI path auto-detects on most systems. If not, set it in Settings > Advanced

**Important:** If you have `ANTHROPIC_API_KEY` set as a system environment variable, the SDK will use that instead of your Claude subscription. Remove it if you want to use your Pro/Max account.

### Memory System
On first run, Chimera creates `.claude/memory/` with starter files:
- `system/identity.md` -- Agent persona and working style
- `system/human.md` -- Facts about you
- `system/vault-conventions.md` -- Your vault's structure and conventions

Edit these files to teach Claude about your project. The content is automatically injected into every conversation.

### Coexistence with Claudian
Chimera Nexus uses a different view type (`chimera-nexus-view`) so it can be installed alongside Claudian. However, only enable one at a time to avoid confusion.

## Architecture

Chimera Nexus uses a **3-zone architecture** to stay maintainable:

```
src/
  [Claudian code]        <-- Upstream zone (minimal patches)
  chimera/               <-- Our zone (memory, utils, types)
    memory/                  Memory injector, extractor, summarizer
    utils/                   Frontmatter parser, token counter
    bridge/                  ChimeraManager, settings bridge
    types.ts                 Chimera-specific types
```

Only 6 surgical patches (~40 lines total) connect Chimera to Claudian. All patches are tracked in `patches/`.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full system diagram and data flow.

## Memory File Format

```markdown
---
description: "Key architectural decisions"
memtype: knowledge
pinned: false
tags:
  - chimera/memory
  - decisions
---

# Architecture Decisions

- Using esbuild for bundling
- Vault-native storage over external databases
```

### Memory Tiers
- **Pinned** (`memtype: system` or `pinned: true`) -- Always loaded into context
- **Indexed** -- File names and descriptions visible, full content loaded on demand
- **On-Demand** -- Loaded only when explicitly requested by the agent

## Configuration

In Obsidian Settings > Chimera Nexus, scroll to the **Chimera Nexus** section:

| Setting | Default | Description |
|---------|---------|-------------|
| Enable Memory Context | On | Inject vault memory into every conversation |
| Auto-extract Memory | On | Extract facts/decisions from conversations |
| Pinned Memory Budget | 2000 | Max tokens for pinned memory |
| Memory Tree Budget | 500 | Max tokens for memory file index |
| Dream Cycle | On | Periodic memory consolidation |

## Development

```bash
git clone https://github.com/Chimera-Actual/chimera-nexus.git
cd chimera-nexus
git checkout v2
npm install
npm run dev    # Watch mode
npm run build  # Production build
npm test       # Run tests
```

### Upstream Merges
Claudian upstream is tracked via the `upstream` remote. See `patches/README.md` for the merge process.

## Credits

- Built on [Claudian](https://github.com/YishenTu/claudian) by Yishen Tu (MIT license)
- Memory system architecture inspired by [Letta](https://github.com/letta-ai/letta) MemFS benchmarks
- Claude Code CLI by [Anthropic](https://anthropic.com)

## License

MIT
