# Chimera Nexus Session 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete foundation scaffold for the Chimera Nexus Obsidian plugin -- project config, type system, plugin entry, settings UI, chat sidebar, Claude Code compatibility layer, session storage, and memory system.

**Architecture:** Obsidian plugin using TypeScript strict mode, esbuild bundling, Jest testing. All vault I/O via Obsidian Vault API. Memory/sessions stored as markdown in `.claude/`. Full Claude Code project compatibility -- skills, agents, commands, hooks, settings all use CC format.

**Tech Stack:** TypeScript 5.x, Obsidian Plugin API 1.8.9+, esbuild, @anthropic-ai/claude-agent-sdk, Jest + ts-jest, ESLint

---

## File Structure

### Root Config Files
- Create: `package.json` -- npm project config
- Create: `tsconfig.json` -- TypeScript strict config
- Create: `esbuild.config.mjs` -- Obsidian plugin bundler
- Create: `manifest.json` -- Obsidian plugin manifest
- Create: `versions.json` -- Obsidian version mapping
- Create: `jest.config.js` -- Jest with ts-jest
- Create: `.eslintrc.cjs` -- ESLint for TypeScript
- Create: `.gitignore` -- Node + Obsidian patterns
- Create: `styles/styles.css` -- Plugin styles

### Core Types
- Create: `src/core/types/index.ts` -- All shared type definitions

### Plugin Entry
- Create: `src/main.ts` -- Plugin class extending Obsidian Plugin

### Features
- Create: `src/features/settings/settings-tab.ts` -- Settings UI
- Create: `src/features/settings/auth-settings.ts` -- Auth config (stub)
- Create: `src/features/chat/chat-view.ts` -- Sidebar chat view
- Create: `src/features/chat/chat-renderer.ts` -- Message rendering (stub)
- Create: `src/features/chat/agent-selector.ts` -- Agent dropdown + session list
- Create: `src/features/chat/mention-detector.ts` -- @agent-name parsing
- Create: `src/features/chat/status-bar.ts` -- Background agent status (stub)
- Create: `src/features/chat/completion-card.ts` -- Agent completion cards (stub)
- Create: `src/features/sessions/session-store.ts` -- Session markdown read/write
- Create: `src/features/sessions/session-index.ts` -- JSON index cache
- Create: `src/features/onboarding/onboarding-wizard.ts` -- First-run wizard (stub)

### Core Modules
- Create: `src/core/claude-compat/settings-loader.ts` -- Settings merge
- Create: `src/core/claude-compat/skill-loader.ts` -- Skill discovery
- Create: `src/core/claude-compat/command-loader.ts` -- Command discovery
- Create: `src/core/claude-compat/agent-loader.ts` -- Agent definition loading
- Create: `src/core/claude-compat/hook-manager.ts` -- Hook lifecycle
- Create: `src/core/claude-compat/plugin-loader.ts` -- Plugin registry (stub)
- Create: `src/core/claude-compat/rules-loader.ts` -- Rules loading
- Create: `src/core/memory/memory-injector.ts` -- System prompt injection
- Create: `src/core/memory/memory-extractor.ts` -- Post-session extraction (stub)
- Create: `src/core/memory/session-summarizer.ts` -- Session summaries (stub)
- Create: `src/core/memory/dream-runner.ts` -- Dream cycle (stub)
- Create: `src/core/runtime/session-manager.ts` -- Session pool (stub)
- Create: `src/core/runtime/sdk-wrapper.ts` -- Claude SDK wrapper (stub)
- Create: `src/core/runtime/tool-enforcer.ts` -- Tool restrictions (stub)
- Create: `src/core/runtime/template-resolver.ts` -- Template vars (stub)
- Create: `src/core/scheduler/loop-scheduler.ts` -- /loop tasks (stub)
- Create: `src/core/scheduler/task-scheduler.ts` -- Persistent cron (stub)
- Create: `src/core/scheduler/cron-parser.ts` -- Cron evaluator (stub)
- Create: `src/core/scheduler/missed-run-handler.ts` -- Missed runs (stub)
- Create: `src/core/agents/agent-loader.ts` -- Agent loading (re-export from claude-compat)
- Create: `src/core/agents/foreground-runner.ts` -- Foreground delegation (stub)
- Create: `src/core/agents/background-manager.ts` -- Background pool (stub)
- Create: `src/core/agents/swarm-runner.ts` -- Multi-agent orchestration (stub)

### Utilities
- Create: `src/utils/frontmatter.ts` -- YAML frontmatter parse/write
- Create: `src/utils/vault-helpers.ts` -- Obsidian Vault API utilities (stub)
- Create: `src/utils/cron-utils.ts` -- Cron matching (stub)
- Create: `src/utils/token-counter.ts` -- Token estimation

### Commands & i18n
- Create: `src/commands/slash-commands.ts` -- Slash command registry (stub)
- Create: `src/i18n/en.ts` -- English strings (stub)

### Tests
- Create: `tests/core/claude-compat/settings-loader.test.ts`
- Create: `tests/core/claude-compat/skill-loader.test.ts`
- Create: `tests/utils/frontmatter.test.ts`
- Create: `tests/utils/token-counter.test.ts`

---

## Task 1: Project Scaffold and Config Files

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `esbuild.config.mjs`
- Create: `manifest.json`
- Create: `versions.json`
- Create: `jest.config.js`
- Create: `.eslintrc.cjs`
- Create: `.gitignore`
- Create: `styles/styles.css`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "chimera-nexus",
  "version": "0.1.0",
  "description": "A vault-native agentic platform for Obsidian",
  "main": "main.js",
  "scripts": {
    "dev": "node esbuild.config.mjs",
    "build": "node esbuild.config.mjs production",
    "lint": "eslint src/ --ext .ts",
    "test": "jest"
  },
  "dependencies": {
    "obsidian": "latest",
    "@anthropic-ai/claude-agent-sdk": "^0.2.76"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "esbuild": "^0.25.0",
    "@types/node": "^20.17.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.2.0",
    "@types/jest": "^29.5.0",
    "eslint": "^8.57.0",
    "@typescript-eslint/parser": "^8.0.0",
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "builtin-modules": "^4.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2021",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2021", "DOM", "DOM.Iterable"],
    "strict": true,
    "declaration": true,
    "declarationDir": "./dist/types",
    "outDir": "./dist",
    "rootDir": "./src",
    "sourceMap": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Create esbuild.config.mjs**

```js
import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";

const prod = process.argv[2] === "production";

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
    ...builtins,
  ],
  format: "cjs",
  target: "es2021",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  minify: prod,
});

if (prod) {
  await context.rebuild();
  process.exit(0);
} else {
  await context.watch();
}
```

- [ ] **Step 4: Create manifest.json, versions.json**

manifest.json:
```json
{
  "id": "chimera-nexus",
  "name": "Chimera Nexus",
  "version": "0.1.0",
  "minAppVersion": "1.8.9",
  "description": "A vault-native agentic platform for Obsidian",
  "author": "Chimera Nexus",
  "isDesktopOnly": true
}
```

versions.json:
```json
{
  "0.1.0": "1.8.9"
}
```

- [ ] **Step 5: Create jest.config.js, .eslintrc.cjs, .gitignore**

jest.config.js:
```js
/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  testMatch: ["**/*.test.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "^obsidian$": "<rootDir>/tests/__mocks__/obsidian.ts",
  },
  collectCoverageFrom: ["src/**/*.ts", "!src/**/*.d.ts"],
};
```

.eslintrc.cjs:
```js
module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: "module",
  },
  plugins: ["@typescript-eslint"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
  ],
  rules: {
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/explicit-function-return-type": "off",
    "no-unused-vars": "off",
    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
  },
  env: {
    node: true,
    jest: true,
  },
};
```

.gitignore:
```
node_modules/
dist/
main.js
*.js.map
.DS_Store
coverage/
.claude/memory/sessions/
.claude/memory/reflections/
.claude/sessions/
.claude/agent-memory/
.claude/task-logs/
.claude/swarm-runs/
.claude/backups/
.claude/dream.lock
```

- [ ] **Step 6: Create styles/styles.css**

```css
/* Chimera Nexus Styles */

.chimera-chat-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 0;
}

.chimera-agent-selector {
  padding: 8px 12px;
  border-bottom: 1px solid var(--background-modifier-border);
  display: flex;
  gap: 8px;
  align-items: center;
}

.chimera-agent-selector select {
  flex: 1;
}

.chimera-session-list {
  max-height: 200px;
  overflow-y: auto;
  border-bottom: 1px solid var(--background-modifier-border);
}

.chimera-session-item {
  padding: 6px 12px;
  cursor: pointer;
  font-size: 0.85em;
  color: var(--text-muted);
}

.chimera-session-item:hover {
  background: var(--background-modifier-hover);
}

.chimera-session-item.is-active {
  color: var(--text-normal);
  background: var(--background-modifier-active-hover);
}

.chimera-messages {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.chimera-message {
  margin-bottom: 16px;
}

.chimera-message-role {
  font-weight: 600;
  font-size: 0.85em;
  margin-bottom: 4px;
  color: var(--text-muted);
}

.chimera-message-content {
  line-height: 1.5;
}

.chimera-input-area {
  padding: 8px 12px;
  border-top: 1px solid var(--background-modifier-border);
  display: flex;
  gap: 8px;
}

.chimera-input-area textarea {
  flex: 1;
  resize: none;
  min-height: 40px;
  max-height: 120px;
}

.chimera-status-bar {
  padding: 4px 12px;
  font-size: 0.8em;
  color: var(--text-muted);
  border-top: 1px solid var(--background-modifier-border);
}
```

- [ ] **Step 7: Create Obsidian mock for tests**

Create `tests/__mocks__/obsidian.ts` with mock classes for Plugin, ItemView, PluginSettingTab, Setting, App, Vault, Notice, etc.

- [ ] **Step 8: Run npm install and verify**

```bash
cd chimera-nexus && npm install
```

- [ ] **Step 9: Commit scaffold config**

```bash
git add package.json tsconfig.json esbuild.config.mjs manifest.json versions.json jest.config.js .eslintrc.cjs .gitignore styles/styles.css tests/__mocks__/obsidian.ts
git commit -m "feat: add project scaffold and config files"
```

---

## Task 2: Core Type Definitions

**Files:**
- Create: `src/core/types/index.ts`

- [ ] **Step 1: Create all type definitions**

This file contains ALL shared types for the project:
- Enums: `MemoryTier`, `HookEvent`, `PermissionMode`, `AuthMethod`
- Interfaces: `MemoryFile`, `SessionSummary`, `ConversationMessage`, `Session`, `SessionIndexEntry`, `SessionIndex`
- Stub interfaces: `ScheduledTask`, `LoopTask`
- Agent/Skill/Command types: `AgentDefinition`, `SkillDefinition`, `CommandDefinition`
- Hook types: `HookHandler`, `HookDefinition`
- Chat types: `MentionResult`
- Settings: `ChimeraSettings` with all defaults
- Helper: `DEFAULT_SETTINGS`

See full code in Task 2 implementation.

- [ ] **Step 2: Verify types compile**

```bash
npx tsc --noEmit src/core/types/index.ts
```

- [ ] **Step 3: Commit**

```bash
git add src/core/types/index.ts
git commit -m "feat: add core type definitions"
```

---

## Task 3: Plugin Entry (main.ts)

**Files:**
- Create: `src/main.ts`

- [ ] **Step 1: Create Plugin class**

Plugin extends Obsidian Plugin with:
- `onload()`: ribbon icon, command, settings load, vault structure init, compat loader init, memory injector init, sidebar view registration
- `onunload()`: cleanup
- `initVaultStructure()`: create `.claude/` subdirectories, generate starter memory files (identity.md, human.md, vault-conventions.md) -- NEVER overwrite existing
- `loadSettings()` / `saveSettings()` using `this.loadData()` / `this.saveData()`

- [ ] **Step 2: Verify it compiles with stubs**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
git commit -m "feat: add plugin entry point with vault structure init"
```

---

## Task 4: Settings Tab

**Files:**
- Create: `src/features/settings/settings-tab.ts`

- [ ] **Step 1: Create PluginSettingTab**

Sections: Authentication (CLI vs API key dropdown, key field, CLI path), Memory (toggles, budgets), Agents (list placeholder), Security (permission mode), Advanced.

- [ ] **Step 2: Commit**

```bash
git add src/features/settings/settings-tab.ts
git commit -m "feat: add settings tab with all config sections"
```

---

## Task 5: Chat View

**Files:**
- Create: `src/features/chat/chat-view.ts`

- [ ] **Step 1: Create ItemView for sidebar chat**

viewType "chimera-nexus-chat", icon "bot". Layout: agent selector dropdown, session list, message area, input with send button, status bar placeholder.

- [ ] **Step 2: Commit**

```bash
git add src/features/chat/chat-view.ts
git commit -m "feat: add sidebar chat view"
```

---

## Task 6: Stub Files for Future Modules

**Files:**
- Create all stub files listed in the File Structure section above that are marked as (stub)

- [ ] **Step 1: Create all stub files**

Each stub file exports a placeholder class or function with:
- TSDoc comment explaining the module's purpose
- TODO comment noting it's not yet implemented

- [ ] **Step 2: Verify full project compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/
git commit -m "feat: add stub files for all future modules"
```

---

## Task 7: Claude Code Compat Layer

**Files:**
- Create: `src/core/claude-compat/settings-loader.ts`
- Create: `src/core/claude-compat/skill-loader.ts`
- Create: `src/core/claude-compat/command-loader.ts`
- Create: `src/core/claude-compat/agent-loader.ts`
- Create: `src/core/claude-compat/hook-manager.ts`
- Create: `src/core/claude-compat/rules-loader.ts`
- Test: `tests/core/claude-compat/settings-loader.test.ts`
- Test: `tests/core/claude-compat/skill-loader.test.ts`

- [ ] **Step 1: Write failing tests for settings-loader**

Test cases: merge logic (project overrides user), deny always wins, array merge, missing files.

- [ ] **Step 2: Run tests to verify failure**

```bash
npx jest tests/core/claude-compat/settings-loader.test.ts
```

- [ ] **Step 3: Implement settings-loader.ts**

Reads `.claude/settings.json` + `~/.claude/settings.json` via Vault API, merges with precedence rules, returns typed `ResolvedSettings`.

- [ ] **Step 4: Run tests to verify pass**

```bash
npx jest tests/core/claude-compat/settings-loader.test.ts
```

- [ ] **Step 5: Write failing tests for skill-loader**

Test: parse SKILL.md frontmatter, discover skills from directory.

- [ ] **Step 6: Run tests to verify failure**

- [ ] **Step 7: Implement skill-loader.ts**

Scan `.claude/skills/` for dirs with SKILL.md, parse frontmatter, return `SkillDefinition[]`.

- [ ] **Step 8: Run tests to verify pass**

- [ ] **Step 9: Implement command-loader.ts**

Scan `.claude/commands/` for .md files, parse frontmatter, return `CommandDefinition[]`.

- [ ] **Step 10: Implement agent-loader.ts**

Scan `.claude/agents/` for .md files, parse YAML frontmatter (all AgentDefinition fields), body as systemPrompt.

- [ ] **Step 11: Implement hook-manager.ts**

Read hooks from settings, index by event, `fireHook()` with command handler (exit codes 0=proceed, 2=block). HTTP/prompt/agent types stubbed.

- [ ] **Step 12: Implement rules-loader.ts**

Scan `.claude/rules/` for .md files, return `{pattern, content}[]`.

- [ ] **Step 13: Commit**

```bash
git add src/core/claude-compat/ tests/core/claude-compat/
git commit -m "feat: add Claude Code compatibility layer with tests"
```

---

## Task 8: Agent Selector + Mention Detector

**Files:**
- Create: `src/features/chat/agent-selector.ts`
- Create: `src/features/chat/mention-detector.ts`

- [ ] **Step 1: Implement agent-selector.ts**

Renders agent dropdown + session list. Dropdown from agent-loader + "Default Chimera" first. Emits events on agent change and session click.

- [ ] **Step 2: Implement mention-detector.ts**

`detectMention(message, agentNames)`: parse @agent-name, detect (bg)/(background) flag, strip from text, return `MentionResult | null`.

- [ ] **Step 3: Commit**

```bash
git add src/features/chat/agent-selector.ts src/features/chat/mention-detector.ts
git commit -m "feat: add agent selector and mention detector"
```

---

## Task 9: Session Store + Index

**Files:**
- Create: `src/features/sessions/session-store.ts`
- Create: `src/features/sessions/session-index.ts`

- [ ] **Step 1: Implement session-store.ts**

`saveSession()`, `loadSession()`, `listSessions()`, `renderTranscript()`, `parseTranscript()`. Markdown with frontmatter is source of truth.

- [ ] **Step 2: Implement session-index.ts**

JSON at `.claude/sessions/index.json`. `addSession()`, `updateSession()`, `removeSession()`, `rebuildIndex()`.

- [ ] **Step 3: Commit**

```bash
git add src/features/sessions/
git commit -m "feat: add session store and index"
```

---

## Task 10: Memory System

**Files:**
- Create: `src/utils/frontmatter.ts`
- Create: `src/utils/token-counter.ts`
- Create: `src/core/memory/memory-injector.ts`
- Test: `tests/utils/frontmatter.test.ts`
- Test: `tests/utils/token-counter.test.ts`

- [ ] **Step 1: Write failing tests for frontmatter**

Test: parse with/without frontmatter, empty body, special chars, stringify roundtrip.

- [ ] **Step 2: Run tests to verify failure**

- [ ] **Step 3: Implement frontmatter.ts**

`parseFrontmatter(content)` and `stringifyFrontmatter(frontmatter, body)`.

- [ ] **Step 4: Run tests to verify pass**

- [ ] **Step 5: Write failing tests for token-counter**

Test: `estimateTokens()` (chars/4), `truncateToTokenBudget()` (sentence boundary).

- [ ] **Step 6: Run tests to verify failure**

- [ ] **Step 7: Implement token-counter.ts**

- [ ] **Step 8: Run tests to verify pass**

- [ ] **Step 9: Implement memory-injector.ts**

`readMemoryTree()`, `classifyMemory()`, `buildPinnedContext()`, `buildTreeIndex()`, `buildSystemPromptContext()`.

- [ ] **Step 10: Verify full build**

```bash
npx tsc --noEmit && npx jest
```

- [ ] **Step 11: Commit**

```bash
git add src/utils/ src/core/memory/ tests/utils/
git commit -m "feat: add memory system with frontmatter parser and token counter"
```

---

## Task 11: Final Verification

- [ ] **Step 1: Run full test suite**

```bash
npx jest --coverage
```

- [ ] **Step 2: Run lint**

```bash
npx eslint src/ --ext .ts
```

- [ ] **Step 3: Attempt build**

```bash
npm run build
```

- [ ] **Step 4: Fix any issues and commit**

---
