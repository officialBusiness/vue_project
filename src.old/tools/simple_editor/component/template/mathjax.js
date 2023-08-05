export default {
	type: 'mathjax',
	toDom(obj){
		if( obj.style ){
			// console.log('obj:', obj);
			delete obj.style.height;
		}
		return this.nodeApi.createDom({
			nodeName: 'img',
			attributes: {
				class: 'mathjax',
				tex: obj.data,
				src: "data:image/svg+xml;base64," + 
					btoa( unescape(encodeURIComponent(
						new XMLSerializer().serializeToString(
							MathJax.tex2svg(obj.data).childNodes[0] 
						)
					) )	),
			},
			style: {
				... obj.style,
		    'max-height': obj.style && obj.style.display ? 'initial' : null
			},
		})
	},
	toObj(dom){
		let obj = {
				type: 'mathjax',
				data: dom.getAttribute("tex"),
			},
			style = this.nodeApi.getNodeStyle(dom);
		if( style ){
			obj.style = style;
		}
		return obj;
	}
}