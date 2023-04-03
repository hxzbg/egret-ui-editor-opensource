import { app, Menu, MenuItem, BrowserWindow } from 'electron';
import { isMacintosh, isWindows } from '../../base/common/platform';
import { IWindowsMainService } from '../../platform/windows/common/windows';
import { ILifecycleService } from '../../platform/lifecycle/electron-main/lifecycleMain';
import { IOperationMainService } from '../../platform/operations/common/operations-main';
import { RootCommands } from '../../workbench/electron-browser/commands/rootCommands';
import { FileRootCommands } from '../../workbench/parts/files/commands/fileRootCommands';
import { SystemCommands } from '../../platform/operations/commands/systemCommands';
import { localize } from '../../base/localization/nls';
import { APPLICATION_NAME } from 'egret/consts/consts';


interface IMenuItemClickHandler {
	inDevTools: (contents: Electron.WebContents) => void;
	inNoWindow: () => void;
}

function mnemonicMenuLabel(label: string): string {
	if (isMacintosh) {
		return label.replace(/\(&&\w\)|&&/g, '');
	}
	return label.replace(/&&/g, '&');
}


export abstract class MenuBase {

	constructor(
		@IWindowsMainService protected windowsMainService: IWindowsMainService,
		@ILifecycleService protected lifecycleService: ILifecycleService,
		@IOperationMainService protected operationService: IOperationMainService
	) {
		this.install();
		this.operationService.onKeybindingUpdate(() => this.keybingdingUpdate_handler());
	}

	private updateKeybindingFlag = false;
	private keybingdingUpdate_handler(): void {
		if (this.updateKeybindingFlag) {
			return;
		}
		this.updateKeybindingFlag = true;
		setTimeout(() => {
			this.updateKeybindingFlag = false;
			this.doUpdateKeybinding();
		}, 200);
	}

	private doUpdateKeybinding(): void {
		//快捷键改变了以后重新安装
		this.install();
	}

	protected abstract install(): void;

	protected toggleDevTools(): void {
		const w = this.windowsMainService.getFocusedWindow();
		if (w && w.win) {
			const contents = w.win.webContents;
			if (isMacintosh && !w.win.isFullScreen() && !contents.isDevToolsOpened()) {
				contents.openDevTools({ mode: 'undocked' }); // due to https://github.com/electron/electron/issues/3647
			} else {
				contents.toggleDevTools();
			}
		}
	}

	protected createMenuItem(label: string, key: string, command: string, name: string, description: string, clickHandler: IMenuItemClickHandler = null): Electron.MenuItem {
		//TODO 需要先将enable设置为false，等渲染继承加载完成之后再设置为true
		const options: Electron.MenuItemConstructorOptions = {
			label,
			accelerator: this.operationService.getKeybinding(command, key, name, description),
			click: () => {
				if (clickHandler) {
					const activeWindow = this.windowsMainService.getFocusedWindow();
					if (!activeWindow) {
						return clickHandler.inNoWindow();
					}
					if (activeWindow.win.webContents.isDevToolsFocused()) {
						return clickHandler.inDevTools(activeWindow.win.webContents.devToolsWebContents);
					}
				}
				this.runActionInRenderer(command);
			},
			enabled: true
		};
		return new MenuItem(options);
	}

	protected createRoleMenuItem(label: string, role: any): Electron.MenuItem {
		//TODO 需要先将enable设置为false，等渲染继承加载完成之后再设置为true
		const options: Electron.MenuItemConstructorOptions = {
			label: label,
			role,
			enabled: true
		};
		return new MenuItem(options);
	}

	/**
	 * 在渲染进程中执行命令
	 */
	private runActionInRenderer(command: string): void {
		if (command == FileRootCommands.RELOAD) {
			this.windowsMainService.reload();
			return;
		}
		this.operationService.executeOperation(command);
	}
}

/**
 * 系统菜单
 */
export class AppMenu extends MenuBase {

	constructor(
		@IWindowsMainService windowsMainService: IWindowsMainService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IOperationMainService operationService: IOperationMainService
	) {
		super(windowsMainService, lifecycleService, operationService);
	}

	protected install(): void {
		// Menus
		const menubar = new Menu();

		// Mac: 应用程序菜单
		let macApplicationMenuItem: Electron.MenuItem;
		if (isMacintosh) {
			const applicationMenu = new Menu();
			macApplicationMenuItem = new MenuItem({ label: APPLICATION_NAME, submenu: applicationMenu });
			this.setMacApplicationMenu(applicationMenu);
		}

		// 文件菜单
		const fileMenu = new Menu();
		const fileMenuItem = new MenuItem({ label: mnemonicMenuLabel(localize('menus.install.fileMenu', 'File(&&F)')), submenu: fileMenu });
		this.setFileMenu(fileMenu);

		// 编辑菜单
		const editMenu = new Menu();
		const editMenuItem = new MenuItem({ label: mnemonicMenuLabel(localize('menus.install.editMenu', 'Edit(&&E)')), submenu: editMenu });
		this.setEditMenu(editMenu);

		// 查看菜单
		const viewMenu = new Menu();
		const viewMenuItem = new MenuItem({ label: mnemonicMenuLabel(localize('menus.install.viewMenu', 'View(&&V)')), submenu: viewMenu });
		this.setViewMenu(viewMenu);

		// 窗口
		const windowMenu = new Menu();
		const windowMenuItem = new MenuItem({ label: mnemonicMenuLabel(localize('menus.install.windowMenu', 'Window(&&W)')), role: 'windowMenu', submenu: windowMenu });
		this.setWindowsMenu(windowMenu);

		// 帮助菜单
		const helpMenu = new Menu();
		const helpMenuItem = new MenuItem({ label: mnemonicMenuLabel(localize('menus.install.help', 'Help(&&H)')), submenu: helpMenu, role: 'help' });
		this.setHelpMenu(helpMenu);

		// Mac: 应用程序菜单
		if (macApplicationMenuItem) {
			menubar.append(macApplicationMenuItem);
		}
		menubar.append(fileMenuItem);
		menubar.append(editMenuItem);
		menubar.append(viewMenuItem);
		menubar.append(windowMenuItem);
		menubar.append(helpMenuItem);

		Menu.setApplicationMenu(menubar);
		this.setUserTasks();
		this.setDockMenu();
	}

	/**
	 * Mac 应用程序菜单
	 */
	private setMacApplicationMenu(macApplicationMenu: Electron.Menu): void {
		const about = this.createMenuItem(localize('system.about', 'About {0}', APPLICATION_NAME), '', RootCommands.PROMPT_ABOUT, '', '');
		const checkUpdate = this.createMenuItem(localize('system.checkUpdate', 'Check Update...'), '', RootCommands.CHECK_UPDATE, '', '');
		const preferences = this.getPreferencesMenu();
		const servicesMenu = new Menu();
		const services = new MenuItem({ label: localize('menus.setMacApplicationMenu.services', 'Services'), role: 'services', submenu: servicesMenu });

		const hide = new MenuItem({ label: localize('menus.setMacApplicationMenu.hide', 'Hide {0}', APPLICATION_NAME), role: 'hide', accelerator: 'Command+H' });
		const hideOthers = new MenuItem({ label: localize('menus.setMacApplicationMenu.hideothers', 'Hide Other'), role: 'hideOthers', accelerator: 'Command+Alt+H' });
		const showAll = new MenuItem({ label: localize('menus.setMacApplicationMenu.unhide', 'Show All'), role: 'unhide' });
		const quit = new MenuItem({
			label: localize('menus.setMacApplicationMenu.quit', 'Quit {0}', APPLICATION_NAME), accelerator: 'CmdOrCtrl+Q',
			click: () => this.lifecycleService.quit()
		});
		const memus = [about];
		memus.push(
			checkUpdate,
			__separator__(),
			preferences,
			__separator__(),
			services,
			__separator__(),
			hide,
			hideOthers,
			showAll,
			__separator__(),
			quit);
		memus.forEach(item => macApplicationMenu.append(item));
	}

	/**
	 * 文件菜单
	 */
	private setFileMenu(fileMenu: Electron.Menu): void {
		const open = this.createMenuItem(mnemonicMenuLabel(localize('menus.setFileMenu.openFolder', 'Open Egret Project(&&P)')), 'CmdOrCtrl+O', RootCommands.OPEN_FOLDER, localize('menus.setFileMenu.openFolderTxt', 'Open Egret Project'), localize('menus.setFileMenu.openFolderOpt', 'Open egret project operation'));
		const newWindow = new MenuItem({ label: mnemonicMenuLabel(localize('menus.setFileMenu.openNewWindow', 'New Window')), click: () => this.windowsMainService.openNewWindow() });
		const createFolder = this.createMenuItem(mnemonicMenuLabel(localize('menus.setFileMenu.newFolder', 'Create Folder(&&F)')), 'Shift+CmdOrCtrl+N', FileRootCommands.NEW_FOLDER, localize('menus.setFileMenu.newFolderTxt', 'Create Folder'), localize('menus.setFileMenu.newFolderOpt', 'Create a folder in the currently selected directory'));
		const createExml = this.createMenuItem(mnemonicMenuLabel(localize('menus.setFileMenu.newExml', 'Create EXML Skin(&&N)')), 'CmdOrCtrl+N', FileRootCommands.NEW_EXML_FILE, localize('menus.setFileMenu.newExmlTxt', 'Create EXML Skin'), localize('menus.setFileMenu.newExmlOpt', 'Create a new Exml skin in the currently selected directory'));

		const export_fgui = this.createMenuItem(mnemonicMenuLabel(localize('menus.setFileMenu.export_fgui', 'Export To FGUI')), '', FileRootCommands.EXPORT_FGUI, null, null);
		const export_fgui_batch = this.createMenuItem(mnemonicMenuLabel(localize('menus.setFileMenu.export_fgui_all', 'Export To FGUI Batch')), '', FileRootCommands.EXPORT_FGUI_BATCH, null, null);

		const save = this.createMenuItem(mnemonicMenuLabel(localize('menus.setFileMenu.save', 'Save(&&S)')), 'CmdOrCtrl+S', FileRootCommands.SAVE_ACTIVE, localize('menus.setFileMenu.saveTxt', 'Save'), localize('menus.setFileMenu.saveOpt', 'Save the current editor'));
		const saveAll = this.createMenuItem(mnemonicMenuLabel(localize('menus.setFileMenu.allSave', 'Save All(&&L)')), 'Alt+CmdOrCtrl+S', FileRootCommands.SAVE_ALL, localize('menus.setFileMenu.allSaveTxt', 'Save All'), localize('menus.setFileMenu.allSaveOpt', 'Save all open editors'));

		const closeCurrent = this.createMenuItem(mnemonicMenuLabel(localize('menus.setFileMenu.closeEditor', 'Close Editor(&&C)')), 'CmdOrCtrl+W', RootCommands.CLOSE_CURRENT, localize('menus.setFileMenu.closeEditorTxt', 'Close Editor'), localize('menus.setFileMenu.closeEditorOpt', 'Close the current editor'));

		const reload = this.createMenuItem(mnemonicMenuLabel(localize('menus.setFileMenu.reload', 'Reload(&&R)')), '', FileRootCommands.RELOAD, null, null);
		const memus = [open, newWindow, __separator__(), createFolder, createExml, __separator__(), export_fgui, export_fgui_batch, __separator__(), save, saveAll, __separator__(), closeCurrent, __separator__(), reload];

		if (isMacintosh) {
			const installShellCommand = this.createMenuItem(mnemonicMenuLabel(localize('menus.setFileMenu.installShellCommand', 'Install shell command')), '', FileRootCommands.INSTALL_SHELL_COMMAND, null, null);
			memus.push(__separator__(), installShellCommand);
		}
		if (isWindows) {
			const preferences = this.getPreferencesMenu();
			memus.push(__separator__(), preferences);

			const exit = new MenuItem({ label: mnemonicMenuLabel(localize('menus.setFileMenu.quit', 'Quit(&&X)')), accelerator: 'CmdOrCtrl+Q', click: () => this.lifecycleService.quit() });
			memus.push(__separator__(), exit);
		}


		memus.forEach(item => fileMenu.append(item));
	}
	/**
	 * 首选项菜单
	 */
	private getPreferencesMenu(): Electron.MenuItem {
		const menus = new Menu();
		const keybingding = this.createMenuItem(mnemonicMenuLabel(localize('menus.getPreferencesMenu.shortcut', 'Shortcut key settings(&&K)')), '', RootCommands.KEYBINDING_SETTING, '', '');
		menus.append(keybingding);
		menus.append(__separator__());

		const wingProperty = this.createMenuItem(mnemonicMenuLabel(localize('menus.getPreferencesMenu.euiConfigure', 'EUI Project Setting(&&P)')), '', RootCommands.WING_PROPERTY, '', '');
		menus.append(wingProperty);
		return new MenuItem({ label: mnemonicMenuLabel(localize('menus.getPreferencesMenu.preference', 'Preference(&&P)')), submenu: menus });
	}
	/**
	 * 编辑菜单
	 */
	private setEditMenu(winLinuxEditMenu: Electron.Menu): void {
		let undo: Electron.MenuItem;
		let redo: Electron.MenuItem;
		let cut: Electron.MenuItem;
		let copy: Electron.MenuItem;
		let paste: Electron.MenuItem;
		let selectAll: Electron.MenuItem;
		if (isMacintosh) {
			undo = this.createMenuItem(mnemonicMenuLabel(localize('menus.setEditMenu.undo', 'Undo(&&U)')), 'CmdOrCtrl+Z', SystemCommands.UNDO, localize('menus.setEditMenu.undoTxt', 'Undo'), localize('menus.setEditMenu.undoOpt', 'Undo operation'), {
				inDevTools: devTools => devTools.undo(),
				inNoWindow: () => Menu.sendActionToFirstResponder('undo:')
			});
			redo = this.createMenuItem(mnemonicMenuLabel(localize('menus.setEditMenu.redo', 'Redo(&&R)')), 'Shift+CmdOrCtrl+Z', SystemCommands.REDO, localize('menus.setEditMenu.redoTxt', 'Redo'), localize('menus.setEditMenu.redoOpt', 'Redo operation'), {
				inDevTools: devTools => devTools.redo(),
				inNoWindow: () => Menu.sendActionToFirstResponder('redo:')
			});
			cut = this.createMenuItem(mnemonicMenuLabel(localize('menus.setEditMenu.cut', 'Cut(&&T)')), 'CmdOrCtrl+X', SystemCommands.CUT, localize('menus.setEditMenu.cutTxt', 'Cut'), localize('menus.setEditMenu.cutOpt', 'Cut operation'), {
				inDevTools: devTools => devTools.cut(),
				inNoWindow: () => Menu.sendActionToFirstResponder('cut:')
			});
			copy = this.createMenuItem(mnemonicMenuLabel(localize('menus.setEditMenu.copy', 'Copy(&&C)')), 'CmdOrCtrl+C', SystemCommands.COPY, localize('menus.setEditMenu.copyTxt', 'Copy'), localize('menus.setEditMenu.copyOpt', 'Copy operation'), {
				inDevTools: devTools => devTools.copy(),
				inNoWindow: () => Menu.sendActionToFirstResponder('copy:')
			});
			paste = this.createMenuItem(mnemonicMenuLabel(localize('menus.setEditMenu.paste', 'Paste(&&P)')), 'CmdOrCtrl+V', SystemCommands.PASTE, localize('menus.setEditMenu.pasteTxt', 'Paste'), localize('menus.setEditMenu.pasteOpt', 'Paste operation'), {
				inDevTools: devTools => devTools.paste(),
				inNoWindow: () => Menu.sendActionToFirstResponder('paste:')
			});
			selectAll = this.createMenuItem(mnemonicMenuLabel(localize('menus.setEditMenu.allSelect', 'Select All(&&A)')), 'CmdOrCtrl+A', SystemCommands.SELECT_ALL, localize('menus.setEditMenu.allSelectTxt', 'Select All'), localize('menus.setEditMenu.allSelectOpt', 'Select all operation'), {
				inDevTools: devTools => devTools.selectAll(),
				inNoWindow: () => Menu.sendActionToFirstResponder('selectAll:')
			});
		} else {
			undo = this.createMenuItem(mnemonicMenuLabel(localize('menus.setEditMenu.undo', 'Undo(&&U)')), 'CmdOrCtrl+Z', SystemCommands.UNDO, localize('menus.setEditMenu.undoTxt', 'Undo'), localize('menus.setEditMenu.undoOpt', 'Undo operation'));
			redo = this.createMenuItem(mnemonicMenuLabel(localize('menus.setEditMenu.redo', 'Redo(&&R)')), 'CmdOrCtrl+Y', SystemCommands.REDO, localize('menus.setEditMenu.redoTxt', 'Redo'), localize('menus.setEditMenu.redoOpt', 'Redo operation'));
			cut = this.createMenuItem(mnemonicMenuLabel(localize('menus.setEditMenu.cut', 'Cut(&&T)')), 'CmdOrCtrl+X', SystemCommands.CUT, localize('menus.setEditMenu.cutTxt', 'Cut'), localize('menus.setEditMenu.cutOpt', 'Cut operation'));
			copy = this.createMenuItem(mnemonicMenuLabel(localize('menus.setEditMenu.copy', 'Copy(&&C)')), 'CmdOrCtrl+C', SystemCommands.COPY, localize('menus.setEditMenu.copyTxt', 'Copy'), localize('menus.setEditMenu.copyOpt', 'Copy operation'));
			paste = this.createMenuItem(mnemonicMenuLabel(localize('menus.setEditMenu.paste', 'Paste(&&P)')), 'CmdOrCtrl+V', SystemCommands.PASTE, localize('menus.setEditMenu.pasteTxt', 'Paste'), localize('menus.setEditMenu.pasteOpt', 'Paste operation'));
			selectAll = this.createMenuItem(mnemonicMenuLabel(localize('menus.setEditMenu.allSelect', 'Select All(&&A)')), 'CmdOrCtrl+A', SystemCommands.SELECT_ALL, localize('menus.setEditMenu.allSelectTxt', 'Select All'), localize('menus.setEditMenu.allSelectOpt', 'Select all operation'));
		}

		const memus = [
			undo,
			redo,
			__separator__(),
			cut,
			copy,
			paste,
			__separator__(),
			selectAll
		];
		memus.forEach(item => winLinuxEditMenu.append(item));
	}

	/**
	 * 查看菜单
	 */
	private setViewMenu(viewMenu: Electron.Menu): void {
		const explorer = this.createMenuItem(mnemonicMenuLabel(localize('menus.viewMenu.explorer', 'Explorer(&&U)')), '', RootCommands.EXPLORER_PANEL, '', '');
		const layer = this.createMenuItem(mnemonicMenuLabel(localize('menus.viewMenu.layer', 'Layer(&&L)')), '', RootCommands.LAYER_PANEL, '', '');
		const output = this.createMenuItem(mnemonicMenuLabel(localize('menus.viewMenu.output', 'Output(&&O)')), '', RootCommands.OUTPUT_PANEL, '', '');
		const assets = this.createMenuItem(mnemonicMenuLabel(localize('menus.viewMenu.resource', 'Resource(&&R)')), '', RootCommands.ASSETS_PANEL, '', '');
		const component = this.createMenuItem(mnemonicMenuLabel(localize('menus.viewMenu.component', 'Component(&&C)')), '', RootCommands.COMPONENT_PANEL, '', '');
		const alignment = this.createMenuItem(mnemonicMenuLabel(localize('menus.viewMenu.align', 'Align(&&A)')), '', RootCommands.ALIGNMENT_PANEL, '', '');
		const property = this.createMenuItem(mnemonicMenuLabel(localize('menus.viewMenu.property', 'Property(&&P)')), '', RootCommands.PROPERTY_PANEL, '', '');

		const quickOpen = this.createMenuItem(mnemonicMenuLabel(localize('menus.viewMenu.quickOpen', 'Quick Open(&&Q)')), 'CmdOrCtrl+P', RootCommands.PROMPT_QUICK_OPEN, localize('menus.viewMenu.quickOpenLabel', 'Quick Open'), localize('menus.viewMenu.quickOpenDes', 'Quick Open EXML file operation'));


		const memus = [explorer, layer, output, assets, component, alignment, property, __separator__(), quickOpen];
		memus.forEach(item => viewMenu.append(item));
	}


	/**
	 * 窗口菜单
	 */
	private setWindowsMenu(windowMenu: Electron.Menu): void {
		const minimize = this.createRoleMenuItem(mnemonicMenuLabel(localize('menus.setWindowsMenu.minimize', 'Minimize(&&M)')), 'minimize');
		const togglefullscreen = this.createRoleMenuItem(mnemonicMenuLabel(localize('menus.setWindowsMenu.togglefullscreen', 'Toggle Full Screen')), 'togglefullscreen');
		const menus = [minimize, togglefullscreen];
		menus.forEach(item => windowMenu.append(item));
	}

	/**
	 * 帮助菜单
	 */
	private setHelpMenu(helpMenu: Electron.Menu): void {
		const toggleDevToolsItem = new MenuItem({
			label: mnemonicMenuLabel(localize('menus.setHelpMenu.toggleDev', 'Toggle Dev(&&T)')),
			click: () => this.toggleDevTools(),
			enabled: true
		});
		const about = this.createMenuItem(localize('system.about', 'About {0}', APPLICATION_NAME), '', RootCommands.PROMPT_ABOUT, '', '');
		const checkUpdate = this.createMenuItem(localize('system.checkUpdate', 'Check Update...'), '', RootCommands.CHECK_UPDATE, '', '');
		// const feedback = this.createMenuItem(localize('system.feedback', 'Send Feedback...'), '', RootCommands.FEEDBACK, '', '');
		const report = this.createMenuItem(localize('system.report', 'Report Issue'), '', RootCommands.REPORT, '', '');
		const menus = [toggleDevToolsItem, report/*, feedback*/];
		if (isWindows) {
			menus.push(about, checkUpdate);
		}
		menus.forEach(item => helpMenu.append(item));
	}

	/**
	 * Windows 任务栏菜单
	 */
	private setUserTasks(): void {
		if (isWindows) {
			app.setUserTasks([
				{
					program: process.execPath,
					arguments: '--new-window',
					iconPath: process.execPath,
					iconIndex: 0,
					title: localize('menus.setFileMenu.openNewWindow', 'New Window'),
					description: localize('menus.setFileMenu.openNewWindowOpt', 'Opens a new window')
				}
			]);
		}
	}

	/**
	 * macOS Dock菜单
	 */
	private setDockMenu(): void {
		if (isMacintosh) {
			const dockMenu = Menu.buildFromTemplate([
				{
					label: localize('menus.setFileMenu.openNewWindow', 'New Window'),
					click: () => {
						this.windowsMainService.openNewWindow();
					}
				}
			]);

			app.dock.setMenu(dockMenu);
		}
	}
}


export class ResMenu extends MenuBase {

	constructor(
		private window: BrowserWindow,
		@IWindowsMainService windowsMainService: IWindowsMainService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IOperationMainService operationService: IOperationMainService
	) {
		super(windowsMainService, lifecycleService, operationService);
		this.installMe();
	}

	protected install(): void {
	}
	protected installMe(): void {
		// Menus
		const menubar = new Menu();

		// Mac: 应用程序菜单
		let macApplicationMenuItem: Electron.MenuItem;
		if (isMacintosh) {
			const applicationMenu = new Menu();
			macApplicationMenuItem = new MenuItem({ label: APPLICATION_NAME, submenu: applicationMenu });
			this.setMacApplicationMenu(applicationMenu);
		}

		// 文件菜单
		const fileMenu = new Menu();
		const fileMenuItem = new MenuItem({ label: mnemonicMenuLabel(localize('menus.install.fileMenu', 'File(&&F)')), submenu: fileMenu });
		this.setFileMenu(fileMenu);

		// 编辑菜单
		const editMenu = new Menu();
		const editMenuItem = new MenuItem({ label: mnemonicMenuLabel(localize('menus.install.editMenu', 'Edit(&&E)')), submenu: editMenu });
		this.setEditMenu(editMenu);

		// 窗口
		const windowMenu = new Menu();
		const windowMenuItem = new MenuItem({ label: mnemonicMenuLabel(localize('menus.install.windowMenu', 'Window(&&W)')), role: 'windowMenu', submenu: windowMenu });
		this.setWindowsMenu(windowMenu);

		// 帮助菜单
		const helpMenu = new Menu();
		const helpMenuItem = new MenuItem({ label: mnemonicMenuLabel(localize('menus.install.help', 'Help(&&H)')), submenu: helpMenu, role: 'help' });
		this.setHelpMenu(helpMenu);

		// Mac: 应用程序菜单
		if (macApplicationMenuItem) {
			menubar.append(macApplicationMenuItem);
		}
		menubar.append(fileMenuItem);
		menubar.append(editMenuItem);
		menubar.append(windowMenuItem);
		menubar.append(helpMenuItem);

		this.window.setMenu(menubar);
	}

	/**
	 * Mac 应用程序菜单
	 */
	private setMacApplicationMenu(macApplicationMenu: Electron.Menu): void {
		const servicesMenu = new Menu();
		const services = new MenuItem({ label: localize('menus.setMacApplicationMenu.services', 'Services'), role: 'services', submenu: servicesMenu });

		const hide = new MenuItem({ label: localize('menus.setMacApplicationMenu.hide', 'Hide {0}', APPLICATION_NAME), role: 'hide', accelerator: 'Command+H' });
		const hideOthers = new MenuItem({ label: localize('menus.setMacApplicationMenu.hideothers', 'Hide Other'), role: 'hideOthers', accelerator: 'Command+Alt+H' });
		const showAll = new MenuItem({ label: localize('menus.setMacApplicationMenu.unhide', 'Show All'), role: 'unhide' });
		const quit = new MenuItem({
			label: localize('menus.setMacApplicationMenu.quit', 'Quit {0}', APPLICATION_NAME), accelerator: 'CmdOrCtrl+Q',
			click: () => this.lifecycleService.quit()
		});
		const memus = [];
		memus.push(
			services,
			__separator__(),
			hide,
			hideOthers,
			showAll,
			__separator__(),
			quit);
		memus.forEach(item => macApplicationMenu.append(item));
	}

	/**
	 * 文件菜单
	 */
	private setFileMenu(fileMenu: Electron.Menu): void {
		const save = this.createMenuItem(mnemonicMenuLabel(localize('menus.setFileMenu.save', 'Save(&&S)')), 'CmdOrCtrl+S', FileRootCommands.SAVE_ACTIVE, localize('menus.setFileMenu.saveTxt', 'Save'), localize('menus.setFileMenu.saveOpt', 'Save the current editor'));
		const saveAll = this.createMenuItem(mnemonicMenuLabel(localize('menus.setFileMenu.allSave', 'Save All(&&L)')), 'Alt+CmdOrCtrl+S', FileRootCommands.SAVE_ALL, localize('menus.setFileMenu.allSaveTxt', 'Save All'), localize('menus.setFileMenu.allSaveOpt', 'Save all open editors'));

		const memus = [save, saveAll];

		memus.forEach(item => fileMenu.append(item));
	}
	/**
	 * 编辑菜单
	 */
	private setEditMenu(winLinuxEditMenu: Electron.Menu): void {
		let undo: Electron.MenuItem;
		let redo: Electron.MenuItem;
		let cut: Electron.MenuItem;
		let copy: Electron.MenuItem;
		let paste: Electron.MenuItem;
		let selectAll: Electron.MenuItem;
		if (isMacintosh) {
			undo = this.createMenuItem(mnemonicMenuLabel(localize('menus.setEditMenu.undo', 'Undo(&&U)')), 'CmdOrCtrl+Z', SystemCommands.UNDO, localize('menus.setEditMenu.undoTxt', 'Undo'), localize('menus.setEditMenu.undoOpt', 'Undo operation'), {
				inDevTools: devTools => devTools.undo(),
				inNoWindow: () => Menu.sendActionToFirstResponder('undo:')
			});
			redo = this.createMenuItem(mnemonicMenuLabel(localize('menus.setEditMenu.redo', 'Redo(&&R)')), 'Shift+CmdOrCtrl+Z', SystemCommands.REDO, localize('menus.setEditMenu.redoTxt', 'Redo'), localize('menus.setEditMenu.redoOpt', 'Redo operation'), {
				inDevTools: devTools => devTools.redo(),
				inNoWindow: () => Menu.sendActionToFirstResponder('redo:')
			});
			cut = this.createMenuItem(mnemonicMenuLabel(localize('menus.setEditMenu.cut', 'Cut(&&T)')), 'CmdOrCtrl+X', SystemCommands.CUT, localize('menus.setEditMenu.cutTxt', 'Cut'), localize('menus.setEditMenu.cutOpt', 'Cut operation'), {
				inDevTools: devTools => devTools.cut(),
				inNoWindow: () => Menu.sendActionToFirstResponder('cut:')
			});
			copy = this.createMenuItem(mnemonicMenuLabel(localize('menus.setEditMenu.copy', 'Copy(&&C)')), 'CmdOrCtrl+C', SystemCommands.COPY, localize('menus.setEditMenu.copyTxt', 'Copy'), localize('menus.setEditMenu.copyOpt', 'Copy operation'), {
				inDevTools: devTools => devTools.copy(),
				inNoWindow: () => Menu.sendActionToFirstResponder('copy:')
			});
			paste = this.createMenuItem(mnemonicMenuLabel(localize('menus.setEditMenu.paste', 'Paste(&&P)')), 'CmdOrCtrl+V', SystemCommands.PASTE, localize('menus.setEditMenu.pasteTxt', 'Paste'), localize('menus.setEditMenu.pasteOpt', 'Paste operation'), {
				inDevTools: devTools => devTools.paste(),
				inNoWindow: () => Menu.sendActionToFirstResponder('paste:')
			});
			selectAll = this.createMenuItem(mnemonicMenuLabel(localize('menus.setEditMenu.allSelect', 'Select All(&&A)')), 'CmdOrCtrl+A', SystemCommands.SELECT_ALL, localize('menus.setEditMenu.allSelectTxt', 'Select All'), localize('menus.setEditMenu.allSelectOpt', 'Select all operation'), {
				inDevTools: devTools => devTools.selectAll(),
				inNoWindow: () => Menu.sendActionToFirstResponder('selectAll:')
			});
		} else {
			undo = this.createMenuItem(mnemonicMenuLabel(localize('menus.setEditMenu.undo', 'Undo(&&U)')), 'CmdOrCtrl+Z', SystemCommands.UNDO, localize('menus.setEditMenu.undoTxt', 'Undo'), localize('menus.setEditMenu.undoOpt', 'Undo operation'));
			redo = this.createMenuItem(mnemonicMenuLabel(localize('menus.setEditMenu.redo', 'Redo(&&R)')), 'CmdOrCtrl+Y', SystemCommands.REDO, localize('menus.setEditMenu.redoTxt', 'Redo'), localize('menus.setEditMenu.redoOpt', 'Redo operation'));
			cut = this.createMenuItem(mnemonicMenuLabel(localize('menus.setEditMenu.cut', 'Cut(&&T)')), 'CmdOrCtrl+X', SystemCommands.CUT, localize('menus.setEditMenu.cutTxt', 'Cut'), localize('menus.setEditMenu.cutOpt', 'Cut operation'));
			copy = this.createMenuItem(mnemonicMenuLabel(localize('menus.setEditMenu.copy', 'Copy(&&C)')), 'CmdOrCtrl+C', SystemCommands.COPY, localize('menus.setEditMenu.copyTxt', 'Copy'), localize('menus.setEditMenu.copyOpt', 'Copy operation'));
			paste = this.createMenuItem(mnemonicMenuLabel(localize('menus.setEditMenu.paste', 'Paste(&&P)')), 'CmdOrCtrl+V', SystemCommands.PASTE, localize('menus.setEditMenu.pasteTxt', 'Paste'), localize('menus.setEditMenu.pasteOpt', 'Paste operation'));
			selectAll = this.createMenuItem(mnemonicMenuLabel(localize('menus.setEditMenu.allSelect', 'Select All(&&A)')), 'CmdOrCtrl+A', SystemCommands.SELECT_ALL, localize('menus.setEditMenu.allSelectTxt', 'Select All'), localize('menus.setEditMenu.allSelectOpt', 'Select all operation'));
		}

		const memus = [
			undo,
			redo,
			__separator__(),
			cut,
			copy,
			paste,
			__separator__(),
			selectAll
		];
		memus.forEach(item => winLinuxEditMenu.append(item));
	}


	/**
	 * 窗口菜单
	 */
	private setWindowsMenu(windowMenu: Electron.Menu): void {
		const minimize = this.createRoleMenuItem(mnemonicMenuLabel(localize('menus.setWindowsMenu.minimize', 'Minimize(&&M)')), 'minimize');
		const togglefullscreen = this.createRoleMenuItem(mnemonicMenuLabel(localize('menus.setWindowsMenu.togglefullscreen', 'Toggle Full Screen')), 'togglefullscreen');
		const menus = [minimize, togglefullscreen];
		menus.forEach(item => windowMenu.append(item));
	}

	/**
	 * 帮助菜单
	 */
	private setHelpMenu(helpMenu: Electron.Menu): void {
		const toggleDevToolsItem = new MenuItem({
			label: mnemonicMenuLabel(localize('menus.setHelpMenu.toggleDev', 'Toggle Dev(&&T)')),
			click: () => this.toggleDevTools(),
			enabled: true
		});
		const menus = [toggleDevToolsItem];
		menus.forEach(item => helpMenu.append(item));
	}
}

function __separator__(): Electron.MenuItem {
	return new MenuItem({ type: 'separator' });
}