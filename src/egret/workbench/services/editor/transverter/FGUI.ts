import * as fs from 'fs';
import * as path from 'path';
import { remote } from 'electron';
import URI from 'egret/base/common/uri';
import { IDisposable } from 'egret/base/common/lifecycle';
import * as sax from 'egret/exts/exml-exts/exml/common/sax/sax';
import { IOperation } from 'egret/platform/operations/common/operations';
import * as xmlTagUtil from 'egret/exts/exml-exts/exml/common/sax/xml-tagUtils';
import * as xmlStrUtil from 'egret/exts/exml-exts/exml/common/sax/xml-strUtils';
import { createDecorator, IInstantiationService } from 'egret/platform/instantiation/common/instantiation';
import { FileEditorModelManager } from 'egret/workbench/services/editor/common/modelManager';
import { EgretProjectModel } from 'egret/exts/exml-exts/exml/common/project/egretProject';
import { FileRootCommands } from 'egret/workbench/parts/files/commands/fileRootCommands';
import { FocusablePartCommandHelper } from 'egret/platform/operations/common/operations';
import { ENode, EContainer} from 'egret/exts/exml-exts/exml/common/exml/treeNodesImpls';
import { IWorkbenchEditorService } from 'egret/workbench/services/editor/common/ediors';
import { IFileModelService } from 'egret/workbench/services/editor/common/models';
import { ExmlModel } from 'egret/exts/exml-exts/exml/common/exml/exmlModel';
import { IFileEditorModel, IInnerModel } from 'egret/editor/core/models';
import { IEgretProjectService } from 'egret/exts/exml-exts/project';
import { IMultiPageEditor } from 'egret/editor/core/editors';
import { resolve } from 'dns';

export const IFGUI = createDecorator<FGUI>("FGUI");

/**
 * fgui服务
 */
export class FGUI
{
	protected _groups = {};
	protected _states = null;
	protected _current_group = "";
	protected _current_comment_name:string = null;
	protected _attributes_processor = {
		id:function(fgui:FGUI, node: ENode, state:string) : string {
			let value = fgui.get_property(node, "id", "string", state);
			return value ? value : "-";
		},
		xy:function(fgui:FGUI, node: ENode, state:string) : string {
			let x = 0;
			let y = 0;
			if(node.getName() != "Group") {
				let group = fgui._groups[fgui._current_group];
				while(group) {
					x = x + group["x"];
					y = y + group["y"];
					group = fgui._groups[group["group"]];
				}
			}
			x = x + fgui.get_property(node, "x", "int", state);
			y = y + fgui.get_property(node, "y", "int", state);
			return x.toString() + ',' + y.toString();
		},
		size:function(fgui:FGUI, node: ENode, state:string) : string {
			let width = fgui.get_property(node, "width", "int", state);
			let height = fgui.get_property(node, "height", "int", state);
			return (width != 0 && height != 0) ? (width.toString().concat(",", height)) : "";
		},
		name:function(fgui:FGUI, node: ENode, state:string) : string {
			let name = fgui.get_property(node, "name", "string", state);
			return name ? name : node.getName();
		},
		group:function(fgui:FGUI, node: ENode, state:string) : string {
			return fgui._current_group;
		},
		visible:function(fgui:FGUI, node: ENode, state:string) : string {
			let value = fgui.get_property(node, "visible", "string", state);
			if(value && value.toString().toLowerCase() == "false") {
				return "false";
			}
			return "";
		},
		color:function(fgui:FGUI, node: ENode, state:string) : string {
			return fgui.transform_color(node,{
				BitmapLabel:{default:"#FFFFFF"},
				Label:{param:"textColor", default:"#FFFFFF"},
			}, state);
		},
		strokeColor:function(fgui:FGUI, node: ENode, state:string) : string {
			return fgui.transform_color(node,{
				Label:{param:"strokeColor"},
			}, state);
		},
		type:function(fgui:FGUI, node: ENode, state:string) : string {
			let name = node.getName();
			if(name == "Rect") {
				return "rect";
			}else if(name == "Object") {
				return node.getType();
			}
			return null;
		},
		corner:function(fgui:FGUI, node: ENode, state:string) : string {
			let name = node.getName();
			if(name == "Rect") {
				let ellipseWidth = fgui.get_property(node, 'ellipseWidth', 'int', state);
				if(ellipseWidth != 0) {
					return ellipseWidth;
				}
				let ellipseHeight = fgui.get_property(node, 'ellipseHeight', 'int', state);
				if(ellipseHeight) {
					return ellipseHeight;
				}
			}
			return "";
		},
		mode:function(fgui:FGUI, node: ENode, state:string) : string {
			let name = node.getName();
			switch(name) {
				case "RadioButton":
					return "Radio";
				case "CheckBox":
					return "Check";
			}
			return null;
		},
		src:function(fgui:FGUI, node: ENode, state:string) : string {
			return fgui.transform_src(node, state);
		},
		pkg:function(fgui:FGUI, node: ENode, state:string) : string {
			return fgui.transform_pkg(node, state);
		},
		fileName:function(fgui:FGUI, node: ENode, state:string) : string {
			return fgui.transform_fileName(node, state);
		},
		bold:function(fgui:FGUI, node: ENode, state:string) : string {
			return fgui.get_property(node, "bold", "boolean", state);
		},
		text:function(fgui:FGUI, node: ENode, state:string) : string {
			return fgui.get_property(node, "text", "string", state);
		},
		value:function(fgui:FGUI, node: ENode, state:string) : string {
			return fgui.get_property(node, "value", "int", state);
		},
		alpha:function(fgui:FGUI, node: ENode, state:string) : string {
			return fgui.get_property(node, "alpha", "float", state);
		},
		italic:function(fgui:FGUI, node: ENode, state:string) : string {
			return fgui.get_property(node, "italic", "boolean", state);
		},
		fontSize:function(fgui:FGUI, node: ENode, state:string) : string {
			return fgui.get_property(node, "size", "int", state);
		},
		stroke:function(fgui:FGUI, node: ENode, state:string) : string {
			return fgui.get_property(node, "stroke", "int", state);
		},
		font:function(fgui:FGUI, node: ENode, state:string) : string {
			if(node.getName() == "BitmapLabel") {
				let font = fgui.get_property(node, "font", "string", state);
				return fgui.transform_url(font, "font");
			}
			return fgui.get_property(node, "fontFamily", "string", state);
		},
		textAlign:function(fgui:FGUI, node: ENode, state:string) : string {
			return fgui.get_property(node, "align", "string", state);
		},
		minimum:function(fgui:FGUI, node: ENode, state:string) : string {
			return fgui.get_property(node, "minimum", "int", state);
		},
		maximum:function(fgui:FGUI, node: ENode, state:string) : string {
			return fgui.get_property(node, "maximum", "int", state);
		},
		rotation:function(fgui:FGUI, node: ENode, state:string) : string {
			return fgui.get_property(node, "rotation", "int", state);
		},
		touchable:function(fgui:FGUI, node: ENode, state:string) : string {
			return fgui.get_property(node, "touchEnabled", "boolean", state);
		},
		letterSpacing:function(fgui:FGUI, node: ENode, state:string) : string {
			return fgui.get_property(node, "letterSpacing", "int", state);
		},
		skew:function(fgui:FGUI, node: ENode, state:string) : string {
			let skewX = fgui.get_property(node, "skewX", "int", state);
			let skewY = fgui.get_property(node, "skewY", "int", state);
			if(skewX != 0 || skewY != 0) {
				return skewX.toString().concat(",", skewY);
			}
			return "";
		},
		scale:function(fgui:FGUI, node: ENode, state:string) : string {
			let scaleX = fgui.get_property(node, "scaleX", "float", state);
			let scaleY = fgui.get_property(node, "scaleY", "float", state);
			if(scaleX != 0 || scaleY != 0) {
				return scaleX.toString().concat(",", scaleY);
			}
			return "";
		},
		advanced:function(fgui:FGUI, node: ENode, state:string) : string {
			return node.getName() == "Group" ? "true" : "";
		},
		restrictSize:function(fgui:FGUI, node: ENode, state:string) : string {
			let minWidth = fgui.get_property(node, "minWidth", "int", state);
			let maxWidth = fgui.get_property(node, "maxWidth", "int", state);
			let minHeight = fgui.get_property(node, "minHeight", "int", state);
			let maxHeight = fgui.get_property(node, "maxHeight", "int", state);
			if(minWidth != 0 || maxWidth != 0 || minHeight != 0 || maxHeight != 0) {
				return minWidth.toString().concat(",", maxWidth, ",", minHeight, ",", maxHeight);
			}
			return "";
		},
		pivot:function(fgui:FGUI, node: ENode, state:string) : string {
			let fix_abled = false;
			switch(node.getName()) {
				case "Image": {
					fix_abled = true;
				}
				break;
			}
			let anchorOffsetX = fgui.get_property(node, "anchorOffsetX", "int", state);
			let anchorOffsetY = fgui.get_property(node, "anchorOffsetY", "int", state);
			let width = fgui.get_property(node, "width", "int", state);
			if(width == 0 && fix_abled) {
				width = node.getInstance()["width"];
			}
			let height = fgui.get_property(node, "height", "int", state);
			if(height == 0 && fix_abled) {
				height = node.getInstance()["height"];
			}
			if(width > 0 && height > 0 && (anchorOffsetX != 0 || anchorOffsetY != 0)) {
				return (anchorOffsetX / width).toFixed(3).toString().concat(",", (anchorOffsetY / height).toFixed(3));
			}
			return "";
		},
		fillColor:function(fgui:FGUI, node: ENode, state:string) : string {
			switch(node.getName()) {
				case "Rect": {
					let alpha = Math.floor(fgui.get_property(node, "fillAlpha", "float", state) * 255);
					if(alpha < 1) {
						return "";
					}

					let color = fgui.get_property(node, "fillColor", "string", state);
					if(!color) {
						return "";
					}
					return "#".concat(alpha.toString(16), color.substring(1));
				}
				break;
			}
			return "";
		},
		lineColor:function(fgui:FGUI, node: ENode, state:string) : string {
			switch(node.getName()) {
				case "Rect": {
					let alpha = Math.floor(fgui.get_property(node, "strokeAlpha", "float", state) * 255);
					if(alpha < 1) {
						return "";
					}

					let color = fgui.get_property(node, "strokeColor", "string", state);
					if(!color) {
						return "";
					}
					return "#".concat(alpha.toString(16), color.substring(1));
				}
				break;
			}
			return "";
		},
		scale9Grid:function(fgui:FGUI, node: ENode, state:string) : string {
			let key = fgui.get_property(node, "source", "string", state);
			if(!key) {
				return "";
			}

			let scale9Grid = fgui.get_property(node, "scale9Grid", "string", state);
			if(!scale9Grid) {
				return "";
			}

			let package_data = fgui.find_package(key, "image");
			if(package_data) {
				let xml = package_data.image[key].xml;
				if(!xml.attributes["scale9grid"]) {
					package_data.dirty = true;
					xmlTagUtil.setAttribute(xml, "scale", "9grid");
					xmlTagUtil.setAttribute(xml, "scale9grid", scale9Grid);
				}
			}
			return "";
		},
		grayed:function(fgui:FGUI, node: ENode, state:string) : string {
			return "";
		},
	};
	protected _processor = {
		//自定义预制件
		ns1:{
			default:{
				name_fix:"component",
				post_processor:function(fgui:FGUI, space:string, node: ENode, state:string) : string {
					let content = "";
					let status = fgui.build_gear_content(space, node);
					if(status) {
						return content.concat(">\n", status, "</component>\n");
					}
					return content.concat("/>\n");
				},
			}
		},
		//普通控件或者Skin
		default:{
			Skin:{
				name_fix:"component",
				pre_processor:function(fgui:FGUI, space:string, node: ENode, state:string) : string {
					if(!node.getParent()) {
						fgui._states = {};
						let states = fgui.get_property(node, "states", "string", "");
						if(states) {
							fgui._states["default"] = states.split(",");
						}
					}
					return "";
				},
				post_processor:function(fgui:FGUI, space:string, node: ENode, state:string) : string {
					let content = "";
					content = content.concat("\t<displayList>\n");
					content = content.concat(fgui.parse_children(space + "\t", node, state));
					content = content.concat("\t</displayList>\n");
					content = content.concat("</component>\n");

					//控制器
					let property_add = ">\n";
					for (const key in fgui._states) {
						property_add = property_add.concat("\t", `<controller name="`, key, `" pages="`);
						let states = fgui._states[key];
						for(let index = 0; index < states.length; index++) {
							property_add = property_add.concat((index + 1).toString(), ",", states[index], ",");
						}
						property_add = property_add.substring(0, property_add.length - 1);
						property_add = property_add.concat(`" selected="0"/>\n`);
					}

					return property_add.concat(content);
				},
			},
			Group:{
				name_fix:"group",
				pre_processor:function(fgui:FGUI, space:string, node: ENode, state:string) : string {
					let content = "";
					let group_prev = fgui._current_group;
					let id = fgui.get_property(node, "id", "string", null);
					let id_index = 0;
					while(!id || fgui._groups[id]) {
						id_index = id_index + 1;
						id = "group_generated_" + id_index;
					}
					if(id_index > 0) {
						node.getXml().attributes["id"] = id;
					}

					//生成Group数据
					let group = {};
					group["id"] = id;
					group["x"] = fgui.get_property(node, "x", "int", null);
					group['y'] = fgui.get_property(node, "y", "int", null);
					group["group"] = group_prev;
					fgui._groups[id] = group;

					//解析子节点
					fgui._current_group = id;
					let child_count = fgui.get_child_count(node);
					if(child_count > 0) {
						let container = node as EContainer;
						for (let index = 0; index < child_count; index++) {
							const child = container.getNodeAt(index) as ENode;
							if(child) {
								content = content.concat(fgui.build_component(space, child, state));
							}
						}
					}
					fgui._current_group = group_prev;
					return content;
				},
				post_processor:function(fgui:FGUI, space:string, node: ENode, state:string) : string {
					return "/>\n";
				},
			},
			Scroller:{
				name_fix:"list",
				post_processor:function(fgui:FGUI, space:string, node: ENode, state:string) : string {
					let content = "";
					let children = node.getXml().children;
					if(children && children.length > 0) {
						children.forEach(child => {
							switch(child.localName) {
								case "List": {
									content = content.concat(fgui.process_list(space, node, child, false, state));
								}
								break;

								case "TabBar": {
									content = content.concat(fgui.process_list(space, node, child, true, state));
								}
								break;
							}
						});
					}
					return content;
				},
			},

			CheckBox:{
				name_fix:"component",
				post_processor:function(fgui:FGUI, space:string, node: ENode, state:string) : string {
					let content = "";
					content = content.concat(">\n", space, `\t<Button mode="Check"/>\n`, space, `</component>\n`);
					return content;
				},
			},
			RadioButton:{
				name_fix:"component",
				post_processor:function(fgui:FGUI, space:string, node: ENode, state:string) : string {
					let content = "";
					content = content.concat(">\n", space, `\t<Button mode="Radio"/>\n`, space, `</component>\n`);
					return content;
				},
			},

			default:{
				//EUI->FGUI 组件名字转换逻辑
				name_fix:{
					Image:"image",
					Label:"text",
					Rect:"graph",
					BitmapLabel:"text",
				},

				post_processor:function(fgui:FGUI, space:string, node: ENode, state:string) : string {
					let content = "";
					let status = fgui.build_gear_content(space, node);
					if(fgui.get_child_count(node) < 1) {
						if(status) {
							content = content.concat(">\n", status, space, "</", fgui._current_comment_name, ">\n");
						}else{
							content = content.concat("/>\n");
						}
					}else{
						content = content.concat(">\n");
						if(status) {
							content = content.concat(status);
						}
						content = content.concat(fgui.parse_children(space, node, state), space, "</", fgui._current_comment_name, ">\n");
					}
					return content;
				},
			}
		}
	};

	protected _property_formater = {
		int:function(value:any) : number {
			return value ? Number.parseInt(value) : 0;
		},
		float:function(value:any) : number {
			return value ? Number.parseFloat(value) : 0;
		},
		string:function(value:any) : number {
			return value ? value.toString() : "";
		},
		boolean:function(value:any) : boolean {
			if(value) {
				let test = value.toString().toLowerCase();
				return test == "true";
			}
			return false;
		},
	};
	
	protected get_property_string(node:ENode, key: string, type:string, state:string) : any {
		let tag = node.getXml();
		if(state) {
			let attribute = tag.attributes[key.concat(".", state)];
			if(attribute) {
				return attribute;
			}
		}
		return tag.attributes[key];
	}

	protected get_property(node:ENode, key: string, type:string, state:string) : any {
		let attribute = this.get_property_string(node, key, type, state);
		switch(key) {
			case "width":
			case "height": {
				if(node.getName() == "Image") {
					let value = node.getInstance()[key];
					if(value) {
						attribute = value.toString();
					}
				}
			}
			break;
			case "x":
			case "y": {
				let value = node.getInstance()[key];
				if(value) {
					attribute = value.toString();
				}
			}
			break;
		}
		return this._property_formater[type](attribute);
	}

	protected _gear_config = {
		gearXY:{params:["xy"],default:["0,0"]},
		gearSize:{params:["size","scale"], default:["0,0","1,1"]},
		gearColor:{params:["color"], default:["#ffffff"]},
		gearLook:{params:["alpha","rotation","grayed","touchable"], default:["1","0","0","0"]},
	};

	protected build_gear_content(space, node: ENode) : string {
		let controllers = this._states["default"]
		if(!controllers || controllers.length <= 0) {
			return "";
		}

		let includeIn = this.get_property(node, "includeIn", "string", null);
		if(!node.hasMutipleStates() && !includeIn) {
			return "";
		}

		let content = "";
		space = space.concat("\t");
		//添加 gearDisplay
		if(includeIn) {
			let gearDisplay = includeIn.split(',');
			content = content.concat(space, `<gearDisplay controller="default" pages="`);
			for(let index = 0; index < gearDisplay.length; index ++) {
				content = content.concat(controllers.indexOf(gearDisplay[index]) + 1, ",");
			}
			content = content.substring(0, content.length - 1);
			content = content.concat(`"/>\n`);
		}

		//添加其它属性
		let gear_amount = {};
		for (const gear in this._gear_config) {
			let config = this._gear_config[gear];
			let params = config.params;
			let default_value = "";
			for(let index = 0; index < params.length; index++) {
				let value = this._attributes_processor[params[index]](this, node, "");
				value = value ? value : config.default[index];
				default_value = default_value.concat(value, ",");
			}

			for (const state in this._states) {
				let pages = "";
				let values = "";
				controllers = this._states[state];
				for(let stateid = 0; stateid < controllers.length; stateid ++) {
					let values_state = "";
					let state_chunk = controllers[stateid];
					for(let index = 0; index < params.length; index++) {
						let value = this._attributes_processor[params[index]](this, node, state_chunk);
						value = value ? value : config.default[index];
						values_state = values_state.concat(value, ",");
					}

					if(values_state != default_value) {
						values_state = values_state.substring(0, values_state.length - 1);

						values = values.concat(values_state, "|");
						pages = pages.concat((stateid + 1).toString(), ",");
					}
				}

				if(values) {
					let amount = gear_amount[gear];
					if(!amount) {
						amount = 0;
					}
					gear_amount[gear] = amount + 1;
					pages = pages.substring(0, pages.length - 1);
					values = values.substring(0, values.length - 1);
					default_value = default_value.substring(0, default_value.length - 1);
					content = content.concat(space,`<`, gear, amount > 0 ? amount : "", ` controller="`, state, `" pages="`,pages, `" values="`, values, `" default="`, default_value, `"/>\n`);
				}
			}
		}
		return content;
	}

	protected process_collection(space:string, node: ENode, tag:sax.Tag, handler:any) : string {
		let content = "";
		space = space.concat('\t');
		if(tag.children) {
			tag.children.forEach(array => {
				if(array.localName == "Array") {
					if(array.children) {
						array.children.forEach(item => {
							content = content.concat(space, "<item>\n");
							if(item.attributes) {
								for (const key in item.attributes) {
									content = content.concat(space, `\t<property target="`, key, `" propertyId="0" value="`, item.attributes[key], `"/>\n`);
								}
							}
							content = content.concat(space, "</item>\n");
						});

						if(handler) {
							handler(array.children);
						}
					}
				}
			});
		}
		return content;
	}

	protected process_list(space:string, node: ENode, tag:sax.Tag, tabbar:boolean, state:string) : string {
		let property_add = this.build_property_xml("defaultItem", this.transform_url(tag.attributes["itemRendererSkinName"], "component"));

		let list_content = "";
		let tabbar_control_size = 0;
		let children = tag.children;
		let process_collection_handler = null;
		if(tabbar) {
			process_collection_handler = function(children) {
				if(children) {
					tabbar_control_size = children.length;
				}
			}
		}

		if(children) {
			children.forEach(child => {
				switch(child.localName) {
					case "layout": {
						if(child.children) {
							let element = child.children[0];
							if(element.localName == "HorizontalLayout") {
								property_add = property_add.concat(this.build_property_xml("layout", "row"));
							}else if(element.localName == "VerticalLayout") {
								property_add = property_add.concat(this.build_property_xml("layout", "column"));
							}
						}
					}
					break;

					case "ArrayCollection": {
						list_content = list_content.concat(this.process_collection(space, node, child, process_collection_handler));
					}
					break;
				}
			});
		}
		let content = "";
		if(tabbar_control_size > 0) {
			//添加TabBar独占控制器
			let id = this.get_property(node, "id", "string", state);
			if(!id) {
				id = "TabBarControl";
			}

			let index= 0;
			let idtest = id;
			while(true) {
				if(!this._states[idtest]) {
					break;
				}else{
					index = index + 1;
					idtest = id.concat(index);
				}
			}

			let states = [];
			for(let i = 0; i < tabbar_control_size; i ++) {
				states.push('');
			}
			this._states[idtest] = states;

			property_add.concat(` selectionController="`, idtest, `"`);
		}
		content = content.concat(property_add, ">\n", list_content, space, "</list>\n");
		return content;
	}

	protected transform_skin_name(skin:string) : string {
		if(skin) {
			if(skin.startsWith("skins.")) {
				skin = skin.substring(6);
			}
			let url:URI = this._exmlConfig.getExmlUri(skin);
			if(!url) {
				url = this._exmlConfig.getExmlUri("skins." + skin);
			}
			if(!url) {
				url = this._exmlConfig.getExmlUri("skins." + skin + "Skin");
			}
			if(url){
				let basename = path.basename(url.path);
				let lastindex = basename.lastIndexOf('.');
				if(lastindex > 0) {
					basename = basename.substring(0, lastindex);
				}
				skin = basename;
			}
		}
		return skin;
	}

	protected transform_url(resname:string, type:string) : string {
		resname = this.transform_skin_name(resname);
		let package_data = this.find_package(resname, type);
		return package_data ? `ui://`.concat(package_data.id, package_data[type][resname].src) : `ui://`.concat(resname);
	}

	protected transform_color(node: ENode, para:Object, state:string) : string {
		let color = null;
		let config = para[node.getName()];
		if(config) {
			if(config.param) {
				color = this.get_property(node, config.param, "string", state);
				if(color) {
					return "#" + color.substring(2);
				}
			}
			
			if(!color){
				color = config.default;
			}
		}
		return color;
	}

	protected find_package(key:string, type:string) : any {
		for (const id in this._packages) {
			let package_data = this._packages[id]
			if(package_data[type][key]) {
				return package_data;
			}
		}
		return null;
	}

	protected transform_pkg(node: ENode, state:string) : string {
		let name = node.getName();
		if(name == "Image") {
			let key = this.get_property(node, "source", "string", state)
			if(key) {
				let package_data = this.find_package(key, "image");
				return package_data ? package_data.id : null;
			}
			return key;
		}else if(node.getNs().prefix === "ns1" || node.getName() === "CheckBox" || node.getName() === "RadioButton") {
			let skinName = this.get_property(node, "skinName", "string", state);
			if(!skinName) {
				skinName = node.getName();
			}
			let package_data = this.find_package(this.transform_skin_name(skinName), "component");
			return package_data ? package_data.id : null;
		}
		return null;
	}

	protected transform_src(node: ENode, state:string) : string {
		let name = node.getName();
		if(name == "Image") {
			let key = this.get_property(node, "source", "string", state)
			if(key) {
				let package_data = this.find_package(key, "image");
				return package_data ? package_data.image[key].src : null;
			}
			return key;
		}else if(node.getNs().prefix === "ns1" || node.getName() === "CheckBox" || node.getName() === "RadioButton") {
			let skinName = this.get_property(node, "skinName", "string", state);
			if(!skinName) {
				skinName = node.getName();
			}
			skinName = this.transform_skin_name(skinName);
			let package_data = this.find_package(skinName, "component");
			return package_data ? package_data.component[skinName].src : null;
		}
		return null;
	}

	protected transform_fileName(node: ENode, state:string) : string {
		let name = node.getName();
		if(name == "Image") {
			let key = this.get_property(node, "source", "string", state)
			if(key) {
				let package_data = this.find_package(key, "image");
				return package_data ? package_data.image[key].fileName : null;
			}
			return key;
		}else if(node.getNs().prefix === "ns1" || node.getName() === "CheckBox" || node.getName() === "RadioButton") {
			let skinName = this.get_property(node, "skinName", "string", state);
			if(!skinName) {
				skinName = node.getName();
			}
			skinName = this.transform_skin_name(skinName);
			let package_data = this.find_package(skinName, "component");
			return package_data ? package_data.component[skinName].fileName : null;
		}
		return null;
	}

	private _packages = null;
	private _skinRoot = null;
	private _fguiRoot = null;
	private _exmlConfig = null;
	constructor(
		@IFileModelService protected fileModelService: IFileModelService,
		@IEgretProjectService protected egretProjectService: IEgretProjectService,
	)
	{
		
	}

	private fix_dir_path(dir:string) : string {
		dir = dir.replace(/\\/g, '/');
		if(!dir.endsWith('/')) {
			dir = dir.concat('/');
		}
		return dir;
	}

	private _package_id_seed = '123456789abcdefghijklmnopqrstuvwxyzz';
	private generate_package_id() : string {
		let package_id = "";
		while(!package_id) {
			for(let i = 0; i < 9; i ++) {
				let random = Math.floor(Math.random() * this._package_id_seed.length);
				package_id = package_id.concat(this._package_id_seed[random]);
			}
	
			if(this._packages) {
				for (const key in this._packages) {
					if(key === package_id) {
						package_id = "";
					}
				}
			}
		}
		return package_id;
	}

	private create_dir(dir:string) : string {
		dir = this.fix_dir_path(dir);
		if(!fs.existsSync(dir)) {
			fs.mkdirSync(dir);
		}
		return dir;
	}

	private create_package(dir:string) {
		dir = this.create_dir(dir);
		let packagefile = dir.concat("package.xml");
		if(!fs.existsSync(packagefile)) {
			let package_id = this.generate_package_id();
			let xml = `<packageDescription id="${package_id}">
	<resources>
	</resources>
	<publish name="" />
</packageDescription>`;
			fs.writeFileSync(packagefile, xml, "utf8");
			this.build_package(packagefile);
		}
	}

	private search_package(dir:string) {
		dir = this.fix_dir_path(dir);
		const files = fs.readdirSync(dir);
		for(let filename of files) {
			const filepath = path.join(dir, filename);
			const stats = fs.statSync(filepath);
			if(stats.isFile()) {
				if(filename == "package.xml") {
					this.build_package(filepath)
				}
			}else if(stats.isDirectory()) {
				this.search_package(filepath);
			}
		}
	}

	private build_package(filepath:string) {
		let xml:sax.Tag = xmlTagUtil.parse(fs.readFileSync(filepath, "utf8"), false)

		let packageid = xml.attributes["id"];
		if(!packageid) {
			return;
		}
		let children = xml.children;
		if(!children) {
			return;
		}

		let package_data = {
			id:packageid,
			font:{},
			image:{},
			component:{},
			filepath:filepath,
			dirty:false,
			xml:xml,
		}
		this._packages[packageid] = package_data;

		children.forEach(child => {
			if(child && child.name == "resources") {
				let resources = child.children;
				if(resources) {
					resources.forEach(element => {
						let attributes = element.attributes;
						if(attributes) {
							let id = attributes["id"];
							let name = attributes["name"];
							let path = attributes["path"];
							switch(element.name) {
								case "font": {
									let font = {
										src:id,
										xml:element,
										fileName:path.concat(name),
									};
									let key = name.replace(/\./g, '_');
									package_data.font[key] = font;
								}
								break;
								case "image": {
									let image = {
										src:id,
										xml:element,
										fileName:path.concat(name),
									};
									image["scale9grid"] = attributes["scale9grid"];
									let key = name.replace(/\./g, '_');
									package_data.image[key] = image;
								}
								break;
	
								case "component": {
									let component = {
										src:id,
										xml:element,
										fileName:path.concat(name),
									};
									let key = name;
									let lastindex = name.lastIndexOf('.');
									if(lastindex > 0) {
										key = name.substring(0, lastindex);
									}
									package_data.component[key] = component;
								}
								break;
							}
						}
					});
				}
			}
		});
	}

	public begin() {
		this._packages = null;
		const egretProjectService = this.egretProjectService;
		const egretProject = egretProjectService.projectModel;
		let projectModel = egretProjectService.projectModel;
		if(projectModel.exmlRoot && projectModel.exmlRoot.length > 0) {
			let skinRoot = projectModel.exmlRoot[0].path;
			if(skinRoot) {
				skinRoot = skinRoot.replace(/\\/g, '/');
				if(!skinRoot.endsWith('/')) {
					skinRoot = skinRoot.concat('/');
				}
			}
			this._skinRoot = skinRoot;
		}

		this._exmlConfig = egretProjectService.exmlConfig;
		const wingProperties = egretProject.getWingProperties();
		return new Promise(function(resolve, reject){
			if(!wingProperties.fgui) {
				remote.dialog.showMessageBox(remote.getCurrentWindow(), {
					type:'error',
					title:'错误',
					message:'请选择FGUI项目根路径',
					buttons:['确定'],
				}).then((value) => {
					resolve(false);
				});
			}else{
				let fguiRoot = wingProperties.fgui;
				fguiRoot = fguiRoot.replace(/\\/g, '/');
				let lastindex = fguiRoot.lastIndexOf('/');
				if(lastindex > 0) {
					fguiRoot = fguiRoot.substring(0, lastindex + 1);
				}
				this._fguiRoot = fguiRoot.concat('assets/');

				this._packages = {};
				this.search_package(this._fguiRoot);
				resolve(true);
			}
		}.bind(this));
	}

	public run(fileModel: IFileEditorModel): boolean {
		if(fileModel) {
			this.save(fileModel);
			return true;
		}
		return false;
	}

	public end() {
		if(!this._packages) {
			return;
		}

		for (const key in this._packages) {
			const element = this._packages[key];
			if(element.dirty) {
				element.dirty = false;
				let xml = xmlTagUtil.stringify(element.xml);
				fs.writeFileSync(element.filepath, xml, "utf8");
			}
		}
	}

	private save(fileModel: IFileEditorModel) {
		if(!fileModel) {
			return;
		}
		
		const model = fileModel.getModel() as ExmlModel;
		if(!model) {
			return;
		}

		let filepath = fileModel.getResource().path
		filepath = filepath.replace(/\\/g, '/');
		let lastindex = filepath.lastIndexOf(this._skinRoot);
		if(lastindex < 0) {
			return;
		}
		filepath = filepath.substring(lastindex + this._skinRoot.length);
		let dir = this._fguiRoot;
		let chunks = filepath.split('/');
		for(let i = 0; i < chunks.length - 1; i ++) {
			dir = dir.concat(chunks[i], '/');
			this.create_dir(dir);
		}
		filepath = this._fguiRoot.concat(filepath);
		lastindex = filepath.lastIndexOf('.');
		if(lastindex > 0) {
			filepath = filepath.substring(0, lastindex);
			filepath = filepath.concat('.xml');
		}

		let xml = `<?xml version="1.0" encoding="utf-8"?>\n`;
		xml = xml.concat(this.build_component("", model.getRootNode() as ENode, ""));
		fs.writeFileSync(filepath, xml, "utf8");
	}

	protected build_property_xml(property:string, value:any) : string {
		let content = "";
		if(!value) {
			return content;
		}
		return content.concat(" ", property,`="`,value,`"`);
	}

	protected get_child_count(node:ENode) : number {
		return node instanceof EContainer ? node.getNumChildren() : 0;
	}

	protected parse_children(space:string, node: ENode, state:string) : string {
		let content = "";
		let child_count = this.get_child_count(node);
		if(child_count > 0) {
			let container = node as EContainer;
			for (let index = 0; index < child_count; index++) {
				const child = container.getNodeAt(index) as ENode;
				if(child) {
					content = content.concat(this.build_component(space + "\t", child, state));
				}
			}
		}
		return content;
	}

	protected build_component(space:string, node: ENode, state:string) : string {
		let content = "";
		if(node) {
			var ns = node.getNs();
			var name = node.getName();
			let processor = this._processor[ns.prefix];
			if(!processor) {
				processor = this._processor.default;
			}

			if(processor[name]) {
				processor = processor[name];
			}else{
				processor = processor.default;
			}

			//生成头
			let comment_name = null;
			let name_fix = processor.name_fix;
			if(name_fix) {
				if(typeof(name_fix) == "string") {
					comment_name = name_fix;
				}else if(name_fix[name]){
					comment_name = name_fix[name];
				}
			}

			if(comment_name) {
				let pre_processor = processor.pre_processor;
				if(pre_processor) {
					content = content.concat(pre_processor(this, space, node, state));
				}
				
				let comment_name_prev = this._current_comment_name;
				this._current_comment_name = comment_name;
				content = content.concat(space, "<", comment_name);

				//遍历属性
				for (const key in this._attributes_processor) {
					if (Object.prototype.hasOwnProperty.call(this._attributes_processor, key)) {
						const processor = this._attributes_processor[key];
						content = content.concat(this.build_property_xml(key, processor(this, node, "")));
					}
				}
				//后处理
				content = content.concat(processor.post_processor(this, space, node, state));
				this._current_comment_name = comment_name_prev;
			}
		}
		return content;
	}
}