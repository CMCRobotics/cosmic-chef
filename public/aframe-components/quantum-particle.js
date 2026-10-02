/**
 * quantum-particle.js
 * Visual representation of a fundamental particle (ingredient).
 * Maps physics properties (Charge, Matter/Antimatter) to visual attributes.
 * Pure stateless renderer: all appearance driven by schema properties.
 */

const PARTICLE_METADATA = {
    // Quarks
    'up': { charge: 'up-type', color: '#FFD54F' },
    'down': { charge: 'down-type', color: '#4DD0E1' },
    'charm': { charge: 'up-type', color: '#FF9800' },
    'strange': { charge: 'down-type', color: '#2196F3' },
    'top': { charge: 'up-type', color: '#F44336' },
    'bottom': { charge: 'down-type', color: '#3F51B5' },

    // Antimatter Quarks (prefixed with anti-)
    'anti-up': { charge: 'down-type', color: '#FFD54F', isAntimatter: true },
    'anti-down': { charge: 'up-type', color: '#4DD0E1', isAntimatter: true },
    'anti-strange': { charge: 'up-type', color: '#2196F3', isAntimatter: true },
    'anti-charm': { charge: 'down-type', color: '#FF9800', isAntimatter: true },
    'anti-bottom': { charge: 'up-type', color: '#3F51B5', isAntimatter: true },
    'anti-top': { charge: 'down-type', color: '#F44336', isAntimatter: true },

    // Leptons
    'electron': { charge: 'lepton', color: '#E91E63' },
    'electron-neutrino': { charge: 'neutral', color: '#ECEFF1' },
    'muon': { charge: 'lepton', color: '#9C27B0' },
    'muon-neutrino': { charge: 'neutral', color: '#ECEFF1' },
    'tau': { charge: 'lepton', color: '#673AB7' },
    'tau-neutrino': { charge: 'neutral', color: '#ECEFF1' }
};

AFRAME.registerComponent('quantum-particle', {
    schema: {
        ingredient: { type: 'string', default: '' },
        active: { type: 'boolean', default: false },
        progress: { type: 'number', default: 0 },
        gesture: { type: 'string', default: '' },
        inactiveColor: { type: 'color', default: '#37474f' }
    },

    init: function () {
        this.log = window.log.getLogger('quantum-particle');
        this.log.setLevel('debug');

        // Create the core sphere
        this.core = document.createElement('a-entity');
        this.core.setAttribute('geometry', {
            primitive: 'sphere',
            radius: 0.15
        });
        this.core.setAttribute('material', {
            color: this.data.inactiveColor,
            emissive: this.data.inactiveColor,
            emissiveIntensity: 0.5,
            flatShading: true
        });
        this.el.appendChild(this.core);

        // Create antimatter wireframe shell
        this.wireframe = document.createElement('a-entity');
        this.wireframe.setAttribute('geometry', {
            primitive: 'sphere',
            radius: 0.25
        });
        this.wireframe.setAttribute('material', {
            color: '#00ff00',
            transparent: true,
            opacity: 0.3,
            side: 'double',
            visible: false
        });
        this.el.appendChild(this.wireframe);

        // Create aura
        this.aura = document.createElement('a-entity');
        this.aura.setAttribute('geometry', {
            primitive: 'sphere',
            radius: 0.25
        });
        this.aura.setAttribute('material', {
            transparent: true,
            opacity: 0,
            side: 'double'
        });
        this.el.appendChild(this.aura);

        // Create googly eyes
        this.eyeLeft = document.createElement('a-entity');
        this.eyeLeft.setAttribute('geometry', {
            primitive: 'sphere',
            radius: 0.05
        });
        this.eyeLeft.setAttribute('material', {
            color: '#ffffff',
            metalness: 0.9,
            roughness: 0.1
        });
        this.eyeLeft.setAttribute('position', '-0.08 0.08 0.16');
        this.el.appendChild(this.eyeLeft);

        this.eyeRight = document.createElement('a-entity');
        this.eyeRight.setAttribute('geometry', {
            primitive: 'sphere',
            radius: 0.05
        });
        this.eyeRight.setAttribute('material', {
            color: '#ffffff',
            metalness: 0.9,
            roughness: 0.1
        });
        this.eyeRight.setAttribute('position', '0.08 0.08 0.16');
        this.el.appendChild(this.eyeRight);

        this.isAntimatter = false;
    },

    update: function (oldData) {
        const ingredientChanged = oldData.ingredient !== this.data.ingredient;
        const activeChanged = oldData.active !== this.data.active;
        const progressChanged = oldData.progress !== this.data.progress;

        if (ingredientChanged) {
            this.updateIngredient();
        }

        if (ingredientChanged || progressChanged || activeChanged) {
            this.updateColors();
        }
    },

    updateIngredient: function () {
        const meta = PARTICLE_METADATA[this.data.ingredient];
        this.isAntimatter = meta ? !!meta.isAntimatter : false;
        this.wireframe.setAttribute('visible', this.isAntimatter);
    },

    updateColors: function () {
        const meta = PARTICLE_METADATA[this.data.ingredient];
        const color = meta ? meta.color : this.data.inactiveColor;

        if (this.data.active && this.data.progress > 0) {
            const targetColor = this.data.progress >= 1.0 ? '#76ff03' : color;
            const emissiveIntensity = 0.5 + this.data.progress * 2.0;
            this.core.setAttribute('material', {
                color: targetColor,
                emissive: targetColor,
                emissiveIntensity: emissiveIntensity
            });
            this.aura.setAttribute('material', {
                color: color,
                opacity: 0.2 + this.data.progress * 0.4
            });
        } else {
            this.core.setAttribute('material', {
                color: this.data.inactiveColor,
                emissive: this.data.inactiveColor,
                emissiveIntensity: 0.5
            });
            this.aura.setAttribute('material', 'opacity', 0);
        }
    },

    tick: function (t, dt) {
        // Idle rotation (when not active)
        if (!this.data.active) {
            this.core.object3D.rotation.y += 0.005;
            return;
        }

        // Get gesture-specific distortion
        const distortion = this.computeDistortion(t);

        // Apply core transformations
        this.applyCoreTransform(t, distortion);

        // Apply aura scaling
        this.applyAuraScale(t, distortion);

        // Apply eye flattening
        this.applyEyeFlattening(distortion);
    },

    computeDistortion: function (t) {
        const gesture = this.data.gesture;

        if (gesture === 'tenderize') {
            // Large, slow bounce
            const period = 300;
            const amount = Math.abs(Math.sin(t / period)) * 0.4;
            return { type: 'squash', amount: amount, period: period };
        } else if (gesture === 'slice') {
            // Small, fast compress
            const period = 100;
            const amount = Math.abs(Math.sin(t / period)) * 0.15;
            return { type: 'squash', amount: amount, period: period };
        } else if (gesture === 'stir') {
            return { type: 'spin' };
        }
        return { type: 'none' };
    },

    applyCoreTransform: function (t, distortion) {
        const rotationSpeed = this.isAntimatter ? -0.02 : 0.02;

        if (distortion.type === 'squash') {
            // Squash on Y, compensate on X/Z
            const squashFactor = 1.0 - distortion.amount;
            const expandFactor = 1.0 + (distortion.amount * 0.5);

            this.core.setAttribute('scale', {
                x: expandFactor,
                y: squashFactor,
                z: expandFactor
            });

            // Vertical bob
            const bobHeight = distortion.amount * 0.1;
            this.core.setAttribute('position', {
                x: 0,
                y: bobHeight,
                z: 0
            });

            // Slow rotation even during squash
            this.core.object3D.rotation.y += rotationSpeed * 0.3;
            this.core.object3D.rotation.x += rotationSpeed * 0.15;
        } else if (distortion.type === 'spin') {
            // Horizontal spin (sideways tumble)
            this.core.object3D.rotation.x += rotationSpeed * 0.5;
            this.core.setAttribute('scale', { x: 1, y: 1, z: 1 });
            this.core.setAttribute('position', { x: 0, y: 0, z: 0 });

            if (this.isAntimatter) {
                this.wireframe.object3D.rotation.x -= rotationSpeed * 0.75;
            }
        } else {
            // No distortion, just gentle spin
            this.core.object3D.rotation.y += rotationSpeed * 0.3;
            this.core.setAttribute('scale', { x: 1, y: 1, z: 1 });
            this.core.setAttribute('position', { x: 0, y: 0, z: 0 });
        }
    },

    applyAuraScale: function (t, distortion) {
        // Aura pulsates with progress
        const pulse = 1 + Math.sin(t / 200) * (0.1 + this.data.progress * 0.2);
        this.aura.setAttribute('scale', { x: pulse, y: pulse, z: pulse });
    },

    applyEyeFlattening: function (distortion) {
        if (distortion.type === 'squash') {
            // Eyes flatten with the core, smaller magnitude
            const squashFactor = 1.0 - (distortion.amount * 0.6);
            this.eyeLeft.setAttribute('scale', { x: 1, y: squashFactor, z: 1 });
            this.eyeRight.setAttribute('scale', { x: 1, y: squashFactor, z: 1 });
        } else {
            // Eyes normal
            this.eyeLeft.setAttribute('scale', { x: 1, y: 1, z: 1 });
            this.eyeRight.setAttribute('scale', { x: 1, y: 1, z: 1 });
        }
    }
});
