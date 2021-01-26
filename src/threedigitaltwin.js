import * as THREE from "three";
import * as utils from "./utils.js";
import CameraControls from 'camera-controls';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KMZLoader } from 'three/examples/jsm/loaders/KMZLoader.js';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';
import { OBJLoader2 } from 'three/examples/jsm/loaders/OBJLoader2.js';
import TwinScene from "./twinscene.js";
import TwinLoader from "./twinloader.js"

CameraControls.install({ THREE: THREE });

export default class ThreeDigitalTwin extends TwinScene {

    constructor(canvas, configs) {
        super(canvas, configs);
        this.loader = new TwinLoader(this.centerInMeters, this.scene);
    }

    loadLayer(geojson, properties, type) {
        this.loader.loadLayer(geojson, properties, type);
    }

    loadInstancedMesh(geometry,material,positions) {
        return this.loader.loadInstancedMesh(geometry,material,positions);
    }

    _onWindowResize() {
        this._camera.aspect = window.innerWidth / window.innerHeight;
        this._camera.updateProjectionMatrix();
        this._renderer.setSize(window.innerWidth, window.innerHeight);
    }

    _clearThree(obj) {
        while (obj.children.length > 0) {
            this._clearThree(obj.children[0]);
            obj.remove(obj.children[0]);
        }
        if (obj.geometry) obj.geometry.dispose();

        if (obj.material) {
            //in case of map, bumpMap, normalMap, envMap ...
            Object.keys(obj.material).forEach(prop => {
                if (!obj.material[prop])
                    return
                if (obj.material[prop] !== null && typeof obj.material[prop].dispose === 'function')
                    obj.material[prop].dispose()
            })
            obj.material.dispose()
        }
    }

    onWindowResize() {

        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);

    }

    removeSceneLayers() {
        this._clearThree(this.scene);
    }

    /**
     * Adds an object to the scene in the given coordinates, given a path
     * @param {string} modelPath - File path or URL of the object
     * @param {Array} coordinates - Real world coordinates of the object
     * @param {Object} rotation - Rotation of object in the 3 axes e.g. {x:1,y:0,z:0}
     * @param {number} scale - Scale of the object
     * @param {number} altitude - Altitude of the object
     */
    _loadModel(modelPath, coordinates, rotation, scale, altitude, lod_distance) {

        var extensionValue = modelPath.split('.').pop();
        var loader;

        switch (extensionValue) {
            case ("kmz"):
                loader = new KMZLoader();
                break;

            case ("gltf"):
                loader = new GLTFLoader();
                break;

            case ("obj"):
                new OBJLoader2().load(modelPath,

                    (model) => {

                        var units = utils.convertCoordinatesToUnits(coordinates[0], coordinates[1]);
                        var targetPosition = new THREE.Vector3(units[0] - this.centerInMeters[0], altitude || 0, -(units[1] - this.centerInMeters[1]));

                        if (rotation) {
                            model.rotation.x = rotation.x;
                            model.rotation.y = rotation.y;
                            model.rotation.z = rotation.z;
                        }

                        if (scale) {
                            model.scale.copy(new THREE.Vector3(scale, scale, scale));
                        }

                        // Adding 2 levels of detail
                        const lod = new THREE.LOD();
                        lod.addLevel(model.scene, 0);
                        // empty cube 
                        const geometry = new THREE.BoxGeometry(0.01, 0.01, 0.01);
                        const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
                        const cube = new THREE.Mesh(geometry, material);
                        if (lod_distance == "low") lod.addLevel(cube, 500);
                        else lod.addLevel(cube, 1500);
                        lod.position.copy(targetPosition);

                        this.scene.add(lod);
                    },

                    undefined,

                    // onError callback
                    (error) => {
                        console.log('Error with model', modelPath);
                        console.log(error);
                    });
                return;

            case ("dae"):
                loader = new ColladaLoader();
                break;

            default:
                break;
        }

        loader.load(
            // resource URL
            modelPath,
            // onLoad callback
            (model) => {

                var units = utils.convertCoordinatesToUnits(coordinates[0], coordinates[1]);
                var targetPosition = new THREE.Vector3(units[0] - this.centerInMeters[0], altitude || 0, -(units[1] - this.centerInMeters[1]));

                if (rotation) {
                    model.rotation.x = rotation.x;
                    model.rotation.y = rotation.y;
                    model.rotation.z = rotation.z;
                }

                if (scale) {
                    model.scene.scale.copy(new THREE.Vector3(scale, scale, scale));
                }

                // Adding 2 levels of detail
                const lod = new THREE.LOD();
                lod.addLevel(model.scene, 0);
                // empty cube 
                const geometry = new THREE.BoxGeometry(0.01, 0.01, 0.01);
                const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
                const cube = new THREE.Mesh(geometry, material);
                if (lod_distance == "low") lod.addLevel(cube, 500);
                else lod.addLevel(cube, 1500);
                lod.position.copy(targetPosition);

                this.scene.add(lod);
            },

            // onProgress callback
            undefined,

            // onError callback
            (error) => {
                console.log('Error with model', modelPath);
                console.log(error);
            }
        );

    }

    moveObjectToCoordinates(mesh, lon, lat) {
        var coordinates = this.convertCoordinatesToUnits(lon, lat);
        var targetPosition = new THREE.Vector3(coordinates[0] - this.centerInMeters[0], mesh.position.y, -(coordinates[1] - this.centerInMeters[1]));
        mesh.position.copy(targetPosition);
    }

    rotateObject(object, axis, angle) {
        let vector;
        if (axis == "x")        vector = new THREE.Vector3(1,0,0);
        else if (axis == "y")   vector = new THREE.Vector3(0,1,0);
        else if (axis == "z")   vector = new THREE.Vector3(0,0,1);
        object.rotateOnAxis(vector, angle)
    }

    setAltitude(object, altitude) {
        object.position.y = altitude;
    }

    removeLayer(layerCode) {
        if (layerCode) {
            var meshes = this.layers.get(layerCode);
            if (meshes && meshes.length > 0) {
                meshes.forEach(mesh => {
                    if (mesh && mesh.geometry) {
                        mesh.geometry.dispose();
                        this.scene.remove(mesh);
                    } else if (mesh) {
                        this.scene.remove(mesh);
                    }
                });
                this.layers.delete(layerCode);
            }

        }
    }

    clear() {
        var context = this.canvas.getContext("2d");
        context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    showGridHelper() {
        const gridHelper = new THREE.GridHelper(3000, 10)
        this.scene.add(gridHelper);
    }

    dispatch(eventName, data) {
        const event = this.events[eventName];
        if (event) {
            event.fire(data);
        }
    }

    on(eventName, callback) {
        let event = this.events[eventName];
        if (!event) {
            event = new DispatcherEvent(eventName);
            this.events[eventName] = event;
        }
        event.registerCallback(callback);
    }

}


class DispatcherEvent {
    constructor(eventName) {
        this.eventName = eventName;
        this.callbacks = [];
    }

    registerCallback(callback) {
        this.callbacks.push(callback);
    }

    unregisterCallback(callback) {
        const index = this.callbacks.indexOf(callback);
        if (index > -1) {
            this.callbacks.splice(index, 1);
        }
    }

    fire(data) {
        const callbacks = this.callbacks.slice(0);
        callbacks.forEach((callback) => {
            callback(data);
        });
    }
}

