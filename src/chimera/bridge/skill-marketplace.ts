/**
 * @file Skill Marketplace settings UI component.
 *
 * Renders a curated list of community skill repositories and lets users
 * install them into the vault's `.claude/skills/` directory via a single
 * button click.
 */

import { Setting, Notice } from "obsidian";
import { exec, ExecOptions } from "child_process";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SkillRepo {
  /** Human-readable display name shown in the UI. */
  name: string;
  /** Attribution shown below the name. */
  author: string;
  /** One-line description of what skills are included. */
  description: string;
  /** GitHub `owner/repo` path used to construct the browser URL. */
  repo: string;
  /** Shell command used to install the skill package. */
  installCmd: string;
  /** List of skill names bundled in this repo (for display only). */
  skills: string[];
}

// ---------------------------------------------------------------------------
// Curated skill registry
// ---------------------------------------------------------------------------

const CURATED_SKILLS: SkillRepo[] = [
  {
    name: "Anthropic Agent Skills",
    author: "Anthropic",
    description: "Official Anthropic skills: PDF, DOCX, PPTX, XLSX, frontend design, canvas art, MCP builder, and more",
    repo: "anthropics/anthropic-agent-skills",
    installCmd: "claude plugins:install anthropic-agent-skills",
    skills: ["pdf", "docx", "pptx", "xlsx", "frontend-design", "canvas-design", "mcp-builder", "brand-guidelines", "skill-creator", "web-artifacts-builder"],
  },
  {
    name: "Obsidian Skills",
    author: "Steph Ango (kepano)",
    description: "Essential Obsidian skills: markdown syntax, bases, canvas, CLI, web scraping",
    repo: "kepano/obsidian-skills",
    installCmd: "npx obsidian-skills",
    skills: ["obsidian-markdown", "obsidian-bases", "json-canvas", "obsidian-cli", "defuddle"],
  },
  {
    name: "Everything Claude Code",
    author: "riyavsinha",
    description: "Comprehensive skill pack: TDD, code review, architecture, security, E2E testing, documentation",
    repo: "riyavsinha/everything-claude-code",
    installCmd: "claude plugins:install everything-claude-code",
    skills: ["tdd", "code-review", "architect", "security-review", "e2e", "build-error-resolver", "doc-updater"],
  },
  {
    name: "Superpowers",
    author: "Claude Plugins Official",
    description: "Planning, brainstorming, subagent-driven development, git worktrees, debugging workflows",
    repo: "anthropics/claude-code-plugins",
    installCmd: "claude plugins:install superpowers",
    skills: ["brainstorming", "writing-plans", "executing-plans", "subagent-driven-development", "systematic-debugging", "verification-before-completion"],
  },
];

// ---------------------------------------------------------------------------
// Public render function
// ---------------------------------------------------------------------------

/**
 * Renders the Skill Marketplace section into the given settings container.
 *
 * Displays a curated list of skill repos with Install and GitHub buttons,
 * followed by a static note about the installed skills section (populated at
 * runtime when the settings page is next opened).
 *
 * @param containerEl - The HTMLElement to render into (typically the settings tab's containerEl).
 * @param vaultPath - Absolute filesystem path to the vault root, used as the
 *   working directory when running install commands.
 */
export function renderSkillMarketplace(containerEl: HTMLElement, vaultPath: string): void {
  new Setting(containerEl).setName("Skill Marketplace").setHeading();

  containerEl.createEl("p", {
    cls: "setting-item-description",
    text: "Install community skills to enhance Claude's capabilities in your vault. Skills are installed to .claude/skills/.",
  });

  for (const repo of CURATED_SKILLS) {
    const repoSetting = new Setting(containerEl)
      .setName(repo.name)
      .setDesc(`${repo.description}\nBy ${repo.author} | Skills: ${repo.skills.join(", ")}`);

    repoSetting.addButton((btn) => {
      btn.setButtonText("Install");
      btn.onClick(async () => {
        btn.setButtonText("Installing...");
        btn.setDisabled(true);
        try {
          await runCommand(repo.installCmd, vaultPath);
          new Notice(`${repo.name} installed successfully`);
          btn.setButtonText("Installed");
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          new Notice(`Failed to install: ${msg}`);
          btn.setButtonText("Install");
          btn.setDisabled(false);
        }
      });
    });

    repoSetting.addButton((btn) => {
      btn.setButtonText("GitHub");
      btn.onClick(() => {
        window.open(`https://github.com/${repo.repo}`);
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Installed skills section
  // ---------------------------------------------------------------------------

  new Setting(containerEl).setName("Installed Skills").setHeading();

  containerEl.createEl("p", {
    cls: "setting-item-description",
    text: "Skills discovered from .claude/skills/ in your vault.",
  });

  const installedContainer = containerEl.createDiv({ cls: "chimera-installed-skills" });
  installedContainer.createEl("p", {
    cls: "setting-item-description",
    text: "Reload the settings page to refresh this list after installing skills.",
  });
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Runs `cmd` in a shell with `cwd` as the working directory, resolving when
 * the process exits with code 0 or rejecting with the stderr/error message.
 *
 * @param cmd - The shell command to execute.
 * @param cwd - Working directory for the command.
 */
function runCommand(cmd: string, cwd: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    // shell is typed as `string` in some @types/node versions; cast to satisfy strict checks.
    const opts: ExecOptions = { cwd, timeout: 60000, shell: process.platform === "win32" ? "cmd.exe" : "/bin/sh" };
    exec(cmd, opts, (err, _stdout, stderr) => {
      if (err) {
        const msg = typeof stderr === "string" ? stderr.trim() : "";
        reject(new Error(msg || err.message));
      } else {
        resolve();
      }
    });
  });
}
