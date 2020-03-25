import * as THREE from "three";
import { MapControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { ThreeDigitalObjects } from "ThreeDigitalTwin";
import axios from 'axios';
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
        fov: 60,
        near: 0.00000001,
        far: 1000000000
    }
}

class ThreeDigitalTwin {

    constructor(mapid, options) {

        this.mapid = mapid;
        this.options = mergeJSON.merge(defaults, options);

        this.camera = null;
        this.scene = null;
        this.renderer = null;
        this.controls = null;
        this.container = null

        this._init();
        this._animate();

        console.log(proj4('EPSG:3785'));
    }

    _convertCoordinatesToWorld(lng, lat) {
        return proj4('EPSG:3785', [lng, -lat]);
    }

    _init() {

        this._initScene();
        this._initRenderer();
        this._initCamera();
        this._initEnvironment();
        //if (this.options.helpers) this._initHelpers();
        this._initControls();
        window.addEventListener('resize', this._onWindowResize.bind(this), false);
    }

    _initScene() {

        this.scene = new THREE.Scene();
        //this.scene.fog = new THREE.FogExp2(0xcccccc, 0.01);
        //this.scene.background = new THREE.Color(0xff0000);
    }

    _initRenderer() {
        this.container = document.getElementById(this.mapid);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.container.appendChild(this.renderer.domElement);
    }

    _initCamera() {

        this.camera = new THREE.PerspectiveCamera(this.options.camera.fov, window.innerWidth / window.innerHeight, this.options.camera.near, this.options.camera.far);
    }

    _initControls() {

        this.controls = new MapControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.screenSpacePanning = true;
        this.controls.zoomSpeed = 10.0;
        this.controls.maxPolarAngle = Math.PI / 2;
        this.controls.maxDistance = WORLD_HEIGHT;
        window.controls = this.controls;

        /** We place x and z axis on earth, latitude will cut across -z axis and longitude will cut across x axis */

        let center = this._convertCoordinatesToWorld(this.options.world.center.longitude, this.options.world.center.latitude);
        this.controls.target = new THREE.Vector3(center[0], 0, center[1]);
        this.camera.position.set(center[0], this.options.world.zoom, center[1]);
        this.camera.lookAt(this.controls.target);
        this.controls.update();
    }

    _initEnvironment() {

        this._initLights();
        this._initSkyBox();
        //this._initOcean();
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
            new THREE.SphereBufferGeometry(20000, 16, 8),
            new THREE.MeshBasicMaterial({ color: 0xffffff })
        );

        this.sunSphere.visible = false;
        this.scene.add(this.sunSphere);

        var effectController = {
            turbidity: 10,
            rayleigh: 2,
            mieCoefficient: 0.005,
            mieDirectionalG: 0.8,
            luminance: 1,
            inclination: 0.49, // elevation / inclination
            azimuth: 0.25, // Facing front,
            sun: true
        };

        var distance = 40;

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
    }


    _initLights() {
        //Ambient light
        let _ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
        this.scene.add(_ambientLight);

        let _skyboxLight = new THREE.DirectionalLight(0xffffff, 1);
        _skyboxLight.castShadow = true;


        var d = 10000;
        _skyboxLight.shadow.camera.left = -d;
        _skyboxLight.shadow.camera.right = d;
        _skyboxLight.shadow.camera.top = d;
        _skyboxLight.shadow.camera.bottom = -d;

        this.scene.add(_skyboxLight);

        var spotLightHelper = new THREE.SpotLightHelper(_skyboxLight);
        this.scene.add(spotLightHelper);

    }

    _initHelpers() {

        // Axis Helper
        var axesHelper = new THREE.AxesHelper(WORLD_HEIGHT);
        this.scene.add(axesHelper);
    }

    _animate() {
        requestAnimationFrame(this._animate.bind(this));

        if (this.controls) {
            this.controls.update();
            this.camera.lookAt(this.controls.target);
        }

        this._render();
    }

    _render() {

        this.renderer.render(this.scene, this.camera);

    }

    _onWindowResize() {

        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);

    }

    getThreeOptions(options) {
        var prop = {};


        prop.material = {};
        prop.material.color = options.color;
        prop.material.shadowSide = THREE.FrontSide;
        prop.material.side = THREE.FrontSide;
        //prop.material.wireframe = true;
        //prop.material.wireframeLinewidth = 1;

        prop.extrudeSettings = {
            steps: 2,
            depth: 16,
            bevelEnabled: false
        };

        return prop;
    }

    async loadDataset(path, options) {

        return new Promise((resolve, reject) => {
            axios.get(path).then(res => {
                let digitalObjects = new ThreeDigitalObjects(res.data, this.getThreeOptions(options));
                resolve(digitalObjects.addTo(this.scene));
            }).catch(function (error) {
                reject(error);
            });
        });
    }

    async loadDatasets(path) {
        return new Promise((resolve, reject) => {
            axios.get(path)
                .then(async (config) => {
                    config.data.datasets.forEach(async (d) => {
                        await this.loadDataset(d.path, d.options);
                    });
                    resolve();
                }).catch(function (err) {
                    reject(err);
                })
        });
    }

}

export default ThreeDigitalTwin;
