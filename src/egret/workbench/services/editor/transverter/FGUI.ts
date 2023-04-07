import * as fs from 'fs';
import * as path from 'path';
import { remote } from 'electron';
import URI from 'egret/base/common/uri';
import * as sax from 'egret/exts/exml-exts/exml/common/sax/sax';
import * as xmlTagUtil from 'egret/exts/exml-exts/exml/common/sax/xml-tagUtils';
import * as xmlStrUtil from 'egret/exts/exml-exts/exml/common/sax/xml-strUtils';
import { createDecorator, IInstantiationService } from 'egret/platform/instantiation/common/instantiation';
import { ENode, EContainer} from 'egret/exts/exml-exts/exml/common/exml/treeNodesImpls';
import { IFileModelService } from 'egret/workbench/services/editor/common/models';
import { ExmlModel } from 'egret/exts/exml-exts/exml/common/exml/exmlModel';
import { IEgretProjectService } from 'egret/exts/exml-exts/project';
import { IFileEditorModel } from 'egret/editor/core/models';

export const IFGUI = createDecorator<FGUI>("FGUI");

/**
 * fgui服务
 */
export class FGUI
{
	protected _groups = {};
	protected _states = null;
	protected _current_group = "";
	protected _attributes_processor = {
		id:function(fgui:FGUI, propertys:Object, node: ENode, state:string) {
			let value = fgui.get_property(node, "id", "string", state);
			propertys["id"] = value ? value : node.getName();
		},
		name:function(fgui:FGUI, propertys:Object, node: ENode, state:string) {
			propertys["name"] = fgui.get_property(node, "id", "string", state);
		},
		xy:function(fgui:FGUI, propertys:Object, node: ENode, state:string) {
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
			propertys["xy"] = x.toString() + ',' + y.toString();
		},
		size:function(fgui:FGUI, propertys:Object, node: ENode, state:string) {
			let sidePair = propertys["sidePair"];
			if(!sidePair){
				sidePair = "";
			}

			//解析百分比对齐
			let width = fgui.get_property(node, "width", "string", state);
			if(width && width.endsWith('%')) {
				if(sidePair) {
					sidePair = sidePair.concat(`,`);
				}
				sidePair = sidePair.concat(`width-width%`);
			}

			let height = fgui.get_property(node, "height", "string", state);
			if(height && height.endsWith('%')) {
				if(sidePair) {
					sidePair = sidePair.concat(`,`);
				}
				sidePair = sidePair.concat(`height-height%`);
			}

			//解析坐标对齐
			let left = fgui.get_property(node, "left", "string", state);
			let right = fgui.get_property(node, "right", "string", state);
			if(left && right) {
				if(sidePair) {
					sidePair = sidePair.concat(`,`);
				}
				sidePair = sidePair.concat(`width-width`);
			}

			//解析居中
			let horizontalCenter = fgui.get_property(node, "horizontalCenter", "string", state);
			if(horizontalCenter) {
				if(sidePair) {
					sidePair = sidePair.concat(`,`);
				}
				sidePair = sidePair.concat(`center-center`);
			}
			let verticalCenter = fgui.get_property(node, "verticalCenter", "string", state);
			if(verticalCenter) {
				if(sidePair) {
					sidePair = sidePair.concat(`,`);
				}
				sidePair = sidePair.concat(`middle-middle`);
			}

			let top = fgui.get_property(node, "top", "string", state);
			let bottom = fgui.get_property(node, "bottom", "string", state);
			if(top && bottom) {
				if(sidePair) {
					sidePair = sidePair.concat(`,`);
				}
				sidePair = sidePair.concat(`height-height`);
			}

			if(sidePair){
				propertys["sidePair"] = sidePair;
			}

			const instance = node.getInstance();
			width = fgui._property_formater["int"](instance["width"]);
			height = fgui._property_formater["int"](instance["height"]);
			propertys["size"] = (width.toString().concat(",", height.toString()));
		},
		group:function(fgui:FGUI, propertys:Object, node: ENode, state:string) {
			propertys["group"] = fgui._current_group;
		},
		visible:function(fgui:FGUI, propertys:Object, node: ENode, state:string) {
			let value = fgui.get_property(node, "visible", "string", state);
			if(value && value.toString().toLowerCase() === "false") {
				propertys["visible"] = "false";
			}
		},
		color:function(fgui:FGUI, propertys:Object, node: ENode, state:string) {
			propertys["color"] = fgui.transform_color(node,{
				BitmapLabel:{default:"#FFFFFF"},
				Label:{param:"textColor", default:"#FFFFFF"},
			}, state);
		},
		strokeColor:function(fgui:FGUI, propertys:Object, node: ENode, state:string) {
			propertys["strokeColor"] = fgui.transform_color(node,{
				Label:{param:"strokeColor"},
			}, state);
		},
		type:function(fgui:FGUI, propertys:Object, node: ENode, state:string) {
			let name = node.getName();
			if(name === "Rect") {
				propertys["type"] = "rect";
			}else if(name === "Object") {
				propertys["type"] = node.getType();
			}
		},
		corner:function(fgui:FGUI, propertys:Object, node: ENode, state:string) {
			let name = node.getName();
			if(name === "Rect") {
				let ellipseWidth = fgui.get_property(node, 'ellipseWidth', 'int', state);
				if(ellipseWidth != 0) {
					propertys["corner"] = ellipseWidth;
					return;
				}

				let ellipseHeight = fgui.get_property(node, 'ellipseHeight', 'int', state);
				if(ellipseHeight) {
					propertys["corner"] = ellipseHeight;
					return;
				}
			}
		},
		mode:function(fgui:FGUI, propertys:Object, node: ENode, state:string) {
			let name = node.getName();
			switch(name) {
				case "RadioButton":
					propertys["mode"] = "Radio";
					break;
				case "CheckBox":
					propertys["mode"] = "Check";
					break;
			}
		},
		src:function(fgui:FGUI, propertys:Object, node: ENode, state:string) {
			propertys["src"] =  fgui.transform_src(node, state);
		},
		pkg:function(fgui:FGUI, propertys:Object, node: ENode, state:string) {
			propertys["pkg"] = fgui.transform_pkg(node, state);
		},
		fileName:function(fgui:FGUI, propertys:Object, node: ENode, state:string) {
			propertys["fileName"] = fgui.transform_fileName(node, state);
		},
		bold:function(fgui:FGUI, propertys:Object, node: ENode, state:string) {
			propertys["bold"] = fgui.get_property(node, "bold", "boolean", state);
		},
		text:function(fgui:FGUI, propertys:Object, node: ENode, state:string) {
			propertys["text"] = fgui.get_property(node, "text", "string", state);
		},
		value:function(fgui:FGUI, propertys:Object, node: ENode, state:string) {
			propertys["value"] = fgui.get_property(node, "value", "int", state);
		},
		alpha:function(fgui:FGUI, propertys:Object, node: ENode, state:string) {
			let key = "alpha";
			if(node.getName() === "Rect") {
				key = "fillAlpha";
			}
			propertys["alpha"] = fgui.get_property(node, key, "float", state);
		},
		italic:function(fgui:FGUI, propertys:Object, node: ENode, state:string) {
			propertys["italic"] = fgui.get_property(node, "italic", "boolean", state);
		},
		fontSize:function(fgui:FGUI, propertys:Object, node: ENode, state:string) {
			propertys["fontSize"] = fgui.get_property(node, "size", "int", state);
		},
		stroke:function(fgui:FGUI, propertys:Object, node: ENode, state:string) {
			propertys["stroke"] = fgui.get_property(node, "stroke", "int", state);
		},
		font:function(fgui:FGUI, propertys:Object, node: ENode, state:string) {
			if(node.getName() === "BitmapLabel") {
				let font = fgui.get_property(node, "font", "string", state);
				propertys["font"] = fgui.transform_url(font, "font");
			}else{
				propertys["font"] = fgui.get_property(node, "fontFamily", "string", state);
			}
		},
		textAlign:function(fgui:FGUI, propertys:Object, node: ENode, state:string) {
			propertys["textAlign"] = fgui.get_property(node, "align", "string", state);
		},
		minimum:function(fgui:FGUI, propertys:Object, node: ENode, state:string) {
			propertys["minimum"] = fgui.get_property(node, "minimum", "int", state);
		},
		maximum:function(fgui:FGUI, propertys:Object, node: ENode, state:string) {
			propertys["maximum"] = fgui.get_property(node, "maximum", "int", state);
		},
		rotation:function(fgui:FGUI, propertys:Object, node: ENode, state:string) {
			propertys["rotation"] = fgui.get_property(node, "rotation", "int", state);
		},
		touchable:function(fgui:FGUI, propertys:Object, node: ENode, state:string) {
			propertys["touchable"] = fgui.get_property(node, "touchEnabled", "boolean", state);
		},
		letterSpacing:function(fgui:FGUI, propertys:Object, node: ENode, state:string) {
			propertys["letterSpacing"] = fgui.get_property(node, "letterSpacing", "int", state);
		},
		skew:function(fgui:FGUI, propertys:Object, node: ENode, state:string) {
			let skewX = fgui.get_property(node, "skewX", "int", state);
			let skewY = fgui.get_property(node, "skewY", "int", state);
			if(skewX != 0 || skewY != 0) {
				propertys["skew"] = skewX.toString().concat(",", skewY);
			}
		},
		scale:function(fgui:FGUI, propertys:Object, node: ENode, state:string) {
			let scaleX = fgui.get_property(node, "scaleX", "float", state);
			let scaleY = fgui.get_property(node, "scaleY", "float", state);
			if(scaleX != 0 || scaleY != 0) {
				propertys["scale"] = scaleX.toString().concat(",", scaleY);
			}
		},
		restrictSize:function(fgui:FGUI, propertys:Object, node: ENode, state:string) {
			let minWidth = fgui.get_property(node, "minWidth", "int", state);
			let maxWidth = fgui.get_property(node, "maxWidth", "int", state);
			let minHeight = fgui.get_property(node, "minHeight", "int", state);
			let maxHeight = fgui.get_property(node, "maxHeight", "int", state);
			if(minWidth != 0 || maxWidth != 0 || minHeight != 0 || maxHeight != 0) {
				propertys["restrictSize"] = minWidth.toString().concat(",", maxWidth, ",", minHeight, ",", maxHeight);
			}
		},
		pivot:function(fgui:FGUI, propertys:Object, node: ENode, state:string) {
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
			if(width === 0 && fix_abled) {
				width = node.getInstance()["width"];
			}
			let height = fgui.get_property(node, "height", "int", state);
			if(height === 0 && fix_abled) {
				height = node.getInstance()["height"];
			}
			if(width > 0 && height > 0 && (anchorOffsetX != 0 || anchorOffsetY != 0)) {
				propertys["pivot"] = (anchorOffsetX / width).toFixed(3).toString().concat(",", (anchorOffsetY / height).toFixed(3));
			}
		},
		fillColor:function(fgui:FGUI, propertys:Object, node: ENode, state:string) {
			switch(node.getName()) {
				case "Rect": {
					let alpha = 255;
					let fillAlpha = fgui.get_property(node, "fillAlpha", "string", state);
					if(fillAlpha){
						alpha = Math.floor(Number.parseFloat(fillAlpha) * 255);
					}
					let color = fgui.get_property(node, "fillColor", "string", state);
					if(!color) {
						color = "0x000000";
					}
					propertys["fillColor"] = "#".concat(alpha.toString(16), color.substring(2));
				}
				break;
			}
		},
		lineColor:function(fgui:FGUI, propertys:Object, node: ENode, state:string) {
			switch(node.getName()) {
				case "Rect": {
					let alpha = Math.floor(fgui.get_property(node, "strokeAlpha", "float", state) * 255);
					if(alpha < 1) {
						return;
					}

					let color = fgui.get_property(node, "strokeColor", "string", state);
					if(!color) {
						return;
					}
					propertys["lineColor"] = "#".concat(alpha.toString(16), color.substring(1));
				}
				break;
			}
		},
		scale9Grid:function(fgui:FGUI, propertys:Object, node: ENode, state:string) {
			let key = fgui.get_property(node, "source", "string", state);
			if(!key) {
				return;
			}

			let scale9Grid = fgui.get_property(node, "scale9Grid", "string", state);
			if(!scale9Grid) {
				return;
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
		},
		grayed:function(fgui:FGUI, propertys:Object, node: ENode, state:string) {
			return;
		},
		autoSize:function(fgui:FGUI, propertys:Object, node: ENode, state:string) {
			switch(node.getName()) {
				case "Label":
				case "BitmapLabel":
					propertys["autoSize"] = "none";
					break;
			}
		},
		input:function(fgui:FGUI, propertys:Object, node: ENode, state:string) {
			switch(node.getName()) {
				case "EditableText":
					propertys["input"] = "true";
					break;
			}
		},
	};
	protected _processor = {
		//自定义预制件
		ns1:{
			default:{
				name_fix:"component",
				attributes_processor:{
					size:function(fgui:FGUI, propertys:Object, node: ENode, state:string) {
						const instance = node.getInstance();
						let width = fgui._property_formater["int"](instance["width"]);
						let height = fgui._property_formater["int"](instance["height"]);
						propertys["size"] = (width.toString().concat(",", height.toString()));
					},
				},
				post_processor:function(fgui:FGUI, space:string, node: ENode, state:string) : any {
					return {};
				},
			}
		},
		//普通控件或者Skin
		default:{
			Skin:{
				name_fix:"component",
				pre_processor:function(fgui:FGUI, space:string, node: ENode, state:string) : any {
					if(!node.getParent()) {
						let states = fgui.get_property(node, "states", "string", "");
						if(states) {
							fgui._states["default"] = states.split(",");
						}
					}
				},
				post_processor:function(fgui:FGUI, space:string, node: ENode, state:string) : any {
					//控制器
					let children = "";
					for (const key in fgui._states) {
						children = children.concat("\t", `<controller name="`, key, `" pages="`);
						let states = fgui._states[key];
						for(let index = 0; index < states.length; index++) {
							children = children.concat((index + 1).toString(), ",", states[index], ",");
						}
						children = children.substring(0, children.length - 1);
						children = children.concat(`" selected="0"/>\n`);
					}
					children = children.concat("\t<displayList>\n");
					children = children.concat(fgui.parse_children(space + "\t", node, state));
					children = children.concat("\t</displayList>\n");
					return {children:children};
				},
			},
			Group:{
				pre_processor:function(fgui:FGUI, space:string, node: ENode, state:string) : any {
					return {children:fgui.transform_group(space, node, state)};
				},
				post_processor:function(fgui:FGUI, space:string, node: ENode, state:string) : any {
					return {};
				},
			},
			Scroller:{
				pre_processor:function(fgui:FGUI, space:string, node: ENode, state:string) : any {
					return {children:fgui.transform_group(space, node, state)};
				},
				post_processor:function(fgui:FGUI, space:string, node: ENode, state:string) : any {
					return {};
				},
			},

			CheckBox:{
				name_fix:"component",
				post_processor:function(fgui:FGUI, space:string, node: ENode, state:string) : any {
					let content = "";
					content = content.concat(space, `\t<Button mode="Check"/>\n`);
					return {children:content};
				},
			},
			RadioButton:{
				name_fix:"component",
				post_processor:function(fgui:FGUI, space:string, node: ENode, state:string) : any {
					let content = "";
					content = content.concat(space, `\t<Button mode="Radio"/>\n`);
					return {children:content};
				},
			},

			List:{
				name_fix:"list",
				post_processor:function(fgui:FGUI, space:string, node: ENode, state:string) : any {
					return fgui.process_list(space, node, false, state);
				},
			},
			TabBar:{
				name_fix:"list",
				post_processor:function(fgui:FGUI, space:string, node: ENode, state:string) : any {
					return fgui.process_list(space, node, true, state);
				},
			},

			default:{
				//EUI->FGUI 组件名字转换逻辑
				name_fix:{
					Image:"image",
					Label:"text",
					Rect:"graph",
					List:"list",
					TabBar:"list",
					BitmapLabel:"text",
					EditableText:"text",
				},

				post_processor:function(fgui:FGUI, space:string, node: ENode, state:string) : any {
					return {children:fgui.parse_children(space, node, state)};
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
				return test === "true";
			}
			return false;
		},
	};
	
	protected get_property_string(node:ENode, key: string, state:string) : any {
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
		let attribute = this.get_property_string(node, key, state);
		switch(key) {
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

	protected build_gear_content(space, node: ENode, processor:Object) : string {
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
		let propertys = {};
		let gear_amount = {};
		const attributes_processor = processor["attributes_processor"];
		for (const gear in this._gear_config) {
			let config = this._gear_config[gear];
			let params = config.params;
			let default_value = "";
			for(let index = 0; index < params.length; index++) {
				const key = params[index];
				let processor_item = this._attributes_processor[key];
				if(attributes_processor && attributes_processor[key]) {
					processor_item = attributes_processor[key];
				}
				processor_item(this, propertys, node, "");
				let value = propertys[key];
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
						const key = params[index];
						let processor_item = this._attributes_processor[key];
						if(attributes_processor && attributes_processor[key]) {
							processor_item = attributes_processor[key];
						}
						processor_item(this, propertys, node, state_chunk);
						let value = propertys[key];
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
				if(array.localName === "Array") {
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

	protected process_list(space:string, node: ENode, tabbar:boolean, state:string) : any {
		let tag:sax.Tag = node.getXml();
		let property = this.build_property_xml("defaultItem", this.transform_url(tag.attributes["itemRendererSkinName"], "component"));

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
							if(element.localName === "HorizontalLayout") {
								property = property.concat(this.build_property_xml("layout", "row"));
							}else if(element.localName === "VerticalLayout") {
								property = property.concat(this.build_property_xml("layout", "column"));
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

			property.concat(` selectionController="`, idtest, `"`);
		}
		return {property:property, children:list_content};
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
		if(name === "Image") {
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
		if(name === "Image") {
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
		if(name === "Image") {
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

	protected transform_group(space:string, node: ENode, state:string) : string {
		let content = "";
		let group_prev = this._current_group;
		let id = this.get_property(node, "id", "string", null);
		let id_index = 0;
		while(!id || this._groups[id]) {
			id_index = id_index + 1;
			id = "group_generated_" + id_index;
		}
		if(id_index > 0) {
			node.getXml().attributes["id"] = id;
		}

		//生成Group数据
		let group = {};
		group["id"] = id;
		group["x"] = this.get_property(node, "x", "int", null);
		group['y'] = this.get_property(node, "y", "int", null);
		group["group"] = group_prev;
		this._groups[id] = group;

		//解析子节点
		this._current_group = id;
		let child_count = this.get_child_count(node);
		if(child_count > 0) {
			let container = node as EContainer;
			for (let index = 0; index < child_count; index++) {
				const child = container.getNodeAt(index) as ENode;
				if(child) {
					content = content.concat(this.build_component(space, child, state));
				}
			}
		}
		//添加Group信息
		let group_content = space.concat(`<group id="`, id, `" name="`, id, `" xy="`, group["x"], `,`, group["y"], `" group="`, group["group"], `" advanced="true"`);
		let gear = this.build_gear_content(space, node, this._processor.default.Group);
		if(gear){
			group_content = group_content.concat(`>\n`, space, `\t`, gear, space, `</group>\n`);
		}else{
			group_content = group_content.concat(`/>\n`);
		}
		this._current_group = group_prev;
		return content.concat(group_content);
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
				if(filename === "package.xml") {
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
			if(child && child.name === "resources") {
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
		this._states = {};
		this._groups = {};
		this._current_group = "";
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
			let comment_name = "";
			let name_fix = processor.name_fix;
			if(name_fix) {
				if(typeof(name_fix) === "string") {
					comment_name = name_fix;
				}else if(name_fix[name]){
					comment_name = name_fix[name];
				}
			}

			let gear = "";
			let sidePair = "";
			let pre_content = null;
			let pre_processor = processor.pre_processor;
			if(pre_processor) {
				pre_content = pre_processor(this, space, node, state);
			}

			if(comment_name) {
				content = content.concat(space, "<", comment_name);

				//遍历属性
				let propertys = {};
				const attributes_processor = processor["attributes_processor"];
				for (const key in this._attributes_processor) {
					let processor_item = this._attributes_processor[key];
					if(attributes_processor && attributes_processor[key]) {
						processor_item = attributes_processor[key];
					}
					processor_item(this, propertys, node, "");
				}
				sidePair = propertys["sidePair"];
				propertys["sidePair"] = null;

				let property = "";
				for (const key in propertys) {
					let element = propertys[key];
					if(key === "id" || key === "name" || element) {
						property = property.concat(' ', key, '="', element, '"');
					}
				}
				if(property){
					content = content.concat(property);
				}

				//处理多控制器情况
				gear = this.build_gear_content(space, node, processor);
			}

			//后处理
			let result = processor.post_processor(this, space, node, state);
			if(pre_content && pre_content.property) {
				content = content.concat(pre_content.property);
			}
			if(result.property) {
				content = content.concat(result.property);
			}

			if((pre_content && pre_content.children) || result.children || sidePair || gear) {
				if(comment_name) {
					content = content.concat(">\n");
				}
				
				if(sidePair) {
					content = content.concat(space, `\t`, `<relation target="" sidePair="`, sidePair, `"/>\n`);
				}

				if(gear) {
					content = content.concat(gear);
				}

				if(pre_content && pre_content.children) {
					content = content.concat(pre_content.children);
				}

				if(result.children) {
					content = content.concat(result.children);
				}

				if(comment_name) {
					content = content.concat(space, "</", comment_name, ">\n");
				}
			}else if(comment_name){
				content = content.concat("/>\n");
			}
		}
		return content;
	}
}