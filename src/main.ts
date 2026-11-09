import { Plugin, ItemView, WorkspaceLeaf, TFile, TFolder, TAbstractFile, setIcon, Menu, MenuItem } from 'obsidian';

const DYNAMIC_EXPLORER_VIEW_TYPE = 'dynamic-folder-explorer';

export default class DynamicExplorerPlugin extends Plugin {
	async onload() {
		// 1. Регистрируем кастомный View
		this.registerView(
			DYNAMIC_EXPLORER_VIEW_TYPE,
			(leaf) => new DynamicExplorerView(leaf)
		);

		// 2. Добавляем иконку в левую панель (рибон) для открытия нашего вида
		this.addRibbonIcon('folder-kanban', 'Открыть динамический проводник', () => {
			this.activateView();
		});

		// 3. Добавляем команду для открытия через палитру команд
		this.addCommand({
			id: 'open-dynamic-explorer',
			name: 'Открыть динамический проводник',
			callback: () => {
				this.activateView();
			},
		});
	}

	async onunload() {
		// Очистка при выключении плагина
	}

	async activateView() {
		const { workspace } = this.app;
		let leaf: WorkspaceLeaf | null | undefined = null; // Добавили | undefined
		const leaves = workspace.getLeavesOfType(DYNAMIC_EXPLORER_VIEW_TYPE);

		if (leaves.length > 0) {
			leaf = leaves[0];
		} else {
			leaf = workspace.getLeftLeaf(false);
			await leaf?.setViewState({ type: DYNAMIC_EXPLORER_VIEW_TYPE, active: true });
		}

		if (leaf) {
			workspace.revealLeaf(leaf);
		}
	}
}

class DynamicExplorerView extends ItemView {
	currentFolder: TFolder | null = null;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType(): string {
		return DYNAMIC_EXPLORER_VIEW_TYPE;
	}

	getIcon(): string {
		return 'folder-git-2';
	}

	getDisplayText(): string {
		return 'Динамический проводник';
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

		// --- ШАПКА ---
		const headerEl = container.createDiv({ cls: 'nav-header' });
		headerEl.style.display = 'flex';
		headerEl.style.alignItems = 'center';
		headerEl.style.gap = '8px';
		headerEl.style.padding = '8px';
		headerEl.style.borderBottom = '1px solid var(--background-modifier-border)';

		// 1. Кнопка «Вверх»
		const upBtn = headerEl.createEl('button', { 
			cls: 'clickable-icon',
			attr: { 'aria-label': 'На уровень выше' } 
		});
		setIcon(upBtn, 'arrow-left');
		upBtn.onclick = () => {
			if (this.currentFolder && this.currentFolder.parent) {
				this.currentFolder = this.currentFolder.parent;
				this.updateView();
			}
		};

		// 2. Название папки / хранилища (в центре)
		const folderNameText = this.currentFolder.isRoot() 
			? (this.app.vault.getName() || 'Корень хранилища') 
			: this.currentFolder.name;

		const titleSpan = headerEl.createSpan({ text: folderNameText });
		titleSpan.style.fontWeight = '600';
		titleSpan.style.fontSize = '0.9em';
		titleSpan.style.overflow = 'hidden';
		titleSpan.style.textOverflow = 'ellipsis';
		titleSpan.style.whiteSpace = 'nowrap';
		titleSpan.style.flex = '1';

		// 3. Кнопка «Домой» (прижата вправо)
		const homeBtn = headerEl.createEl('button', { 
			cls: 'clickable-icon',
			attr: { 'aria-label': 'Корень хранилища' } 
		});
		setIcon(homeBtn, 'home');
		homeBtn.style.marginLeft = 'auto';
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
		listContainer.style.padding = '8px';

		if (!this.currentFolder) return;

		listContainer.oncontextmenu = (e: MouseEvent) => {
			e.preventDefault();
			this.showContextMenu(e, null);
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
			const itemEl = childrenContainer.createDiv({ cls: 'tree-item-self' });
			itemEl.style.padding = '4px 8px';
			itemEl.style.cursor = 'pointer';
			itemEl.style.borderRadius = '4px';
			itemEl.style.display = 'flex';
			itemEl.style.alignItems = 'center';
			itemEl.style.gap = '6px';

			// Сохраняем путь в дата-атрибут, чтобы мы могли легко найти этот элемент в DOM
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

			itemEl.onmouseenter = () => itemEl.style.backgroundColor = 'var(--background-modifier-hover)';
			itemEl.onmouseleave = () => itemEl.style.backgroundColor = 'transparent';
		}
	}

	showContextMenu(event: MouseEvent, target: TFile | TFolder | TAbstractFile | null, textSpan?: HTMLElement) {
		const menu = new Menu();

		const currentDir = target instanceof TFolder 
			? target 
			: (target instanceof TFile ? target.parent : this.currentFolder) || this.app.vault.getRoot();

		if (target && textSpan) {
			menu.addItem((item: MenuItem) => {
				item.setTitle('Переименовать')
					.setIcon('pencil')
					.onClick(() => {
						this.inlineRename(textSpan, target);
					});
			});

			menu.addItem((item: MenuItem) => {
				item.setTitle('Удалить')
					.setIcon('trash')
					.onClick(async () => {
						await this.app.vault.trash(target, true);
					});
			});
		}

		menu.addSeparator();

		// Создание новой заметки с автоматическим переименованием
		menu.addItem((item: MenuItem) => {
			item.setTitle('Новая заметка')
				.setIcon('file-plus')
				.onClick(async () => {
					const basePath = currentDir.path === '/' ? '' : `${currentDir.path}/`;
					let fileName = `${basePath}Без названия.md`;
					let counter = 1;

					while (this.app.vault.getAbstractFileByPath(fileName)) {
						fileName = `${basePath}Без названия ${counter++}.md`;
					}

					// 1. Если создаем внутри другой папки, спускаемся в неё, чтобы сразу увидеть созданный файл
					if (currentDir instanceof TFolder && this.currentFolder !== currentDir) {
						this.currentFolder = currentDir;
					}

					const newFile = await this.app.vault.create(fileName, '');
					
					// Обновляем вид, чтобы элемент отрисовался в DOM
					this.updateView();

					// Находим созданный элемент в DOM и запускаем для него инлайн-редактирование
					setTimeout(() => {
						const createdEl = this.containerEl.querySelector(`[data-path="${newFile.path}"]`);
						const titleSpan = createdEl?.querySelector('.nav-file-title-content') as HTMLElement;
						if (titleSpan) {
							this.inlineRename(titleSpan, newFile);
						}
					}, 50);
				});
		});

		// Создание новой папки с автоматическим переименованием
		menu.addItem((item: MenuItem) => {
			item.setTitle('Новая папка')
				.setIcon('folder-plus')
				.onClick(async () => {
					const basePath = currentDir.path === '/' ? '' : `${currentDir.path}/`;
					let folderName = 'Новая папка';
					let folderPath = `${basePath}${folderName}`;
					let counter = 1;

					while (this.app.vault.getAbstractFileByPath(folderPath)) {
						folderName = `Новая папка ${counter++}`;
						folderPath = `${basePath}${folderName}`;
					}

					if (currentDir instanceof TFolder && this.currentFolder !== currentDir) {
						this.currentFolder = currentDir;
					}

					const newFolder = await this.app.vault.createFolder(folderPath);
					
					// Обновляем вид
					this.updateView();

					// Запускаем инлайн-редактирование для новой папки
					setTimeout(() => {
						const createdEl = this.containerEl.querySelector(`[data-path="${newFolder.path}"]`);
						const titleSpan = createdEl?.querySelector('.nav-file-title-content') as HTMLElement;
						if (titleSpan) {
							this.inlineRename(titleSpan, newFolder);
						}
					}, 50);
				});
		});

		menu.showAtPosition({ x: event.clientX, y: event.clientY });
	}

	// Метод inline-переименования
	inlineRename(textSpan: HTMLElement, target: TAbstractFile) {
		const oldName = target instanceof TFile ? target.basename : target.name;
		
		const inputEl = document.createElement('input');
		inputEl.type = 'text';
		inputEl.value = oldName;
		inputEl.style.width = '100%';
		inputEl.style.fontSize = 'inherit';
		inputEl.style.fontFamily = 'inherit';
		inputEl.style.border = '1px solid var(--interactive-accent)';
		inputEl.style.borderRadius = '3px';
		inputEl.style.background = 'var(--background-primary)';
		inputEl.style.color = 'var(--text-normal)';
		inputEl.style.padding = '0 4px';

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
					console.error('Ошибка переименования:', err);
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