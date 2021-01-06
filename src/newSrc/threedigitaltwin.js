import * as THREE from "three";
import { reproject } from "reproject";
import proj4 from "proj4";
import CameraControls from 'camera-controls';

CameraControls.install({ THREE: THREE });

const NUM_MAX_OBJECT_LOOP = 100;
const REFRESH_TIMEOUT = 500; //ms
class Twin {

    constructor(canvas) {
        this._clock = new THREE.Clock();
        this._canvas = canvas;
        this._center = this._convertCoordinatesToWorldUnits([-8.7016652234108349, 41.185523935676713]);
        this._camera = null;
        this._scene = null;
        this._renderer = null;
        this._controls = null;

        this._meshes = [];
        this._delta = 0;
        this.events = {};
    }

    setCenter(center) {
        this._center = this._convertCoordinatesToWorldUnits(center);
    }

    /*  lon => x
        lat => z
        depth / altitude => y 
    */
    initScene() {

        /// Init Scene
        this._scene = new THREE.Scene();

        /// Init Camera
        this._camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 5000);

        /// Init Render
        this._renderer = new THREE.WebGLRenderer({ canvas: this._canvas, antialias: true, powerPreference: "high-performance", physicallyCorrectLights: true });
        this._renderer.shadowMap.enabled = false;
        this._renderer.setSize(window.innerWidth, window.innerHeight);
        window.addEventListener("resize", this._onWindowResize.bind(this), false);
        this._camera.position.y = 3000;

        /// Init Camera Controls
        this._controls = new CameraControls(this._camera, this._renderer.domElement);
        this._controls.verticalDragToForward = true;
        this._controls.dollyToCursor = false;
        this._controls.maxDistance = 5000;

        /// Init Lights
        let light = new THREE.PointLight(0xffffff);
        light.position.set(0, 150, 100);
        this._scene.add(light);

        this._scene.add(new THREE.AmbientLight(0x404040));

        /// Helpers (@remove)
        const size = 100;
        const axesHelper = new THREE.AxesHelper(size);
        this._scene.add(axesHelper);

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

    _dispatchLoop() {

        let dispatchCount = 0;

        for (let i = 0; i < this._meshes.length; i++) {

            let mesh = this._meshes[i];
            console.log(mesh);
            this._scene.add(mesh);
            this._meshes.splice(i, 1);

            dispatchCount++;

            if (dispatchCount == NUM_MAX_OBJECT_LOOP) {
                break;
            }

        }
    }

    _animate(now) {

        // each X seconds
        if (!this._last || now - this._last >= REFRESH_TIMEOUT) {
            this._last = now;
            this._dispatchLoop();
        }

        const delta = this._clock.getDelta();
        this._controls.update(delta);

        requestAnimationFrame(this._animate.bind(this));

        //if (hasControlsUpdated) {
        this._renderer.render(this._scene, this._camera);
        //}
    }

    removeSceneLayers() {
        this._clearThree(this._scene);
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

    _calcVertices(geometry) {
        var vecs2 = [];
        var vertices = [];

        for (var P of geometry.coordinates) {
            if (geometry.type === "MultiPolygon") {
                P = P[0];
            }

            var p0 = new THREE.Vector2(
                P[0][0] - this._center[0], //adjust to center
                P[0][1] - this._center[1] //adjust to center
            );
            for (var i = 1; i < P.length; ++i) {
                var p1 = new THREE.Vector2(
                    P[i][0] - this._center[0], //adjust to center
                    P[i][1] - this._center[1] //adjust to center
                );
                vecs2.push(p0, p1);
                p0 = p1;
            }

            vertices.push(new THREE.Shape(vecs2));

            vecs2 = [];
        }

        return vertices;
    }

    showGridHelper() {
        const gridHelper = new THREE.GridHelper(3000, 10)
        this._scene.add(gridHelper);
    }

    _convertGeoJsonToWorldUnits(geojson) {
        return reproject(geojson, proj4.WGS84, proj4("EPSG:3785"));
    }

    _convertCoordinatesToWorldUnits(coords) {
        return proj4("EPSG:3857", coords);
    }

    _dispatch(eventName, data) {
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

export { Twin as default }