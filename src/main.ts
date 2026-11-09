import { Plugin, ItemView, WorkspaceLeaf, TFile, TFolder, setIcon, } from 'obsidian';

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
        return 'folder-git-2'; // Здесь можно указать любую иконку из Lucide (например, 'folder', 'Compass', 'layers' и т.д.)
    }

	getDisplayText(): string {
		return 'Динамический проводник';
	}

	async onOpen() {
		// Перерисовываем вид при изменении активного файла
		this.registerEvent(
			this.app.workspace.on('active-leaf-change', () => {
				this.updateView();
			})
		);

		// Перерисовываем, если файлы создаются, удаляются или переименовываются
		this.registerEvent(
			this.app.vault.on('rename', () => this.updateView())
		);
		this.registerEvent(
			this.app.vault.on('delete', () => this.updateView())
		);
		this.registerEvent(
			this.app.vault.on('create', () => this.updateView())
		);

		this.updateView();
	}

	async onClose() {
		// Очистка
	}

	updateView() {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass('dynamic-folder-explorer');

		// Шапка с кнопками управления («Вверх» и «Домой»)
		const headerEl = container.createDiv({ cls: 'nav-header' });
		headerEl.style.display = 'flex';
		headerEl.style.gap = '8px';
		headerEl.style.padding = '8px';
		headerEl.style.borderBottom = '1px solid var(--background-modifier-border)';

		// Кнопка «Вверх» (на уровень выше)
		const upBtn = headerEl.createEl('button', { 
			cls: 'clickable-icon',
			attr: { 'aria-label': 'На уровень выше' } 
		});

		setIcon(upBtn, 'arrow-left');

		upBtn.onclick = () => {
			if (this.currentFolder && this.currentFolder.parent) {
				this.currentFolder = this.currentFolder.parent;
				this.renderFolderContents(container);
			}
		};

		// Кнопка «Домой» (в корень хранилища)
		const homeBtn = headerEl.createEl('button', { 
			cls: 'clickable-icon',
			attr: { 'aria-label': 'Домой' } // Подсказка появится при наведении мыши
		});

		setIcon(homeBtn, 'home');

		homeBtn.onclick = () => {
			this.currentFolder = this.app.vault.getRoot();
			this.renderFolderContents(container);
		};

		// Определяем текущую папку на основе активного файла, если она не задана вручную
		const activeFile = this.app.workspace.getActiveFile();
		if (activeFile) {
			this.currentFolder = activeFile.parent;
		} else if (!this.currentFolder) {
			this.currentFolder = this.app.vault.getRoot();
		}

		this.renderFolderContents(container);
	}

	renderFolderContents(container: HTMLElement) {
		// Удаляем старый список файлов, если он есть, оставляя шапку
		const existingList = container.querySelector('.file-list-container');
		if (existingList) existingList.remove();

		const listContainer = container.createDiv({ cls: 'file-list-container' });
		listContainer.style.padding = '8px';

		if (!this.currentFolder) return;

		// Заголовок текущей папки
		const titleEl = listContainer.createDiv({ cls: 'folder-title' });
		titleEl.style.fontWeight = 'bold';
		titleEl.style.marginBottom = '8px';
		titleEl.setText(`📁 ${this.currentFolder.name || 'Корень хранилища'}`);

		// Рендерим содержимое (подпапки и файлы)
		const childrenContainer = listContainer.createDiv({ cls: 'tree-item-children' });

		// Сначала папки, потом файлы
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

			if (child instanceof TFolder) {
				itemEl.setText(`📁 ${child.name}`);
				itemEl.onclick = () => {
					this.currentFolder = child;
					this.renderFolderContents(container);
				};
			} else if (child instanceof TFile) {
				itemEl.setText(`📄 ${child.basename}`);
				itemEl.onclick = () => {
					this.app.workspace.openLinkText(child.path, '', false);
				};
			}

			itemEl.onmouseenter = () => itemEl.style.backgroundColor = 'var(--background-modifier-hover)';
			itemEl.onmouseleave = () => itemEl.style.backgroundColor = 'transparent';
		}
	}
}