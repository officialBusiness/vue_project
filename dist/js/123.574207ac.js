"use strict";(self["webpackChunkvue_project"]=self["webpackChunkvue_project"]||[]).push([[123],{7123:function(e,t,i){i.r(t),i.d(t,{default:function(){return m}});var l=function(){var e=this,t=e._self._c;return t("div",{staticClass:"tool-glsl_to_js"},[t("div",{staticClass:"operation"},[t("div",{staticClass:"button import"},[e._v(" 导入 glsl 文件 "),t("input",{attrs:{type:"file",webkitdirectory:"true"},on:{change:e.readJlslFiles}})]),e.loadOver?t("div",{staticClass:"button export",on:{mousedown:e.exportJsFiles}},[e._v(" 导出 js 文件 ")]):e._e()]),t("div",{staticClass:"title"},[e._v("文件树")]),t("div",{staticClass:"file_tree"},[e.filesTree?t("v-file_node",{attrs:{fileNode:e.filesTree}}):e._e()],1),t("div",{staticClass:"empty"})])},s=[];i(7658),i(541);function n(e,t,i=(()=>{})){let l=null,s={},n=0;for(let r=0;r<e.length;r++){let o,a=e[r],f=a.webkitRelativePath.split("/"),c=new FileReader,d="";f.forEach(((r,f,h)=>{if(d+=`/${r}`,f===h.length-1){let l=r.split(".");if("glsl"===l[1]){let s={fullName:r,name:l[0],jsName:l[0]+".js"};c.readAsText(a),o.files.push(s),c.onload=function(l){t(s,c.result),n++,n===e.length&&i()}}else n++}else if(0===f)l||(l={name:r,files:[]}),o=l;else{let e;if(void 0===s[d]){let t={name:r,files:[]};e=s[d]=0,o.files.unshift(t),o=t}else e=s[d],o=o.files[e]}}))}return l}var r=function(){var e=this,t=e._self._c;return t("div",{staticClass:"component-file-node"},[t("div",{staticClass:"node-content"},[t("div",{class:{expand:!0,leaf:e.isLeaf,expanded:e.isExpand&&!e.isLeaf},on:{mousedown:e.handleExpand}},[e._v(" › ")]),t("div",{staticClass:"label"},[e._v(e._s(e.fileNode.name))]),t("div",{staticClass:"btns"},[t("div",{staticClass:"btn"},[e.fileNode.files?t("div",{staticClass:"iconfont icon-output",attrs:{title:"导出js文件"},on:{mousedown:function(t){return t.stopPropagation(),e.exportJSFiles(e.fileNode)}}}):e._e()])])]),e.isLeaf?e._e():t("div",{ref:"children",staticClass:"children"},e._l(e.fileNode.files,(function(e){return t("component-file-node",{key:e.name,attrs:{fileNode:e}})})),1)])},o=[],a={name:"component-file-node",props:{fileNode:{type:Object}},data(){return{isLeaf:!this.fileNode.files||0===this.fileNode.files.length,isExpand:!0}},methods:{handleExpand(){if(this.isLeaf)return;let e;this.isExpand=!this.isExpand,this.isExpand?(this.$refs.children.style.height=null,e=this.$refs.children.clientHeight,this.$refs.children.style.height=0,setTimeout((()=>{this.$refs.children.style.height=`${e}px`}),0),setTimeout((()=>{this.$refs.children.style.height=null}),300)):(e=this.$refs.children.clientHeight,this.$refs.children.style.height=`${e}px`,setTimeout((()=>{this.$refs.children.style.height=0}),0))},exportJSFiles(e){if(console.log("node:",e),e.files){let t="",i=[];function l(e,s="."){e.file?(t+=`import czm_${e.name} from '${s}.js';\n`,i.push(`czm_${e.name}`)):e.files&&e.files.forEach((e=>{l(e,`${s}/${e.name}`)}))}l(e),t+=`\nexport default {\n\t${i.join(",\n\t")}\n}`;let s=document.createElement("a"),n=document.createEvent("MouseEvents");n.initEvent("click",!1,!1);let r=new Blob([t]);s.href=URL.createObjectURL(r),s.download="CzmBuiltins.js",s.dispatchEvent(n)}}},mounted(){}},f=a,c=i(1001),d=(0,c.Z)(f,r,o,!1,null,null,null),h=d.exports,u={components:{"v-file_node":h},data(){return{filesTree:null,loadOver:!1}},methods:{readJlslFiles(e){this.filesTree=n(e.target.files,((e,t)=>{t.replaceAll("`","'"),e.file="export default `"+t+"`"}),(()=>{this.loadOver=!0}))},exportJsFiles(){var e=new JSZip;this.zipFile(e,this.filesTree),e.generateAsync({type:"blob"}).then((function(e){let t=document.createElement("a"),i=document.createEvent("MouseEvents");i.initEvent("click",!1,!1);let l=new Blob([e]);t.href=URL.createObjectURL(l),t.download="js.zip",t.dispatchEvent(i)}))},zipFile(e,t){t.files.forEach((t=>{t.file?e.file(t.jsName,t.file):t.files&&this.zipFile(e.folder(t.name),t)}))}}},p=u,v=(0,c.Z)(p,l,s,!1,null,null,null),m=v.exports},5117:function(e,t,i){var l=i(6330),s=TypeError;e.exports=function(e,t){if(!delete e[t])throw s("Cannot delete property "+l(t)+" of "+l(e))}},541:function(e,t,i){var l=i(2109),s=i(7908),n=i(6244),r=i(3658),o=i(5117),a=i(7207),f=1!==[].unshift(0),c=!function(){try{Object.defineProperty([],"length",{writable:!1}).unshift()}catch(e){return e instanceof TypeError}}();l({target:"Array",proto:!0,arity:1,forced:f||c},{unshift:function(e){var t=s(this),i=n(t),l=arguments.length;if(l){a(i+l);var f=i;while(f--){var c=f+l;f in t?t[c]=t[f]:o(t,c)}for(var d=0;d<l;d++)t[d]=arguments[d]}return r(t,i+l)}})}}]);
//# sourceMappingURL=123.574207ac.js.map