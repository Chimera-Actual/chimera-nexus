/**
 * @file CLI / API key authentication configuration helpers.
 *
 * Validates that the user has supplied all required credentials for the
 * selected {@link AuthMethod} before any session is started.
 */

// TODO: Not yet implemented -- validate auth config against live CLI / API.

import { ChimeraSettings, AuthMethod } from "../../core/types";

/**
 * Returns `true` when the supplied settings contain the credentials required
 * for the configured {@link AuthMethod}.
 *
 * - For {@link AuthMethod.CLI}: verifies that `cliPath` is non-empty.
 * - For {@link AuthMethod.APIKey}: verifies that `apiKey` is non-empty.
 *
 * @param settings - The plugin settings to validate.
 * @returns `true` if authentication is configured; `false` otherwise.
 */
export function validateAuthConfig(settings: ChimeraSettings): boolean {
  if (settings.authMethod === AuthMethod.APIKey) {
    return settings.apiKey.trim().length > 0;
  }
  return settings.cliPath.trim().length > 0;
}
