import * as utils from "./utils.js";
import TwinObject from "./twinobject.js"

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
                feature.properties.offset = offset;

                let shape = new TwinObject(properties).createExtrudeGeometry(feature, center);

                if (shape) {
                    scene.add(shape);
                    shape.geometry.dispose();
                }

                offset += 1;
            }

            // this.dispatch('layerloaded', layerCode);

            break;

        case "GLTF":

            for (let feature of geo.features) {
                feature.layerCode = layerCode;
                feature.properties = Object.assign({}, properties, feature.properties);

                let modelGLTF = await new TwinObject(properties).createModelGLTF(feature, center);

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

