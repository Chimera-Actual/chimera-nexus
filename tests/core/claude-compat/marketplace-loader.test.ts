/**
 * @file Unit tests for MarketplaceLoader.
 */

import { MarketplaceLoader } from "../../../src/core/claude-compat/marketplace-loader";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VALID_INDEX = JSON.stringify({
  name: "chimera-official",
  owner: { name: "chimera-nexus", email: "plugins@chimera.dev" },
  metadata: { description: "Official plugin index", version: "1.0.0", pluginRoot: "plugins/" },
  plugins: [
    {
      name: "hello-world",
      source: "./plugins/hello-world",
      description: "A simple hello world plugin",
      version: "0.1.0",
      category: "demo",
      keywords: ["hello", "demo"],
    },
    {
      name: "github-plugin",
      source: { source: "github", repo: "chimera-nexus/github-plugin", ref: "main" },
      description: "Installed from GitHub",
    },
    {
      name: "url-plugin",
      source: { source: "url", url: "https://example.com/plugin.git" },
    },
    {
      name: "subdir-plugin",
      source: { source: "git-subdir", url: "https://github.com/mono/repo.git", path: "packages/subdir-plugin", ref: "v2.0.0" },
    },
  ],
});

// ---------------------------------------------------------------------------
// parseIndex()
// ---------------------------------------------------------------------------

describe("MarketplaceLoader.parseIndex()", () => {
  it("parses a valid marketplace.json with plugins", () => {
    const result = MarketplaceLoader.parseIndex(VALID_INDEX);

    expect(result).toBeDefined();
    expect(result!.name).toBe("chimera-official");
    expect(result!.owner).toEqual({ name: "chimera-nexus", email: "plugins@chimera.dev" });
    expect(result!.plugins).toHaveLength(4);

    const first = result!.plugins[0];
    expect(first.name).toBe("hello-world");
    expect(first.source).toBe("./plugins/hello-world");
    expect(first.description).toBe("A simple hello world plugin");
    expect(first.version).toBe("0.1.0");
    expect(first.category).toBe("demo");
    expect(first.keywords).toEqual(["hello", "demo"]);
  });

  it("returns undefined for invalid JSON", () => {
    const result = MarketplaceLoader.parseIndex("{ this is not valid json }");
    expect(result).toBeUndefined();
  });

  it("returns undefined when name field is missing", () => {
    const noName = JSON.stringify({
      owner: { name: "someone" },
      plugins: [],
    });
    expect(MarketplaceLoader.parseIndex(noName)).toBeUndefined();
  });

  it("returns undefined when owner field is missing", () => {
    const noOwner = JSON.stringify({
      name: "my-index",
      plugins: [],
    });
    expect(MarketplaceLoader.parseIndex(noOwner)).toBeUndefined();
  });

  it("returns undefined when owner.name is missing", () => {
    const noOwnerName = JSON.stringify({
      name: "my-index",
      owner: { email: "foo@bar.com" },
      plugins: [],
    });
    expect(MarketplaceLoader.parseIndex(noOwnerName)).toBeUndefined();
  });

  it("returns undefined when plugins is not an array", () => {
    const badPlugins = JSON.stringify({
      name: "my-index",
      owner: { name: "someone" },
      plugins: "not-an-array",
    });
    expect(MarketplaceLoader.parseIndex(badPlugins)).toBeUndefined();
  });

  it("returns undefined when plugins field is missing", () => {
    const noPlugins = JSON.stringify({
      name: "my-index",
      owner: { name: "someone" },
    });
    expect(MarketplaceLoader.parseIndex(noPlugins)).toBeUndefined();
  });

  it("parses GitHub source objects correctly", () => {
    const result = MarketplaceLoader.parseIndex(VALID_INDEX);
    const githubEntry = result!.plugins.find((p) => p.name === "github-plugin");

    expect(githubEntry).toBeDefined();
    expect(githubEntry!.source).toEqual({
      source: "github",
      repo: "chimera-nexus/github-plugin",
      ref: "main",
    });
  });

  it("parses metadata with pluginRoot", () => {
    const result = MarketplaceLoader.parseIndex(VALID_INDEX);

    expect(result!.metadata).toBeDefined();
    expect(result!.metadata!.description).toBe("Official plugin index");
    expect(result!.metadata!.version).toBe("1.0.0");
    expect(result!.metadata!.pluginRoot).toBe("plugins/");
  });

  it("skips plugin entries that are missing required name field", () => {
    const withBadEntry = JSON.stringify({
      name: "my-index",
      owner: { name: "someone" },
      plugins: [
        { name: "valid-plugin", source: "./plugins/valid" },
        { source: "./plugins/no-name" }, // missing name
        { name: "another-valid", source: { source: "github", repo: "org/repo" } },
      ],
    });
    const result = MarketplaceLoader.parseIndex(withBadEntry);
    expect(result).toBeDefined();
    expect(result!.plugins).toHaveLength(2);
    expect(result!.plugins.map((p) => p.name)).toEqual(["valid-plugin", "another-valid"]);
  });

  it("skips plugin entries that are missing required source field", () => {
    const withBadEntry = JSON.stringify({
      name: "my-index",
      owner: { name: "someone" },
      plugins: [
        { name: "valid-plugin", source: "./plugins/valid" },
        { name: "no-source-plugin" }, // missing source
      ],
    });
    const result = MarketplaceLoader.parseIndex(withBadEntry);
    expect(result).toBeDefined();
    expect(result!.plugins).toHaveLength(1);
    expect(result!.plugins[0].name).toBe("valid-plugin");
  });

  it("parses metadata as optional (omitted)", () => {
    const minimal = JSON.stringify({
      name: "minimal-index",
      owner: { name: "anon" },
      plugins: [{ name: "p", source: "./p" }],
    });
    const result = MarketplaceLoader.parseIndex(minimal);
    expect(result).toBeDefined();
    expect(result!.metadata).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// resolveGitUrl()
// ---------------------------------------------------------------------------

describe("MarketplaceLoader.resolveGitUrl()", () => {
  const MARKETPLACE_REPO = "https://github.com/chimera-nexus/marketplace.git";

  it("resolves a relative path source to the marketplace repo URL", () => {
    const url = MarketplaceLoader.resolveGitUrl("./plugins/my-plugin", MARKETPLACE_REPO);
    expect(url).toBe(MARKETPLACE_REPO);
  });

  it("resolves a non-relative string source using itself as the URL", () => {
    const url = MarketplaceLoader.resolveGitUrl(
      "https://example.com/some-plugin.git",
      MARKETPLACE_REPO
    );
    expect(url).toBe("https://example.com/some-plugin.git");
  });

  it("resolves a GitHub source to a https clone URL", () => {
    const url = MarketplaceLoader.resolveGitUrl(
      { source: "github", repo: "chimera-nexus/my-plugin", ref: "main" },
      MARKETPLACE_REPO
    );
    expect(url).toBe("https://github.com/chimera-nexus/my-plugin.git");
  });

  it("resolves a URL source directly", () => {
    const url = MarketplaceLoader.resolveGitUrl(
      { source: "url", url: "https://example.com/plugin.git" },
      MARKETPLACE_REPO
    );
    expect(url).toBe("https://example.com/plugin.git");
  });

  it("resolves a git-subdir source using the url field", () => {
    const url = MarketplaceLoader.resolveGitUrl(
      { source: "git-subdir", url: "https://github.com/mono/repo.git", path: "packages/plugin" },
      MARKETPLACE_REPO
    );
    expect(url).toBe("https://github.com/mono/repo.git");
  });
});
