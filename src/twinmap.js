import * as GeoThree from 'geo-three/build/geo-three.js';

const key = "pk.eyJ1IjoidHJpZWRldGkiLCJhIjoiY2oxM2ZleXFmMDEwNDMzcHBoMWVnc2U4biJ9.jjqefEGgzHcutB1sr0YoGw";

export default class TwinMap {

    constructor() {

        // Create a map tiles provider object
        var provider = new GeoThree.MapBoxProvider(key, "mapbox/streets-v10", GeoThree.MapBoxProvider.STYLE);
        this.map = new GeoThree.MapView(GeoThree.MapView.PLANAR, provider);
    }

    getMap() {
        return this.map;
    }

}