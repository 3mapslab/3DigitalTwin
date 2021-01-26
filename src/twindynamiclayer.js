import * as THREE from 'three';

export default class TwinDynamicLayer extends THREE.InstancedMesh {

    constructor(geometry, material, count) {
        super(geometry, material, count);
    }

    addObject() {
        
        /*
        var boxWidth = 6.06;
        var boxHeight = 2.6;
        var boxDepth = 2.44;
        */

        this.count++;
        console.log(this.instanceMatrix);

    }

    moveObject() {

    }

    removeObject() {

    }

    // TODO: methods for adding, moving and removing 1 instance
}