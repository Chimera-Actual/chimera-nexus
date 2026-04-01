/**
 * @file First-run setup wizard for Chimera Nexus.
 *
 * Guides the user through selecting an auth method, verifying credentials,
 * and creating the initial vault folder structure on first install.
 */

import { App, Modal, Setting } from "obsidian";
import { exec } from "child_process";
import { ChimeraSettings, AuthMethod } from "../../core/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The three wizard steps, numbered for clarity. */
type WizardStep = 1 | 2 | 3;

/** Result of probing the `claude` CLI. */
interface CliProbeResult {
  found: boolean;
  version: string;
}

// ---------------------------------------------------------------------------
// Internal Modal implementation
// ---------------------------------------------------------------------------

/**
 * Multi-step onboarding modal that walks the user through:
 *
 * 1. CLI detection
 * 2. Authentication method selection
 * 3. Memory bootstrap confirmation
 */
class OnboardingModal extends Modal {
  private step: WizardStep = 1;
  private cliResult: CliProbeResult = { found: false, version: "" };
  private readonly settings: ChimeraSettings;
  private readonly saveSettings: () => Promise<void>;
  private resolvePromise!: () => void;
  /** Promise resolved when the modal is dismissed (finished or closed). */
  readonly done: Promise<void>;

  constructor(app: App, settings: ChimeraSettings, saveSettings: () => Promise<void>) {
    super(app);
    this.settings = settings;
    this.saveSettings = saveSettings;
    this.done = new Promise<void>((resolve) => {
      this.resolvePromise = resolve;
    });
  }

  /** Called by Obsidian when the modal is opened. */
  onOpen(): void {
    this._render();
  }

  /** Called by Obsidian when the modal is closed. */
  onClose(): void {
    this.resolvePromise();
  }

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  /** Clears and re-renders the content area for the current step. */
  private _render(): void {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h2", { text: "Welcome to Chimera Nexus" });
    contentEl.createEl("p", {
      text: `Step ${this.step} of 3`,
      cls: "chimera-onboarding-step-indicator",
    });

    switch (this.step) {
      case 1:
        this._renderStep1();
        break;
      case 2:
        this._renderStep2();
        break;
      case 3:
        this._renderStep3();
        break;
    }
  }

  // -------------------------------------------------------------------------
  // Step 1 – CLI Detection
  // -------------------------------------------------------------------------

  /** Renders the CLI detection step. */
  private _renderStep1(): void {
    const { contentEl } = this;

    contentEl.createEl("h3", { text: "Step 1: Claude CLI Detection" });

    const statusEl = contentEl.createEl("p", {
      text: "Checking for Claude CLI…",
      cls: "chimera-onboarding-status",
    });

    const buttonContainer = contentEl.createDiv({ cls: "chimera-onboarding-buttons" });

    const nextButton = buttonContainer.createEl("button", {
      text: "Next",
      cls: "mod-cta",
    });
    nextButton.disabled = true;

    // Probe the CLI and update the status element once done.
    this._detectCli()
      .then((result) => {
        this.cliResult = result;

        if (result.found) {
          statusEl.setText(`Claude CLI found (v${result.version})`);
          statusEl.addClass("chimera-onboarding-success");
        } else {
          statusEl.setText("Claude CLI not found.");
          statusEl.removeClass("chimera-onboarding-success");
          statusEl.addClass("chimera-onboarding-warning");

          const instructions = contentEl.createEl("div", {
            cls: "chimera-onboarding-instructions",
          });
          instructions.createEl("p", {
            text: "To install the Claude CLI, run one of the following commands:",
          });
          const pre = instructions.createEl("pre");
          pre.createEl("code", { text: "npm install -g @anthropic-ai/claude-code" });
          instructions.createEl("p", {
            text: "After installing, restart Obsidian and run the setup wizard again.",
          });
        }

        nextButton.disabled = false;
      })
      .catch(() => {
        statusEl.setText("Could not determine CLI status.");
        nextButton.disabled = false;
      });

    nextButton.addEventListener("click", () => {
      this.step = 2;
      this._render();
    });
  }

  // -------------------------------------------------------------------------
  // Step 2 – Authentication
  // -------------------------------------------------------------------------

  /** Renders the authentication method selection step. */
  private _renderStep2(): void {
    const { contentEl } = this;

    contentEl.createEl("h3", { text: "Step 2: Authentication" });
    contentEl.createEl("p", { text: "How should Chimera Nexus authenticate with Claude?" });

    // Auth method toggle
    new Setting(contentEl)
      .setName("Authentication method")
      .setDesc("Use the Claude CLI's stored credentials, or supply an API key directly.")
      .addDropdown((drop) => {
        drop.addOption(AuthMethod.CLI, "Use CLI (recommended)");
        drop.addOption(AuthMethod.APIKey, "Use API Key");
        drop.setValue(this.settings.authMethod);
        drop.onChange((value) => {
          this.settings.authMethod = value as AuthMethod;
          apiKeyContainer.style.display =
            value === AuthMethod.APIKey ? "block" : "none";
        });
      });

    // API Key input (shown only when APIKey is selected)
    const apiKeyContainer = contentEl.createDiv();
    apiKeyContainer.style.display =
      this.settings.authMethod === AuthMethod.APIKey ? "block" : "none";

    new Setting(apiKeyContainer)
      .setName("API Key")
      .setDesc("Your Anthropic API key (starts with sk-ant-…).")
      .addText((text) => {
        text
          .setPlaceholder("sk-ant-…")
          .setValue(this.settings.apiKey)
          .onChange((value) => {
            this.settings.apiKey = value;
          });
        text.inputEl.type = "password";
      });

    // Navigation buttons
    const buttonContainer = contentEl.createDiv({ cls: "chimera-onboarding-buttons" });

    buttonContainer
      .createEl("button", { text: "Back" })
      .addEventListener("click", () => {
        this.step = 1;
        this._render();
      });

    buttonContainer
      .createEl("button", { text: "Next", cls: "mod-cta" })
      .addEventListener("click", async () => {
        try {
          await this.saveSettings();
        } catch {
          // Non-fatal; proceed regardless.
        }
        this.step = 3;
        this._render();
      });
  }

  // -------------------------------------------------------------------------
  // Step 3 – Memory Bootstrap
  // -------------------------------------------------------------------------

  /** Renders the memory bootstrap confirmation step. */
  private _renderStep3(): void {
    const { contentEl } = this;

    contentEl.createEl("h3", { text: "Step 3: Memory Bootstrap" });
    contentEl.createEl("p", {
      text: "Chimera Nexus has initialised the starter memory files in your vault. These files help Claude understand your preferences and working context.",
    });

    const list = contentEl.createEl("ul");
    [
      ".claude/memory/system.md – Core system context",
      ".claude/memory/knowledge.md – Your knowledge base",
      ".claude/memory/user.md – Your personal preferences",
    ].forEach((item) => list.createEl("li", { text: item }));

    contentEl.createEl("p", {
      text: "You can edit these files at any time to customise how Chimera Nexus behaves.",
    });

    // Navigation buttons
    const buttonContainer = contentEl.createDiv({ cls: "chimera-onboarding-buttons" });

    buttonContainer
      .createEl("button", { text: "Back" })
      .addEventListener("click", () => {
        this.step = 2;
        this._render();
      });

    buttonContainer
      .createEl("button", { text: "Finish", cls: "mod-cta" })
      .addEventListener("click", () => {
        this.close();
      });
  }

  // -------------------------------------------------------------------------
  // CLI probe
  // -------------------------------------------------------------------------

  /**
   * Runs `claude --version` via child_process and parses the output.
   *
   * @returns A {@link CliProbeResult} indicating whether the CLI was found and,
   *          if so, which version string it reported.
   */
  private _detectCli(): Promise<CliProbeResult> {
    return new Promise((resolve) => {
      try {
        exec("claude --version", { timeout: 5000 }, (error, stdout) => {
          if (error) {
            resolve({ found: false, version: "" });
            return;
          }
          const version = stdout.trim().replace(/^claude\s+/i, "");
          resolve({ found: true, version });
        });
      } catch {
        resolve({ found: false, version: "" });
      }
    });
  }
}

// ---------------------------------------------------------------------------
// Public façade
// ---------------------------------------------------------------------------

/**
 * Modal wizard shown when Chimera Nexus is opened for the first time.
 *
 * Delegates to the internal {@link OnboardingModal} and resolves only after
 * the user has completed or dismissed the wizard.
 */
export class OnboardingWizard {
  /**
   * Opens the onboarding modal and resolves when the user completes or
   * dismisses it.
   *
   * @param app          - The Obsidian App instance used to open modals.
   * @param settings     - Mutable settings object; auth choices are written here.
   * @param saveSettings - Async callback that persists the settings to disk.
   */
  async show(
    app: App,
    settings: ChimeraSettings,
    saveSettings: () => Promise<void>
  ): Promise<void> {
    try {
      const modal = new OnboardingModal(app, settings, saveSettings);
      modal.open();
      await modal.done;
    } catch {
      // If the modal fails to open, resolve silently — the plugin should still
      // be usable without completing the wizard.
    }
  }
}
