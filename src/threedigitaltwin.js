import * as THREE from "three";
import { MapControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import ThreeDigitalObjects from "./threedigitalobjects.js";
import proj4 from 'proj4';
import mergeJSON from "merge-json";

const WORLD_WIDTH = 20026376.39 * 2;
const WORLD_HEIGHT = 20048966.10 * 2;


const defaults = {
    helpers: true,
    world: {
        center: {
            latitude: 0,
            longitude: 0
        },
        zoom: 1000
    },
    camera: {
        fov: 75,
        near: 0.0000001,
        far: 100000

    }
}

class ThreeDigitalTwin {

    constructor(inputElement, canvas, options) {

        this.inputElement = inputElement;
        this.canvas = canvas;
        this.width = inputElement.clientWidth;
        this.height = inputElement.clientHeight;
        this.aspect = inputElement.clientWidth / inputElement.clientHeight;

        this.options = mergeJSON.merge(defaults, options);

        this.camera = null;
        this.scene = null;
        this.renderer = null;
        this.controls = null;
        this.container = null

        this._init();
        this._render();
    }

    _convertCoordinatesToWorld(lng, lat) {
        return proj4('EPSG:3785', [lng, -lat]);
    }

    _init() {

        this._initScene();
        this._initRenderer();
        this._initCamera();
        this._initEnvironment();
        if (this.options.helpers) this._initHelpers();
        this._initControls();
    }

    _initScene() {

        this.scene = new THREE.Scene();
        //this.scene.background = new THREE.Color(0xf0f0f0);
    }

    _initRenderer() {
        this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, canvas: this.canvas });
        this.renderer.setPixelRatio(1);
        this.renderer.setSize(this.width, this.height, false);
        this.renderer.shadowMap.enabled = true;
    }

    _initCamera() {

        this.camera = new THREE.PerspectiveCamera(this.options.camera.fov, this.aspect, this.options.camera.near, this.options.camera.far);

    }

    _initControls() {

        this.controls = new MapControls(this.camera, this.inputElement);
        this.controls.enableDamping = false;
        this.controls.screenSpacePanning = false;
        this.controls.zoomSpeed = 10;
        this.controls.maxPolarAngle = (Math.PI / 2) - 0.1;
        this.controls.maxDistance = WORLD_HEIGHT;
        this.controls.minDistance = 10;

        /** We place x and z axis on earth, latitude will cut across -z axis and longitude will cut across x axis */

        let center = this._convertCoordinatesToWorld(this.options.world.center.longitude, this.options.world.center.latitude);
        this.controls.target = new THREE.Vector3(center[0], 0, center[1]);
        this.camera.position.set(center[0], this.options.world.zoom, center[1]);
        this.camera.lookAt(this.controls.target);

        this.controls.update();
        //this.controls.addEventListener('change', this._render.bind(this));
    }

    _initEnvironment() {

        this._initSkyBox();
        this._initOcean();
    }

    _initOcean() {
        var geometry = new THREE.PlaneBufferGeometry(WORLD_WIDTH, WORLD_HEIGHT, 32);
        var material = new THREE.MeshBasicMaterial({ color: 0x4977af });

        var ocean = new THREE.Mesh(geometry, material);
        ocean.rotateX(- Math.PI / 2);
        this.scene.add(ocean);
    }

    _initSkyBox() {
        // Add Sky
        this.sky = new Sky();
        this.sky.scale.setScalar(WORLD_HEIGHT);
        this.scene.add(this.sky);

        // Add Sun Helper
        this.sunSphere = new THREE.Mesh(
            new THREE.SphereBufferGeometry(200000, 16, 8),
            new THREE.MeshBasicMaterial({ color: 0xffffff })
        );

        this.scene.add(this.sunSphere);

        var effectController = {
            turbidity: 10,
            rayleigh: 2,
            mieCoefficient: 0.005,
            mieDirectionalG: 0.8,
            luminance: 1,
            // 0.48 is a cracking dusk / sunset
            // 0.4 is a beautiful early-morning / late-afternoon
            // 0.2 is a nice day time
            inclination: 0.48, // elevation / inclination
            azimuth: 0.25, // Facing front,
            sun: true
        };

        var distance = WORLD_HEIGHT / 2;

        var uniforms = this.sky.material.uniforms;
        uniforms["turbidity"].value = effectController.turbidity;
        uniforms["rayleigh"].value = effectController.rayleigh;
        uniforms["mieCoefficient"].value = effectController.mieCoefficient;
        uniforms["mieDirectionalG"].value = effectController.mieDirectionalG;
        uniforms["luminance"].value = effectController.luminance;

        var theta = Math.PI * (effectController.inclination - 0.5);
        var phi = 2 * Math.PI * (effectController.azimuth - 0.5);

        this.sunSphere.position.z = distance * Math.cos(phi);
        this.sunSphere.position.y = distance * Math.sin(phi) * Math.sin(theta);
        this.sunSphere.position.x = distance * Math.sin(phi) * Math.cos(theta);

        this.sunSphere.visible = effectController.sun;

        uniforms["sunPosition"].value.copy(this.sunSphere.position);

        this._initLights();
    }


    _initLights() {

        //Ambient light
        this._ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
        this.scene.add(this._ambientLight);

        //Spot light
        this._skyboxLight = new THREE.PointLight(0xfffffe, 0.5);
        this._skyboxLight.color.setHSL(0.1, 1, 0.95);
        this._skyboxLight.position.copy(this.sunSphere.position);
        this.scene.add(this._skyboxLight);
    }

    _initHelpers() {

        // Axis Helper
        var axesHelper = new THREE.AxesHelper(WORLD_WIDTH);
        this.scene.add(axesHelper);
    }

    _resizeRendererToDisplaySize(renderer) {
        const canvas = this.inputElement;
        const width = canvas.clientWidth | 0;
        const height = canvas.clientHeight | 0;
        const needResize = canvas.width !== width || canvas.height !== height;
        if (needResize) {
            renderer.setSize(width, height, false);
        }
        return needResize;
    }

    _render() {

        /*
        if (this.controls) {
            this.controls.update();
            this.camera.lookAt(this.controls.target);
        }*/

        if (this._resizeRendererToDisplaySize(this.renderer)) {
            this.camera.aspect = this.inputElement.clientWidth / this.inputElement.clientHeight;
            this.camera.updateProjectionMatrix();
        }

        this.renderer.render(this.scene, this.camera);

        requestAnimationFrame(this._render.bind(this));
    }

    loadDataset(e) {

        var that = this;
        return new Promise((resolve) => {
            that.digitalObjects = new ThreeDigitalObjects(e.data, e.options);
            resolve(that.digitalObjects.addTo(this.scene));
        });

    }
}

ThreeDigitalTwin.EventDispatcher = THREE.EventDispatcher;
export default ThreeDigitalTwin;
