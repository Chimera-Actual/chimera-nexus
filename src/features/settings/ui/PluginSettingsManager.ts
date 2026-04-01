import { Notice, setIcon } from 'obsidian';

import type { ClaudianPlugin as ClaudianPluginType } from '../../../core/types';
import type ClaudianPlugin from '../../../main';

export class PluginSettingsManager {
  private containerEl: HTMLElement;
  private plugin: ClaudianPlugin;

  constructor(containerEl: HTMLElement, plugin: ClaudianPlugin) {
    this.containerEl = containerEl;
    this.plugin = plugin;
    this.render();
  }

  private render() {
    this.containerEl.empty();

    const headerEl = this.containerEl.createDiv({ cls: 'chimera-plugin-header' });
    headerEl.createSpan({ text: 'Claude Code Plugins', cls: 'chimera-plugin-label' });

    const refreshBtn = headerEl.createEl('button', {
      cls: 'chimera-settings-action-btn',
      attr: { 'aria-label': 'Refresh' },
    });
    setIcon(refreshBtn, 'refresh-cw');
    refreshBtn.addEventListener('click', () => this.refreshPlugins());

    const plugins = this.plugin.pluginManager.getPlugins();

    if (plugins.length === 0) {
      const emptyEl = this.containerEl.createDiv({ cls: 'chimera-plugin-empty' });
      emptyEl.setText('No Claude Code plugins found. Enable plugins via the Claude CLI.');
      return;
    }

    const projectPlugins = plugins.filter(p => p.scope === 'project');
    const userPlugins = plugins.filter(p => p.scope === 'user');

    const listEl = this.containerEl.createDiv({ cls: 'chimera-plugin-list' });

    if (projectPlugins.length > 0) {
      const sectionHeader = listEl.createDiv({ cls: 'chimera-plugin-section-header' });
      sectionHeader.setText('Project Plugins');

      for (const plugin of projectPlugins) {
        this.renderPluginItem(listEl, plugin);
      }
    }

    if (userPlugins.length > 0) {
      const sectionHeader = listEl.createDiv({ cls: 'chimera-plugin-section-header' });
      sectionHeader.setText('User Plugins');

      for (const plugin of userPlugins) {
        this.renderPluginItem(listEl, plugin);
      }
    }
  }

  private renderPluginItem(listEl: HTMLElement, plugin: ClaudianPluginType) {
    const itemEl = listEl.createDiv({ cls: 'chimera-plugin-item' });
    if (!plugin.enabled) {
      itemEl.addClass('chimera-plugin-item-disabled');
    }

    const statusEl = itemEl.createDiv({ cls: 'chimera-plugin-status' });
    if (plugin.enabled) {
      statusEl.addClass('chimera-plugin-status-enabled');
    } else {
      statusEl.addClass('chimera-plugin-status-disabled');
    }

    const infoEl = itemEl.createDiv({ cls: 'chimera-plugin-info' });

    const nameRow = infoEl.createDiv({ cls: 'chimera-plugin-name-row' });

    const nameEl = nameRow.createSpan({ cls: 'chimera-plugin-name' });
    nameEl.setText(plugin.name);

    const actionsEl = itemEl.createDiv({ cls: 'chimera-plugin-actions' });

    const toggleBtn = actionsEl.createEl('button', {
      cls: 'chimera-plugin-action-btn',
      attr: { 'aria-label': plugin.enabled ? 'Disable' : 'Enable' },
    });
    setIcon(toggleBtn, plugin.enabled ? 'toggle-right' : 'toggle-left');
    toggleBtn.addEventListener('click', () => this.togglePlugin(plugin.id));
  }

  private async togglePlugin(pluginId: string) {
    const plugin = this.plugin.pluginManager.getPlugins().find(p => p.id === pluginId);
    const wasEnabled = plugin?.enabled ?? false;

    try {
      await this.plugin.pluginManager.togglePlugin(pluginId);
      await this.plugin.agentManager.loadAgents();

      const view = this.plugin.getView();
      const tabManager = view?.getTabManager();
      if (tabManager) {
        try {
          await tabManager.broadcastToAllTabs(
            async (service) => { await service.ensureReady({ force: true }); }
          );
        } catch {
          new Notice('Plugin toggled, but some tabs failed to restart.');
        }
      }

      new Notice(`Plugin "${pluginId}" ${wasEnabled ? 'disabled' : 'enabled'}`);
    } catch (err) {
      await this.plugin.pluginManager.togglePlugin(pluginId);
      const message = err instanceof Error ? err.message : 'Unknown error';
      new Notice(`Failed to toggle plugin: ${message}`);
    } finally {
      this.render();
    }
  }

  private async refreshPlugins() {
    try {
      await this.plugin.pluginManager.loadPlugins();
      await this.plugin.agentManager.loadAgents();

      new Notice('Plugin list refreshed');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      new Notice(`Failed to refresh plugins: ${message}`);
    } finally {
      this.render();
    }
  }

  public refresh() {
    this.render();
  }
}
