/**
 * We reuse and extend http://jdomingu.github.io/ThreeGeoJSON/ to render geojson data in 3D with three.js.
 */
import * as THREE from "three";
import proj4 from 'proj4';
import mergeJSON from "merge-json";

const defaults = {
    material: {
        color: "rgb(255,255,255)",
        opacity: 0.5,
        transparent: true
    },
    altitude: 10,
    extrude: true,
    extrudeSettings: {
        steps: 2,
        bevelEnabled: false,
        depth: 10
    }
}

class ThreeDigitalObjects {

    constructor(json, options) {
        this._json_geom = this._createGeometryArray(json);
        this._options = this._getOptions(options);
        console.log(this._options)
        this._objects = new THREE.Group();
        this._drawObjects();
    }

    _getOptions(options) {
        return mergeJSON.merge(defaults, options);
    }

    _drawObjects() {

        let coordinates = [];

        for (let geom_num = 0; geom_num < this._json_geom.length; geom_num++) {

            if (this._json_geom[geom_num].type == 'Point') {
                coordinates.push(this._convertToPlaneCoords(this._json_geom[geom_num].coordinates))
                this._drawParticle(coordinates, this._options);
                coordinates = [];

            } else if (this._json_geom[geom_num].type == 'MultiPoint') {
                for (let point_num = 0; point_num < this._json_geom[geom_num].coordinates.length; point_num++) {
                    coordinates.push(this._convertToPlaneCoords(this._json_geom[geom_num].coordinates[point_num]));
                    this._drawParticle(coordinates, this._options);
                    coordinates = [];
                }

            } else if (this._json_geom[geom_num].type == 'LineString') {
                for (let segment_num = 0; segment_num < this._json_geom[geom_num].coordinates.length; segment_num++) {
                    coordinates.push(this._convertToPlaneCoords(this._json_geom[geom_num].coordinates[segment_num]));
                }
                this._drawLine(coordinates, this._options);
                coordinates = [];

            } else if (this._json_geom[geom_num].type == 'Polygon') {
                for (let segment_num = 0; segment_num < this._json_geom[geom_num].coordinates.length; segment_num++) {
                    for (let point_num = 0; point_num < this._json_geom[geom_num].coordinates[segment_num].length; point_num++) {
                        coordinates.push(this._convertToPlaneCoords(this._json_geom[geom_num].coordinates[segment_num][point_num]));
                    }
                    this._drawPolygon(coordinates, this._options);
                    coordinates = [];
                }

            } else if (this._json_geom[geom_num].type == 'MultiLineString') {
                for (let polygon_num = 0; polygon_num < this._json_geom[geom_num].coordinates.length; polygon_num++) {
                    for (let segment_num = 0; segment_num < this._json_geom[geom_num].coordinates[polygon_num].length; segment_num++) {
                        for (let point_num = 0; point_num < this._json_geom[geom_num].coordinates[polygon_num][segment_num].length; point_num++) {
                            coordinates.push(this._convertToPlaneCoords(this._json_geom[geom_num].coordinates[polygon_num][segment_num][point_num]));
                        }
                        this._drawLine(coordinates, this._options);
                        coordinates = [];
                    }
                }

            } else if (this._json_geom[geom_num].type == 'MultiPolygon') {
                for (let polygon_num = 0; polygon_num < this._json_geom[geom_num].coordinates.length; polygon_num++) {
                    for (let segment_num = 0; segment_num < this._json_geom[geom_num].coordinates[polygon_num].length; segment_num++) {
                        for (let point_num = 0; point_num < this._json_geom[geom_num].coordinates[polygon_num][segment_num].length; point_num++) {
                            coordinates.push(this._convertToPlaneCoords(this._json_geom[geom_num].coordinates[polygon_num][segment_num][point_num]));
                        }
                        this._drawPolygon(coordinates, this._options);
                        coordinates = [];
                    }
                }
            } else {
                coordinates = [];
                throw new Error('The geoJSON is not valid.');
            }
        }
    }

    _createGeometryArray(json) {
        let geometry_array = [];

        if (json.type == 'Feature') {
            geometry_array.push(json.geometry);
        } else if (json.type == 'FeatureCollection') {
            for (let feature_num = 0; feature_num < json.features.length; feature_num++) {
                geometry_array.push(json.features[feature_num].geometry);
            }
        } else if (json.type == 'GeometryCollection') {
            for (let geom_num = 0; geom_num < json.geometries.length; geom_num++) {
                geometry_array.push(json.geometries[geom_num]);
            }
        } else {
            throw new Error('The geoJSON is not valid.');
        }

        return geometry_array;
    }

    _convertCoordinatesToWorld(lng, lat) {
        return proj4('EPSG:3785', [lng, lat]);
    }

    _convertToPlaneCoords(coordinates_array) {
        let lon = coordinates_array[0];
        let lat = coordinates_array[1];
        let coord = this._convertCoordinatesToWorld(lon, lat);
        return new THREE.Vector3(coord[0], 0, coord[1]);
    }

    _drawParticle(coordinates) {
        let particle_geom = new THREE.Geometry();
        particle_geom.vertices.push(coordinates[0]);
        particle_geom.translateY(this._options.altitude);
        let particle_material = new THREE.PointsMaterial(this._options.material);
        let particle = new THREE.Points(particle_geom, particle_material);
        this.addMeshInObjects(particle);
    }

    _drawLine(coordinates) {
        let line_geom = new THREE.Geometry();
        let line_material = new THREE.LineBasicMaterial(this._options.material);
        line_geom.vertices = coordinates;
        line_geom.rotateX(Math.PI); //the line is created on the x, y plane.It is necessary to rotate the polygon.
        line_geom.translate(0, this._options.altitude, 0);
        let line = new THREE.Line(line_geom, line_material);
        this.addMeshInObjects(line);
    }

    _drawPolygon(coordinates) {
        var shape = this._createShape(coordinates);
        var geometry = new THREE.ExtrudeBufferGeometry(shape, this._options.extrudeSettings);
        geometry.rotateX(-Math.PI / 2); //the polygon is created on the x, y plane.It is necessary to rotate the polygon.
        geometry.translate(0, this._options.altitude, 0);
        var material = new THREE.MeshPhongMaterial(this._options.material);
        var poly = new THREE.Mesh(geometry, material);
        this.addMeshInObjects(poly);
    }

    _createShape(coordinates) {

        var shape = new THREE.Shape();

        if (coordinates.length > 0);
        {
            shape.moveTo(coordinates[0].x, coordinates[0].z);
            for (var i = 1; i < coordinates.length; i++) {
                shape.lineTo(coordinates[i].x, coordinates[i].z);
            }
            shape.moveTo(coordinates[0].x, coordinates[0].z);
        }

        return shape;
    }

    addMeshInObjects(mesh) {
        this._objects.add(mesh);
    }

    addTo(scene) {
        scene.add(this._objects);
    }
}

export default ThreeDigitalObjects;
