/**
 * @file Skill Marketplace settings UI component.
 *
 * Renders a curated list of community skill repositories and lets users
 * install them into the vault's `.claude/skills/` directory via a single
 * button click. Detects already-installed skills and offers update instead.
 */

import { Setting, Notice } from "obsidian";
import { exec, ExecOptions } from "child_process";
import * as fs from "fs";
import * as path from "path";

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
    repo: "anthropics/skills",
    installCmd: "git clone --depth 1 https://github.com/anthropics/skills.git .claude/plugins/anthropic-skills",
    skills: ["pdf", "docx", "pptx", "xlsx", "frontend-design", "canvas-design", "mcp-builder", "brand-guidelines", "skill-creator", "web-artifacts-builder"],
  },
  {
    name: "Obsidian Skills",
    author: "Steph Ango (kepano)",
    description: "Essential Obsidian skills: markdown syntax, bases, canvas, CLI, web scraping",
    repo: "kepano/obsidian-skills",
    installCmd: "git clone --depth 1 https://github.com/kepano/obsidian-skills.git .claude/skills/obsidian-skills",
    skills: ["obsidian-markdown", "obsidian-bases", "json-canvas", "obsidian-cli", "defuddle"],
  },
  {
    name: "Everything Claude Code",
    author: "affaan-m",
    description: "Comprehensive skill pack: TDD, code review, architecture, security, E2E testing, documentation",
    repo: "affaan-m/everything-claude-code",
    installCmd: "git clone --depth 1 https://github.com/affaan-m/everything-claude-code.git .claude/plugins/everything-claude-code",
    skills: ["tdd", "code-review", "architect", "security-review", "e2e", "build-error-resolver", "doc-updater"],
  },
  {
    name: "Superpowers",
    author: "obra (Jesse Vincent)",
    description: "Planning, brainstorming, subagent-driven development, git worktrees, debugging workflows",
    repo: "obra/superpowers",
    installCmd: "git clone --depth 1 https://github.com/obra/superpowers.git .claude/plugins/superpowers",
    skills: ["brainstorming", "writing-plans", "executing-plans", "subagent-driven-development", "systematic-debugging", "verification-before-completion"],
  },
];

// ---------------------------------------------------------------------------
// Public render function
// ---------------------------------------------------------------------------

/**
 * Renders the Skill Marketplace section into the given settings container.
 *
 * Displays a curated list of skill repos with Install/Update and GitHub buttons,
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
    const installDir = getInstallDir(repo.installCmd);
    const installed = isInstalled(vaultPath, installDir);

    const repoSetting = new Setting(containerEl)
      .setName(repo.name)
      .setDesc(`${repo.description}\nBy ${repo.author} | Skills: ${repo.skills.join(", ")}`);

    repoSetting.addButton((btn) => {
      btn.setButtonText(installed ? "Update" : "Install");
      if (installed) btn.setCta();

      btn.onClick(async () => {
        const currentlyInstalled = isInstalled(vaultPath, installDir);

        if (currentlyInstalled) {
          btn.setButtonText("Updating...");
          btn.setDisabled(true);
          try {
            await runCommand("git pull", path.join(vaultPath, installDir));
            new Notice(`${repo.name} updated successfully`);
            btn.setButtonText("Update");
            btn.setDisabled(false);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            new Notice(`Failed to update: ${msg}`);
            btn.setButtonText("Update");
            btn.setDisabled(false);
          }
        } else {
          btn.setButtonText("Installing...");
          btn.setDisabled(true);
          try {
            await runCommand(repo.installCmd, vaultPath);
            new Notice(`${repo.name} installed successfully`);
            btn.setButtonText("Update");
            btn.setCta();
            btn.setDisabled(false);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            new Notice(`Failed to install: ${msg}`);
            btn.setButtonText("Install");
            btn.setDisabled(false);
          }
        }
      });
    });

    repoSetting.addButton((btn) => {
      btn.setButtonText("GitHub");
      btn.onClick(() => {
        window.open(`https://github.com/${repo.repo}`);
      });
    });

    if (installed) {
      repoSetting.addButton((btn) => {
        btn.setButtonText("Uninstall");
        btn.setWarning();
        btn.onClick(async () => {
          btn.setButtonText("Removing...");
          btn.setDisabled(true);
          try {
            const fullPath = path.join(vaultPath, installDir);
            await removeDirectory(fullPath);
            new Notice(`${repo.name} uninstalled`);
            // Reset the install button back to "Install"
            const buttons = repoSetting.controlEl.querySelectorAll("button");
            if (buttons[0]) {
              buttons[0].textContent = "Install";
              buttons[0].disabled = false;
              buttons[0].removeClass("mod-cta");
            }
            btn.setButtonText("Uninstall");
            btn.setDisabled(true);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            new Notice(`Failed to uninstall: ${msg}`);
            btn.setButtonText("Uninstall");
            btn.setDisabled(false);
          }
        });
      });
    }
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
 * Extracts the install directory from the git clone command.
 * e.g. "git clone --depth 1 https://... .claude/plugins/foo" -> ".claude/plugins/foo"
 */
function getInstallDir(installCmd: string): string {
  const parts = installCmd.split(" ");
  return parts[parts.length - 1];
}

/**
 * Checks if a skill directory already exists in the vault.
 */
function isInstalled(vaultPath: string, installDir: string): boolean {
  try {
    return fs.existsSync(path.join(vaultPath, installDir));
  } catch {
    return false;
  }
}

/**
 * Recursively removes a directory.
 */
function removeDirectory(dirPath: string): Promise<void> {
  return fs.promises.rm(dirPath, { recursive: true, force: true });
}

/**
 * Runs `cmd` in a shell with `cwd` as the working directory, resolving when
 * the process exits with code 0 or rejecting with the stderr/error message.
 *
 * @param cmd - The shell command to execute.
 * @param cwd - Working directory for the command.
 */
function runCommand(cmd: string, cwd: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
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
