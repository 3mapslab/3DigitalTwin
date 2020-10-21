import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KMZLoader } from 'three/examples/jsm/loaders/KMZLoader.js';
import { extrudeGeoJSON } from 'geometry-extrude';
import reproject from 'reproject-spherical-mercator';
import proj4 from 'proj4';
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { Water } from "three/examples/jsm/objects/Water.js";
import * as OIMO from "oimo";
import CameraControls from 'camera-controls'
import * as TWEEN from 'es6-tween';
import { MeshLine, MeshLineMaterial } from 'three.meshline';
import * as ThreeGeo from 'geo-three/build/geo-three.js';

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
        this.zoom.start = configs.zoom.start || 250;
        this.zoom.min = configs.zoom.min || 10;
        this.zoom.max = configs.zoom.max || 500;

        this.center = configs.center || {};
        this.center.lng = configs.center.lng || -8.7016652234108349;
        this.center.lat = configs.center.lat || 41.185523935676713;

        this.pitchAngle = configs.pitchAngle || {}
        this.pitchAngle.start = configs.pitchAngle.start || 0;
        this.pitchAngle.min = configs.pitchAngle.min || 0;
        this.pitchAngle.max = configs.pitchAngle.max || Math.PI;

        this.bearingAngle = configs.bearingAngle || {}
        this.bearingAngle.start = configs.bearingAngle.start || 0;
        this.bearingAngle.min = configs.bearingAngle.min || 0;
        this.bearingAngle.max = configs.bearingAngle.max || Math.PI / 2;
        
        this.oceanVisible = configs.oceanVisible || true;
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

        this.scene = new THREE.Scene();
        //this.scene.background = new THREE.Color(0xcce0ff);
        //this.scene.fog = new THREE.Fog(0xcce0ff, far / 4, far / 2);
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
        this.cameraControls.maxPolarAngle = Math.PI / 2;
        this.cameraControls.maxDistance = this.zoom.max; //1KM

        const bb = new THREE.Box3(
            new THREE.Vector3(-this.width / 2, 10, -this.height / 2),
            new THREE.Vector3(this.width / 2, this.cameraControls.maxDistance, this.height / 2)
        );
        this.cameraControls.setBoundary(bb);
        this.cameraControls.saveState();



        if (axisHelper) {
            var axesHelper = new THREE.AxesHelper(this.width / 2);
            this.scene.add(axesHelper);
        }


        window.addEventListener('resize', this.onWindowResize.bind(this), false);
        canvas.addEventListener('click', this.onDocumentMouseClick.bind(this), false);

        this._initAllTextures();
        this._initAllModels();
        if (this.oceanVisible) {
            this._initOcean();
        }
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

    prepareLayer(layerCode, geojson, properties, outline) {
        if (geojson == null || geojson.features == null) return;
        var prop = properties;

        geojson.features.forEach(feature => {
            var geojson_feature = {
                "type": "FeatureCollection",
                "features": [feature],
            };
            if (feature.properties.asset_type_configuration) {

                if (feature.properties.asset_type_configuration.options_extrudeSettings_depth)
                    prop.depth = feature.properties.asset_type_configuration.options_extrudeSettings_depth;

                if (feature.properties.asset_type_configuration.options_altitude)
                    prop.altitude = feature.properties.asset_type_configuration.options_altitude;

                if (feature.properties.asset_type_configuration.options_material_color)
                    prop.material.color = feature.properties.asset_type_configuration.options_material_color.substring(0, 7);

                if (feature.properties.asset_type_configuration.options_material_opacity)
                    prop.material.opacity = feature.properties.asset_type_configuration.options_material_opacity;

                this.loadLayer(layerCode, geojson_feature, prop, outline);
            } else {
                this.loadLayer(layerCode, geojson_feature, properties, outline);
            }
        });
    }

    loadLayer(layerCode, geojson, properties, outline) {
        if (geojson == null || geojson.features == null) return;
        var depth, altitude, color, opacity;

        if (properties) {
            depth = properties && properties.depth != null && !isNaN(properties.depth) ? properties.depth : 2;
            altitude = properties && properties.altitude != null && !isNaN(properties.altitude) ? properties.altitude : 0;
            color = properties && properties.material && properties.material.color ? properties.material.color : 'white';
            opacity = properties && properties.material && properties.material.opacity != null ? properties.material.opacity : 1;
        }

        var material_options = {
            color: new THREE.Color(color),
            opacity: opacity,
        };

        var reproject_geojson = this.convertGeoJsonToWorldUnits(geojson);

        const { polygon } = extrudeGeoJSON(reproject_geojson, {
            depth: depth,
            simplify: 0,
            excludeBottom: true,
            translate: [-this.centerWorldInMeters[0], -this.centerWorldInMeters[1]]
        });
        const { position, normal, indices } = polygon;

        var mesh = null;
        var geometry = null;
        var material = null;

        if (outline) {

            geometry = new THREE.Geometry();
            for (let i = 0; i < position.length; i += 3) {
                geometry.vertices.push(new THREE.Vector3(position[i], position[i + 1], altitude + depth));
            }
            var line = new MeshLine();
            line.setGeometry(geometry, function (p) { return p / 2; });

            material = new MeshLineMaterial(material_options);
            mesh = new THREE.Mesh(line.geometry, material);

        } else {

            geometry = new THREE.BoxBufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
            geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
            geometry.setIndex(new THREE.Uint32BufferAttribute(indices, 1));
            geometry.translate(0, 0, altitude);

            material = new THREE.MeshPhongMaterial(material_options);
            mesh = new THREE.Mesh(geometry, material);

        }
        mesh.matrixAutoUpdate = false;
        mesh.receiveShadow = false;
        mesh.rotateOnAxis(new THREE.Vector3(1, 0, 0), - Math.PI / 2);
        mesh.updateMatrix();

        this.scene.add(mesh);

        if (layerCode) {
            var value = [];
            if (this.layers.get(layerCode)) {
                value = this.layers.get(layerCode);
            }
            value.push(mesh);
            this.layers.set(layerCode, value);
        }


        geometry.dispose();
        material.dispose();

        return mesh;

    }

    removeLayer(layerCode) {
        if (layerCode) {
            var meshes = this.layers.get(layerCode);

            meshes.forEach(mesh => {
                if (mesh && mesh.geometry) {
                    mesh.geometry.dispose();
                    this.scene.remove(mesh);
                }
            });
            this.layers.delete(layerCode);
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
        return reproject(geojson);
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
            this.ocean.material.depthWrite = false;
            this.ocean.material.polygonOffset = true;
            this.ocean.material.polygonOffsetFactor = 1;
            this.ocean.material.polygonOffsetUnits = 16;
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

    _loadKMZModel(modelPath, coordinates) {
        
        return new Promise((reject) => {
            new KMZLoader().load(
                // resource URL
                modelPath,
                // onLoad callback
                (kmz) => {
                    var units = this.convertCoordinatesToUnits(coordinates[0], coordinates[1]);
                    var targetPosition = new THREE.Vector3(units[0] - this.centerWorldInMeters[0], 0, -(units[1] - this.centerWorldInMeters[1]));
                    kmz.scene.position.copy(targetPosition);

                    this.scene.add(kmz.scene);
                    this.renderer.render();
                },
                // onError callback
                (err) => {
                    console.log('Error with model', modelPath);
                    console.log('An error happened', err);
                    reject(err)
                }
            )}
        );
        
    }

    _loadModel(modelPath, coordinates) {

        var loader = new GLTFLoader();
        loader.load(
            // resource URL
            modelPath,
            // onLoad callback
            (gltf) => {
                var units = this.convertCoordinatesToUnits(coordinates[0], coordinates[1]);
                var targetPosition = new THREE.Vector3(units[0] - this.centerWorldInMeters[0], 0, -(units[1] - this.centerWorldInMeters[1]));
                gltf.scene.position.copy(targetPosition);
                
                this.scene.add(gltf.scene);
                this.renderer.render();
            },
            // onError callback
            (error) => {
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

    onDocumentMouseClick(event) {
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