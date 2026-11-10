import { 
	Plugin, 
	ItemView, 
	WorkspaceLeaf, 
	TFile, 
	TFolder, 
	TAbstractFile, 
	setIcon, 
	Menu, 
	MenuItem, 
	Modal, 
	PluginSettingTab, 
	Setting 
} from 'obsidian';

interface DynamicExplorerSettings {
	confirmDelete: boolean;
}

const DEFAULT_SETTINGS: DynamicExplorerSettings = {
	confirmDelete: true
};

const DYNAMIC_EXPLORER_VIEW_TYPE = 'dynamic-folder-explorer';

export default class DynamicExplorerPlugin extends Plugin {
	settings!: DynamicExplorerSettings;

	async onload() {
		await this.loadSettings();

		this.registerView(
			DYNAMIC_EXPLORER_VIEW_TYPE,
			(leaf) => new DynamicExplorerView(leaf, this)
		);

		this.addRibbonIcon('folder-kanban', 'Open dynamic explorer', () => {
			this.activateView();
		});

		this.addCommand({
			id: 'open-dynamic-explorer',
			name: 'Open dynamic explorer',
			callback: () => {
				this.activateView();
			},
		});

		// Register settings tab in Obsidian
		this.addSettingTab(new DynamicExplorerSettingTab(this.app, this));
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async activateView() {
		const { workspace } = this.app;
		let leaf = workspace.getLeavesOfType(DYNAMIC_EXPLORER_VIEW_TYPE)[0];

		if (!leaf) {
			leaf = workspace.getLeftLeaf(false)!;
			await leaf.setViewState({ type: DYNAMIC_EXPLORER_VIEW_TYPE, active: true });
		}

		if (leaf) {
			workspace.revealLeaf(leaf);
		}
	}
}

// --- CONFIRM DELETE MODAL ---
class ConfirmDeleteModal extends Modal {
	target: TAbstractFile;
	plugin: DynamicExplorerPlugin;
	onConfirm: () => void;

	constructor(app: any, plugin: DynamicExplorerPlugin, target: TAbstractFile, onConfirm: () => void) {
		super(app);
		this.plugin = plugin;
		this.target = target;
		this.onConfirm = onConfirm;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h3', { text: 'Delete item' });
		contentEl.createEl('p', { 
			text: `Are you sure you want to delete "${this.target.name}"?` 
		});

		// "Don't show again" checkbox container
		const dontShowContainer = contentEl.createDiv({ cls: 'confirm-delete-checkbox' });

		const checkbox = dontShowContainer.createEl('input', { type: 'checkbox' });
		const label = dontShowContainer.createEl('label', { 
			cls: 'confirm-delete-label', 
			text: "Don't show this warning again" 
		});
		label.onclick = () => checkbox.click();

		// Control buttons container
		const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });

		const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
		cancelBtn.onclick = () => this.close();

		const deleteBtn = buttonContainer.createEl('button', { 
			text: 'Delete', 
			cls: 'mod-warning' 
		});

		deleteBtn.onclick = async () => {
			if (checkbox.checked) {
				this.plugin.settings.confirmDelete = false;
				await this.plugin.saveSettings();
			}
			this.onConfirm();
			this.close();
		};
	}

	onClose() {
		this.contentEl.empty();
	}
}

// --- PLUGIN SETTINGS TAB ---
class DynamicExplorerSettingTab extends PluginSettingTab {
	plugin: DynamicExplorerPlugin;

	constructor(app: any, plugin: DynamicExplorerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('Confirm deletion')
			.setDesc('Ask for confirmation before moving files or folders to the trash.')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.confirmDelete)
					.onChange(async (value) => {
						this.plugin.settings.confirmDelete = value;
						await this.plugin.saveSettings();
					})
			);
	}
}

// --- MAIN EXPLORER VIEW ---
class DynamicExplorerView extends ItemView {
	currentFolder: TFolder | null = null;
	plugin: DynamicExplorerPlugin;

	constructor(leaf: WorkspaceLeaf, plugin: DynamicExplorerPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return DYNAMIC_EXPLORER_VIEW_TYPE;
	}

	getIcon(): string {
		return 'folder-git-2';
	}

	getDisplayText(): string {
		return 'Dynamic explorer';
	}

	async onOpen() {
		this.registerEvent(
			this.app.workspace.on('active-leaf-change', () => {
				this.updateView();
			})
		);

		this.registerEvent(this.app.vault.on('rename', () => this.updateView()));
		this.registerEvent(this.app.vault.on('delete', () => this.updateView()));
		this.registerEvent(this.app.vault.on('create', () => this.updateView()));

		this.updateView();
	}

	async onClose() {}

	updateView() {
		const container = this.containerEl.children[1] as HTMLElement;
		if (!container) return;

		container.empty();
		container.addClass('dynamic-folder-explorer');

		const activeFile = this.app.workspace.getActiveFile();
		if (activeFile && !this.currentFolder) {
			this.currentFolder = activeFile.parent;
		} else if (!this.currentFolder) {
			this.currentFolder = this.app.vault.getRoot();
		}

		if (!this.currentFolder) return;

		// --- HEADER ---
		const headerEl = container.createDiv({ cls: 'dynamic-explorer-header' });

		// 1. "Up" button
		const upBtn = headerEl.createEl('button', { 
			cls: 'clickable-icon',
			attr: { 'aria-label': 'Go up' } 
		});
		setIcon(upBtn, 'arrow-left');
		upBtn.onclick = () => {
			if (this.currentFolder && this.currentFolder.parent) {
				this.currentFolder = this.currentFolder.parent;
				this.updateView();
			}
		};

		// 2. Folder / vault name (center)
		const folderNameText = this.currentFolder.isRoot() 
			? (this.app.vault.getName() || 'Vault root') 
			: this.currentFolder.name;

		const titleSpan = headerEl.createSpan({ 
			cls: 'dynamic-explorer-title', 
			text: folderNameText 
		});

		// 3. "Home" button (pinned right)
		const homeBtn = headerEl.createEl('button', { 
			cls: 'dynamic-explorer-home-btn clickable-icon',
			attr: { 'aria-label': 'Vault root' } 
		});
		setIcon(homeBtn, 'home');
		homeBtn.onclick = () => {
			this.currentFolder = this.app.vault.getRoot();
			this.updateView();
		};

		this.renderFolderContents(container);
	}

	renderFolderContents(container: HTMLElement) {
		const existingList = container.querySelector('.file-list-container');
		if (existingList) existingList.remove();

		const listContainer = container.createDiv({ cls: 'file-list-container' });

		if (!this.currentFolder) return;

		// Right-click in any empty area opens creation context menu
		listContainer.oncontextmenu = (e: MouseEvent) => {
			if (e.target === listContainer || (e.target as HTMLElement).classList.contains('tree-item-children')) {
				e.preventDefault();
				this.showContextMenu(e, null);
			}
		};

		const childrenContainer = listContainer.createDiv({ cls: 'tree-item-children' });

		const sortedChildren = [...this.currentFolder.children].sort((a, b) => {
			const aIsFolder = a instanceof TFolder;
			const bIsFolder = b instanceof TFolder;
			if (aIsFolder && !bIsFolder) return -1;
			if (!aIsFolder && bIsFolder) return 1;
			return a.name.localeCompare(b.name);
		});

		for (const child of sortedChildren) {
			const itemEl = childrenContainer.createDiv({ cls: 'explorer-item' });
			itemEl.setAttr('data-path', child.path);

			const iconSpan = itemEl.createSpan({ cls: 'nav-file-icon' });
			const textSpan = itemEl.createSpan({ cls: 'nav-file-title-content' });

			if (child instanceof TFolder) {
				setIcon(iconSpan, 'folder');
				textSpan.setText(child.name);
				itemEl.onclick = () => {
					this.currentFolder = child;
					this.updateView();
				};
			} else if (child instanceof TFile) {
				setIcon(iconSpan, 'file');
				textSpan.setText(child.basename);
				itemEl.onclick = () => {
					this.app.workspace.openLinkText(child.path, '', false);
				};
			}

			itemEl.oncontextmenu = (e: MouseEvent) => {
				e.preventDefault();
				e.stopPropagation();
				this.showContextMenu(e, child, textSpan);
			};
		}
	}

	showContextMenu(event: MouseEvent, target: TFile | TFolder | TAbstractFile | null, textSpan?: HTMLElement) {
		const menu = new Menu();

		const currentDir = target instanceof TFolder 
			? target 
			: (target instanceof TFile ? target.parent : this.currentFolder) || this.app.vault.getRoot();

		// 1. Create items
		menu.addItem((item: MenuItem) => {
			item.setTitle('New note')
				.setIcon('file-plus')
				.onClick(async () => {
					const basePath = currentDir.path === '/' ? '' : `${currentDir.path}/`;
					let fileName = `${basePath}Untitled.md`;
					let counter = 1;

					while (this.app.vault.getAbstractFileByPath(fileName)) {
						fileName = `${basePath}Untitled ${counter++}.md`;
					}

					if (currentDir instanceof TFolder && this.currentFolder !== currentDir) {
						this.currentFolder = currentDir;
					}

					const newFile = await this.app.vault.create(fileName, '');
					this.updateView();

					setTimeout(() => {
						const createdEl = this.containerEl.querySelector(`[data-path="${newFile.path}"]`);
						const titleSpan = createdEl?.querySelector('.nav-file-title-content') as HTMLElement;
						if (titleSpan) {
							this.inlineRename(titleSpan, newFile);
						}
					}, 50);
				});
		});

		menu.addItem((item: MenuItem) => {
			item.setTitle('New folder')
				.setIcon('folder-plus')
				.onClick(async () => {
					const basePath = currentDir.path === '/' ? '' : `${currentDir.path}/`;
					let folderName = 'New folder';
					let folderPath = `${basePath}${folderName}`;
					let counter = 1;

					while (this.app.vault.getAbstractFileByPath(folderPath)) {
						folderName = `New folder ${counter++}`;
						folderPath = `${basePath}${folderName}`;
					}

					if (currentDir instanceof TFolder && this.currentFolder !== currentDir) {
						this.currentFolder = currentDir;
					}

					const newFolder = await this.app.vault.createFolder(folderPath);
					this.updateView();

					setTimeout(() => {
						const createdEl = this.containerEl.querySelector(`[data-path="${newFolder.path}"]`);
						const titleSpan = createdEl?.querySelector('.nav-file-title-content') as HTMLElement;
						if (titleSpan) {
							this.inlineRename(titleSpan, newFolder);
						}
					}, 50);
				});
		});

		// 2. Rename
		if (target && textSpan) {
			menu.addSeparator();

			menu.addItem((item: MenuItem) => {
				item.setTitle('Rename')
					.setIcon('pencil')
					.onClick(() => {
						this.inlineRename(textSpan, target);
					});
			});
		}

		// 3. Delete
		if (target) {
			menu.addSeparator();

			menu.addItem((item: MenuItem) => {
				item.setTitle('Delete')
					.setIcon('trash')
					.onClick(() => {
						const doDelete = async () => {
							await this.app.vault.trash(target, true);
						};

						if (this.plugin.settings.confirmDelete) {
							new ConfirmDeleteModal(this.app, this.plugin, target, doDelete).open();
						} else {
							doDelete();
						}
					});
			});
		}

		menu.showAtPosition({ x: event.clientX, y: event.clientY });
	}

	inlineRename(textSpan: HTMLElement, target: TAbstractFile) {
		const oldName = target instanceof TFile ? target.basename : target.name;
		
		const inputEl = document.createElement('input');
		inputEl.type = 'text';
		inputEl.value = oldName;
		inputEl.addClass('inline-rename-input');

		textSpan.replaceWith(inputEl);
		inputEl.focus();
		inputEl.select();

		let isSaved = false;

		const saveRename = async () => {
			if (isSaved) return;
			isSaved = true;

			const newName = inputEl.value.trim();

			if (newName && newName !== oldName) {
				const parentPath = target.parent?.path === '/' ? '' : `${target.parent?.path}/`;
				const ext = target instanceof TFile ? (target.extension ? `.${target.extension}` : '') : '';
				const newPath = `${parentPath}${newName}${ext}`;

				try {
					await this.app.fileManager.renameFile(target, newPath);
				} catch (err) {
					console.error('Rename error:', err);
				}
			}

			this.updateView();
		};

		inputEl.onblur = () => saveRename();
		inputEl.onkeydown = (e: KeyboardEvent) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				saveRename();
			} else if (e.key === 'Escape') {
				e.preventDefault();
				isSaved = true;
				this.updateView();
			}
		};
	}
}