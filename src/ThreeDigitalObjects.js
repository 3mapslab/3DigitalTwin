/**
 * We reuse and extend http://jdomingu.github.io/ThreeGeoJSON/ to render geojson data in 3D with three.js.
 */
import * as THREE from "three";
import proj4 from 'proj4';

export default class ThreeDigitalObjects {

    constructor(json, options) {
        this._json_geom = this._createGeometryArray(json);
        this._options = options;
        this._objects = new THREE.Group();
        this._drawObjects();
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
                    for (let point_num = 0; point_num < this._json_geom[geom_num].coordinates[segment_num].length; point_num++) {
                        coordinates.push(this._convertToPlaneCoords(this._json_geom[geom_num].coordinates[segment_num][point_num]));
                    }
                    this._drawLine(coordinates, this._options);
                    coordinates = [];
                }

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
        let particle_material = new THREE.PointsMaterial(this._options.material);
        let particle = new THREE.Points(particle_geom, particle_material);
        this.addMeshInObjects(particle);
    }

    _drawLine(coordinates) {
        let line_geom = new THREE.Geometry();
        let line_material = new THREE.LineBasicMaterial(this._options.material);
        line_geom.vertices = coordinates;
        line_geom.rotateX(Math.PI); //the polygon is created on the x, y plane.It is necessary to rotate the polygon.
        let line = new THREE.Line(line_geom, line_material);
        this.addMeshInObjects(line);
    }

    _drawPolygon(coordinates) {

        let poly_material = new THREE.MeshPhongMaterial(this._options.material);
        var shape = this._createShape(coordinates);
        var geom = this._options.extrudeSettings ? new THREE.ExtrudeBufferGeometry(shape, this._options.extrudeSettings) : new THREE.ShapeBufferGeometry(shape);
        geom.rotateX(-Math.PI / 2); //the polygon is created on the x, y plane.It is necessary to rotate the polygon.
        let poly = new THREE.Mesh(geom, poly_material);
        this.addMeshInObjects(poly);
    }

    _createShape(coordinates) {

        let coords = [];
        for (var i = 0; i < coordinates.length; i++) {
            coords.push(new THREE.Vector2(coordinates[i].x, coordinates[i].z));
        }

        return new THREE.Shape(coords);
    }

    addMeshInObjects(mesh) {
        this._objects.add(mesh);
    }

    addTo(scene) {
        scene.add(this._objects);
    }
}
