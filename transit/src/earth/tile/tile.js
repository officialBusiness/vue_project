import {
	Mesh,
	Texture,
	Vector3
	// MeshBasicMaterial,
	// RawShaderMaterial
} from '../../libs/three.module.js';
import tileGeometry from './tile_geometry.js';
import Layer from '../layer/layer.js';

export default class Tile{
	constructor(column, row, level, terrain, layerManager, parent){

		this.column = column;
		this.row = row;
		this.level = level;
		this.order = `${column}-${row}-${level}`;

		this.terrain = terrain;
		this.layerManager = layerManager;

		this.layer = new Layer();

		this.parent = parent;
		this.children = [];

		this.mesh;
		this.textures = new Map();

		this.gridCenters = null;
		this.center = null;
		this.geometricError = null;

		this.initMesh();
		this.updateLayer();
	}

	getChildren(){
		if( this.children.length === 0){
			this.children.push(
				new Tile(
					this.column << 1,
					this.row << 1,
					this.level + 1,
					this.terrain,
					this.layerManager,
					this
				),
				new Tile(
					this.column << 1 | 1,
					this.row << 1,
					this.level + 1,
					this.terrain,
					this.layerManager,
					this
				),
				new Tile(
					this.column << 1,
					this.row << 1 | 1,
					this.level + 1,
					this.terrain,
					this.layerManager,
					this
				),
				new Tile(
					this.column << 1 | 1,
					this.row << 1 | 1,
					this.level + 1,
					this.terrain,
					this.layerManager,
					this
				)
			);
		}

		return this.children;
	}

	initMesh(){
		let
			geometryParams = this.terrain.computeGeometry(this.column, this.row, this.level),
			geometry = new tileGeometry(geometryParams);

		geometry.computeBoundingSphere();

		this.mesh = new Mesh(geometry, this.layer.material );
		this.mesh.name = `${this.order}-tile`;
		this.mesh.renderOrder = this.level;

		this.gridCenters = geometryParams.gridCenters;
		this.center = geometryParams.center;
		this.geometricError = geometry.boundingSphere.radius / 256;
	}

	getSphere(){
		return this.mesh.geometry.boundingSphere;
	}

	updateLayer(){
		this.layer.updateMaterial(this.layerManager);
	}

	traverse(judge){
		if( judge(this) ){
			this.getChildren().forEach((child)=>{
				child.traverse(judge);
			});
		}
		return this;
	}

	show(){
		this.terrain.tileGroup.add(this.mesh);
		this.layerManager.load(this);
	}

	hasProviderImage(provider){
		return this.textures.has(provider);
	}

	saveImage(provider, image){
		let	texture = new Texture();
		texture.image = image;
		texture.needsUpdate = true;
		this.textures.set(provider, texture);
	}

	render(){
		this.layer.render(this.textures);
	}

	hide(){
		this.terrain.tileGroup.remove(this.mesh);
		this.layer.hide();
	}

	
}