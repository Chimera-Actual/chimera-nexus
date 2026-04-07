# Chimera Nexus User Guide

A vault-native agentic platform for Obsidian. Built on [Claudian](https://github.com/YishenTu/claudian) with persistent memory, scheduling, and multi-agent orchestration.

> Everything Claudian does, plus your vault remembers.

---

## Table of Contents

- [What is Chimera Nexus?](#what-is-chimera-nexus)
- [Requirements](#requirements)
- [Installation](#installation)
- [Getting Started](#getting-started)
- [Chat Interface](#chat-interface)
- [Memory System](#memory-system)
- [Dream Cycle](#dream-cycle)
- [Skill Marketplace](#skill-marketplace)
- [Configuration Export/Import](#configuration-exportimport)
- [Scheduling & Automation](#scheduling--automation)
- [Agents](#agents)
- [Plugin System](#plugin-system)
- [Settings Reference](#settings-reference)
- [File & Directory Reference](#file--directory-reference)
- [Troubleshooting](#troubleshooting)

---

## What is Chimera Nexus?

Chimera Nexus embeds Claude Code inside Obsidian as a sidebar chat. Your vault directory becomes Claude's working directory, giving it full agentic capabilities -- file read/write, bash commands, and multi-step workflows.

What sets it apart from Claudian (its upstream) is the **vault-native memory system**. After every conversation, Chimera extracts facts, decisions, and corrections into markdown files stored in `.claude/memory/`. This context is automatically injected into every future conversation, so Claude gets smarter about your project over time.

**Core philosophy:** The vault *is* the platform. No external databases, no cloud memory services. Just markdown files that Claude reads and writes.

---

## Requirements

| Requirement | Details |
|-------------|---------|
| Obsidian | v1.4.5 or later |
| Platform | Desktop only (Windows, macOS, Linux) |
| Claude Code CLI | Installed and authenticated (`claude auth login`) |
| Subscription | Claude Pro, Max, or Team (or API key) |

### Installing Claude Code CLI

1. Visit [claude.ai/code](https://claude.ai/code) and follow the installation instructions
2. Open a terminal and run: `claude auth login`
3. Complete the browser-based OAuth flow
4. Verify with: `claude --version`

---

## Installation

### Via BRAT (Recommended)

[BRAT](https://github.com/TfTHacker/obsidian42-brat) is a plugin manager that supports beta plugins.

1. Install BRAT from Obsidian's Community Plugins
2. Open BRAT settings and click **Add Beta Plugin**
3. Enter: `Chimera-Actual/chimera-nexus`
4. Select version `1.0.0-beta.2` or later
5. Click **Add Plugin**
6. Go to Settings > Community Plugins and enable **Chimera Nexus**

### Manual Installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/Chimera-Actual/chimera-nexus/releases)
2. In your vault folder, create: `.obsidian/plugins/chimera-nexus/`
3. Copy all 3 files into that folder
4. Restart Obsidian (or reload plugins)
5. Go to Settings > Community Plugins and enable **Chimera Nexus**

### Coexistence with Claudian

Chimera Nexus uses a separate view type (`chimera-nexus-view`), so it can be installed alongside Claudian without conflicts. However, only enable one at a time to avoid duplicate sidebar panels.

---

## Getting Started

### First Launch

1. After enabling the plugin, click the **Chimera Nexus icon** in the left sidebar (or use the command palette: "Chimera Nexus: Open Chat")
2. The sidebar chat panel opens
3. On first run, Chimera creates the memory directory at `.claude/memory/` with three starter files:
   - `system/identity.md` -- Agent persona and working style
   - `system/human.md` -- Facts about you (the user)
   - `system/vault-conventions.md` -- Your vault's structure and conventions

### Authentication

Chimera Nexus uses the Claude Code CLI for authentication. If you've already run `claude auth login`, you're set.

**Troubleshooting auth:**
- If you have `ANTHROPIC_API_KEY` set as an environment variable, the SDK will use that API key instead of your Claude subscription. Remove it if you want to use your Pro/Max account.
- If the CLI path isn't auto-detected, set it manually in Settings > Chimera Nexus > Advanced

### Your First Conversation

Type a message in the chat input and press Enter. Claude has full access to your vault directory and can:
- Read and write files
- Run bash/shell commands
- Search your vault
- Execute multi-step workflows
- Reference your memory context automatically

---

## Chat Interface

Chimera Nexus inherits Claudian's polished chat UI. Here's what you can do:

### Multi-Tab Support

Open multiple concurrent conversations in separate tabs. Each tab maintains its own session and context.

### Model Selection

Choose from available Claude models using the model selector dropdown:
- **Haiku** -- Fast, lightweight
- **Sonnet** -- Balanced speed and capability
- **Opus** -- Most capable
- 1M context variants available for each

### Effort Level

Control how much thinking Claude does:
- **Low** -- Quick, direct answers
- **Medium** -- Standard reasoning
- **High** -- Deeper analysis
- **Max** -- Maximum reasoning effort

### Permission Modes

Control what Claude can do without asking:

| Mode | Behavior |
|------|----------|
| **Ask Before Edits** | Claude asks before writing/editing files |
| **Edit Automatically** | Claude can read and write freely |
| **Plan** | Claude plans but doesn't execute |
| **Bypass Permissions** | Full autonomy (use with caution) |

### Tool Call Rendering

When Claude uses tools (Read, Write, Edit, Bash, Grep, Glob, etc.), the tool calls are rendered inline in the conversation with:
- Expandable/collapsible tool blocks
- Syntax-highlighted code
- Diff views for edits

### Thinking Blocks

Claude's reasoning process is displayed as collapsible "thinking" blocks with duration timers, so you can see how Claude arrived at its answer.

### @-Mentions

Reference files and images directly in your message:
- Type `@` followed by a file name to include it as context
- Works with images (they're sent as visual context)
- The referenced file content is sent alongside your message

### Slash Commands

Type `/` to see available slash commands. Commands are defined as markdown files in `.claude/commands/` with YAML frontmatter:

```markdown
---
name: review
description: Review code for issues
---

Review the following code for bugs, security issues, and style problems:

$ARGUMENTS
```

### Inline Editing

Select text in your editor, then use the inline edit feature to have Claude modify just that selection.

### Session History

Access past conversations through the session history panel:
- Search sessions by title or content
- Sessions are auto-titled based on the conversation
- Session metadata stored in `.claude/sessions/*.meta.json`
- Full message history stored in `~/.claude/projects/{vault}/*.jsonl`

---

## Memory System

The memory system is Chimera Nexus's core innovation. It gives Claude persistent, vault-native memory that grows over time.

### How It Works

```
1. You chat with Claude
2. After each conversation, Chimera extracts signals:
   - Corrections ("no, actually...")
   - Decisions ("let's go with...")
   - Facts about you ("I work at...", "I prefer...")
3. Signals are appended to markdown files in .claude/memory/
4. Next conversation: memory is injected into the system prompt
5. Claude starts with context about you and your project
```

### Memory Directory Structure

```
.claude/memory/
  system/                     # Tier 1: Pinned (always in context)
    identity.md                 # Agent persona and working style
    human.md                    # Facts about you
    vault-conventions.md        # Vault structure and naming rules
  knowledge/                  # Tier 2: Indexed (titles visible, content on-demand)
    corrections.md              # Auto-extracted corrections
    decisions.md                # Auto-extracted decisions
    [your custom files].md      # Anything you add here
  reflections/                # Dream-generated insights
    [consolidated files].md
  sessions/                   # Compressed session summaries
    2026-04-07-abc123.md        # One per session
```

### Memory Tiers

Memory files are organized into tiers that control how they're loaded into context:

| Tier | Criteria | Loading Behavior |
|------|----------|-----------------|
| **Pinned** | `memtype: system` or `pinned: true` | Full content always loaded (up to budget) |
| **Indexed** | Everything else | File names and descriptions listed; content loaded on demand |
| **On-Demand** | Special flag | Only loaded when explicitly requested |

### Memory File Format

Every memory file uses YAML frontmatter:

```markdown
---
description: "Key architectural decisions for this project"
memtype: knowledge
pinned: false
tags:
  - chimera/memory
  - decisions
created: 2026-04-07T10:00:00Z
updated: 2026-04-07T10:30:00Z
---

# Architectural Decisions

- Using esbuild for bundling because it's 100x faster than webpack
- Vault-native storage over external databases for portability
- Three-zone architecture to minimize upstream merge conflicts
```

### Frontmatter Fields

| Field | Type | Description |
|-------|------|-------------|
| `description` | string | One-line summary (shown in memory index) |
| `memtype` | string | `system`, `knowledge`, `user`, or custom |
| `pinned` | boolean | Force-pin to always load in context |
| `tags` | string[] | Organizational tags |
| `created` | ISO date | When the file was created |
| `updated` | ISO date | When the file was last modified |

### Creating Custom Memory Files

You can create memory files manually. Just add a `.md` file anywhere under `.claude/memory/` with proper frontmatter:

```markdown
---
description: "API keys and service endpoints for our infrastructure"
memtype: knowledge
pinned: true
tags:
  - infrastructure
---

# Service Endpoints

- Production API: api.example.com
- Staging: staging-api.example.com
- Database: PostgreSQL on port 5432
```

Set `pinned: true` for information Claude should always have. Leave it `false` for reference material that Claude can request when relevant.

### Auto-Extraction

When **Auto-extract Memory** is enabled (default), Chimera scans each conversation after it ends for:

| Signal | Pattern Examples | Stored In |
|--------|-----------------|-----------|
| Corrections | "no, actually...", "that's wrong", "not that" | `knowledge/corrections.md` |
| Decisions | "let's go with...", "I decided", "the plan is" | `knowledge/decisions.md` |
| User facts | "I am a...", "I work at...", "I prefer..." | `system/human.md` |
| Repeated topics | 3+ mentions of the same topic | `knowledge/decisions.md` |

Each extracted entry is timestamped:

```markdown
[2026-04-07T10:30:00Z] User prefers TypeScript over JavaScript for all new code
```

### Session Summaries

After each conversation, a compressed summary is saved to `.claude/memory/sessions/`:

```markdown
---
description: "Session: Refactored auth middleware"
memtype: session
tags:
  - chimera/session
created: 2026-04-07T10:30:00Z
---

# Refactored auth middleware

**Key Topics:** authentication, middleware, express, jwt, security
**Decisions:** Switch from cookie-based to JWT tokens
**Token Count:** 4,520
```

Summaries are heuristic-based (no LLM call) -- they analyze word frequency and pattern-match decision language.

### Token Budgets

Memory injection respects strict token budgets to avoid consuming Claude's context window:

| Budget | Default | Controls |
|--------|---------|----------|
| Pinned Memory Budget | 2,000 tokens | Maximum tokens for pinned file content |
| Memory Tree Budget | 500 tokens | Maximum tokens for the file index |

Token estimation uses a fast heuristic (characters / 4) rather than a full tokenizer. If pinned content exceeds the budget, files are truncated at sentence boundaries.

### Memory Context Assembly

When you send a message, the memory context is assembled in 4 layers:

1. **Base prompt** -- "You are Chimera Nexus, a vault-native agent..."
2. **CLAUDE.md** -- Your vault's root CLAUDE.md file (if it exists)
3. **Pinned memory** -- Full content of all pinned files (up to budget)
4. **Memory tree index** -- Compact listing of all other memory files (up to budget)

This assembled context is injected into the system prompt before your message reaches Claude.

---

## Dream Cycle

The dream cycle is an automated maintenance process that consolidates and optimizes your memory over time.

### What It Does

The dream runner executes 4 phases:

| Phase | Name | Action |
|-------|------|--------|
| 1 | **Inventory** | Catalog all memory and session files, detect stale entries (>30 days untouched) |
| 2 | **Extract** | Pull signals from recent session summaries that haven't been processed |
| 3 | **Consolidate** | Merge small files (<100 tokens) into larger ones; split oversized files (>2,000 tokens) |
| 4 | **Reorganize** | Rewrite files for optimal retrieval structure |

### Eligibility

The dream cycle only runs when:
- At least 24 hours since the last dream
- At least 5 new session files since the last dream
- No other dream is currently running

### Safety Mechanisms

- **File lock** -- `dream.lock` prevents concurrent runs
- **Backup** -- Original files are backed up before any mutations
- **Timeout** -- 10-minute maximum execution time
- **Sandboxed** -- Only operates within `.claude/memory/`
- **Graceful** -- If anything fails, the dream aborts and chat continues working

### Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| Dream Cycle | Enabled | Toggle periodic consolidation |
| Dream Interval | 1 hour | How often to check dream eligibility (minimum 15 minutes) |

Dream state is tracked in `.claude/memory/.dream-state.json`.

---

## Skill Marketplace

The Skill Marketplace provides one-click installation of curated community skills.

### Accessing the Marketplace

Go to Settings > Chimera Nexus > Skill Marketplace

### Available Skill Repositories

| Repository | Author | Description |
|------------|--------|-------------|
| Anthropic Skills | Anthropic | Official skills from Anthropic |
| Obsidian Skills | Community | Obsidian-focused workflow skills |
| Everything Claude Code | Community | Extended Claude Code capabilities |
| Superpowers | Community | Advanced productivity skills |

### Installing Skills

1. Find a skill in the marketplace
2. Click **Install** -- Chimera runs `git clone --depth 1` to fetch the repository
3. Skills are installed to `.claude/skills/` or `.claude/plugins/`
4. Click the **GitHub** link to view the source before installing

### Custom Skills

Create your own skills by adding a `SKILL.md` file in `.claude/skills/{skill-name}/`:

```markdown
---
name: my-skill
description: Does something useful
---

Instructions for Claude when this skill is activated...
```

---

## Configuration Export/Import

Back up and restore your entire Chimera Nexus configuration.

### Exporting

1. Settings > Chimera Nexus > Export/Import
2. Click **Export**
3. Select categories to include:
   - Settings
   - Agents
   - Skills
   - Commands
   - Memory
   - Tasks
   - MCP configs
4. A JSON file is saved

**Security:** Sensitive keys (`apiKey`, `claudeCliPathsByHost`) are automatically excluded from exports.

### Importing

1. Settings > Chimera Nexus > Export/Import
2. Click **Import**
3. Select a previously exported JSON file
4. Preview the contents
5. Confirm -- existing files are preserved (merge, not overwrite)

### Export Format

```json
{
  "_chimeraNexusExport": 2,
  "_exportedAt": "2026-04-07T10:00:00Z",
  "settings": { ... },
  "files": {
    ".claude/agents/researcher.md": "...",
    ".claude/memory/system/identity.md": "..."
  }
}
```

---

## Scheduling & Automation

### Task Scheduling (Beta)

Define cron-based tasks that execute on a schedule. Tasks are markdown files in `.claude/tasks/`:

```markdown
---
id: daily-review
name: Daily Code Review
enabled: true
schedule: "0 9 * * 1-5"
model: sonnet
permissionMode: AskBeforeEdits
maxDurationSeconds: 300
tags:
  - maintenance
---

Review all files modified in the last 24 hours for code quality issues.
Summarize findings in .claude/memory/knowledge/daily-review.md.
```

### Cron Expression Format

Standard 5-field cron syntax:

```
┌───────────── minute (0-59)
│ ┌───────────── hour (0-23)
│ │ ┌───────────── day of month (1-31)
│ │ │ ┌───────────── month (1-12)
│ │ │ │ ┌───────────── day of week (0-6, Sun=0)
│ │ │ │ │
* * * * *
```

**Examples:**
- `0 9 * * 1-5` -- 9 AM on weekdays
- `*/15 * * * *` -- Every 15 minutes
- `0 0 1 * *` -- Midnight on the 1st of each month
- `30 17 * * 5` -- 5:30 PM on Fridays

### Loop Tasks

Session-scoped repeating tasks that run on a millisecond interval within the current session:

- Maximum 50 loops per session
- Each loop tracks: runCount, lastRun, expiresAt
- Loops are cleared when the session ends

### Template Variables

Task prompts support template variables:

| Variable | Output |
|----------|--------|
| `{{today}}` | Current date (YYYY-MM-DD) |
| `{{date:FORMAT}}` | Formatted date |
| `{{hour}}` | Current hour (00-23) |
| `{{minute}}` | Current minute (00-59) |
| `{{second}}` | Current second (00-59) |

Custom variables can be defined in `.claude/variables.json`.

### Missed Run Detection

When Obsidian starts, Chimera checks for tasks that should have run while the application was closed. If a task missed its scheduled execution, it can be flagged for immediate execution.

---

## Agents

### Custom Agents

Define custom agents as markdown files in `.claude/agents/`:

```markdown
---
name: researcher
type: standard
description: Research agent for deep investigation
model: opus
permissionMode: AskBeforeEdits
memory: true
---

You are a research specialist. When given a topic, thoroughly investigate it by:
1. Searching the vault for existing knowledge
2. Reading relevant files in detail
3. Synthesizing findings into a clear summary
```

### Agent Types

| Type | Description |
|------|-------------|
| `standard` | Single-task agent with defined persona |
| `orchestrator` | Coordinates multiple sub-agents |

### Background Agents (Beta)

Run agents in the background without blocking the chat:

- **Priority queue** with 5 levels:
  1. User chat (highest)
  2. Loop tasks
  3. Scheduled tasks
  4. Background agents
  5. Dream cycle (lowest)
- **Concurrency control** via session slot manager
- **Job tracking** with status (queued, running, completed, failed, cancelled)

### Swarm Orchestration (Beta)

Coordinate multiple agents working on complex tasks:

- **Declarative manifest** defines the swarm structure
- **Waves** -- groups of tasks that run concurrently
- **Dependencies** -- wave N starts only after wave N-1 completes
- **Output files** -- each agent writes its output to the vault, readable by downstream waves
- Manifest persisted to `.claude/swarm-runs/{id}/_manifest.json`

---

## Plugin System

### Plugin Discovery

Chimera Nexus supports Claude Code-compatible plugins in `.claude/plugins/`:

```
.claude/plugins/
  my-plugin/
    .claude-plugin/
      plugin.json          # Plugin manifest
      marketplace.json     # Optional marketplace index
    skills/                # Plugin skills
    agents/                # Plugin agents
```

### Plugin Manifest (`plugin.json`)

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "Does useful things",
  "author": "Your Name",
  "skills": ["skills/my-skill/SKILL.md"],
  "agents": ["agents/my-agent.md"]
}
```

### Managing Plugins

Use the `/plugin` slash command:

| Subcommand | Description |
|------------|-------------|
| `/plugin list` | List installed plugins |
| `/plugin install <url>` | Install from URL or Git |
| `/plugin uninstall <name>` | Remove a plugin |
| `/plugin enable <name>` | Enable a disabled plugin |
| `/plugin disable <name>` | Disable without removing |
| `/plugin update <name>` | Update to latest |
| `/plugin discover` | Auto-discover plugins in directory |
| `/plugin validate <name>` | Validate plugin structure |
| `/plugin marketplace` | Browse curated plugins |

---

## Settings Reference

Access all settings in Obsidian Settings > Chimera Nexus.

### Memory Settings

| Setting | Default | Type | Description |
|---------|---------|------|-------------|
| Enable Memory Context | `true` | Toggle | Inject vault memory into every system prompt |
| Auto-extract Memory | `true` | Toggle | Auto-extract facts/decisions after conversations |
| Pinned Memory Budget | `2000` | Number | Max tokens for pinned memory files |
| Memory Tree Budget | `500` | Number | Max tokens for the file index |

### Dream Settings

| Setting | Default | Type | Description |
|---------|---------|------|-------------|
| Dream Cycle | `true` | Toggle | Enable periodic memory consolidation |
| Dream Interval | `1` | Hours | How often to check eligibility (min 15 min) |

### Inherited Claudian Settings

Chimera Nexus inherits all Claudian settings including:
- Model selection and effort level
- Permission mode
- CLI path configuration
- MCP server management
- UI preferences (theme, font size, etc.)
- Language/locale
- Keyboard shortcuts

### Settings Storage

| File | Contents |
|------|----------|
| `.claude/settings.json` | Claude Code-compatible settings (permissions, env) |
| `.claude/claudian-settings.json` | UI and plugin-specific settings |
| `.claude/settings.local.json` | Local overrides (gitignored) |
| `.claude/mcp.json` | MCP server configurations |

---

## File & Directory Reference

### `.claude/` Directory

```
.claude/
  settings.json               # CC-compatible permissions and env
  claudian-settings.json      # UI and plugin settings
  settings.local.json         # Local overrides (gitignored)
  mcp.json                    # MCP server configs
  commands/                   # Slash commands (*.md with YAML frontmatter)
  agents/                     # Custom agent definitions
  skills/                     # Installed skills (each in subdirectory)
  plugins/                    # Installed plugins
  tasks/                      # Scheduled task definitions
  variables.json              # Custom template variables
  sessions/                   # Session metadata (*.meta.json)
  memory/                     # Chimera memory system
    system/                     # Pinned memory (always in context)
      identity.md               # Agent persona
      human.md                  # User facts
      vault-conventions.md      # Vault structure
    knowledge/                  # Indexed memory
      corrections.md            # Auto-extracted corrections
      decisions.md              # Auto-extracted decisions
    reflections/                # Dream-generated insights
    sessions/                   # Session summaries
    .dream-state.json           # Dream cycle state
  swarm-runs/                 # Swarm execution records
```

### User-Level Files

```
~/.claude/
  projects/{vault-hash}/       # SDK session storage
    *.jsonl                      # Full message history
```

---

## Troubleshooting

### Authentication Issues

**"CLI not found"**
- Ensure Claude Code CLI is installed: `claude --version`
- If not auto-detected, set the path manually in Settings > Advanced

**"Using API key instead of subscription"**
- Remove the `ANTHROPIC_API_KEY` environment variable
- Chimera strips this from the CLI environment automatically, but system-level variables may still override

**"OAuth token expired"**
- Run `claude auth login` in your terminal to re-authenticate

### Memory Not Working

**"Memory files not created on first run"**
- Check that Chimera can write to your vault's `.claude/` directory
- Look for error notifications in Obsidian

**"Memory context not appearing in conversations"**
- Verify **Enable Memory Context** is toggled on in settings
- Check that `.claude/memory/system/` contains at least one `.md` file with valid frontmatter
- Confirm your pinned budget isn't set to 0

**"Auto-extraction not capturing anything"**
- Verify **Auto-extract Memory** is toggled on
- Extraction only runs on the last 20 messages per session
- Patterns must match specific language (e.g., "no, actually" for corrections)

### Dream Cycle Issues

**"Dream never runs"**
- Must have 5+ new session files since last dream
- Must be 24+ hours since last dream
- Check `.claude/memory/.dream-state.json` for current state

**"Dream seems stuck"**
- 10-minute timeout protects against hangs
- Delete `dream.lock` in `.claude/memory/` if it persists after a crash

### Performance

**"Chat is slow to start"**
- Memory loading adds a small delay. Reduce budgets if needed.
- The memory tree is cached for 5 minutes to minimize file reads.

**"Context window filling up"**
- Reduce Pinned Memory Budget (default 2000)
- Review pinned files -- unpin anything not essential
- The memory system respects budgets strictly; it will never exceed them

### Plugin/Skill Issues

**"Skill not showing up"**
- Ensure the skill has a valid `SKILL.md` in its directory
- Run `/plugin validate <name>` to check structure
- Restart Obsidian after installing new skills

---

## Tips & Best Practices

### Optimizing Memory

1. **Write clear identity.md** -- Tell Claude who it is in the context of your vault. Be specific about tone, expertise, and constraints.
2. **Keep human.md updated** -- The more Claude knows about you, the better it can tailor responses.
3. **Pin strategically** -- Only pin files that every conversation needs. Over-pinning wastes context budget.
4. **Use descriptive frontmatter** -- The `description` field appears in the memory index. Make it count.
5. **Let auto-extraction work** -- Don't manually duplicate what auto-extraction captures. Review `corrections.md` and `decisions.md` periodically.

### Vault Conventions

1. **Edit `.claude/memory/system/vault-conventions.md`** to describe your vault's structure, naming patterns, and folder organization. This helps Claude navigate your vault effectively.
2. **Use CLAUDE.md** at your vault root for project-level instructions that should always be in context (separate from the memory system).

### Security

1. **Never put secrets in memory files** -- Memory content is injected into prompts sent to the API
2. **Review exports before sharing** -- Sensitive keys are auto-excluded, but double-check
3. **Use `.claude/settings.local.json`** for machine-specific overrides (it's gitignored)

### Working with the Dream Cycle

1. **Let it run** -- The dream cycle is conservative by default (24h + 5 sessions minimum)
2. **Check reflections/** -- After dreams run, review what was consolidated
3. **Back up before experiments** -- Use Export/Import to snapshot your configuration

---

## Internationalization

Chimera Nexus supports 10 languages (inherited from Claudian). Change the language in Settings > Chimera Nexus > Language.

---

## Credits

- Built on [Claudian](https://github.com/YishenTu/claudian) by Yishen Tu (MIT license)
- Memory system architecture inspired by [Letta](https://github.com/letta-ai/letta)
- Claude Code CLI by [Anthropic](https://anthropic.com)

## License

MIT
