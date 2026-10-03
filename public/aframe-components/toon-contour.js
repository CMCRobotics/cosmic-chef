AFRAME.registerShader('toon-contour', {
  schema: {
    color: {type: 'color', is: 'uniform', default: '#ff0000'},
    lightDirection: {type: 'vec3', is: 'uniform', default: {x: -1.0, y: 1.0, z: 1.0}},
    outlineColor: {type: 'color', is: 'uniform', default: '#000000'},
    outlineThickness: {type: 'float', is: 'uniform', default: 0.4}
  },

  vertexShader: `
    varying vec3 vNormal;
    varying vec3 vViewPosition;

    void main() {
      vNormal = normalize(normalMatrix * normal);
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      vViewPosition = -mvPosition.xyz;
      gl_Position = projectionMatrix * mvPosition;
    }
  `,

  fragmentShader: `
    uniform vec3 color;
    uniform vec3 lightDirection;
    uniform vec3 outlineColor;
    uniform float outlineThickness;

    varying vec3 vNormal;
    varying vec3 vViewPosition;

    void main() {
      vec3 normal = normalize(vNormal);
      vec3 viewDir = normalize(vViewPosition);
      vec3 lightDir = normalize(lightDirection);

      float dotProduct = dot(normal, lightDir);
      float intensity = smoothstep(0.3, 0.35, dotProduct) * 0.6 + 0.4;
      vec3 finalColor = color * intensity;

      float edgeDetection = dot(normal, viewDir);

      if (edgeDetection < outlineThickness) {
        finalColor = mix(outlineColor, finalColor, smoothstep(outlineThickness - 0.05, outlineThickness, edgeDetection));
      }

      gl_FragColor = vec4(finalColor, 1.0);
    }
  `
});

AFRAME.registerComponent('glb-toon-material', {
  schema: {
    color: {type: 'color', default: '#ff8800'},
    outlineThickness: {type: 'float', default: 0.35}
  },

  init: function () {
    console.log('glb-toon-material: Component initialized on entity:', this.el.id);

    const self = this;

    const applyMaterial = () => {
      console.log('glb-toon-material: applyMaterial called');
      const model = self.el.getObject3D('mesh');
      console.log('glb-toon-material: model object:', model);
      if (!model) {
        console.warn('glb-toon-material: No mesh found');
        return;
      }

      console.log('glb-toon-material: Creating toon material');

      const colorObj = new THREE.Color(self.data.color);

      const toonMaterial = new THREE.ShaderMaterial({
        uniforms: {
          color: { value: colorObj },
          lightDirection: { value: new THREE.Vector3(-1.0, 1.0, 1.0).normalize() },
          outlineColor: { value: new THREE.Color('#000000') },
          outlineThickness: { value: self.data.outlineThickness }
        },
        vertexShader: `
          varying vec3 vNormal;
          varying vec3 vViewPosition;

          void main() {
            vNormal = normalize(normalMatrix * normal);
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            vViewPosition = -mvPosition.xyz;
            gl_Position = projectionMatrix * mvPosition;
          }
        `,
        fragmentShader: `
          uniform vec3 color;
          uniform vec3 lightDirection;
          uniform vec3 outlineColor;
          uniform float outlineThickness;

          varying vec3 vNormal;
          varying vec3 vViewPosition;

          void main() {
            vec3 normal = normalize(vNormal);
            vec3 viewDir = normalize(vViewPosition);
            vec3 lightDir = normalize(lightDirection);

            float dotProduct = dot(normal, lightDir);
            float intensity = smoothstep(0.3, 0.35, dotProduct) * 0.6 + 0.4;
            vec3 finalColor = color * intensity;

            float rim = dot(normal, viewDir);
            if (rim < outlineThickness) {
              finalColor = outlineColor;
            }

            gl_FragColor = vec4(finalColor, 1.0);
          }
        `
      });

      let meshCount = 0;
      model.traverse((node) => {
        if (node.isMesh) {
          node.material = toonMaterial;
          meshCount++;
        }
      });

      console.log('glb-toon-material: Material applied to', meshCount, 'meshes', { color: self.data.color, outlineThickness: self.data.outlineThickness });
    };

    console.log('glb-toon-material: Adding model-loaded listener');
    this.el.addEventListener('model-loaded', applyMaterial);

    // Also try immediately in case model is already loaded
    setTimeout(() => {
      console.log('glb-toon-material: Checking if model already loaded');
      if (this.el.getObject3D('mesh')) {
        console.log('glb-toon-material: Model already loaded, applying material now');
        applyMaterial();
      }
    }, 100);
  }
});
