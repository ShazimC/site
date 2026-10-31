'use strict';
// Site Publisher: sidebar UI over scripts/publish/cli.ts in the site repo.
// All state lives in note frontmatter; this view just reads it and runs the CLI.
const { ItemView, Menu, Notice, Plugin, PluginSettingTab, Setting, TFile, setIcon } = require('obsidian');
const { execFile } = require('child_process');

const VIEW = 'site-publisher';
const DEFAULTS = { repoPath: '/Users/shazimc/Code/site', nodePath: '' };
const PLATFORMS = ['site', 'substack', 'medium'];
const LABELS = { site: 'Site', substack: 'Substack', medium: 'Medium' };
const STATUSES = ['undrafted', 'draft', 'published'];

module.exports = class SitePublisher extends Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULTS, await this.loadData());
    this.busy = new Set();
    this.config = null;

    this.registerView(VIEW, (leaf) => new PublishView(leaf, this));
    this.addRibbonIcon('send', 'Site publisher', () => this.openView());
    this.addSettingTab(new PublisherSettings(this));

    this.addCommand({ id: 'open', name: 'Open publishing sidebar', callback: () => this.openView() });
    this.addCommand({ id: 'refresh', name: 'Refresh publishing status', callback: () => this.refresh() });
    this.addCommand({
      id: 'toggle',
      name: 'Add/remove current note from publishing',
      editorCheckCallback: (checking, _editor, ctx) => this.whenMarkdown(ctx.file, checking, (f) => this.togglePublish(f)),
    });
    this.addCommand({
      id: 'complete',
      name: 'Toggle complete on current note',
      editorCheckCallback: (checking, _editor, ctx) => this.whenMarkdown(ctx.file, checking, (f) => this.setComplete(f, !this.isComplete(f))),
    });
    this.addCommand({
      id: 'draft',
      name: 'Create drafts for current note',
      editorCheckCallback: (checking, _editor, ctx) => this.whenMarkdown(ctx.file, checking, (f) => this.run('draft', [f])),
    });

    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file) => {
        if (!(file instanceof TFile) || file.extension !== 'md') return;
        const marked = this.isMarked(file);
        menu.addItem((item) =>
          item.setTitle(marked ? 'Remove from publishing' : 'Add to publishing').setIcon('send').onClick(() => this.togglePublish(file)),
        );
        if (marked) menu.addItem((item) => item.setTitle('Create drafts').setIcon('file-up').onClick(() => this.run('draft', [file])));
      }),
    );

    this.app.workspace.onLayoutReady(async () => {
      if (!this.settings.nodePath) await this.detectNode();
      if (!this.app.workspace.getLeavesOfType(VIEW).length) await this.app.workspace.getLeftLeaf(false).setViewState({ type: VIEW });
    });
  }

  whenMarkdown(file, checking, action) {
    if (!file || file.extension !== 'md') return false;
    if (!checking) action(file);
    return true;
  }

  async openView() {
    const existing = this.app.workspace.getLeavesOfType(VIEW)[0];
    const leaf = existing ?? this.app.workspace.getLeftLeaf(false);
    if (!existing) await leaf.setViewState({ type: VIEW, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  rerender() {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW)) leaf.view.render();
  }

  frontmatter(file) {
    return this.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
  }

  isMarked(file) {
    return this.frontmatter(file).publish === true;
  }

  marked() {
    return this.app.vault.getMarkdownFiles().filter((f) => this.isMarked(f));
  }

  async togglePublish(file) {
    const marked = this.isMarked(file);
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      if (marked) return void delete fm.publish;
      fm.publish = true;
      fm.complete ??= true;
      for (const platform of PLATFORMS) fm[platform] ??= 'undrafted';
    });
    new Notice(`${file.basename}: ${marked ? 'removed from' : 'added to'} publishing`);
  }

  isComplete(file) {
    return this.frontmatter(file).complete !== false;
  }

  async setComplete(file, complete) {
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      fm.complete = complete;
    });
    new Notice(`${file.basename}: marked ${complete ? 'complete' : 'incomplete'}. Run “Update drafts” to apply it to the site.`);
  }

  async setMedium(file, status) {
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      fm.medium = status;
    });
  }

  urls(file) {
    const fm = this.frontmatter(file);
    const config = this.config ?? {};
    const base = fm.site === 'published' ? config.siteUrl : config.devUrl;
    return {
      site: fm.site && fm.slug && base ? `${base}/thoughts/${fm.slug}/` : null,
      substack: fm.substack_url ?? null,
    };
  }

  async detectNode() {
    const found = await new Promise((resolve) =>
      execFile('/bin/zsh', ['-lic', 'command -v node'], { timeout: 10000 }, (_e, out) => resolve(out.trim().split('\n').pop() || '')),
    );
    if (found) {
      this.settings.nodePath = found;
      await this.saveData(this.settings);
    }
    return found;
  }

  cli(args) {
    const { repoPath, nodePath } = this.settings;
    if (!nodePath) return Promise.reject(new Error('Set the Node path in Site Publisher settings.'));
    const env = { ...process.env, OBSIDIAN_VAULT: this.app.vault.adapter.getBasePath() };
    return new Promise((resolve, reject) =>
      execFile(nodePath, ['scripts/publish/cli.ts', ...args, '--json'], { cwd: repoPath, env, timeout: 180000, maxBuffer: 1 << 24 }, (error, stdout, stderr) => {
        try {
          const parsed = JSON.parse(stdout);
          if (parsed && !Array.isArray(parsed) && parsed.error) reject(new Error(parsed.error));
          else resolve(parsed);
        } catch {
          reject(new Error((stderr || error?.message || 'No output from CLI').trim()));
        }
      }),
    );
  }

  async loadConfig() {
    try {
      this.config = await this.cli(['config']);
    } catch (error) {
      new Notice(`Site publisher: ${error.message}`);
    }
  }

  async run(command, files) {
    const paths = files.map((f) => this.app.vault.adapter.getFullPath(f.path));
    files.forEach((f) => this.busy.add(f.path));
    this.rerender();
    try {
      if (!this.config) await this.loadConfig();
      const results = await this.cli([command, ...paths]);
      for (const result of results) {
        const name = result.note.split('/').pop().replace(/\.md$/, '');
        const lines = [...result.messages.map((m) => `✓ ${m}`), ...result.errors.map((e) => `✗ ${e}`)];
        if (command !== 'status' || result.errors.length) new Notice(`${name}\n${lines.join('\n') || 'Done'}`, result.errors.length ? 0 : 6000);
      }
    } catch (error) {
      new Notice(`Site publisher: ${error.message}`, 0);
    } finally {
      files.forEach((f) => this.busy.delete(f.path));
      this.rerender();
    }
  }

  async refresh() {
    await this.loadConfig();
    const files = this.marked();
    if (files.length) await this.run('status', files);
    else this.rerender();
  }
};

class PublishView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() {
    return VIEW;
  }

  getDisplayText() {
    return 'Publishing';
  }

  getIcon() {
    return 'send';
  }

  async onOpen() {
    this.registerEvent(this.app.metadataCache.on('changed', () => this.render()));
    this.registerEvent(this.app.vault.on('rename', () => this.render()));
    this.registerEvent(this.app.vault.on('delete', () => this.render()));
    this.render();
    if (!this.plugin.config) this.plugin.loadConfig().then(() => this.render());
  }

  render() {
    const root = this.contentEl;
    root.empty();
    root.addClass('sp-view');

    const header = root.createDiv('sp-header');
    header.createEl('h4', { text: 'Publishing' });
    const tools = header.createDiv('sp-tools');
    iconButton(tools, 'plus', 'Add current note', () => {
      const file = this.app.workspace.getActiveFile();
      if (file?.extension === 'md' && !this.plugin.isMarked(file)) this.plugin.togglePublish(file);
    });
    iconButton(tools, 'refresh-cw', 'Refresh status', () => this.plugin.refresh());

    const files = this.plugin.marked().sort((a, b) => b.stat.mtime - a.stat.mtime);
    if (!files.length) {
      root.createDiv({ cls: 'sp-empty', text: 'No notes marked for publishing. Use “Add to publishing” from a note’s menu or the + button.' });
      return;
    }

    const list = root.createDiv('sp-list');
    for (const file of files) this.row(list, file);
  }

  row(list, file) {
    const fm = this.plugin.frontmatter(file);
    const busy = this.plugin.busy.has(file.path);
    const urls = this.plugin.urls(file);
    const row = list.createDiv({ cls: 'sp-row' + (busy ? ' is-busy' : '') });

    const heading = row.createDiv('sp-heading');
    const title = heading.createDiv({ cls: 'sp-title', text: fm.title ?? file.basename });
    title.setAttr('title', file.path);
    const complete = heading.createEl('label', { cls: 'sp-complete' });
    const checkbox = complete.createEl('input', { type: 'checkbox' });
    checkbox.checked = this.plugin.isComplete(file);
    checkbox.onchange = () => this.plugin.setComplete(file, checkbox.checked);
    complete.createSpan({ text: 'Complete' });
    title.onclick = () => this.app.workspace.getLeaf(false).openFile(file);
    if (file.parent && !file.parent.isRoot()) row.createDiv({ cls: 'sp-path', text: file.parent.path });

    const chips = row.createDiv('sp-chips');
    for (const platform of PLATFORMS) {
      const status = STATUSES.includes(fm[platform]) ? fm[platform] : 'undrafted';
      const chip = chips.createEl('button', { cls: `sp-chip is-${status}`, text: LABELS[platform] });
      chip.setAttr('aria-label', `${LABELS[platform]}: ${status}`);
      chip.onclick = (event) => this.openChip(event, file, platform, urls);
    }

    const actions = row.createDiv('sp-actions');
    if (busy) {
      actions.createSpan({ cls: 'sp-busy', text: 'Working…' });
      return;
    }
    textButton(actions, 'file-up', fm.site ? 'Update drafts' : 'Create drafts', () => this.plugin.run('draft', [file]));
    const medium = textButton(actions, 'external-link', 'Medium import', () => this.plugin.run('medium', [file]));
    if (fm.site !== 'published') {
      medium.disabled = true;
      medium.setAttr('aria-label', 'Available once the site post is committed and pushed');
    }
  }

  openChip(event, file, platform, urls) {
    if (platform === 'medium') {
      const current = this.plugin.frontmatter(file).medium ?? 'undrafted';
      const menu = new Menu();
      for (const status of STATUSES) {
        menu.addItem((i) =>
          i.setTitle(`Medium: ${status}`).setChecked(status === current).onClick(() => this.plugin.setMedium(file, status)),
        );
      }
      menu.showAtMouseEvent(event);
      return;
    }
    const url = urls[platform];
    if (url) window.open(url);
    else new Notice(`${LABELS[platform]}: no draft yet`);
  }
}

function iconButton(parent, icon, label, onClick) {
  const button = parent.createEl('button', { cls: 'clickable-icon' });
  setIcon(button, icon);
  button.setAttr('aria-label', label);
  button.onclick = onClick;
  return button;
}

function textButton(parent, icon, label, onClick) {
  const button = parent.createEl('button', { cls: 'sp-action' });
  setIcon(button.createSpan(), icon);
  button.createSpan({ text: label });
  button.onclick = onClick;
  return button;
}

class PublisherSettings extends PluginSettingTab {
  constructor(plugin) {
    super(plugin.app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    const save = () => this.plugin.saveData(this.plugin.settings);
    containerEl.empty();

    new Setting(containerEl)
      .setName('Site repo')
      .setDesc('Absolute path to the Astro repo containing scripts/publish.')
      .addText((t) => t.setValue(this.plugin.settings.repoPath).onChange((v) => ((this.plugin.settings.repoPath = v.trim()), save())));

    new Setting(containerEl)
      .setName('Node path')
      .setDesc('Node 22.18+ (runs TypeScript natively). Detected from your login shell.')
      .addText((t) => t.setValue(this.plugin.settings.nodePath).onChange((v) => ((this.plugin.settings.nodePath = v.trim()), save())))
      .addButton((b) =>
        b.setButtonText('Detect').onClick(async () => {
          const found = await this.plugin.detectNode();
          new Notice(found ? `Node: ${found}` : 'Node not found');
          this.display();
        }),
      );
  }
}
