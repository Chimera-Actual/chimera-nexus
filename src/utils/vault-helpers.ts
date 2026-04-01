/**
 * @file Utility functions wrapping common Obsidian Vault API patterns.
 *
 * Provides thin helpers that reduce boilerplate when working with the
 * Obsidian {@link Vault} API across the plugin codebase.
 */

import { App, Vault, normalizePath } from "obsidian";

/**
 * Ensures that `path` exists as a folder in `vault`, creating it (and any
 * missing ancestors) if necessary.
 *
 * @param vault - The Obsidian Vault instance.
 * @param path - Vault-relative path of the folder to create.
 */
export async function ensureFolder(vault: Vault, path: string): Promise<void> {
  const normalized = normalizePath(path);
  const exists = await vault.adapter.exists(normalized);
  if (!exists) {
    await vault.createFolder(normalized);
  }
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
  try {
    const normalized = normalizePath(path);
    const exists = await vault.adapter.exists(normalized);
    if (!exists) {
      return null;
    }
    return await vault.adapter.read(normalized);
  } catch (err) {
    console.warn("[Chimera] readSafe failed for path:", path, err);
    return null;
  }
}

/**
 * Writes `content` to the vault file at `path`, creating any missing parent
 * folders first.
 *
 * Uses {@link Vault.adapter} directly so that the path may be either an
 * existing or a new file.
 *
 * @param vault - The Obsidian Vault instance.
 * @param path - Vault-relative path of the file to write.
 * @param content - String content to write.
 */
export async function writeSafe(
  vault: Vault,
  path: string,
  content: string
): Promise<void> {
  try {
    const normalized = normalizePath(path);
    // Derive parent folder from the normalized path.
    const lastSlash = normalized.lastIndexOf("/");
    if (lastSlash > 0) {
      const parentDir = normalized.slice(0, lastSlash);
      await ensureFolder(vault, parentDir);
    }
    await vault.adapter.write(normalized, content);
  } catch (err) {
    console.warn("[Chimera] writeSafe failed for path:", path, err);
    throw err;
  }
}

/**
 * Recursively lists all Markdown (`.md`) file paths under `dir`.
 *
 * @param vault - The Obsidian Vault instance.
 * @param dir - Vault-relative directory path to search.
 * @returns An array of vault-relative paths for every `.md` file found.
 */
export async function listMarkdownFiles(
  vault: Vault,
  dir: string
): Promise<string[]> {
  try {
    const normalized = normalizePath(dir);
    const results: string[] = [];

    const recurse = async (currentDir: string): Promise<void> => {
      const listing = await vault.adapter.list(currentDir);

      for (const filePath of listing.files) {
        if (filePath.endsWith(".md")) {
          results.push(filePath);
        }
      }

      for (const subDir of listing.folders) {
        await recurse(subDir);
      }
    }

    await recurse(normalized);
    return results;
  } catch (err) {
    console.warn("[Chimera] listMarkdownFiles failed for dir:", dir, err);
    return [];
  }
}

/**
 * Attempts a best-effort auto-commit via the Obsidian Git community plugin.
 *
 * Accesses the plugin through Obsidian's internal `app.plugins.plugins` map,
 * which is untyped at the Obsidian API level. We cast through `unknown` and
 * document every assumption inline to avoid use of `any`.
 *
 * This function never throws to its caller -- if Obsidian Git is not installed,
 * the API has changed, or the commit fails for any reason, it logs a warning
 * and returns `false`.
 *
 * @param app - The Obsidian App instance.
 * @param message - Commit message string.
 * @returns `true` if the commit succeeded, `false` otherwise.
 */
export async function tryAutoCommit(
  app: App,
  message: string
): Promise<boolean> {
  try {
    // `app.plugins` is an internal Obsidian API not exposed in the public
    // type definitions, so we cast through `unknown` to access it safely.
    const internalPlugins = (
      app as unknown as {
        plugins: { plugins: Record<string, unknown> };
      }
    ).plugins;

    // Represent the subset of the Obsidian Git plugin API we rely on.
    // If the actual plugin shape changes, the runtime checks below will
    // catch it and we return false gracefully.
    const gitPlugin = internalPlugins?.plugins?.["obsidian-git"] as
      | {
          gitManager?: {
            stageAll(): Promise<void>;
            commit(message: string): Promise<void>;
          };
        }
      | undefined;

    if (!gitPlugin?.gitManager) {
      return false; // Obsidian Git not installed or API changed.
    }

    await gitPlugin.gitManager.stageAll();
    await gitPlugin.gitManager.commit(message);
    return true;
  } catch (err) {
    console.warn("[Chimera] Auto-commit failed:", err);
    return false;
  }
}
