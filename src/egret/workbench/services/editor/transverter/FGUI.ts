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
	protected _groups = null;
	protected _states = null;
	protected _cur_group = "";
	protected _attributes_processor = {
		id:function(fgui:FGUI, propertys:Object, node: ENode, state:string) : any {
			let value = fgui.get_property(node, "id", "string", state);
			return fgui.set_attribute(propertys, "id", value ? value : node.getName());
		},
		name:function(fgui:FGUI, propertys:Object, node: ENode, state:string) : any {
			return fgui.set_attribute(propertys, "name", fgui.get_property(node, "id", "string", state));
		},
		xy:function(fgui:FGUI, propertys:Object, node: ENode, state:string) : any {
			let x = 0;
			let y = 0;
			if(node.getName() != "Group") {
				let group = fgui._groups[fgui._cur_group];
				while(group) {
					x = x + group["x"];
					y = y + group["y"];
					group = fgui._groups[group["group"]];
				}
			}
			x = x + fgui.get_property(node, "x", "int", state);
			y = y + fgui.get_property(node, "y", "int", state);
			return fgui.set_attribute(propertys, "xy", x.toString() + ',' + y.toString());
		},
		size:function(fgui:FGUI, propertys:Object, node: ENode, state:string) : any {
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
				propertys = fgui.set_attribute(propertys, "relation", sidePair);
			}

			const instance = node.getInstance();
			width = fgui._property_formater["int"](instance["width"]);
			height = fgui._property_formater["int"](instance["height"]);
			return fgui.set_attribute(propertys, "size", (width.toString().concat(",", height.toString())));
		},
		group:function(fgui:FGUI, propertys:Object, node: ENode, state:string) : any {
			return fgui.set_attribute(propertys, "group", fgui._cur_group);
		},
		visible:function(fgui:FGUI, propertys:Object, node: ENode, state:string) : any {
			let value = fgui.get_property(node, "visible", "string", state);
			if(value && value.toString().toLowerCase() === "false") {
				propertys = fgui.set_attribute(propertys, "visible", "false");
			}else if(state){
				let includeIn = fgui.get_property(node, "includeIn", "string", "");
				if(includeIn) {
					let splits = includeIn.split(',');
					if(splits.indexOf(state) < 0) {
						propertys = fgui.set_attribute(propertys, "visible", "false");
					}
				}
			}
			return propertys;
		},
		color:function(fgui:FGUI, propertys:Object, node: ENode, state:string) : any {
			let color = "";
			switch(node.getName()){
				case "BitmapLabel":{
					color = "0xffffff";
				}
				break;

				case "Label":{
					color = fgui.get_property(node, "textColor", "string", state);
					if(!color){
						color = "0xffffff";
					}
				}
				break;
			}
			return fgui.set_attribute(propertys, "color", fgui.transform_color(color));
		},
		strokeColor:function(fgui:FGUI, propertys:Object, node: ENode, state:string) : any {
			switch(node.getName()){
				case "Label":{
					let borderColor = fgui.get_property(node, "borderColor", "string", state);
					if(!borderColor){
						let stroke = fgui.get_property(node, "stroke", "int", state);
						if(stroke){
							borderColor = "0x000000";
						}
					}
					return fgui.set_attribute(propertys, "strokeColor", fgui.transform_color(borderColor));
				}
			}
			return fgui.set_attribute(propertys, "strokeColor", fgui.transform_color(fgui.get_property(node, "strokeColor", "string", state)));
		},
		type:function(fgui:FGUI, propertys:Object, node: ENode, state:string) : any {
			let name = node.getName();
			if(name === "Rect") {
				propertys = fgui.set_attribute(propertys, "type", "rect");
			}else if(name === "Object") {
				propertys = fgui.set_attribute(propertys, "type", node.getType());
			}
			return propertys;
		},
		corner:function(fgui:FGUI, propertys:Object, node: ENode, state:string) : any {
			let name = node.getName();
			if(name === "Rect") {
				let ellipseWidth = fgui.get_property(node, 'ellipseWidth', 'int', state);
				if(ellipseWidth != 0) {
					return fgui.set_attribute(propertys, "corner", ellipseWidth);
				}

				let ellipseHeight = fgui.get_property(node, 'ellipseHeight', 'int', state);
				if(ellipseHeight) {
					return fgui.set_attribute(propertys, "corner", ellipseHeight);
				}
			}
			return propertys;
		},
		mode:function(fgui:FGUI, propertys:Object, node: ENode, state:string) : any {
			let name = node.getName();
			switch(name) {
				case "RadioButton":
					return fgui.set_attribute(propertys, "mode", "Radio");
				case "CheckBox":
					return fgui.set_attribute(propertys, "mode", "Check");
			}
			return propertys;
		},
		src:function(fgui:FGUI, propertys:Object, node: ENode, state:string) : any {
			return fgui.set_attribute(propertys, "src", fgui.transform_src(node, state));
		},
		pkg:function(fgui:FGUI, propertys:Object, node: ENode, state:string) : any {
			return fgui.set_attribute(propertys, "pkg", fgui.transform_pkg(node, state));
		},
		fileName:function(fgui:FGUI, propertys:Object, node: ENode, state:string) : any {
			return fgui.set_attribute(propertys, "fileName", fgui.transform_fileName(node, state));
		},
		bold:function(fgui:FGUI, propertys:Object, node: ENode, state:string) : any {
			return fgui.set_attribute(propertys, "bold", fgui.get_property(node, "bold", "boolean", state));
		},
		text:function(fgui:FGUI, propertys:Object, node: ENode, state:string) : any {
			return fgui.set_attribute(propertys, "text", fgui.get_property(node, "text", "string", state));
		},
		value:function(fgui:FGUI, propertys:Object, node: ENode, state:string) : any {
			return fgui.set_attribute(propertys, "value", fgui.get_property(node, "value", "int", state));
		},
		alpha:function(fgui:FGUI, propertys:Object, node: ENode, state:string) : any {
			let key = "alpha";
			if(node.getName() === "Rect") {
				key = "fillAlpha";
			}
			return fgui.set_attribute(propertys, "alpha", fgui.get_property(node, key, "float", state));
		},
		italic:function(fgui:FGUI, propertys:Object, node: ENode, state:string) : any {
			return fgui.set_attribute(propertys, "italic", fgui.get_property(node, "italic", "boolean", state));
		},
		fontSize:function(fgui:FGUI, propertys:Object, node: ENode, state:string) : any {
			if(node.getName() === "Label"){
				return fgui.set_attribute(propertys, "fontSize", node.getInstance()["size"]);
			}
			return fgui.set_attribute(propertys, "fontSize", fgui.get_property(node, "size", "int", state));
		},
		font:function(fgui:FGUI, propertys:Object, node: ENode, state:string) : any {
			if(node.getName() === "BitmapLabel") {
				let font = fgui.get_property(node, "font", "string", state);
				return fgui.set_attribute(propertys, "font", fgui.transform_url(font, "font"));
			}else{
				return fgui.set_attribute(propertys, "font", fgui.get_property(node, "fontFamily", "string", state));
			}
			return propertys;
		},
		align:function(fgui:FGUI, propertys:Object, node: ENode, state:string) : any {
			return fgui.set_attribute(propertys, "align", fgui.get_property(node, "textAlign", "string", state));
		},
		vAlign:function(fgui:FGUI, propertys:Object, node: ENode, state:string) : any {
			return fgui.set_attribute(propertys, "vAlign", fgui.get_property(node, "verticalAlign", "string", state));
		},
		minimum:function(fgui:FGUI, propertys:Object, node: ENode, state:string) : any {
			return fgui.set_attribute(propertys, "minimum", fgui.get_property(node, "minimum", "int", state));
		},
		maximum:function(fgui:FGUI, propertys:Object, node: ENode, state:string) : any {
			return fgui.set_attribute(propertys, "maximum", fgui.get_property(node, "maximum", "int", state));
		},
		rotation:function(fgui:FGUI, propertys:Object, node: ENode, state:string) : any {
			return fgui.set_attribute(propertys, "rotation", fgui.get_property(node, "rotation", "int", state));
		},
		touchable:function(fgui:FGUI, propertys:Object, node: ENode, state:string) : any {
			return fgui.set_attribute(propertys, "touchable", fgui.get_property(node, "touchEnabled", "boolean", state));
		},
		letterSpacing:function(fgui:FGUI, propertys:Object, node: ENode, state:string) : any {
			return fgui.set_attribute(propertys, "letterSpacing", fgui.get_property(node, "letterSpacing", "int", state));
		},
		skew:function(fgui:FGUI, propertys:Object, node: ENode, state:string) : any {
			let skewX = fgui.get_property(node, "skewX", "int", state);
			let skewY = fgui.get_property(node, "skewY", "int", state);
			if(skewX != 0 || skewY != 0) {
				propertys = fgui.set_attribute(propertys, "skew", skewX.toString().concat(",", skewY));
			}
			return propertys;
		},
		scale:function(fgui:FGUI, propertys:Object, node: ENode, state:string) : any {
			let scaleX = fgui.get_property(node, "scaleX", "float", state);
			let scaleY = fgui.get_property(node, "scaleY", "float", state);
			if(scaleX != 0 || scaleY != 0) {
				return fgui.set_attribute(propertys, "scale", scaleX.toString().concat(",", scaleY));
			}
			return propertys;
		},
		restrictSize:function(fgui:FGUI, propertys:Object, node: ENode, state:string) : any {
			let minWidth = fgui.get_property(node, "minWidth", "int", state);
			let maxWidth = fgui.get_property(node, "maxWidth", "int", state);
			let minHeight = fgui.get_property(node, "minHeight", "int", state);
			let maxHeight = fgui.get_property(node, "maxHeight", "int", state);
			if(minWidth != 0 || maxWidth != 0 || minHeight != 0 || maxHeight != 0) {
				return fgui.set_attribute(propertys, "restrictSize", minWidth.toString().concat(",", maxWidth, ",", minHeight, ",", maxHeight));
			}
			return propertys;
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
				return fgui.set_attribute(propertys, "pivot", (anchorOffsetX / width).toFixed(3).toString().concat(",", (anchorOffsetY / height).toFixed(3)));
			}
			return propertys;
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
					return fgui.set_attribute(propertys, "fillColor", "#".concat(alpha.toString(16), color.substring(2)));
				}
				break;
			}
			return propertys;
		},
		lineColor:function(fgui:FGUI, propertys:Object, node: ENode, state:string) {
			switch(node.getName()) {
				case "Rect": {
					let alpha = Math.floor(fgui.get_property(node, "strokeAlpha", "float", state) * 255);
					if(alpha > 0) {
						let color = fgui.get_property(node, "strokeColor", "string", state);
						if(color) {
							return fgui.set_attribute(propertys, "lineColor", "#".concat(alpha.toString(16), color.substring(1)));
						}
					}
				}
				break;
			}
			return propertys;
		},
		scale9Grid:function(fgui:FGUI, propertys:Object, node: ENode, state:string) {
			let key = fgui.get_property(node, "source", "string", state);
			if(key) {
				let scale9Grid = fgui.get_property(node, "scale9Grid", "string", state);
				if(scale9Grid) {
					let package_data = fgui.find_package(key, "image");
					if(package_data) {
						let xml = package_data.image[key].xml;
						if(!xml.attributes["scale9grid"]) {
							package_data.dirty = true;
							xmlTagUtil.setAttribute(xml, "scale", "9grid");
							xmlTagUtil.setAttribute(xml, "scale9grid", scale9Grid);
						}
					}
				}
			}
			return propertys;
		},
		grayed:function(fgui:FGUI, propertys:Object, node: ENode, state:string) {
			return propertys;
		},
		autoSize:function(fgui:FGUI, propertys:Object, node: ENode, state:string) {
			switch(node.getName()) {
				case "Label":
				case "BitmapLabel":
					return fgui.set_attribute(propertys, "autoSize", "none");
			}
			return propertys;
		},
		input:function(fgui:FGUI, propertys:Object, node: ENode, state:string) {
			switch(node.getName()) {
				case "EditableText":
					return fgui.set_attribute(propertys, "input", "true");
			}
			return propertys;
		},
		defaultItem:function(fgui:FGUI, propertys:Object, node: ENode, state:string) {
			return fgui.set_attribute(propertys, "defaultItem", fgui.transform_url(fgui.get_property(node, "itemRendererSkinName", "string", state), "component"));
		},
	};
	protected _processor = {
		//自定义预制件
		ns1:{
			default:{
				name_fix:"component",
				post_processor:function(fgui:FGUI, content_data:Object, node: ENode) {
					let content = content_data["content"];
					let propertys = content_data["propertys"]["_"];
					if(!propertys["src"]) {
						content_data["component"] = "loader";
					}
					content = content.concat(fgui.parse_children(content_data, node));
					content_data["content"] = content;
					return fgui.content_data_tostring(content_data);
				},
			}
		},
		//普通控件或者Skin
		default:{
			Skin:{
				name_fix:"component",
				pre_processor:function(fgui:FGUI, content_data:Object, node: ENode) {
					if(!node.getParent()) {
						let states = fgui.get_property(node, "states", "string", "");
						if(states) {
							fgui._states["default"] = states.split(",");
						}
					}
				},
				post_processor:function(fgui:FGUI, content_data:Object, node: ENode) : string {
					//控制器
					let content = "";
					for (const key in fgui._states) {
						content = content.concat("\t", `<controller name="`, key, `" pages="`);
						let states = fgui._states[key];
						for(let index = 0; index < states.length; index++) {
							content = content.concat((index + 1).toString(), ",", states[index], ",");
						}
						content = content.substring(0, content.length - 1);
						content = content.concat(`" selected="0"/>\n`);
					}
					content = content.concat("\t<displayList>\n");
					let space = content_data["space"];
					content_data["space"] = space + "\t";
					content = content.concat(fgui.parse_children(content_data, node));
					content_data["space"] = space;
					content = content.concat("\t</displayList>\n");
					content_data["content"] = content;
					return fgui.content_data_tostring(content_data);
				},
			},
			Group:{
				pre_processor:function(fgui:FGUI, content_data:Object, node: ENode){
					fgui.pre_process_group(content_data, node);
				},
				post_processor:function(fgui:FGUI, content_data:Object, node: ENode) : string{
					return fgui.post_process_group(content_data, node);
				},
			},
			Scroller:{
				pre_processor:function(fgui:FGUI, content_data:Object, node: ENode) {
					fgui.pre_process_group(content_data, node);
				},
				post_processor:function(fgui:FGUI, content_data:Object, node: ENode) : string{
					return fgui.post_process_group(content_data, node);
				},
			},

			CheckBox:{
				name_fix:"component",
				post_processor:function(fgui:FGUI, content_data:Object, node: ENode) : string {
					content_data["content"] = content_data["content"].concat(content_data["space"], `\t<Button mode="Check"/>\n`);
					return fgui.content_data_tostring(content_data);
				},
			},
			RadioButton:{
				name_fix:"component",
				post_processor:function(fgui:FGUI, content_data:Object, node: ENode) : string {
					content_data["content"] = content_data["content"].concat(content_data["space"], `\t<Button mode="Radio"/>\n`);
					return fgui.content_data_tostring(content_data);
				},
			},

			List:{
				name_fix:"list",
				post_processor:function(fgui:FGUI, content_data:Object, node: ENode) : string {
					return fgui.process_list(content_data, node);
				},
			},
			TabBar:{
				name_fix:"list",
				post_processor:function(fgui:FGUI, content_data:Object, node: ENode) : string {
					content_data["tabbar"] = true;
					return fgui.process_list(content_data, node);
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

				post_processor:function(fgui:FGUI, content_data:Object, node: ENode) : string {
					let content = content_data["content"];
					content = content.concat(fgui.parse_children(content_data, node));
					content_data["content"] = content;
					return fgui.content_data_tostring(content_data);
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
		return this._property_formater[type](this.get_property_string(node, key, state));
	}

	protected _gear_config = {
		gearXY:{params:["xy"],default:["0,0"]},
		gearSize:{params:["size","scale"], default:["0,0","1,1"]},
		gearColor:{params:["color"], default:["#ffffff"]},
		gearLook:{params:["alpha","rotation","grayed","touchable"], default:["1","0","0","0"]},
	};

	protected _gear_attributes_define = {
		relation:function(fgui:FGUI, content_data:Object) : string {
			let attributes = content_data["propertys"]["_"];
			if(!attributes){
				return null;
			}
			let relation = attributes["relation"];
			if(!relation) {
				return null;
			}
			return content_data["space"].concat(`\t<relation target="" sidePair="`, relation, `"/>\n`);
		},
		gearXY:function(fgui:FGUI, content_data:Object) : string {
			return fgui.build_gear_item("gearXY", content_data, ["xy"], ["0,0"]);
		},
		gearSize:function(fgui:FGUI, content_data:Object) : string {
			return fgui.build_gear_item("gearSize", content_data, ["size","scale"], ["0,0","1,1"]);
		},
		gearColor:function(fgui:FGUI, content_data:Object) : string {
			return fgui.build_gear_item("gearColor", content_data, ["color"], ["#ffffff"]);
		},
		gearLook:function(fgui:FGUI, content_data:Object) : string {
			return fgui.build_gear_item("gearLook", content_data, ["alpha","rotation","grayed","touchable"], ["1","0","0","0"]);
		},
	};

	protected check_gear(content_data:Object, names:Array<string>, defs:Array<string>) : boolean {
		let propertys = content_data["propertys"];
		let propertys_default = propertys["_"];
		for (const state_name in this._states) {
			if(state_name === "default") {
				continue;
			}

			this._states[state_name].forEach(state_item => {
				let key = state_name.concat('_', state_item);
				let propertys_item = propertys[key]
				if(propertys_item) {
					for(let i = 0; i < names.length; i ++) {
						let name = names[i];
						let val0 = propertys_item[name];
						val0 = val0 ? val0 : defs[i];
						let val1 = propertys_default[name];
						val1 = val1 ? val1 : defs[i];
						if(val0 !== val1){
							return true;
						}
					}
				}
			});
		}
		return false;
	}

	protected build_gear_item(gear_name:string, content_data:Object, names:Array<string>, defs:Array<string>) : string {
		if(!this.check_gear(content_data, names, defs)) {
			return null;
		}

		let gear_count = 0;
		let gear_content = "";
		let space = content_data["space"];
		let propertys = content_data["propertys"];
		let propertys_default = propertys["_"];
		for (const state_name in this._states) {
			if(state_name === "default") {
				continue;
			}

			let item_names = "";
			let gear_content_state0 = "";
			let gear_content_state1 = "";
			this._states[state_name].forEach(state_item => {
				let content0 = "";
				let content1 = "";
				let key = state_name.concat('_', state_item);
				let propertys_item = propertys[key]
				if(propertys_item) {
					for(let i = 0; i < names.length; i ++) {
						let name = names[i];
						let val0 = propertys_item[name];
						val0 = val0 ? val0 : defs[i];
						content0 = content0.concat(val0, ",");
						let val1 = propertys_default[name];
						val1 = val1 ? val1 : defs[i];
						content1 = content1.concat(val1, ",");
					}
				}

				if(content0 !== content1) {
					item_names = item_names.concat(state_item, ",");
					content0 = content0.substring(0, content0.length - 1);
					gear_content_state0 = gear_content_state0.concat(content0, "|");
					content1 = content1.substring(0, content1.length - 1);
					gear_content_state1 = gear_content_state1.concat(content1, "|");
				}
			});

			if(item_names) {
				let count = gear_count > 0 ? gear_count.toString() : "";
				item_names = item_names.substring(0, item_names.length - 1);
				gear_content_state0 = gear_content_state0.substring(0, gear_content_state0.length - 1);
				gear_content_state1 = gear_content_state1.substring(0, gear_content_state1.length - 1);
				gear_content = gear_content.concat(space, `\t<`, gear_name, count, ` controller="`, state_name, 
				`" pages="`,item_names, `" values="`, gear_content_state0, `" default="`, gear_content_state1, `"/>\n`);
			}
		}
		return gear_content;
	}

	protected build_gear_content(content_data:Object) : string {
		let content = "";
		for (const key in this._gear_attributes_define) {
			let gear_item = this._gear_attributes_define[key](this, content_data);
			if(gear_item){
				content = content.concat(gear_item);
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

	protected process_list(content_data:Object, node: ENode) : any {
		let tag:sax.Tag = node.getXml();
		let space = content_data["space"];
		let tabbar = content_data["tabbar"];
		let content = content_data["content"];
		let propertys = content_data["propertys"]["_"];

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
								propertys["layout"] = "row";
							}else if(element.localName === "VerticalLayout") {
								propertys["layout"] = "column";
							}
						}
					}
					break;

					case "ArrayCollection": {
						content = content.concat(this.process_collection(space, node, child, process_collection_handler));
					}
					break;
				}
			});
		}

		if(tabbar_control_size > 0) {
			//添加TabBar独占控制器
			let id = this.get_property(node, "id", "string", "");
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
			propertys["selectionController"] = idtest;
		}
		content_data["content"] = content;
		return this.content_data_tostring(content_data);
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
			}else{
				skin = "";
			}
		}
		return skin;
	}

	protected transform_url(resname:string, type:string) : string {
		resname = this.transform_skin_name(resname);
		let package_data = this.find_package(resname, type);
		return package_data ? `ui://`.concat(package_data.id, package_data[type][resname].src) : `ui://`.concat(resname);
	}

	protected transform_color(color:string) : string {
		if(color){
			return "#" + color.substring(2);
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

	protected pre_process_group(content_data:Object, node: ENode) {
		content_data["pre_group"] = this._cur_group;
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
		group["group"] = content_data["pre_group"];
		this._groups[id] = group;
		content_data["cur_group"] = id;
	}

	protected post_process_group(content_data:Object, node: ENode) : string {
		let space = content_data["space"];
		let content = content_data["content"];
		let attributes = content_data["propertys"]["_"];
		attributes["advanced"] = true;
		let gear_content = this.build_gear_content(content_data);
		this._cur_group = content_data["cur_group"];
		content = content.concat(this.parse_children(content_data, node));
		this._cur_group = content_data["pre_group"];
		let group_content = space.concat(`<group `, this.build_attribute_content(content_data));
		if(gear_content){
			group_content = group_content.concat(">\n");
			group_content = group_content.concat(gear_content);
			group_content = group_content.concat(space, `</group>\n`);
		}else{
			group_content = group_content.concat("/>\n");
		}
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
		this._cur_group = "";
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
		xml = xml.concat(this.build_component("", model.getRootNode() as ENode));
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

	protected parse_children(content_data:Object, node: ENode) : string {
		let content = "";
		let space = content_data["space"];
		if(content_data["component"]) {
			space = space + "\t";
		}
		let child_count = this.get_child_count(node);
		if(child_count > 0) {
			let container = node as EContainer;
			for (let index = 0; index < child_count; index++) {
				const child = container.getNodeAt(index) as ENode;
				if(child) {
					content = content.concat(this.build_component(space, child));
				}
			}
		}
		return content;
	}

	protected set_attribute(propertys:Object, key:string, value:any) : Object {
		if(value != null) {
			if(!propertys) {
				propertys = {};
			}
			propertys[key] = value;
		}
		return propertys;
	}

	protected parse_attributes(content_data:Object, node: ENode, processor) {
		let propertys = content_data["propertys"];
		const attributes_processor = processor["attributes_processor"];
		let parser = (state_name:string, state_item:string) => {
			let key = state_name.concat('_', state_item)
			let propertys_item = propertys[key];
			for (const key in this._attributes_processor) {
				let processor_item = this._attributes_processor[key];
				if(attributes_processor && attributes_processor[key]) {
					processor_item = attributes_processor[key];
				}
				propertys_item = processor_item(this, propertys_item, node, state_item);
			}
			propertys[key] = propertys_item;
		};

		parser("", "");	//获取默认属性
		if(node.hasMutipleStates()) {
			for (const state_name in this._states) {
				let states = this._states[state_name];
				states.forEach(state_item => {
					parser(state_name, state_item);
				});
			}
		}
	}

	protected build_attribute_content(content_data:Object) : string {
		let attribute_content = null;
		let propertys = content_data["propertys"]["_"];
		if(propertys){
			attribute_content = "";
			for (const key in propertys) {
				if(this._gear_attributes_define[key]) {
					continue;
				}
				let val = propertys[key];
				if(!val && key !== "id" && key !== "name") {
					continue;
				}
				attribute_content = attribute_content.concat(' ', key, '="', val, '"');
			}
			return attribute_content;
		}
		return attribute_content;
	}

	protected content_data_tostring(content_data:Object) : string {
		let content = "";
		let space = content_data["space"];
		let component = content_data["component"];
		//生成属性文本内容
		if(component) {
			content = content.concat(space, "<", component,this.build_attribute_content(content_data));
			let gear_content = this.build_gear_content(content_data);
			if(content_data["content"] || gear_content){
				content = content.concat('>\n');
				content = content.concat(content_data["content"]);
				content = content.concat(gear_content);
				content = content.concat(space, `</`, component, ">\n");
			}else{
				content = content.concat('/>\n');
			}
		}else{
			if(content_data["content"]){
				content = content.concat(content_data["content"]);
			}
		}
		return content;
	}

	protected build_component(space:string, node: ENode) : string {
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

			//获取头信息
			let component = "";
			let name_fix = processor.name_fix;
			if(name_fix) {
				if(typeof(name_fix) === "string") {
					component = name_fix;
				}else if(name_fix[name]){
					component = name_fix[name];
				}
			}

			let content_data = {
				space:space,
				content:"",
				propertys:{},
				component:component,
			};

			if(processor.pre_processor) {
				processor.pre_processor(this, content_data, node);
			}
			this.parse_attributes(content_data, node, processor);
			return processor.post_processor(this, content_data, node);
		}
		return "";
	}
}