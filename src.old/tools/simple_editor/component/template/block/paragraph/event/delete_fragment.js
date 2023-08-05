
export default function deleteFragment(startContainer, startOffset, endContainer, endOffset){
	console.log('%c执行 deleteFragment', 'color: #000000; background-color: #ffffff');
	console.log('startContainer:', startContainer, '\nstartOffset:', startOffset, '\nendContainer:', endContainer, '\nendOffset:', endOffset);
	let { rangeApi, nodeApi } = this;
	if( startContainer && endContainer ){
		console.log('fragment 在 container 中');
		let container = nodeApi.getContainer(startContainer);
		if( rangeApi.isStartInContainer(startContainer, startOffset) ){
			console.log('startContainer 光标在 container 最前端');
			if( rangeApi.isEndInContainer(endContainer, endOffset) ){
				console.log('endContainer 光标在 container 最未端, 清空 container');
				rangeApi.setCollapsedRange(container, 0);
				nodeApi.emptyAllChild(container);
			}else{
				console.log('endContainer 光标不在 container 最未端');
				deleteStartFragment.call(this, container, endContainer, endOffset);
			}
		}else{
			console.log('startContainer 光标不在 container 最前端');
			if( rangeApi.isEndInContainer(endContainer, endOffset) ){
				console.log('endContainer 光标在 container 最未端');
				deleteEndFragment.call(this, container, startContainer, startOffset);
			}else{
				console.log('endContainer 光标不在 container 最未端');
				deleteCenterFragment.call(this, container, startContainer, startOffset, endContainer, endOffset);
			}
		}
	}else if( startContainer ){
		console.log('container 后半部分在 fragment 中, 需要选择 range');
		let container = nodeApi.getContainer(startContainer);
		if( rangeApi.isStartInContainer(startContainer, startOffset) ){
			console.log('startContainer 光标在 container 最前端, 清空 container');
			nodeApi.emptyAllChild(container);
			rangeApi.setCollapsedRange(container, 0);
		}else if( rangeApi.isEndInContainer(startContainer, startOffset) ){
			console.log('startContainer 光标在 container 最未端, 光标重叠选择 container 最未端');
			rangeApi.setCollapsedRange(startContainer, startOffset);
		}else{
			console.log('startContainer 光标在 container 中间');
			deleteEndFragment.call(this, container, startContainer, startOffset);
		}
	}else if( endContainer ){
		console.log('container 前半部分在 fragment 中, 不需要选择 range');
		let container = nodeApi.getContainer(endContainer);
		if( rangeApi.isStartInContainer(endContainer, endOffset) ){
			console.log('endContainer 光标在 container 最前端, 无操作');
		}else if( rangeApi.isEndInContainer(endContainer, endOffset) ){
			console.log('endContainer 光标在 container 最未端, 清空 container');
			nodeApi.emptyAllChild(container);
		}else{
			console.log('endContainer 光标在 container 中间');
			deleteStartFragment.call(this, container, endContainer, endOffset, false);
		}
	}else{
		console.error('startContainer:', startContainer, 'startOffset:', startOffset, 'endContainer:', endContainer, 'endOffset:', endOffset);
		throw new Error('不知道的特殊情况');
	}
}

export function deleteStartFragment(container, endContainer, endOffset, needRange = true){
	console.log('%c删除 container 开始部分片段', 'color: #000000; background-color: #ffffff');
	let { rangeApi, nodeApi } = this,
			endFragment = nodeApi.splitFromNodeOffsetStillTop(endContainer, endOffset, container);
	if( nodeApi.isContainer(endFragment) ){
		nodeApi.emptyAllChild(container);
		nodeApi.appendChildren(container, endFragment.childNodes);
		endFragment = null;
		if( needRange ){
			console.log('进行光标选择');
			rangeApi.setRangeOfNodeStart(container);
		}else{
			console.log('不进行光标选择');
		}
	}else{
		console.error('endFragment:', endFragment);
		throw new Error('按道理 endFragment 应该是 container');
	}
}

export function deleteCenterFragment(container, startContainer, startOffset, endContainer, endOffset){
	console.log('%c删除 container 中间部分片段', 'color: #000000; background-color: #ffffff');
	let { rangeApi, nodeApi } = this,
			endFragment = nodeApi.splitFromNodeOffsetStillTop(endContainer, endOffset, container);

	deleteEndFragment.call(this, container, startContainer, startOffset);

	nodeApi.insertAfter(endFragment, container);
	nodeApi.mergeTwoNodes(container, endFragment);
}

export function deleteEndFragment(container, startContainer, startOffset, needRange = true){
	console.log('%c删除 container 结尾部分片段', 'color: #000000; background-color: #ffffff');
	let { rangeApi, nodeApi } = this;
	
	nodeApi.splitFromNodeOffsetStillTop(startContainer, startOffset, container);
	if( needRange ){
		rangeApi.setRangeOfNodeEnd(container);
	}
}

