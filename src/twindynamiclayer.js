import * as THREE from 'three';

export default class TwinDynamicLayer extends THREE.InstancedMesh {

    constructor(geometry, material, count) {
        super(geometry, material, count);
    }
    
    // TODO: methods for adding, moving and removing 1 instance
}