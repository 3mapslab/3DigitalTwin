import * as THREE from "three";

var boxWidth = 6.06;
var boxHeight = 2.6;
var boxDepth = 2.44;

let baseCube = new THREE.BoxBufferGeometry(
    boxWidth,
    boxHeight,
    boxDepth
);

var MAX_OBJECTS = 3000;

export class Containers extends THREE.Mesh {
    constructor(config, textures) {
        super();

        this.config = config;
        
        var material = [
            new THREE.MeshStandardMaterial({ color: "red" }),
            new THREE.MeshStandardMaterial({ color: "red" }),
            new THREE.MeshStandardMaterial({ color: "red" }),
            new THREE.MeshStandardMaterial({ color: "red" }),
            new THREE.MeshStandardMaterial({ color: "red" }),
            new THREE.MeshStandardMaterial({ color: "red" }),
          ];

        material.forEach((m, side) => {
            let texture = null;

            if (side == 0) texture = textures.backTexture;
            else if (side == 1) texture = textures.doorTexture;
            else if (side == 2 || side == 3) texture = textures.upTexture;
            else if (side == 4 || side == 5) texture = textures.sideTexture;

            m.onBeforeCompile = (shader) => {
                shader.uniforms.customTexture = {
                    type: "t",
                    value: new THREE.TextureLoader().load(texture),
                };

                shader.vertexShader = shader.vertexShader
                    .replace(
                        "#define STANDARD",
                        `#define STANDARD
        
        varying vec3 vColor;
        varying mat4 vPosition;`
                    )
                    .replace(
                        "#include <common>",
                        `#include <common>
            attribute vec3 aRotate;
            attribute vec3 aPosition;
            attribute vec3 aColor;`
                    )
                    .replace(
                        "#include <project_vertex>",
                        `#include <project_vertex>
              mat4 tPos = mat4(vec4(1.0,0.0,0.0,0.0),
                              vec4(0.0,1.0,0.0,0.0),
                              vec4(0.0,0.0,1.0,0.0),
                              vec4(aPosition.x,aPosition.y,aPosition.z,1.0));
              // Rotate
              mat4 rXPos = mat4(vec4(1.0,0.0,0.0,0.0),
                                  vec4(0.0,cos(aRotate.x),-sin(aRotate.x),0.0),
                                  vec4(0.0,sin(aRotate.x),cos(aRotate.x),0.0),
                                  vec4(0.0,0.0,0.0,1.0));
                
              mat4 rYPos = mat4(vec4(cos(aRotate.y),0.0,sin(aRotate.y),0.0),
                                  vec4(0.0,1.0,0.0,0.0),
                                  vec4(-sin(aRotate.y),0.0,cos(aRotate.y),0.0),
                                  vec4(0.0,0.0,0.0,1.0));
                
              mat4 rZPos = mat4(vec4(cos(aRotate.z),-sin(aRotate.z),0.0,0.0),
                                  vec4(sin(aRotate.z),cos(aRotate.z),0.0,0.0),
                                  vec4(0.0,0.0,1.0,0.0),
                                  vec4(0.0,0.0,0.0,1.0));
                                  
              vPosition = tPos * rXPos * rZPos * rYPos;
              gl_Position = projectionMatrix * modelViewMatrix * vPosition * vec4(position,1.0);`
                    );

                shader.fragmentShader = shader.fragmentShader
                    .replace(
                        "#define STANDARD",
                        `#define STANDARD
            uniform sampler2D customTexture;`
                    )
                    .replace(
                        "#include <fog_fragment>",
                        `#include <fog_fragment>
             vec4 col = texture2D(customTexture, vUv);
             gl_FragColor = col;`
                    );
            };
        });

        this.material = material;
        this.instancedGeometry = new THREE.InstancedBufferGeometry().copy(baseCube);
        this.instancedGeometry.instanceCount = MAX_OBJECTS;
    }
    init() {
        const aPosition = [];
        const aColor = [];
        const aRotate = [];

        for (let index = 0; index < MAX_OBJECTS; index++) {
            aPosition.push(-10000, -10000, -10000);
            aColor.push(0, 0, 0);
            aRotate.push(0, 0, 0);
        }

        this.frustumCulled = false;

        // forloop
        this.instancedGeometry.setAttribute(
            "aPosition",
            new THREE.InstancedBufferAttribute(new Float32Array(aPosition), 3, false)
        );
        this.instancedGeometry.setAttribute(
            "aColor",
            new THREE.InstancedBufferAttribute(new Float32Array(aColor), 3, false)
        );
        this.instancedGeometry.setAttribute(
            "aRotate",
            new THREE.InstancedBufferAttribute(new Float32Array(aRotate), 3, false)
        );

        this.geometry = this.instancedGeometry;
    }
    clean() {
        this.geometry.dispose();
    }
    update() { }

    dispose() {
        this.geometry.dispose();
        baseCube.dispose();
        this.material.dispose();
    }
}