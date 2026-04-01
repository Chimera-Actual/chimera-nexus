/**
 * @file Utility functions wrapping common Obsidian Vault API patterns.
 *
 * Provides thin helpers that reduce boilerplate when working with the
 * Obsidian {@link Vault} API across the plugin codebase.
 */

// TODO: Not yet implemented -- implement folder creation and safe read helpers.

import { Vault } from "obsidian";

/**
 * Ensures that `path` exists as a folder in `vault`, creating it (and any
 * missing ancestors) if necessary.
 *
 * @param vault - The Obsidian Vault instance.
 * @param path - Vault-relative path of the folder to create.
 */
export async function ensureFolder(vault: Vault, path: string): Promise<void> {
  void vault;
  void path;
  throw new Error("Not implemented");
}

/**
 * Reads a vault file by path, returning its content or `null` if the file
 * does not exist.
 *
 * Unlike the raw Vault API this function never throws on a missing file.
 *
 * @param vault - The Obsidian Vault instance.
 * @param path - Vault-relative path of the file to read.
 * @returns The file content as a string, or `null` if not found.
 */
export async function readSafe(
  vault: Vault,
  path: string
): Promise<string | null> {
  void vault;
  void path;
  throw new Error("Not implemented");
}
