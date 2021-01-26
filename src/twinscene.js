import * as THREE from "three";
import * as utils from "./utils.js";
import CameraControls from 'camera-controls';
import TwinMap from './twinmap.js'

const MAXOFFSET = 100000;
const near = 5;
const far = 3500;

export default class TwinScene {

    constructor(canvas, configs) {

        this.clock = new THREE.Clock();
        this.camera = null;
        this.scene = null;
        this.renderer = null;
        this.controls = null;
        this.meshes = [];
        this.delta = 0;
        this.events = {};

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


        /// Init Scene
        this.scene = new THREE.Scene();

        /// Init Camera
        this.camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, near, far);
        this.camera.position.set(0, this.zoom.start, 0);

        /// Init Render
        this.renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: "high-performance", physicallyCorrectLights: true });
        this.renderer.shadowMap.enabled = false;
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        window.addEventListener("resize", this.onWindowResize.bind(this), false);
        this.renderer.setClearColor(0x87ceeb, 1);

        /// Init Camera Controls
        this.controls = new CameraControls(this.camera, this.renderer.domElement);
        this.controls.verticalDragToForward = true;
        this.controls.dollyToCursor = false;
        this.controls.maxDistance = this.zoom.max;
        this.controls.maxPolarAngle = Math.PI;

        /// Init Lights
        let light = new THREE.PointLight(0xffffff);
        light.position.set(0, 150, 100);
        this.scene.add(light);

        //Ambient light
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
        this.scene.add(this.ambientLight);

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

        let map = new TwinMap().getMap();
        map.position.set(-this.centerInMeters[0], 0, this.centerInMeters[1]);

        // Display the map under all other objects
        map.material.polygonOffset = true;
        map.material.polygonOffsetUnits = MAXOFFSET;
        this.scene.add(map);

        this.animate();
        }

        
    animate() {

        const delta = this.clock.getDelta();
        this.controls.update(delta);

        requestAnimationFrame(this.animate.bind(this));
        this.renderer.render(this.scene, this.camera);
        
    }

}
