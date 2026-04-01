/**
 * @file First-run setup wizard for Chimera Nexus.
 *
 * Guides the user through selecting an auth method, verifying credentials,
 * and creating the initial vault folder structure on first install.
 */

// TODO: Not yet implemented -- build multi-step modal wizard UI.

import { App } from "obsidian";

/**
 * Modal wizard shown when Chimera Nexus is opened for the first time.
 */
export class OnboardingWizard {
  /**
   * Opens the wizard modal and resolves when the user completes or dismisses it.
   *
   * @param app - The Obsidian App instance used to open modals.
   */
  async show(app: App): Promise<void> {
    void app;
    throw new Error("Not implemented");
  }
}
