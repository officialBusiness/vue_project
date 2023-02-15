
export default {
	type: 'text',
	toDom(obj){
		if( obj.data.indexOf('\\n') > -1 ){
			console.error(data);
			throw new Error('text 内存在换行信息');
		}
		if( obj.data === ' ' ){
			console.error('存在空字符串');
		}
		return this.nodeApi.createTextNode(obj.data);
	},
	toObj(dom){
		return {
			type: "text",
			data: dom.nodeValue
		}
	}
}