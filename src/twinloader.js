import * as THREE from "three";
import * as utils from "./utils.js";
import TwinDynamicLayer from "./twindynamiclayer.js";
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { centroid } from '@turf/centroid'
import { polygon } from "@turf/helpers";
import TwinObject from "./twinobject.js";
import Delaunator from 'delaunator';
var offset = 0;

export default class TwinLoader {

    constructor(center, scene) {
        this.center = center; // in meters
        this.scene = scene;
    }

    /**
     * 
     * @param {*} geometry 
     * @param {*} material 
     * @param {*} positions - e.g. {x: 1, y,: 1, z: 1}
     */
    loadInstancedMesh(geometry, material, positions) {

        let mesh = new TwinDynamicLayer(geometry, material, positions.length);
        this.scene.add(mesh);

        const dummy = new THREE.Object3D();
        this.scene.add(mesh);

        for (let i = 0; i < positions.length; i++) {
            let units = utils.convertCoordinatesToUnits(positions[i].x, positions[i].z)
            dummy.position.set(units[0] - this.center[0], positions[i].y, -(units[1] - this.center[1]));
            dummy.rotation.set(0, Math.PI / 4.5, 0);
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
        }

        return mesh;
    }


    /**
     * 
     * @param {Object} geojson - geojson object
     * @param {Object} properties 
     * @param {String} type - EXTRUDE, GLTF
     */
    async loadLayer(geojson, properties, type) {

        if (geojson == null || geojson.features == null) return;

        var geo = utils.convertGeoJsonToWorldUnits(geojson);
        var shape; 

        switch (type) {
            case "DEM":
                shape = this.createDEM(geo.features);

                if (shape)
                    this.scene.add(shape);

                break;
            case "EXTRUDE":

                for (let feature of geo.features) {
                    feature.properties = Object.assign({}, properties, feature.properties);
                    feature.properties.offset = offset;

                    let shape = this.createExtrudeGeometry(feature, this.center);

                    if (shape) {
                        this.scene.add(shape);
                        shape.geometry.dispose();
                    }

                    offset += 1;
                }
                break;

            case "GLTF":

                for (let feature of geo.features) {
                    feature.properties = Object.assign({}, properties, feature.properties);

                    let modelGLTF = await this.createModelGLTF(feature, this.center);

                    if (modelGLTF) {
                        this.scene.add(modelGLTF);
                    }
                }
                break;

            default:
                break;
        }
    }

    createMaterial(properties) {

        var textureTop;
        var textureSide;

        if (properties.textureTop) {
            textureTop = new THREE.TextureLoader().load(properties.textureTop) || null;
            textureTop.wrapS = THREE.RepeatWrapping;
            textureTop.wrapT = THREE.RepeatWrapping;
            textureTop.flipY = false;
        }

        if (properties.textureSide) {
            textureSide = new THREE.TextureLoader().load(properties.textureSide) || null;
            textureSide.wrapS = THREE.RepeatWrapping;
            textureSide.wrapT = THREE.RepeatWrapping;
            textureSide.flipY = false;
        }

        var material = [new THREE.MeshPhongMaterial({
            color: new THREE.Color(properties.colorTop) || null,
            opacity: properties.opacityTop,
            transparent: true,
            map: textureTop || null,
            polygonOffset: properties.polygonOffset || false, // fix overlapping problems
            polygonOffsetFactor: properties.polygonOffsetFactor || -1, // fix overlapping problems
            polygonOffsetUnits: properties.polygonOffsetUnits - properties.offset || -1 * properties.offset // fix overlapping problems
        }), new THREE.MeshPhongMaterial({
            color: new THREE.Color(properties.colorSide) || null,
            opacity: properties.opacitySide,
            transparent: true,
            map: textureSide || null,
            polygonOffset: properties.polygonOffset || false, // fix overlapping problems
            polygonOffsetFactor: properties.polygonOffsetFactor || -1, // fix overlapping problems
            polygonOffsetUnits: properties.polygonOffsetUnits - properties.offset || -1 * properties.offset // fix overlapping problems
        })]

        return material;
    }

    createShapeFromGeoJson(feature) {
        var vecs2 = [];
        var shapes = [];

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

            shapes.push(shape);
            vecs2 = [];
        }

        return shapes;
    }

    createExtrudeGeometry(feature) {

        var shapearray = this.createShapeFromGeoJson(feature);

        var material =
            this.createMaterial(feature.properties.material);

        var extrudeSettings = {
            depth: feature.properties.depth,
            bevelEnabled: false,
            bevelSegments: 1,
            steps: 5,
            bevelSize: 0,
            bevelThickness: 1
        };

        var geometry = new THREE.ExtrudeBufferGeometry(shapearray, extrudeSettings);
        geometry.translate(-this.center[0], -this.center[1], feature.properties.altitude);
        var mesh = new TwinObject(geometry, material);


        if (material[0].map) {
            this.adjustTextureTopRepeat(mesh, feature.properties.material.textureSizeTop);
        }

        if (material[1].map) {
            this.adjustTextureSideRepeat(mesh, feature.properties.material.textureSizeSide);
        }

        mesh.matrixAutoUpdate = false;
        mesh.receiveShadow = false;
        mesh.rotateOnAxis(new THREE.Vector3(1, 0, 0), - Math.PI / 2);
        mesh.updateMatrix();

        geometry.dispose();

        return mesh;
    }

    async createModelGLTF(feature) {

        var coordX;
        var coordY;
        var centroid_obj

        if (feature.geometry.type == "MultiPoint") {
            coordX = feature.geometry.coordinates[0][0];
            coordY = feature.geometry.coordinates[0][1];
        }
        else if (feature.geometry.type != "Point") {
            centroid_obj = centroid(polygon(feature.geometry.coordinates));
            coordX = centroid_obj.geometry.coordinates[0];
            coordY = centroid_obj.geometry.coordinates[1];
        } else {
            coordX = feature.geometry.coordinates[0];
            coordY = feature.geometry.coordinates[1];
        }

        var mesh;
        await this.loadGLTF(feature.properties.model).then((object) => {

            object.position.set(coordX - this.center[0], feature.properties.altitude, -(coordY - this.center[1]));
            object.matrixAutoUpdate = false;
            object.receiveShadow = false;
            object.updateMatrix();

            mesh = object;
        });

        return mesh;
    }

    createDEM(features) {

        var mesh = new THREE.Group();
        var points3d = [];
        for (var feature of features) {
            var coordinates = feature.geometry.coordinates;
            points3d.push(new THREE.Vector3(coordinates[0] - this.center[0], coordinates[1] - this.center[1], - coordinates[2] * 2));
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

        var plane = new TwinObject(geometry, new THREE.MeshPhongMaterial({ color: "blue", side: THREE.BackSide, wireframe: false }));

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
                undefined, // onProgress Callback
                (error) => {
                    console.error(error);
                }
            );
        });
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


}