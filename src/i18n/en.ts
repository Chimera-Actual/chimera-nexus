/**
 * @file English language strings for the UI.
 *
 * Central string table for all user-visible text in Chimera Nexus. Import
 * `EN_STRINGS` and look up keys rather than hardcoding strings in components.
 */

// TODO: Not yet implemented -- populate with full string set during UI build.

/**
 * English UI string map.
 *
 * Keys use camelCase identifiers; values are display-ready English strings.
 */
export const EN_STRINGS: Record<string, string> = {
  welcome: "Welcome to Chimera Nexus",
  ready: "Ready",
  noSessions: "No sessions yet",
  loading: "Loading...",
  error: "An error occurred",
  cancel: "Cancel",
  confirm: "Confirm",
};
