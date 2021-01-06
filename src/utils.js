import { reproject } from "reproject";
import proj4 from "proj4";

export default class utils {
    
    convertGeoJsonToWorldUnits(geojson) {
        return reproject(geojson, proj4.WGS84, proj4('EPSG:3785'));
    }

    convertCoordinatesToUnits(lng, lat) {
        return proj4('EPSG:3857', [lng, lat]);
    }
    
}