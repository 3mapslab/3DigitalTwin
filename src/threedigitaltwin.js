import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KMZLoader } from 'three/examples/jsm/loaders/KMZLoader.js';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';
// import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { OBJLoader2 } from 'three/examples/jsm/loaders/OBJLoader2.js';
// import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
//import { extrudeGeoJSON } from 'geometry-extrude';
import { reproject } from 'reproject';
import proj4 from 'proj4';
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { Water } from "three/examples/jsm/objects/Water.js";
import * as OIMO from "oimo";
import CameraControls from 'camera-controls'
import * as TWEEN from 'es6-tween';
//import { MeshLine, MeshLineMaterial } from 'three.meshline';
import * as ThreeGeo from 'geo-three/build/geo-three.js';
import Delaunator from 'delaunator';
import turf from 'turf';
//import { Geometry } from 'three';


CameraControls.install({ THREE: THREE });

const near = 5;
const far = 3500;

const PHYSICWORLD =
{
    timestep: 1 / 60,
    iterations: 8,
    broadphase: 2, // 1 brute force, 2 sweep and prune, 3 volume tree
    worldscale: 1, // scale full world 
    random: false,  // randomize sample
    info: true,   // calculate statistic or not
    gravity: [0, -9.8, 0]
}

export default class ThreeDigitalTwin {

    /**
     * models and textures are both js Map() objects
     * @param models - Map()
     * @param textures - Map() - Each value in this Map, contains an  object with the following structure:
     * 
     * {
     *  type: 'cube' //"cube" or "regular",
     *  texture: //The actual texture structure (already existed)
     * }
     * 
    */
    constructor(configs, models, textures) {

        this.width = configs.width || 15000;
        this.height = configs.height || 15000;

        this.zoom = configs.zoom || {};
        this.zoom.start = configs.zoom && configs.zoom.start ? configs.zoom.start : 250;
        this.zoom.min = configs.zoom && configs.zoom.min ? configs.zoom.min : 10;
        this.zoom.max = configs.zoom && configs.zoom.max ? configs.zoom.max : 500;

        this.center = configs.center || {};
        this.center.lng = configs.center && configs.center.lng ? configs.center.lng : -8.7016652234108349;
        this.center.lat = configs.center && configs.center.lat ? configs.center.lat : 41.185523935676713;

        this.pitchAngle = configs.pitchAngle || {}
        this.pitchAngle.start = configs.pitchAngle && configs.pitchAngle.start ? configs.pitchAngle.start : 0;
        this.pitchAngle.min = configs.pitchAngle && configs.pitchAngle.min ? configs.pitchAngle.min : 0;
        this.pitchAngle.max = configs.pitchAngle && configs.pitchAngle.max ? configs.pitchAngle.max : Math.PI;

        this.bearingAngle = configs.bearingAngle || {}
        this.bearingAngle.start = configs.bearingAngle && configs.bearingAngle.start ? configs.bearingAngle.start : 0;
        this.bearingAngle.min = configs.bearingAngle && configs.bearingAngle.min ? configs.bearingAngle.min : 0;
        this.bearingAngle.max = configs.bearingAngle && configs.bearingAngle.max ? configs.bearingAngle.max : Math.PI / 2;

        this.oceanVisible = configs.oceanVisible || false;
        this.axisHelper = configs.axisHelper || false;

        this.providerMapTile = configs.providerMapTile || null;
        this.modeMapTile = configs.modeMapTile || null;

        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.scope = null;
        this.models = models || [];
        this.textures = textures || [];
        this.camera = null;
        this.scene = null;
        this.renderer = null;
        this.ground = null;
        this.cameraControls = null;
        this.physicWorld = null;
        this.clock = new THREE.Clock();
        this.centerWorldInMeters = this.convertCoordinatesToUnits(this.center.lng, this.center.lat);
        this.modelsMesh = new Map();
        this.materialsMesh = new Map();
        this.cubeMaterial = new Map();
        this.layers = new Map();
        this.INTERSECTED = null;
        this.events = {};
        this._3DTile = null;
    }

    init(canvas, axisHelper) {

        this.canvas = canvas;
        this.scene = new THREE.Scene();
        //this.scene.background = new THREE.Color(0xcce0ff);
        //this.scene.fog = new THREE.Fog(0xF5F5F5, far / 4, far / 2);
        this.scene.fog = new THREE.Fog(0xFFFFFF, far / 3, far / 2);
        this.camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, near, far);
        this.camera.position.set(0, this.zoom.start, 0);

        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance", physicallyCorrectLights: true });

        this.renderer.shadowMap.enabled = false;
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);

        this.cameraControls = new CameraControls(this.camera, this.renderer.domElement);
        //Locks Zoom and rotation 
        this.cameraControls.verticalDragToForward = true;
        this.cameraControls.dollyToCursor = false;
        //this.cameraControls.maxPolarAngle = Math.PI / 2;
        this.cameraControls.maxDistance = this.zoom.max; //1KM

        const bb = new THREE.Box3(
            new THREE.Vector3(-this.width / 2, -10, -this.height / 2),
            new THREE.Vector3(this.width / 2, this.cameraControls.maxDistance, this.height / 2)
        );
        this.cameraControls.setBoundary(bb);
        this.cameraControls.saveState();



        if (axisHelper) {
            var axesHelper = new THREE.AxesHelper(this.width / 2);
            this.scene.add(axesHelper);
        }


        window.addEventListener('resize', this.onWindowResize.bind(this), false);
        // canvas.addEventListener('click', this.onDocumentMouseClick.bind(this), false);

        this._initAllTextures();
        this._initAllModels();
        /*if (this.oceanVisible) */this._initOcean();
        this._initSkyBox();
        this._initPhysicWorld();
        this._initAllTiles();

        // Create the map view and add it to your THREE scene
        this._3DTile = new ThreeGeo.MapView(this.modes[2][1], this.providers[9][1], this.providers[15][1]);
        this._3DTile.position.set(- this.centerWorldInMeters[0], 0, this.centerWorldInMeters[1]);

        this.animate();

    }

    _initAllTiles() {
        var DEV_MAPBOX_API_KEY = "pk.eyJ1IjoidGVudG9uZSIsImEiOiJjazBwNHU4eDQwZzE4M2VzOGhibWY5NXo5In0.8xpF1DEcT6Y4000vNhjj1g";
        var DEV_HEREMAPS_APP_ID = "HqSchC7XT2PA9qCfxzFq";
        var DEV_HEREMAPS_APP_CODE = "5rob9QcZ70J-m18Er8-rIA";
        var DEV_BING_API_KEY = "AuViYD_FXGfc3dxc0pNa8ZEJxyZyPq1lwOLPCOydV3f0tlEVH-HKMgxZ9ilcRj-T";
        var DEV_MAPTILER_API_KEY = "B9bz5tIKxl4beipiIbR0";
        var OPEN_MAP_TILES_SERVER_MAP = "";

        this.providers = [
            ["Vector OpenSteet Maps", new ThreeGeo.OpenStreetMapsProvider()],
            ["Vector OpenTile Maps", new ThreeGeo.OpenMapTilesProvider(OPEN_MAP_TILES_SERVER_MAP)],
            ["Vector Map Box", new ThreeGeo.MapBoxProvider(DEV_MAPBOX_API_KEY, "mapbox/streets-v10", ThreeGeo.MapBoxProvider.STYLE)],
            ["Vector Here Maps", new ThreeGeo.HereMapsProvider(DEV_HEREMAPS_APP_ID, DEV_HEREMAPS_APP_CODE, "base", "normal.day")],
            ["Vector Here Maps Night", new ThreeGeo.HereMapsProvider(DEV_HEREMAPS_APP_ID, DEV_HEREMAPS_APP_CODE, "base", "normal.night")],
            ["Vector Here Maps Terrain", new ThreeGeo.HereMapsProvider(DEV_HEREMAPS_APP_ID, DEV_HEREMAPS_APP_CODE, "aerial", "terrain.day")],
            ["Vector Bing Maps", new ThreeGeo.BingMapsProvider(DEV_BING_API_KEY, ThreeGeo.BingMapsProvider.ROAD)],
            ["Vector Map Tiler Basic", new ThreeGeo.MapTilerProvider(DEV_MAPTILER_API_KEY, "maps", "basic", "png")],
            ["Vector Map Tiler Outdoor", new ThreeGeo.MapTilerProvider(DEV_MAPTILER_API_KEY, "maps", "outdoor", "png")],
            ["Satellite Map Box", new ThreeGeo.MapBoxProvider(DEV_MAPBOX_API_KEY, "mapbox.satellite", ThreeGeo.MapBoxProvider.MAP_ID, "jpg70", false)],
            ["Satellite Map Box Labels", new ThreeGeo.MapBoxProvider(DEV_MAPBOX_API_KEY, "mapbox/satellite-streets-v10", ThreeGeo.MapBoxProvider.STYLE, "jpg70")],
            ["Satellite Here Maps", new ThreeGeo.HereMapsProvider(DEV_HEREMAPS_APP_ID, DEV_HEREMAPS_APP_CODE, "aerial", "satellite.day", "jpg")],
            ["Satellite Bing Maps", new ThreeGeo.BingMapsProvider(DEV_BING_API_KEY, ThreeGeo.BingMapsProvider.AERIAL)],
            ["Satellite Maps Tiler Labels", new ThreeGeo.MapTilerProvider(DEV_MAPTILER_API_KEY, "maps", "hybrid", "jpg")],
            ["Satellite Maps Tiler", new ThreeGeo.MapTilerProvider(DEV_MAPTILER_API_KEY, "tiles", "satellite", "jpg")],
            ["Height Map Box", new ThreeGeo.MapBoxProvider(DEV_MAPBOX_API_KEY, "mapbox.terrain-rgb", ThreeGeo.MapBoxProvider.MAP_ID, "pngraw")],
            ["Height Map Tiler", new ThreeGeo.MapTilerProvider(DEV_MAPTILER_API_KEY, "tiles", "terrain-rgb", "png")],
            ["Debug Height Map Box", new ThreeGeo.HeightDebugProvider(new ThreeGeo.MapBoxProvider(DEV_MAPBOX_API_KEY, "mapbox.terrain-rgb", ThreeGeo.MapBoxProvider.MAP_ID, "pngraw"))],
            ["Debug", new ThreeGeo.DebugProvider()]
        ];

        this.modes = [
            ["Planar", ThreeGeo.MapView.PLANAR],
            ["Height", ThreeGeo.MapView.HEIGHT],
            ["Height Shader", ThreeGeo.MapView.HEIGHT_SHADER],
            ["Spherical", ThreeGeo.MapView.SPHERICAL]
        ];
    }

    _initAllModels() {
        for (let [key, value] of this.models) {
            this._initModel(key, value);
        }
    }

    /**
     * Textures can be "regular", and are loaded with the _initMaterial function, but can also be 
     * "cube" textures and wrap up a 6 side geometry with the _initCubeMaterial function 
     *
     * **/
    _initAllTextures() {
        for (let [key, value] of this.textures) {
            if (value.type == "regular") {
                this._initMaterial(key, value.texture);
            } else if (value.type == "cube") {
                this._initCubeMaterial(key, value.texture);
            }
        }
    }

    _initLights() {

        //Ambient light
        this._ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
        this.scene.add(this._ambientLight);

        //Spot light
        this._skyboxLight = new THREE.PointLight(0xfffffe, 0.3, 0, 0);
        this._skyboxLight.color.setHSL(0.1, 1, 0.95);
        this._skyboxLight.position.copy(this.sunSphere.position);
        this.scene.add(this._skyboxLight);

        //Hemisphere Light
        var light = new THREE.HemisphereLight(0xffffbb, 0x080820, 0.4);



        this.scene.add(light);
    }

    // JSON to DATA URI -> https://dopiaza.org/tools/datauri/index.php
    _initModel(name, dataURI) {
        // instantiate a loader
        var loader = new THREE.BufferGeometryLoader();

        // load a resource (data.uri)
        loader.load(dataURI,

            // onLoad callback
            (geometry) => {
                this.modelsMesh.set(name, geometry);

                this.dispatch('init_' + name + "_model");
            },

            // onProgress callback
            function (xhr) {
                console.log((xhr.loaded / xhr.total * 100) + '% loaded');
            },

            // onError callback
            function (err) {
                console.log('An error happened', err);
            }
        );
    }

    _initMaterial(name, dataURI) {
        this._loadTexture(dataURI).then(
            texture => {
                var material = new THREE.MeshLambertMaterial({ map: texture });
                this.materialsMesh.set(name, material);
            },
            error => {
                console.log(error);
            }
        );
    }

    /**
     * Loads the textures of all existing conveyors, saving them in a map (cubeMaterial),
     * key: Name | value: Array of materials
     * 
     * @param {Name of the conveyor texture} name 
     * @param {Array with textures of a specific conveyor} facesOfTexture 
     */
    _initCubeMaterial(name, facesOfTexture) {
        for (let face in facesOfTexture) {
            this._loadCubeTexture(facesOfTexture[face]).then(
                texture => {
                    var material = new THREE.MeshLambertMaterial({ map: texture });

                    if (this.cubeMaterial.get(name)) {
                        var materials = this.cubeMaterial.get(name);
                        materials[face] = material;
                    } else {
                        var textureFaces = {};
                        textureFaces[face] = material;
                        this.cubeMaterial.set(name, textureFaces);
                    }
                },
                error => {
                    console.log(error);
                }
            );
        }

    }

    animate(time) {
        const delta = this.clock.getDelta();
        this.cameraControls.update(delta);

        requestAnimationFrame(this.animate.bind(this));
        this.renderer.render(this.scene, this.camera);

        if (this.ocean) {
            this.ocean.material.uniforms['time'].value += 1.0 / 120.0;
        }

        TWEEN.update(time);

        this._updatePhysicWorld();

        this.renderer.renderLists.dispose();
    }

    onWindowResize() {

        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();

        this.renderer.setSize(window.innerWidth, window.innerHeight);

    }

    async loadLayer(layerCode, geojson, properties, type) {

        if (geojson == null || geojson.features == null) return;

        var geo = this.convertGeoJsonToWorldUnits(geojson);
        var shape = null;
        var model = null;
        var values;
        var feature;

        switch (type) {

            case "DEM":
                shape = this.createDEM(geo.features);

                if (shape)
                    this.scene.add(shape);

                break;
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
                }

                this.dispatch('layerloaded', layerCode);

                break;
            case "MODEL":

                for (feature of geo.features) {
                    feature.layerCode = layerCode;
                    feature.properties = Object.assign({}, properties, feature.properties);

                    model = await this.createModel(feature);

                    if (model) {
                        this.scene.add(model);

                        if (layerCode) {
                            values = [];
                            if (this.layers.get(layerCode)) {
                                values = this.layers.get(layerCode);
                            }
                            values.push(model);
                            this.layers.set(layerCode, values);
                        }

                        model.geometry.dispose();
                    }
                }

                this.dispatch('layerloaded', layerCode);

                break;
            default:
                console.log('default');
        }

    }

    calcVertices(feature) {
        var vecs2 = [];
        var vertices = [];

        for (var P of feature.geometry.coordinates) {

            if (feature.geometry.type === "MultiPolygon") {
                P = P[0];
            }
            var p0 = new THREE.Vector2(P[0][0], P[0][1]);
            for (var i = 1; i < P.length; ++i) {

                var p1 = new THREE.Vector2(P[i][0], P[i][1]);
                vecs2.push(p0, p1);
                p0 = p1;
            }
            vertices.push(new THREE.Shape(vecs2));
            vecs2 = [];
        }

        return vertices;
    }


    createDEM(features) {

        var mesh = new THREE.Group();
        var points3d = [];
        for (var feature of features) {
            var coordinates = feature.geometry.coordinates;
            points3d.push(new THREE.Vector3(coordinates[0] - this.centerWorldInMeters[0], coordinates[1] - this.centerWorldInMeters[1], - coordinates[2] * 2));
        }

        var geometry = new THREE.BufferGeometry().setFromPoints(points3d);

        var cloud = new THREE.Points(
            geometry,
            new THREE.PointsMaterial({ color: 0x99ccff, size: 2 })
        );

        cloud.rotateOnAxis(new THREE.Vector3(1, 0, 0), - Math.PI / 2);

        var indexDelaunay = Delaunator.from(
            points3d.map(v => {
                return [v.x, v.y];
            })
        );

        var meshIndex = []; // delaunay index => three.js index
        for (let i = 0; i < indexDelaunay.triangles.length; i++) {
            meshIndex.push(indexDelaunay.triangles[i]);
        }

        geometry.setIndex(meshIndex); // add three.js index to the existing geometry

        var plane = new THREE.Mesh(
            geometry, // re-use the existing geometry
            new THREE.MeshPhongMaterial({ color: "blue", side: THREE.BackSide, wireframe: false })
        );

        plane.rotateOnAxis(new THREE.Vector3(1, 0, 0), - Math.PI / 2);
        plane.geometry.verticesNeedUpdate = true;
        plane.geometry.normalsNeedUpdate = true;
        plane.geometry.computeBoundingSphere();
        plane.geometry.computeFaceNormals();
        plane.geometry.computeVertexNormals();
        plane.matrixAutoUpdate = false;
        plane.receiveShadow = false;
        plane.updateMatrix();

        mesh.add(cloud);
        mesh.add(plane);
        return mesh;

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
            polygonOffsetUnits: feature.properties.material.polygonOffsetUnits || -1 // fix overlapping problems
        }), new THREE.MeshPhongMaterial({
            color: new THREE.Color(feature.properties.material.colorSide) || null,
            opacity: feature.properties.material.opacitySide,
            transparent: true,
            map: textureSide || null,
            polygonOffset: feature.properties.material.polygonOffset || false, // fix overlapping problems
            polygonOffsetFactor: feature.properties.material.polygonOffsetFactor || -1, // fix overlapping problems
            polygonOffsetUnits: feature.properties.material.polygonOffsetUnits || -1// fix overlapping problems
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
        shape3D.translate(-this.centerWorldInMeters[0], -this.centerWorldInMeters[1], feature.properties.altitude);
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

    async createModel(feature) {

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
            polygonOffsetUnits: feature.properties.material.polygonOffsetUnits || -1 // fix overlapping problems
        }), new THREE.MeshPhongMaterial({
            color: new THREE.Color(feature.properties.material.colorSide) || null,
            opacity: feature.properties.material.opacitySide,
            transparent: true,
            map: textureSide || null,
            polygonOffset: feature.properties.material.polygonOffset || false, // fix overlapping problems
            polygonOffsetFactor: feature.properties.material.polygonOffsetFactor || -1, // fix overlapping problems
            polygonOffsetUnits: feature.properties.material.polygonOffsetUnits || -1// fix overlapping problems
        })]

        var centroid = turf.centroid(turf.polygon(feature.geometry.coordinates));
        var model;
        var mesh;
        await this.loadGeometry(feature.properties.model).then((geometry) => {
            model = geometry;

            mesh = new THREE.Mesh(model, material);
            mesh.position.set(centroid.geometry.coordinates[0] - this.centerWorldInMeters[0],feature.properties.altitude,-(centroid.geometry.coordinates[1] - this.centerWorldInMeters[1]));

            if (textureTop) {
                this.adjustTextureTopRepeat(mesh, feature.properties.material.textureSizeTop);
            }
    
            if (textureSide) {
                this.adjustTextureSideRepeat(mesh, feature.properties.material.textureSizeSide);
            }

            mesh.matrixAutoUpdate = false;
            mesh.receiveShadow = false;
            mesh.updateMatrix();
            model.dispose();

        });

        return mesh;
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

    loadGeometry(objectPath) {
        return new Promise((resolve) => {
            new THREE.BufferGeometryLoader().load(
                objectPath,

                // onLoad callback
                (geometry) => {
                    resolve(geometry);
                },

                // onError callback
                function (err) {
                    console.log("An error happened", err);
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
                    }
                });
                this.layers.delete(layerCode);
            }

        }
    }

    /**
     * Creates a geometry if the object doesn't have assetType, or uses a model already loaded in a map (modelMesh).
     * Creates a material if the object doesn't have type, or uses a material alreadt loaded in a map (cubeMaterial or materialMesh).
     * 
     * @param {Geometry of an object} object 
     * @param {Boolean that represents if the object has physcis} hasPhysics 
     */
    loadObject(object, hasPhysics, isVisible) {
        //First, load up the object's geometry
        var geometry;
        if (this.modelsMesh.get(object.assetType)) {
            geometry = this.modelsMesh.get(object.assetType).clone();
        } else {
            /**
             * This is being used ONLY when models are not found in the "modelsMesh" map.
             * It creates a performant BoxBufferGeometry box with the specified default dimensions (5,5,5) or some send by param
            */
            let boxWidth = object.boxWidth ? object.boxWidth : 5;
            let boxHeight = object.boxHeight ? object.boxHeight : 5;
            let boxDepth = object.boxDepth ? object.boxDepth : 5;
            geometry = new THREE.BoxBufferGeometry(boxWidth, boxHeight, boxDepth);
        }

        //...then, load up its material:
        var material;
        if (object.textureType == 'regular') {
            material = this.materialsMesh.get(object.type).clone();
        } else if (object.textureType == 'cube') {
            let materialColl = this.cubeMaterial.get(object.type);
            //now, if this a 6-faced texture, clone all of its faces individually...
            material = [
                materialColl.face1.clone(),
                materialColl.face2.clone(),
                materialColl.face3.clone(),
                materialColl.face4.clone(),
                materialColl.face5.clone(),
                materialColl.face6.clone()];
        }
        else {
            material = new THREE.MeshLambertMaterial({ color: object.textureColor ? object.textureColor : 0xff0000, wireframe: false });
        }

        if (Array.isArray(material)) {
            material.forEach(element => {
                //  element.depthWrite = false;
                element.polygonOffset = true; // fix overlapping problems
                element.polygonOffsetFactor = -1; // fix overlapping problems
                element.polygonOffsetUnits = -1000; // fix overlapping problems
                //   element.DoubleSide = true;
            });
        } else {
            //   material.depthWrite = false;
            material.polygonOffset = true; // fix overlapping problems
            material.polygonOffsetFactor = -1; // fix overlapping problems
            material.polygonOffsetUnits = -900; // fix overlapping problems
            // material.DoubleSide = true;
        }


        return this._loadMesh(object, geometry, material, hasPhysics, isVisible);
    }

    removeObject(mesh, hasPhysics) {

        if (!mesh) return;

        if (hasPhysics) {
            //@TODO PERCORRER this.physicWorld.bodies e comparar mesh com a body.twinMesh
        }
        if (Array.isArray(mesh)) {
            mesh.forEach(element => {
                this.removeObjectByUUID(element.uuid);
            });

        } else if (mesh.mesh && Array.isArray(mesh.mesh)) {
            mesh.mesh.forEach(element => {
                this.removeObjectByUUID(element.uuid);
            });
        } else {
            this.removeObjectByUUID(mesh.uuid);
        }

    }

    removeObjectByUUID(uuid) {
        const object = this.scene.getObjectByProperty('uuid', uuid);
        if (object) {
            object.geometry.dispose();
            if (Array.isArray(object.material)) {
                object.material.forEach(element => {
                    element.dispose();
                });
            } else {
                object.material.dispose();
            }

            this.scene.remove(object);
        }
    }

    setVisible(mesh, state) {
        mesh.visible = state;
        mesh.updateMatrix();
    }

    _loadMesh(object, geometry, material, hasPhysics, isVisible) {
        var mesh = new THREE.Mesh(geometry, material);
        mesh.matrixAutoUpdate = false;
        mesh.receiveShadow = false;

        var coordinates = this.convertCoordinatesToUnits(object.geometry.coordinates[0], object.geometry.coordinates[1]);
        mesh.geometry.rotateY((object.rotation || 0) * (Math.PI / 180));
        var size = new THREE.Vector3();
        new THREE.Box3().setFromObject(mesh).getSize(size);
        var height = object.height ? object.height : 1;
        mesh.position.set(coordinates[0] - this.centerWorldInMeters[0], height, -(coordinates[1] - this.centerWorldInMeters[1]));

        if (hasPhysics) {
            let position = mesh.position;
            let body = this.physicWorld.add({
                type: 'box', // type of shape : sphere, box, cylinder 
                size: [size.x, size.y, size.z], // size of shape
                pos: [position.x, position.y, position.z], // start position in degree
                rot: [0, 0, 0], // start rotation in degree
                move: true, // dynamic or statique
                density: 1,
                friction: 0.2,
                restitution: 0.2,
                belongsTo: 1, // The bits of the collision groups to which the shape belongs.
                collidesWith: 0xffffffff // The bits of the collision groups with which the shape collides.
            });
            body.twinMesh = mesh;
            this.physicWorld.bodies.push(body);
        }

        mesh.updateMatrix();
        mesh.visible = isVisible;
        this.scene.add(mesh);

        geometry.dispose();

        return mesh;
    }

    convertGeoJsonToWorldUnits(geojson) {
        return reproject(geojson, proj4.WGS84, proj4('EPSG:3785'));
    }

    convertCoordinatesToUnits(lng, lat) {
        return proj4('EPSG:3857', [lng, lat]);
    }

    _initSkyBox() {
        // Add Sky
        this.sky = new Sky();
        this.sky.scale.setScalar(this.width / 2);
        this.scene.add(this.sky);

        // Add Sun Helper
        this.sunSphere = new THREE.Mesh(
            new THREE.SphereBufferGeometry(1, 16, 8),
            new THREE.MeshBasicMaterial({
                color: 0xffffff
            })
        );

        this.scene.add(this.sunSphere);

        var pmremGenerator = new THREE.PMREMGenerator(this.renderer);

        this.effectController = {
            turbidity: 6,
            rayleigh: 0.25,
            mieCoefficient: 0.033,
            mieDirectionalG: 0.9,
            inclination: 0, // elevation / inclination
            azimuth: 0.25, // Facing front,
            exposure: 1
        };

        var distance = this.height;

        var uniforms = this.sky.material.uniforms;
        uniforms["turbidity"].value = this.effectController.turbidity;
        uniforms["rayleigh"].value = this.effectController.rayleigh;
        uniforms["mieCoefficient"].value = this.effectController.mieCoefficient;
        uniforms["mieDirectionalG"].value = this.effectController.mieDirectionalG;

        var theta = Math.PI * (this.effectController.inclination - 0.5);
        var phi = 2 * Math.PI * (this.effectController.azimuth - 0.5);

        this.sunSphere.position.z = distance * Math.cos(phi);
        this.sunSphere.position.y = distance * Math.sin(phi) * Math.sin(theta);
        this.sunSphere.position.x = distance * Math.sin(phi) * Math.cos(theta);
        this.sunSphere.visible = this.effectController.sun;

        uniforms["sunPosition"].value.copy(this.sunSphere.position);
        if (this.ocean) {
            this.ocean.material.uniforms['sunDirection'].value.copy(this.sunSphere.position).normalize();
        }

        //this.renderer.outputEncoding = THREE.sRGBEncoding;
        //this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 0.5;
        this.scene.environment = pmremGenerator.fromScene(this.sky).texture;

        this._initLights();
    }

    _initOcean() {
        var geometry = new THREE.PlaneBufferGeometry(this.height, this.height);
        this._loadTexture('https://raw.githubusercontent.com/jbouny/ocean/master/assets/img/waternormals.jpg').then((texture) => {
            texture.wrapS = texture.wrapT = THREE.RepeatWrapping;

            this.ocean = new Water(
                geometry, {
                textureWidth: 512,
                textureHeight: 512,
                waterNormals: texture,
                alpha: 1.0,
                sunDirection: this._skyboxLight.position.clone().normalize(),
                sunColor: 0xffffff,
                waterColor: 0x001e0f,
                distortionScale: 3.7,
                fog: this.scene.fog !== undefined
            }
            );
            this.ocean.position.set(0, 0, 0);
            this.ocean.rotateX(-Math.PI / 2);

            this.dispatch('oceanLoaded');

        });
    }

    toggleOcean(state) {
        if (state) {
            this.scene.add(this.ocean);
        } else {
            this.scene.remove(this.ocean);
        }

        this.ocean.material.dispose();
        this.ocean.geometry.dispose();
    }

    toggle3DTile(state) {
        if (state) {
            this.scene.add(this._3DTile);
        } else {
            this.scene.remove(this._3DTile);
        }
    }

    _initPhysicWorld() {

        //init oimo world
        this.physicWorld = new OIMO.World(PHYSICWORLD);

        //init all bodies in oimo world
        this.physicWorld.bodies = [];

        //init all mesh in oimo world
        this.physicWorld.meshes = [];

        //init ground in oimo world
        this.physicWorld.add({ size: [this.width, 5, this.height], pos: [0, 0, 0] }); // ground
    }

    _updatePhysicWorld() {
        // Step the physics world
        this.physicWorld.step();
        if (this.physicWorld && this.physicWorld.bodies.length > 0) {
            for (var i = 0; i !== this.physicWorld.bodies.length; i++) {
                var body = this.physicWorld.bodies[i];
                body.twinMesh.position.copy(body.getPosition());
                body.twinMesh.quaternion.copy(body.getQuaternion());
            }
        }
        localStorage.setItem('oimo-stats', this.physicWorld.getInfo());
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

                        var units = this.convertCoordinatesToUnits(coordinates[0], coordinates[1]);
                        var targetPosition = new THREE.Vector3(units[0] - this.centerWorldInMeters[0], altitude || 0, -(units[1] - this.centerWorldInMeters[1]));

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

                var units = this.convertCoordinatesToUnits(coordinates[0], coordinates[1]);
                var targetPosition = new THREE.Vector3(units[0] - this.centerWorldInMeters[0], altitude || 0, -(units[1] - this.centerWorldInMeters[1]));

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

    _loadTexture(texturePath) {
        return new Promise((resolve, reject) => {
            new THREE.ImageBitmapLoader().load(
                // resource URL
                texturePath,
                // onLoad callback
                (imageBitmap) => {
                    resolve(new THREE.CanvasTexture(imageBitmap));
                },
                // onProgress callback currently not supported
                undefined,

                // onError callback
                (err) => {
                    console.log('Error with texture', texturePath);
                    console.log('An error happened', err);
                    reject(err)
                }
            );
        });
    }

    _loadCubeTexture(texturePath) {
        return new Promise((resolve, reject) => {
            new THREE.TextureLoader().load(
                // resource URL
                texturePath,
                // onLoad callback
                (texture) => {
                    resolve(texture);
                },
                // onProgress callback currently not supported
                undefined,

                // onError callback
                (err) => {
                    console.log('Error with texture', texturePath);
                    console.log('An error happened', err);
                    reject(err)
                }
            );
        });
    }

    focusOnObject(obj) {
        this.cameraControls.rotateTo(0, 0, true);

        if (Array.isArray(obj))
            this.cameraControls.fitTo(obj[0], true);
        else
            this.cameraControls.fitTo(obj, true);


    }

    unFocusOnObject() {
        /*
        objects.forEach(object => {
            object.mesh.material.forEach(material => {
                material.opacity = 1;
                material.transparent = false;
            });
        });*/
    }

    updateObjectPosition(object, animation) {

        if (Array.isArray(object.mesh)) {
            object.mesh.forEach(element => {
                this.updateMeshPosition(element, object.geometry, animation)
            });

        } else {
            this.updateMeshPosition(object.mesh, object.geometry, animation)
        }

    }

    updateMeshPosition(mesh, geometry, animation) {

        var coordinates = this.convertCoordinatesToUnits(geometry.coordinates[0], geometry.coordinates[1]);
        var targetPosition = new THREE.Vector3(coordinates[0] - this.centerWorldInMeters[0], mesh.position.y, -(coordinates[1] - this.centerWorldInMeters[1]));

        //if anime
        if (animation) {

            //Smooth Animation Object
            new TWEEN.Tween(mesh.position).to(targetPosition, 5000)
                .on('update', () => {
                    mesh.updateMatrix();
                }).start() // Start the tween immediately.

        } else {
            mesh.position.copy(targetPosition);

        }

        mesh.lookAt(targetPosition);
        mesh.updateMatrix();

        return mesh;
    }

    /* onDocumentMouseClick(event) {
         event.preventDefault();
         this.mouse.x = (event.offsetX / window.innerWidth) * 2 - 1;
         this.mouse.y = - (event.offsetY / window.innerHeight) * 2 + 1;
         // find intersections
         var params = { Mesh: {}, Line: { threshold: 50 }, LOD: {}, Points: { threshold: 5 }, Sprite: {} };
         this.raycaster.params = params;
         this.raycaster.setFromCamera(this.mouse, this.camera);
         var intersects = this.raycaster.intersectObjects(this.scene.children);
 
         if (intersects.length > 0) {
             this.dispatch('intersectObject', intersects[0].object);
 
         }
     }*/

    clear() {
        var context = this.canvas.getContext("2d");
        context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    findObjectThroughUUID(object, objects, otherObjects, anotherObjects) {
        var foundElement = false;
        var foundObject = null;
        if (object) {
            objects.forEach(element => {
                if (element && element.mesh) {
                    element.mesh.forEach(objectMesh => {
                        if (object.uuid == objectMesh.uuid) {
                            foundElement = true;
                            foundObject = { obj: element, type: "first" };//VEHICLES
                        }
                    });
                }
            });

            if (!foundElement) {
                otherObjects.forEach(function (value, key) {
                    if (value && value.uuid && value.uuid == object.uuid && object.visible == true) {
                        var obj = anotherObjects.get(key);
                        foundObject = { obj: obj, type: "second" };//CONTAINERS

                    }
                });
            }
        }
        return foundObject;
    }

    flyHome() {
        this.cameraControls.setLookAt(0, this.zoom.start, 0, 0, 0, 0, true);
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