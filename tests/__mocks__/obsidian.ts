/**
 * Mock of the Obsidian module for Jest unit tests.
 * Provides functional mock implementations of all commonly used Obsidian API classes.
 */

// ─── TAbstractFile ─────────────────────────────────────────────────────────

export class TAbstractFile {
  path: string = "";
  name: string = "";
  vault: Vault = new Vault();
  parent: TFolder | null = null;
}

// ─── TFile ─────────────────────────────────────────────────────────────────

export class TFile extends TAbstractFile {
  stat = { ctime: 0, mtime: 0, size: 0 };
  basename: string = "";
  extension: string = "";
}

// ─── TFolder ───────────────────────────────────────────────────────────────

export class TFolder extends TAbstractFile {
  children: TAbstractFile[] = [];
  isRoot(): boolean {
    return this.parent === null;
  }
}

// ─── Vault ─────────────────────────────────────────────────────────────────

export class Vault {
  adapter = {
    exists: jest.fn().mockResolvedValue(false),
    read: jest.fn().mockResolvedValue(""),
    write: jest.fn().mockResolvedValue(undefined),
    mkdir: jest.fn().mockResolvedValue(undefined),
    list: jest.fn().mockResolvedValue({ files: [], folders: [] }),
  };

  getAbstractFileByPath = jest.fn().mockReturnValue(null);
  read = jest.fn().mockResolvedValue("");
  create = jest.fn().mockResolvedValue(new TFile());
  modify = jest.fn().mockResolvedValue(undefined);
  createFolder = jest.fn().mockResolvedValue(undefined);
  getFiles = jest.fn().mockReturnValue([]);
  getMarkdownFiles = jest.fn().mockReturnValue([]);
  delete = jest.fn().mockResolvedValue(undefined);
  rename = jest.fn().mockResolvedValue(undefined);
  on = jest.fn().mockReturnValue({ unload: jest.fn() });
}

// ─── Workspace ─────────────────────────────────────────────────────────────

export class WorkspaceLeaf {
  view: unknown = null;
  openFile = jest.fn().mockResolvedValue(undefined);
  setViewState = jest.fn().mockResolvedValue(undefined);
  getViewState = jest.fn().mockReturnValue({});
  detach = jest.fn();
}

export class Workspace {
  getLeaf = jest.fn().mockReturnValue(new WorkspaceLeaf());
  revealLeaf = jest.fn();
  getLeavesOfType = jest.fn().mockReturnValue([]);
  on = jest.fn().mockReturnValue({ unload: jest.fn() });
  onLayoutReady = jest.fn((cb: () => void) => cb());
  getActiveFile = jest.fn().mockReturnValue(null);
  getActiveViewOfType = jest.fn().mockReturnValue(null);
}

// ─── App ───────────────────────────────────────────────────────────────────

export class App {
  vault = new Vault();
  workspace = new Workspace();
  metadataCache = {
    getFileCache: jest.fn().mockReturnValue(null),
    on: jest.fn().mockReturnValue({ unload: jest.fn() }),
  };
}

// ─── Plugin ────────────────────────────────────────────────────────────────

export class Plugin {
  app: App = new App();
  manifest = { id: "mock-plugin", name: "Mock Plugin", version: "0.0.1" };

  loadData = jest.fn().mockResolvedValue({});
  saveData = jest.fn().mockResolvedValue(undefined);
  registerEvent = jest.fn();
  registerInterval = jest.fn().mockReturnValue(0);
  addRibbonIcon = jest.fn().mockReturnValue(document.createElement("div"));
  addCommand = jest.fn();
  addSettingTab = jest.fn();
  registerView = jest.fn();
  registerExtensions = jest.fn();
  onload = jest.fn().mockResolvedValue(undefined);
  onunload = jest.fn();
}

// ─── ItemView ──────────────────────────────────────────────────────────────

export class ItemView {
  app: App = new App();
  containerEl = document.createElement("div");
  leaf: WorkspaceLeaf = new WorkspaceLeaf();
  icon: string = "";

  getViewType = jest.fn().mockReturnValue("mock-view");
  getDisplayText = jest.fn().mockReturnValue("Mock View");
  getIcon = jest.fn().mockReturnValue("star");
  onOpen = jest.fn().mockResolvedValue(undefined);
  onClose = jest.fn().mockResolvedValue(undefined);
}

// ─── PluginSettingTab ──────────────────────────────────────────────────────

export class PluginSettingTab {
  app: App = new App();
  containerEl = document.createElement("div");

  display = jest.fn();
  hide = jest.fn();
}

// ─── Setting ───────────────────────────────────────────────────────────────

export class Setting {
  private el = document.createElement("div");

  constructor(_containerEl?: HTMLElement) {
    // Accept container element but don't require it for mocking
  }

  setName = jest.fn().mockReturnThis();
  setDesc = jest.fn().mockReturnThis();
  setClass = jest.fn().mockReturnThis();
  setHeading = jest.fn().mockReturnThis();
  setDisabled = jest.fn().mockReturnThis();

  addText = jest.fn().mockImplementation((cb?: (text: { setValue: jest.Mock; setPlaceholder: jest.Mock; onChange: jest.Mock; inputEl: HTMLInputElement }) => void) => {
    const textComponent = {
      setValue: jest.fn().mockReturnThis(),
      setPlaceholder: jest.fn().mockReturnThis(),
      onChange: jest.fn().mockReturnThis(),
      inputEl: document.createElement("input"),
    };
    if (cb) cb(textComponent);
    return this;
  });

  addToggle = jest.fn().mockImplementation((cb?: (toggle: { setValue: jest.Mock; onChange: jest.Mock }) => void) => {
    const toggleComponent = {
      setValue: jest.fn().mockReturnThis(),
      onChange: jest.fn().mockReturnThis(),
    };
    if (cb) cb(toggleComponent);
    return this;
  });

  addDropdown = jest.fn().mockImplementation((cb?: (dropdown: { addOption: jest.Mock; setValue: jest.Mock; onChange: jest.Mock }) => void) => {
    const dropdownComponent = {
      addOption: jest.fn().mockReturnThis(),
      addOptions: jest.fn().mockReturnThis(),
      setValue: jest.fn().mockReturnThis(),
      onChange: jest.fn().mockReturnThis(),
      selectEl: document.createElement("select"),
    };
    if (cb) cb(dropdownComponent);
    return this;
  });

  addButton = jest.fn().mockImplementation((cb?: (button: { setButtonText: jest.Mock; setCta: jest.Mock; onClick: jest.Mock }) => void) => {
    const buttonComponent = {
      setButtonText: jest.fn().mockReturnThis(),
      setCta: jest.fn().mockReturnThis(),
      setWarning: jest.fn().mockReturnThis(),
      setDisabled: jest.fn().mockReturnThis(),
      onClick: jest.fn().mockReturnThis(),
      buttonEl: document.createElement("button"),
    };
    if (cb) cb(buttonComponent);
    return this;
  });

  addSlider = jest.fn().mockImplementation((cb?: (slider: { setLimits: jest.Mock; setValue: jest.Mock; onChange: jest.Mock }) => void) => {
    const sliderComponent = {
      setLimits: jest.fn().mockReturnThis(),
      setValue: jest.fn().mockReturnThis(),
      setDynamicTooltip: jest.fn().mockReturnThis(),
      onChange: jest.fn().mockReturnThis(),
      sliderEl: document.createElement("input"),
    };
    if (cb) cb(sliderComponent);
    return this;
  });
}

// ─── Notice ────────────────────────────────────────────────────────────────

export class Notice {
  constructor(_message: string | DocumentFragment, _timeout?: number) {
    // Mock implementation - no-op
  }
  setMessage = jest.fn().mockReturnThis();
  hide = jest.fn();
}

// ─── MarkdownRenderer ──────────────────────────────────────────────────────

export const MarkdownRenderer = {
  renderMarkdown: jest.fn().mockResolvedValue(undefined),
  render: jest.fn().mockResolvedValue(undefined),
};

// ─── Utility functions ─────────────────────────────────────────────────────

export const normalizePath = jest.fn().mockImplementation((path: string): string => {
  // Basic normalization: replace backslashes with forward slashes, remove trailing slashes
  return path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/$/, "");
});

// ─── Additional exports for completeness ───────────────────────────────────

export const Platform = {
  isDesktop: true,
  isMobile: false,
  isDesktopApp: true,
  isMobileApp: false,
};

export const moment = jest.fn().mockReturnValue({
  format: jest.fn().mockReturnValue(""),
  valueOf: jest.fn().mockReturnValue(0),
});
