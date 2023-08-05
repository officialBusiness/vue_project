import { getEmptyLiDom, resetListLabel } from '../list.js';
import { isLabel, isLiContent } from './delete_forward_on_start.js'
import { emptyLiContent, emptyLiLabel, emptyLi } from './delete_fragment.js';
import { deleteStartFragment, deleteCenterFragment, deleteEndFragment } from '../../paragraph/event/delete_fragment.js';

export default function enterFragment(startContainer, startOffset, endContainer, endOffset){
	console.log('%c执行 enterFragment', 'color: #000000; background-color: #ffffff');
	console.log('startContainer:', startContainer, '\nstartOffset:', startOffset, '\nendContainer:', endContainer, '\nendOffset:', endOffset);
	let { rangeApi, nodeApi } = this;

	if( startContainer && endContainer ){
		console.log('fragment 在 container 中');
		let startContainerNode = nodeApi.getContainer(startContainer),
				startContainerNodeLi = startContainerNode.parentNode,
				endContainerNode = nodeApi.getContainer(endContainer),
				endContainerNodeLi = endContainerNode.parentNode,

				li = startContainerNode.parentNode,
				liContent = li.childNodes[1], 

				block = nodeApi.getBlock(li),
				newLi = getEmptyLiDom.call(this, block.getAttribute('label')),
				newLiContent = newLi.childNodes[1];

		if( startContainerNode === endContainerNode ){
			console.log('range 在同一个 container 中');
			nodeApi.insertAfter( newLi, li );
			resetListLabel(block);
			if( rangeApi.isStartInContainer(startContainer, startOffset) ){
				console.log('startContainer 光标在 container 最前端');
				if( rangeApi.isEndInContainer(endContainer, endOffset) ){
					console.log('endContainer 光标在 container 最未端, 清空 container');
					nodeApi.emptyAllChild(liContent);
					rangeApi.setCollapsedRange(newLiContent, 0);
				}else{
					console.log('endContainer 光标不在 container 最未端');
					deleteStartFragment.call(this, endContainerNode, endContainer, endOffset, false);

					nodeApi.appendChildren( newLiContent, liContent.childNodes );
					rangeApi.setRangeOfNodeStart(newLiContent);
				}
			}else{
				console.log('startContainer 光标不在 container 最前端');
				if( rangeApi.isEndInContainer(endContainer, endOffset) ){
					console.log('endContainer 光标在 container 最未端');
					deleteEndFragment.call(this, startContainerNode, startContainer, startOffset, false);

					resetListLabel(block);
					rangeApi.setCollapsedRange(newLiContent, 0);
				}else{
					console.log('endContainer 光标不在 container 最未端');

					let splitedNode = nodeApi.splitFromNodeOffsetStillTop(endContainer, endOffset, endContainerNode);
					nodeApi.splitFromNodeOffsetStillTop(startContainer, startOffset, startContainerNode);

					nodeApi.appendChildren( newLiContent, splitedNode.childNodes );
					rangeApi.setRangeOfNodeStart(newLiContent);
				}
			}

		}else if( startContainerNodeLi === endContainerNodeLi ){
			console.log('range 在不同的 container 中, 但是在同一个 liContainer 中');

			nodeApi.insertAfter( newLi, li );
			resetListLabel(block);
			if( isLabel(startContainerNode) && isLiContent(endContainerNode) ){
				if( rangeApi.isStartInContainer(startContainer, startOffset) ){
					console.log('startContainer 光标在 label container 最前端, 删空 li label');
					emptyLiLabel.call(this, startContainerNode);
				}else if( rangeApi.isEndInContainer(startContainer, startOffset) ){
					console.log('startContainer 光标在 label container 最未端, 无操作');
				}else{
					console.log('startContainer 光标在 label container 中间');
					deleteEndFragment.call(this, startContainerNode, startContainer, startOffset);
				}

				if( rangeApi.isStartInContainer(endContainer, endOffset) ){
					console.log('endContainer 光标在 li container 最前端');

					nodeApi.appendChildren( newLiContent, liContent.childNodes );
					rangeApi.setRangeOfNodeStart(newLiContent);

				}else if( rangeApi.isEndInContainer(endContainer, endOffset) ){
					console.log('startContainer 光标在 li container 最未端');

					nodeApi.emptyAllChild(liContent);
					rangeApi.setCollapsedRange(newLiContent, 0);
				}else{
					console.log('endContainer 光标在 li container 中间');
					// deleteStartFragment.call(this, endContainerNode, endContainer, endOffset, false);

					let splitedNode = nodeApi.splitFromNodeOffsetStillTop(endContainer, endOffset, endContainerNode);
					nodeApi.emptyAllChild(liContent);

					nodeApi.appendChildren( newLiContent, splitedNode.childNodes );
					rangeApi.setRangeOfNodeStart(newLiContent);
				}
			}else{
				console.error('startContainerNode:', startContainerNode, '\nendContainerNode:', endContainerNode);
				throw new Error('这种情况 startContainer 应该咋 label, endContainer 应该在 liContainer 中, 不应该打印此信息');
			}
		}else{
			console.log('range 在不同的 liContainer 中');

			while( startContainerNodeLi.nextSibling !== endContainerNodeLi ){
				nodeApi.removeNode(startContainerNodeLi.nextSibling);
			}

			if( rangeApi.isStartInContainer(startContainer, startOffset) ){
				nodeApi.emptyAllChild(startContainerNode);
			}else if( rangeApi.isEndInContainer(startContainer, startOffset) ){
			}else{
				deleteEndFragment.call(this, startContainerNode, startContainer, startOffset, false);
			}
			if( isLabel(startContainerNode) ){
				console.log('startContainerNode 是 label');
				emptyLiContent.call(this, startContainerNodeLi);
			}

			if( rangeApi.isStartInContainer(endContainer, endOffset) ){
				rangeApi.setRangeOfNodeStart(endContainerNode);
			}else if( rangeApi.isEndInContainer(endContainer, endOffset) ){
				nodeApi.emptyAllChild(endContainerNode);
				rangeApi.setCollapsedRange(endContainerNode, 0);
			}else{
				deleteStartFragment.call(this, endContainerNode, endContainer, endOffset);
				// rangeApi.setRangeOfNodeStart(endContainerNode);
			}
			if( isLiContent(endContainerNode) ){
				console.log('endContainerNode 是 liContainer');
				emptyLiLabel.call(this, endContainerNodeLi);
			}
		}

	}else if( startContainer ){
		console.log('container 后半部分在 fragment 中, 不需要选择 range');
		let startContainerNode = nodeApi.getContainer(startContainer),
				startContainerNodeLi = startContainerNode.parentNode;

		while( startContainerNodeLi.nextSibling ){
			nodeApi.removeNode(startContainerNodeLi.nextSibling);
		}

		if( isLabel(startContainerNode) ){
			console.log('startContainerNode 是 label');
			emptyLiContent.call(this, startContainerNodeLi);
			if( rangeApi.isStartInContainer(startContainer, startOffset) ){
				console.log('startContainer 光标在 container 最前端');
				emptyLiLabel.call(this, startContainerNodeLi);
			}else if( rangeApi.isEndInContainer(startContainer, startOffset) ){
				console.log('startContainer 光标在 container 最未端');
			}else{
				console.log('startContainer 光标在 container 中间');
				deleteEndFragment.call(this, startContainerNode, startContainer, startOffset);
			}
		}else if(isLiContent(startContainerNode)){
			console.log('startContainerNode 是 liContainer');
			if( rangeApi.isStartInContainer(startContainer, startOffset) ){
				console.log('startContainer 光标在 container 最前端');
				emptyLiContent.call(this, startContainerNodeLi);
			}else if( rangeApi.isEndInContainer(startContainer, startOffset) ){
				console.log('startContainer 光标在 container 最未端');
			}else{
				console.log('startContainer 光标在 container 中间');
				deleteEndFragment.call(this, startContainerNode, startContainer, startOffset, false);
			}
		}

	}else if( endContainer ){
		console.log('container 前半部分在 fragment 中, 需要选择 range');
		let endContainerNode = nodeApi.getContainer(endContainer),
				endContainerNodeLi = endContainerNode.parentNode;

		while( endContainerNodeLi.previousSibling ){
			nodeApi.removeNode(endContainerNodeLi.previousSibling);
		}

		if( isLabel(endContainerNode) ){
			console.log('endContainerNode 是 label');
			if( rangeApi.isStartInContainer(endContainer, endOffset) ){
				console.log('endContainerNode 光标在 container 最前端');
				if( endContainerNode.childNodes.length ){
					rangeApi.setRangeOfNodeStart(endContainerNode);
				}else{
					rangeApi.setCollapsedRange(endContainerNode, 0);
				}
			}else if( rangeApi.isEndInContainer(endContainer, endOffset) ){
				console.log('endContainerNode 光标在 container 最未端');
				emptyLiLabel.call(this, endContainerNodeLi);
				rangeApi.setCollapsedRange(endContainerNode, 0);
			}else{
				console.log('endContainerNode 光标在 container 中间');
				deleteStartFragment.call(this, endContainerNode, endContainer, endOffset);
			}
		}else if( isLiContent(endContainerNode) ){
			console.log('endContainerNode 是 liContainer');
			emptyLiLabel.call(this, endContainerNodeLi);
			if( rangeApi.isStartInContainer(endContainer, endOffset) ){
				console.log('endContainerNode 光标在 container 最前端');
				if( endContainerNode.childNodes.length ){
					rangeApi.setRangeOfNodeStart(endContainerNode);
				}else{
					rangeApi.setCollapsedRange(endContainerNode, 0);
				}
			}else if( rangeApi.isEndInContainer(endContainer, endOffset) ){
				console.log('endContainerNode 光标在 container 最未端');
				emptyLiContent.call(this, endContainerNodeLi);
				rangeApi.setCollapsedRange(endContainerNode, 0);
			}else{
				console.log('endContainerNode 光标在 container 中间');
				deleteStartFragment.call(this, endContainerNode, endContainer, endOffset);
			}
		}
	}else{
		console.error('startContainer:', startContainer, 'startOffset:', startOffset, 'endContainer:', endContainer, 'endOffset:', endOffset);
		throw new Error('不知道的特殊情况');
	}
}