import * as THREE from "three";
import * as utils from "./utils.js";
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { centroid } from '@turf/centroid'
import { polygon } from "@turf/helpers";

//import * as TwinLoader from "./twinloader.js"

var offset = 0;

/**
 * 
 * @param {Number} layerCode 
 * @param {Object} geojson - geojson object
 * @param {Object} properties 
 * @param {String} type - EXTRUDE, GLTF
 */
export async function loadLayer(layerCode, geojson, properties, type, center, scene) {

    if (geojson == null || geojson.features == null) return;

    var geo = utils.convertGeoJsonToWorldUnits(geojson);

    switch (type) {
        case "EXTRUDE":

            for (let feature of geo.features) {
                feature.layerCode = layerCode;
                feature.properties = Object.assign({}, properties, feature.properties);

                let shape = createExtrudeGeometry(feature, center);

                if (shape) {
                    scene.add(shape);
                    shape.geometry.dispose();
                }

                offset += 1;
            }

            // this.dispatch('layerloaded', layerCode);
            break;

        case "GLTF":
            console.log("GLTFFFFFFFFF")
            for (let feature of geo.features) {
                feature.layerCode = layerCode;
                feature.properties = Object.assign({}, properties, feature.properties);

                let modelGLTF = await createModelGLTF(feature, center);

                if (modelGLTF) {
                    scene.add(modelGLTF);
                }
            }

            //this.dispatch('layerloaded', layerCode);

            break;

        default:
            break;
    }
}

function createMaterial(properties) {

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
        polygonOffsetUnits: properties.polygonOffsetUnits - offset || -1*offset // fix overlapping problems
    }), new THREE.MeshPhongMaterial({
        color: new THREE.Color(properties.colorSide) || null,
        opacity: properties.opacitySide,
        transparent: true,
        map: textureSide || null,
        polygonOffset: properties.polygonOffset || false, // fix overlapping problems
        polygonOffsetFactor: properties.polygonOffsetFactor || -1, // fix overlapping problems
        polygonOffsetUnits: properties.polygonOffsetUnits - offset || -1*offset // fix overlapping problems
    })]

    return material;
}

function createExtrudeGeometry(feature, center) {

    var shapearray = createShapeFromGeoJson(feature);

    var material =
        createMaterial(feature.properties.material);

    var extrudeSettings = {
        depth: feature.properties.depth,
        bevelEnabled: false,
        bevelSegments: 1,
        steps: 5,
        bevelSize: 0,
        bevelThickness: 1
    };

    var geometry = new THREE.ExtrudeBufferGeometry(shapearray, extrudeSettings);
    geometry.translate(-center[0], -center[1], feature.properties.altitude);
    var mesh = new THREE.Mesh(geometry, material);

    
    if (material[0].map) {
        adjustTextureTopRepeat(mesh, feature.properties.material.textureSizeTop);
    }

    if (material[1].map) {
        adjustTextureSideRepeat(mesh, feature.properties.material.textureSizeSide);
    }

    mesh.matrixAutoUpdate = false;
    mesh.receiveShadow = false;
    mesh.rotateOnAxis(new THREE.Vector3(1, 0, 0), - Math.PI / 2);
    mesh.updateMatrix();

    geometry.dispose();

    return mesh;
}

function createShapeFromGeoJson(feature) {
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

function adjustTextureTopRepeat(mesh, textureSize) {

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

function adjustTextureSideRepeat(mesh, textureSize) {

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

async function createModelGLTF(feature, center) {

    var coordX;
    var coordY;
    var centroid_obj

    if (feature.geometry.type == "MultiPoint") {
        coordX = feature.geometry.coordinates[0][0];
        coordY = feature.geometry.coordinates[0][1];
    }
    else if (feature.geometry.type != "Point") {
        centroid_obj= centroid(polygon(feature.geometry.coordinates));
        coordX = centroid_obj.geometry.coordinates[0];
        coordY = centroid_obj.geometry.coordinates[1];
    } else {
        coordX = feature.geometry.coordinates[0];
        coordY = feature.geometry.coordinates[1];
    }

    var mesh;
    await loadGLTF(feature.properties.model).then((object) => {
        
        object.position.set(coordX - center[0], feature.properties.altitude, -(coordY - center[1]));
        object.matrixAutoUpdate = false;
        object.receiveShadow = false;
        object.updateMatrix();

        mesh = object;
    });

    return mesh;
}

function loadGLTF(objPath) {
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