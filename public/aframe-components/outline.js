AFRAME.registerComponent('outline', {
    schema: {
        color: { type: 'color', default: '#ffffff' },
        width: { type: 'number', default: 0.08 },
        emissive: { type: 'number', default: 1.0 }
    },

    init: function () {
        this.log = window.log.getLogger('outline');
        this.log.setLevel('info');
        this.outlineMeshes = [];
    },

    update: function () {
        this.createOutline();
    },

    createOutline: function () {
        const el = this.el;
        const data = this.data;

        const waitForModel = setInterval(() => {
            const obj3D = el.getObject3D('mesh');
            if (obj3D) {
                clearInterval(waitForModel);
                this.applyOutlineToObject(obj3D, data);
            }
        }, 100);

        setTimeout(() => clearInterval(waitForModel), 5000);
    },

    applyOutlineToObject: function (obj3D, data) {
        obj3D.traverse((child) => {
            if (child.isMesh) {
                const outlineMesh = this.createOutlineMesh(child, data);
                child.parent.add(outlineMesh);
                this.outlineMeshes.push(outlineMesh);
            }
        });

        this.log.debug('Shader outline applied', { color: data.color, width: data.width });
    },

    createOutlineMesh: function (originalMesh, data) {
        const geometry = originalMesh.geometry.clone();

        const material = new THREE.ShaderMaterial({
            uniforms: {
                outlineColor: { value: new THREE.Color(data.color) },
                outlineWidth: { value: data.width },
                emissiveIntensity: { value: data.emissive }
            },
            vertexShader: `
                uniform float outlineWidth;

                void main() {
                    vec3 normal = normalize(normalMatrix * normal);
                    vec4 pos = modelViewMatrix * vec4(position, 1.0);
                    pos.xyz += normal * outlineWidth;
                    gl_Position = projectionMatrix * pos;
                }
            `,
            fragmentShader: `
                uniform vec3 outlineColor;
                uniform float emissiveIntensity;

                void main() {
                    gl_FragColor = vec4(outlineColor, 1.0);
                    gl_FragColor.rgb *= emissiveIntensity;
                }
            `,
            side: THREE.BackSide,
            depthWrite: true
        });

        const outlineMesh = new THREE.Mesh(geometry, material);
        outlineMesh.name = 'outline_' + originalMesh.name;

        return outlineMesh;
    },

    remove: function () {
        this.outlineMeshes.forEach((mesh) => {
            if (mesh.parent) {
                mesh.parent.remove(mesh);
            }
            if (mesh.material) {
                mesh.material.dispose();
            }
        });
        this.outlineMeshes = [];
    }
});
