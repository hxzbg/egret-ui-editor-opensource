import * as fs from 'fs';
import * as path from 'path';
import { IOperation } from 'egret/platform/operations/common/operations';
import { IWindowClientService } from '../../../platform/windows/common/window';
import { AboutPanel } from '../../parts/about/aboutPanel';
import { WingPropertyPanel } from '../../parts/wingproperty/wingPropertyPanel';
import { IEgretProjectService } from '../../../exts/exml-exts/project';
import { createDecorator, IInstantiationService } from '../../../platform/instantiation/common/instantiation';
import { KeybindingPanel } from '../../parts/keybinding/keybindingPanel';
import { IDisposable, dispose } from '../../../base/common/lifecycle';
import { onLauncherTask } from 'egret/platform/launcher/common/launcherHelper';
import Launcher from 'egret/platform/launcher/common/launcher';
import { AppId } from 'egret/platform/launcher/common/launcherDefines';
import { SearchFilePanel } from 'egret/workbench/parts/searchFile/view/searchFilePanel';
import { IWorkbenchEditorService } from 'egret/workbench/services/editor/common/ediors';
import { BaseEditor } from 'egret/editor/browser/baseEditor';
import { innerWindowManager } from 'egret/platform/innerwindow/common/innerWindowManager';
import { IFileModelService } from 'egret/workbench/services/editor/common/models';
import { ExmlModel } from 'egret/exts/exml-exts/exml/common/exml/exmlModel';
import { IExmlFileEditorModel, IExmlModel } from 'egret/exts/exml-exts/exml/common/exml/models';
import { ExmlFileEditor } from 'egret/exts/exml-exts/exml/browser/exmlFileEditor';
import { IFGUI, FGUI } from 'egret/workbench/services/editor/transverter/FGUI';
import { IEditorService, IEditor } from 'egret/editor/core/editors';
import URI from 'egret/base/common/uri';
import { shell } from 'electron';
import { prototype } from 'events';

export class ExportFGUIOperation implements IOperation {
	constructor(
		@IFGUI protected fgui: FGUI,
		@IFileModelService protected fileModelService: IFileModelService,
		@IWorkbenchEditorService protected workbenchEditorService: IWorkbenchEditorService,
	) {		
	}
	/**
	 * 运行
	 */
	public run(): Promise<any> {
		let fgui = this.fgui;
		let fileEditor = this.workbenchEditorService.getActiveEditor() as ExmlFileEditor;
		if(!fileEditor) {
			return Promise.resolve(void 0);
		}

		return fileEditor.getModel().then(async function(model){
			if(model) {
				let value = await fgui.begin();
				if(value) {
					fgui.run(model);
					fgui.end();
				}
			}
		});
	}
	/**
	 * 释放
	 */
	public dispose(): void {
		this.fgui = null;
	}
}

export class ExportFGUIBatchOperation extends ExportFGUIOperation {
	protected _exmls:string[] = [];
	private fix_dir_path(dir:string) : string {
		dir = dir.replace(/\\/g, '/');
		if(!dir.endsWith('/')) {
			dir = dir.concat('/');
		}
		return dir;
	}

	private search_exml(dir:string) {
		dir = this.fix_dir_path(dir);
		const files = fs.readdirSync(dir);
		for(let filename of files) {
			const filepath = path.join(dir, filename);
			const stats = fs.statSync(filepath);
			if(stats.isFile()) {
				let extname = path.extname(filename);
				if(extname && extname.toLowerCase() === ".exml") {
					this._exmls.push(filepath);
				}
			}else if(stats.isDirectory()) {
				this.search_exml(filepath);
			}
		}
	}
	constructor(
		@IFGUI protected fgui: FGUI,
		@IFileModelService protected fileModelService: IFileModelService,
		@IWorkbenchEditorService protected workbenchEditorService: IWorkbenchEditorService,
		@IEgretProjectService protected egretProjectService: IEgretProjectService,
		@IEditorService protected editorService: IEditorService,
	) { 
		super(fgui, fileModelService, workbenchEditorService);
		let projectModel = egretProjectService.projectModel;
		if(projectModel.root && projectModel.exmlRoot && projectModel.exmlRoot.length > 0) {
			let root = projectModel.root.fsPath;
			root = root.replace(/\\/g, '/');
			if(!root.endsWith('/')) {
				root = root.concat('/');
			}
			let skinRoot = projectModel.exmlRoot[0].path;
			skinRoot = skinRoot.replace(/\\/g, '/');
			if(!skinRoot.endsWith('/')) {
				skinRoot = skinRoot.concat('/');
			}
			if(skinRoot[0] === '/') {
				skinRoot = skinRoot.substring(1);
			}
			this.search_exml(root.concat(skinRoot));
		}
	}

	protected export_one(resolve) {
		if(this._exmls.length <= 0 ) {
			resolve(true);
		}else{
			let filepath = this._exmls.pop();
			this.workbenchEditorService.openEditor({ resource: URI.file(filepath) }, true).then((fileEditor) => {
				fileEditor.getModel().then((fileEditorModel) => {
					if(fileEditorModel) {
						let exmlModel = fileEditorModel.getModel() as ExmlModel;
						exmlModel.refreshTree().then(() => {
							this.fgui.run(fileEditorModel);
							setTimeout(() => {
								this.workbenchEditorService.closeEditor(fileEditor);
								setTimeout(() => {
									this.export_one(resolve);
								}, 100);
							}, 100);
						});
					}
				});
			});
		}
	}

	/**
	 * 运行
	 */
	public run(): Promise<any> {
		let editors = this.workbenchEditorService.getOpenEditors();
		return this.workbenchEditorService.closeEditors(editors).then(() => {
			return this.fgui.begin().then((value) => {
				if(value){
					return new Promise((resolve) => {
						this.export_one(resolve);
					});
				}
			}).then(() => {
				this.fgui.end();
			});
		})
	}
}

/**
 * 打开文件夹的操作
 */
export class OpenFolderOperation implements IOperation {
	constructor(@IWindowClientService private windowService: IWindowClientService) {
	}
	/**
	 * 运行
	 */
	public run(): Promise<any> {
		this.windowService.pickFolderAndOpen({});
		return Promise.resolve(void 0);
	}
	/**
	 * 释放
	 */
	public dispose(): void {
		this.windowService = null;
	}
}


/**
 * 弹出关于
 */
export class PromptAboutOperation implements IOperation {
	/**
	 * 运行
	 */
	public run(): Promise<any> {
		if (innerWindowManager.tryActive(AboutPanel)) {
			return Promise.resolve(void 0);
		}
		const about = new AboutPanel();
		about.open(null, true);
		return Promise.resolve(void 0);
	}
	/**
	 * 释放
	 */
	public dispose(): void {
	}
}

/**
 * 反馈问题
 */
export class ReportIssueOperation implements IOperation {
	/**
	 * 运行
	 */
	public run(): Promise<any> {
		shell.openExternal('https://github.com/egret-labs/egret-ui-editor-opensource/issues');
		return Promise.resolve(void 0);
	}
	/**
	 * 释放
	 */
	public dispose(): void {
	}
}

/**
 * 快速打开运行
 */
export class PrompQuickOpenOperation implements IOperation {
	constructor(
		@IInstantiationService private instantiationService: IInstantiationService
	) {
	}
	/**
	 * 运行
	 */
	public run(): Promise<any> {
		if (innerWindowManager.tryActive(SearchFilePanel)) {
			return Promise.resolve(void 0);
		}
		const panel = this.instantiationService.createInstance(SearchFilePanel);
		panel.open(null, true);
		return Promise.resolve(void 0);
	}
	/**
	 * 释放
	 */
	public dispose(): void {
	}
}


/**
 * 检查更新
 */
export class CheckUpdateOperation implements IOperation {
	/**
	 * 运行
	 */
	public run(): Promise<any> {
		onLauncherTask(Launcher.checkAppUpdate(AppId.EUIEditor));
		return Promise.resolve(void 0);
	}
	/**
	 * 释放
	 */
	public dispose(): void {
	}
}


/**
 * 检查更新
 */
export class FeedbackOperation implements IOperation {
	/**
	 * 运行
	 */
	public run(): Promise<any> {
		onLauncherTask(Launcher.feedback(AppId.EUIEditor));
		return Promise.resolve(void 0);
	}
	/**
	 * 释放
	 */
	public dispose(): void {
	}
}


//TODO 这个应该放在Exml相关的初始化里
/**
 * wingproperty 属性 
 */
export class WingPropertyOperation implements IOperation {
	constructor(
		@IEgretProjectService private egretProjectService: IEgretProjectService,
		@IInstantiationService private instantiationService: IInstantiationService,
	) { }
	/**
	 * 运行
	 */
	public run(): Promise<any> {
		if (innerWindowManager.tryActive(WingPropertyPanel)) {
			return Promise.resolve(void 0);
		}
		const projectProperties = this.egretProjectService.projectModel.getWingProperties();

		// new WingPropertyPanel
		let wingproperty = this.instantiationService.createInstance(WingPropertyPanel, projectProperties, this.egretProjectService.projectModel);
		wingproperty.open(null, true);
		wingproperty.onClosed(v => {
			wingproperty.dispose();
			wingproperty = null;
		});
		return Promise.resolve(void 0);
	}
	/**
	 * 释放
	 */
	public dispose(): void {
		this.egretProjectService = null;
		this.instantiationService = null;
	}
}



/**
 * 关闭当前编辑器 
 */
export class CloseCurrentOperation implements IOperation {
	constructor(
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
	) { }
	/**
	 * 运行
	 */
	public run(): Promise<any> {
		const editor = this.editorService.getActiveEditor() as BaseEditor;
		if (editor instanceof BaseEditor) {
			return this.editorService.closeEditor(editor);
		}
		return Promise.resolve(void 0);
	}
	/**
	 * 释放
	 */
	public dispose(): void {
		this.editorService = null;
	}
}



/**
 * 快捷键设置属性 
 */
export class KeybindingSettingOperation implements IOperation {
	constructor(
		@IInstantiationService private instantiationService: IInstantiationService,
	) { }
	/**
	 * 运行
	 */
	public run(): Promise<any> {
		return new Promise((resolve, reject) => {
			if (innerWindowManager.tryActive(KeybindingPanel)) {
				return Promise.resolve(void 0);
			}
			const toDispose: IDisposable[] = [];
			const panel = this.instantiationService.createInstance(KeybindingPanel);
			panel.open(null, true);
			toDispose.push(panel.onClosed(() => {
				dispose(toDispose);
				resolve(void 0);
			}));
		});
	}
	/**
	 * 释放
	 */
	public dispose(): void {
		this.instantiationService = null;
	}
}