import * as THREE from "three";
import * as utils from "./utils.js";
import CameraControls from 'camera-controls';
import * as GeoThree from 'geo-three/build/geo-three.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KMZLoader } from 'three/examples/jsm/loaders/KMZLoader.js';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';
import { OBJLoader2 } from 'three/examples/jsm/loaders/OBJLoader2.js';
import { centroid } from '@turf/centroid'
import polygon from "@turf/helpers";

CameraControls.install({ THREE: THREE });

// const NUM_MAX_OBJECT_LOOP = 100;
// const REFRESH_TIMEOUT = 500; //ms
const near = 5;
const far = 3500;
var offset = 0;

class ThreeDigitalTwin {

    constructor(canvas, configs) {
        
        this.width = configs.width || 15000;
        this.height = configs.height || 15000;

        this.zoom = configs.zoom || {};
        this.zoom.start = configs.zoom && configs.zoom.start ? configs.zoom.start : 250;
        this.zoom.min = configs.zoom && configs.zoom.min ? configs.zoom.min : 10;
        this.zoom.max = configs.zoom && configs.zoom.max ? configs.zoom.max : 500;

        this.center = configs.center || {};
        this.center.lng = configs.center && configs.center.lng ? configs.center.lng : -8.7016652234108349;
        this.center.lat = configs.center && configs.center.lat ? configs.center.lat : 41.185523935676713;
        this.centerInMeters = utils.convertCoordinatesToUnits(this.center.lng, this.center.lat);

        this.providerMapTile = configs.providerMapTile || null;
        this.modeMapTile = configs.modeMapTile || null;

        this.fog = configs.fog || false;

        this._clock = new THREE.Clock();
        this._canvas = canvas;
        this._camera = null;
        this.scene = null;
        this._renderer = null;
        this._controls = null;
        this._meshes = [];
        this._delta = 0;
        this.events = {};

    }

    /*  lon => x
        lat => z
        depth / altitude => y 
    */
    initScene() {

        /// Init Scene
        this.scene = new THREE.Scene();

        /// Init Camera
        this._camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, near, far);
        this._camera.position.set(0, this.zoom.start, 0);

        /// Init Render
        this._renderer = new THREE.WebGLRenderer({ canvas: this._canvas, antialias: true, powerPreference: "high-performance", physicallyCorrectLights: true });
        this._renderer.shadowMap.enabled = false;
        this._renderer.setSize(window.innerWidth, window.innerHeight);
        window.addEventListener("resize", this._onWindowResize.bind(this), false);
        this._renderer.setClearColor(0x87ceeb, 1);

        /// Init Camera Controls
        this._controls = new CameraControls(this._camera, this._renderer.domElement);
        this._controls.verticalDragToForward = true;
        this._controls.dollyToCursor = false;
        this._controls.maxDistance = this.zoom.max;
        this._controls.maxPolarAngle = Math.PI / 2.2;

        /// Init Lights
        let light = new THREE.PointLight(0xffffff);
        light.position.set(0, 150, 100);
        this.scene.add(light);

        //Ambient light
        this._ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
        this.scene.add(this._ambientLight);

        //Hemisphere Light
        var hlight = new THREE.HemisphereLight(0xffffbb, 0x080820, 0.4);
        this.scene.add(hlight);

        // Fog
        if(this.fog) {
            this.scene.fog = new THREE.Fog(0xFFFFFF, far/3, far/2);
        }

        /// Helpers (@remove)
        // const size = 100;
        // const axesHelper = new THREE.AxesHelper(size);
        // this.scene.add(axesHelper);

        // Create a map tiles provider object
        var provider = new GeoThree.MapBoxProvider(
            "pk.eyJ1IjoidHJpZWRldGkiLCJhIjoiY2oxM2ZleXFmMDEwNDMzcHBoMWVnc2U4biJ9.jjqefEGgzHcutB1sr0YoGw",
            "mapbox/streets-v10",
            GeoThree.MapBoxProvider.STYLE
        );

        // Create the map view and add it to your THREE scene
        var map = new GeoThree.MapView(GeoThree.MapView.PLANAR, provider);
        map.position.set(-this.centerInMeters[0], 0, this.centerInMeters[1]);
        this.scene.add(map);

        this._animate();

    }

    _onWindowResize() {
        this._camera.aspect = window.innerWidth / window.innerHeight;
        this._camera.updateProjectionMatrix();
        this._renderer.setSize(window.innerWidth, window.innerHeight);
    }

    _clearThree(obj) {
        while (obj.children.length > 0) {
            this._clearThree(obj.children[0])
            obj.remove(obj.children[0]);
        }
        if (obj.geometry) obj.geometry.dispose()

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

    _animate() {

        const delta = this._clock.getDelta();
        this._controls.update(delta);

        requestAnimationFrame(this._animate.bind(this));

        this._renderer.render(this.scene, this._camera);
        
    }

    onWindowResize() {

        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();

        this.renderer.setSize(window.innerWidth, window.innerHeight);

    }

    removeSceneLayers() {
        this._clearThree(this.scene);
    }

    loadGeoJSON(url) {
        fetch(
            url,
            { method: "POST" }
        )
            .then((response) => {
                return response.json();
            })
            .then((data) => {
                var geojson = this._convertGeoJsonToWorldUnits(data);

                for (var feature of geojson.features) {
                    let shape = this._createShapeExtrude(feature.geometry);
                    this._meshes.push(shape);
                }
            });

    }

    _createShapeExtrude(geometry) {

        let shapearray = this._calcVertices(geometry);
        var material = new THREE.MeshBasicMaterial({
            color: new THREE.Color('#A9A9A9'),
        });

        const extrudeSettings = {
            steps: 2,
            depth: 10,
            bevelEnabled: false,
        };

        var shape3D = new THREE.ExtrudeBufferGeometry(shapearray, extrudeSettings);
        shape3D.translate(0, -5, 0);
        var mesh = new THREE.Mesh(shape3D, material);
        mesh.matrixAutoUpdate = false;
        mesh.receiveShadow = false;
        mesh.frustumCulled = false;
        mesh.rotateOnAxis(new THREE.Vector3(1, 0, 0), - Math.PI / 2);
        mesh.updateMatrix();

        return mesh;
    }

    calcVertices(feature) {
        var vecs2 = [];
        var vertices = [];

        for (var P of feature.geometry.coordinates) {

            outerP = P;

            if (feature.geometry.type === "MultiPolygon") {
                var outerP = P[0];
            }

            var p0 = new THREE.Vector2(outerP[0][0], outerP[0][1]);
            for (let i = 1; i < outerP.length; ++i) {

                var p1 = new THREE.Vector2(outerP[i][0], outerP[i][1]);
                vecs2.push(p0, p1);
                p0 = p1;
            }

            var shape = new THREE.Shape(vecs2)

            // iterate through holes
            for (let i = 1; i < P.length; ++i) {

                let hole = P[i];
                let points = [];

                for (let j = 0; j < hole.length; ++j) {
                    points.push(new THREE.Vector2(hole[j][0], hole[j][1]))
                }

                let path = new THREE.Path(points);
                shape.holes.push(path);
            }

            vertices.push(shape);
            vecs2 = [];
        }

        return vertices;
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

    async loadLayer(layerCode, geojson, properties, type) {

        if (geojson == null || geojson.features == null) return;

        var geo = utils.convertGeoJsonToWorldUnits(geojson);
        var shape = null;
        var modelGLTF = null;
        var values;
        var feature;

        switch (type) {
            case "EXTRUDE":

                for (feature of geo.features) {
                    feature.layerCode = layerCode;
                    feature.properties = Object.assign({}, properties, feature.properties);

                    shape = this.createShape(feature);

                    if (shape) {
                        this.scene.add(shape);

                        if (layerCode) {
                            values = [];
                            if (this.layers.get(layerCode)) {
                                values = this.layers.get(layerCode);
                            }
                            values.push(shape);
                            this.layers.set(layerCode, values);
                        }

                        shape.geometry.dispose();
                    }

                    offset += 1;
                }

                this.dispatch('layerloaded', layerCode);

                break;
            case "GLTF":
                for (feature of geo.features) {
                    feature.layerCode = layerCode;
                    feature.properties = Object.assign({}, properties, feature.properties);

                    modelGLTF = await this.createModelGLTF(feature);

                    if (modelGLTF) {
                        this.scene.add(modelGLTF);

                        if (layerCode) {
                            values = [];
                            if (this.layers.get(layerCode)) {
                                values = this.layers.get(layerCode);
                            }
                            values.push(modelGLTF);
                            this.layers.set(layerCode, values);
                        }
                    }
                }

                this.dispatch('layerloaded', layerCode);

                break;
            default:
                console.log('default');
        }
    }

    //1- Buildings 2- Warehouses 3- Roads 4- Gardens 5- Parking slots 
    createShape(feature) {

        var shapearray = this.calcVertices(feature);
        var textureTop;
        var textureSide;

        if (feature.properties.material.textureTop) {
            textureTop = new THREE.TextureLoader().load(feature.properties.material.textureTop) || null;
            textureTop.wrapS = THREE.RepeatWrapping;
            textureTop.wrapT = THREE.RepeatWrapping;
            textureTop.flipY = false;
        }

        if (feature.properties.material.textureSide) {
            textureSide = new THREE.TextureLoader().load(feature.properties.material.textureSide) || null;
            textureSide.wrapS = THREE.RepeatWrapping;
            textureSide.wrapT = THREE.RepeatWrapping;
            textureSide.flipY = false;
        }

        var material = [new THREE.MeshPhongMaterial({
            color: new THREE.Color(feature.properties.material.colorTop) || null,
            opacity: feature.properties.material.opacityTop,
            transparent: true,
            map: textureTop || null,
            polygonOffset: feature.properties.material.polygonOffset || false, // fix overlapping problems
            polygonOffsetFactor: feature.properties.material.polygonOffsetFactor || -1, // fix overlapping problems
            polygonOffsetUnits: feature.properties.material.polygonOffsetUnits - offset || -1 // fix overlapping problems
        }), new THREE.MeshPhongMaterial({
            color: new THREE.Color(feature.properties.material.colorSide) || null,
            opacity: feature.properties.material.opacitySide,
            transparent: true,
            map: textureSide || null,
            polygonOffset: feature.properties.material.polygonOffset || false, // fix overlapping problems
            polygonOffsetFactor: feature.properties.material.polygonOffsetFactor || -1, // fix overlapping problems
            polygonOffsetUnits: feature.properties.material.polygonOffsetUnits - offset || -1// fix overlapping problems
        })]

        var extrudeSettings = {
            depth: feature.properties.depth,
            bevelEnabled: false,
            bevelSegments: 1,
            steps: 5,
            bevelSize: 0,
            bevelThickness: 1
        };

        var shape3D = new THREE.ExtrudeBufferGeometry(shapearray, extrudeSettings);
        shape3D.translate(-this.centerInMeters[0], -this.centerInMeters[1], feature.properties.altitude);
        var mesh = new THREE.Mesh(shape3D, material);


        if (textureTop) {
            this.adjustTextureTopRepeat(mesh, feature.properties.material.textureSizeTop);
        }

        if (textureSide) {
            this.adjustTextureSideRepeat(mesh, feature.properties.material.textureSizeSide);
        }

        mesh.matrixAutoUpdate = false;
        mesh.receiveShadow = false;
        mesh.rotateOnAxis(new THREE.Vector3(1, 0, 0), - Math.PI / 2);
        mesh.updateMatrix();

        shape3D.dispose();

        return mesh;
    }

    async createModelGLTF(feature) {
        var coordX;
        var coordY;
        if (feature.geometry.type != "Point") {
            var centroid_obj = centroid(polygon(feature.geometry.coordinates));
            coordX = centroid_obj.geometry.coordinates[0];
            coordY = centroid_obj.geometry.coordinates[1];
        } else {
            coordX = feature.geometry.coordinates[0];
            coordY = feature.geometry.coordinates[1];
        }

        var mesh;
        await this.loadGLTF(feature.properties.model).then((object) => {

            object.position.set(coordX - this.centerInMeters[0], feature.properties.altitude, -(coordY - this.centerInMeters[1]));

            object.matrixAutoUpdate = false;
            object.receiveShadow = false;
            object.updateMatrix();

            mesh = object;
        });

        return mesh;
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

    adjustTextureTopRepeat(mesh, textureSize) {

        mesh.geometry.computeBoundingBox();
        let max = mesh.geometry.boundingBox.max;
        let min = mesh.geometry.boundingBox.min;
        let height = max.y - min.y;
        let width = max.x - min.x;

        let repeatValX = width / textureSize;
        let repeatValY = height / textureSize;
        if (repeatValX < 0.1) {
            repeatValX *= 10;
        } else if (repeatValX > 0.45) {
            repeatValX /= 2;
        }
        if (repeatValY < 0.1) {
            repeatValY *= 10;
        }

        mesh.material[0].map.repeat.set(repeatValX, repeatValY);
    }

    adjustTextureSideRepeat(mesh, textureSize) {

        mesh.geometry.computeBoundingBox();
        let max = mesh.geometry.boundingBox.max;
        let min = mesh.geometry.boundingBox.min;

        let height = max.z - min.z;
        let width = max.x - min.x;

        let repeatValX = width / textureSize;
        let repeatValY = height / textureSize;
        if (repeatValX < 0.1) {
            repeatValX *= 10;
        } else if (repeatValX > 0.45) {
            repeatValX /= 2;
        }
        if (repeatValY < 0.1) {
            repeatValY *= 10;
        }

        mesh.material[1].map.repeat.set(repeatValX, repeatValY);
    }

    loadGLTF(objPath) {
        return new Promise((resolve) => {
            const loader = new GLTFLoader();
            loader.load(
                objPath,
                (gltf) => {
                    gltf.scene.children.forEach((element) => {
                        if (element.material) {
                            element.material.metalness = 0;
                        }
                    });
                    resolve(gltf.scene);
                },
                (error) => {
                    console.error(error);
                }
            );
        });
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

export { ThreeDigitalTwin as default }