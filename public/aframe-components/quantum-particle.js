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

        // Create googly eyes - slightly bigger, flat, deep-set
        // Eyes are children of core so they rotate with stir gesture
        this.eyeLeft = document.createElement('a-entity');
        this.eyeLeft.setAttribute('geometry', {
            primitive: 'sphere',
            radius: 0.04
        });
        this.eyeLeft.setAttribute('material', {
            color: '#ffffff',
            metalness: 0.9,
            roughness: 0.1
        });
        this.eyeLeft.setAttribute('position', '-0.07 0.07 0.07');
        this.eyeLeft.setAttribute('scale', '0.9 2.2 1.1');
        this.core.appendChild(this.eyeLeft);

        this.eyeRight = document.createElement('a-entity');
        this.eyeRight.setAttribute('geometry', {
            primitive: 'sphere',
            radius: 0.04
        });
        this.eyeRight.setAttribute('material', {
            color: '#ffffff',
            metalness: 0.9,
            roughness: 0.1
        });
        this.eyeRight.setAttribute('position', '0.07 0.07 0.07');
        this.eyeRight.setAttribute('scale', '0.9 2.2 1.1');
        this.core.appendChild(this.eyeRight);

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
        // Idle breathing and blinking (when not active)
        if (!this.data.active) {
            // Subtle breathing
            const breathe = 1 + Math.sin(t / 1500) * 0.08;
            this.core.setAttribute('scale', { x: breathe, y: breathe, z: breathe });

            // Eyes blink with randomness
            this.updateEyeBlink(t);

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

        // Eyes blink during active prep with no gesture
        if (distortion.type === 'none') {
            this.updateEyeBlink(t);
        }
    },

    computeDistortion: function (t) {
        const gesture = this.data.gesture;

        if (gesture === 'tenderize') {
            // Large, slow bounce
            const period = 300;
            const amount = Math.abs(Math.sin(t / period)) * 0.4;
            return { type: 'tenderize', amount: amount, period: period };
        } else if (gesture === 'slice') {
            // Slow, exaggerated stretch with Z elongation (slime effect)
            const period = 250;
            const amount = Math.abs(Math.sin(t / period)) * 0.4;
            return { type: 'slice', amount: amount, period: period };
        } else if (gesture === 'stir') {
            return { type: 'spin' };
        }
        return { type: 'none' };
    },

    applyCoreTransform: function (t, distortion) {
        const rotationSpeed = this.isAntimatter ? -0.02 : 0.02;

        if (distortion.type === 'tenderize') {
            // Tenderize: particle on surface being squashed from above — no rotation
            // Bottom stays on ground, top compresses down
            const squashFactor = 1.0 - distortion.amount;
            const expandFactor = 1.0 + (distortion.amount * 0.3);

            this.core.setAttribute('scale', {
                x: expandFactor,
                y: squashFactor,
                z: expandFactor
            });

            // Move center down to keep bottom on surface (core radius is 0.15)
            const dropAmount = 0.15 * distortion.amount;
            this.core.setAttribute('position', {
                x: 0,
                y: -dropAmount,
                z: 0
            });
        } else if (distortion.type === 'slice') {
            // Slice: stretched backwards (front stays fixed), pushed through from behind
            // Bottom stays on ground, minimal Y compression, stretched backwards along -Z
            const squashFactor = 1.0 - (distortion.amount * 0.4);
            const elongateFactor = 1.0 + (distortion.amount * 2.5);
            const compressFactor = 1.0 - (distortion.amount * 0.5);

            this.core.setAttribute('scale', {
                x: compressFactor,
                y: squashFactor,
                z: elongateFactor
            });

            // Move center down to keep bottom on surface (proportional to actual squash)
            const squashChange = 1.0 - squashFactor;
            const dropAmount = 0.15 * squashChange;

            // Move backwards so front (z+) stays fixed, stretches backwards (z-)
            const pullBackAmount = 0.15 * (elongateFactor - 1);
            this.core.setAttribute('position', {
                x: 0,
                y: -dropAmount,
                z: -pullBackAmount
            });
        } else if (distortion.type === 'spin') {
            // Vertical spin (stir) - rotation around Y axis
            this.core.object3D.rotation.y -= rotationSpeed * 2.5;
            this.core.setAttribute('scale', { x: 1, y: 1, z: 1 });
            this.core.setAttribute('position', { x: 0, y: 0, z: 0 });

            if (this.isAntimatter) {
                this.wireframe.object3D.rotation.y -= rotationSpeed * 3.75;
            }
        } else {
            // No distortion during active prep — subtle breathing, eyes blink separately
            const breathe = 1 + Math.sin(t / 1500) * 0.06;
            this.core.setAttribute('scale', { x: breathe, y: breathe, z: breathe });
            this.core.setAttribute('position', { x: 0, y: 0, z: 0 });
        }
    },

    applyAuraScale: function (t, distortion) {
        // Aura breathes regardless of progress
        const pulse = 1 + Math.sin(t / 200) * 0.15;

        // Apply same distortion and position as core
        if (distortion.type === 'tenderize') {
            const squashFactor = 1.0 - distortion.amount;
            const expandFactor = 1.0 + (distortion.amount * 0.3);
            this.aura.setAttribute('scale', {
                x: expandFactor * pulse,
                y: squashFactor * pulse,
                z: expandFactor * pulse
            });
            const dropAmount = 0.15 * distortion.amount;
            this.aura.setAttribute('position', {
                x: 0,
                y: -dropAmount,
                z: 0
            });
        } else if (distortion.type === 'slice') {
            const squashFactor = 1.0 - (distortion.amount * 0.4);
            const elongateFactor = 1.0 + (distortion.amount * 2.5);
            const compressFactor = 1.0 - (distortion.amount * 0.5);
            this.aura.setAttribute('scale', {
                x: compressFactor * pulse,
                y: squashFactor * pulse,
                z: elongateFactor * pulse
            });
            const squashChange = 1.0 - squashFactor;
            const dropAmount = 0.15 * squashChange;
            const pullBackAmount = 0.15 * (elongateFactor - 1);
            this.aura.setAttribute('position', {
                x: 0,
                y: -dropAmount,
                z: -pullBackAmount
            });
        } else if (distortion.type === 'spin') {
            this.aura.setAttribute('scale', { x: pulse, y: pulse, z: pulse });
            this.aura.setAttribute('position', { x: 0, y: 0, z: 0 });
        } else {
            this.aura.setAttribute('scale', { x: pulse, y: pulse, z: pulse });
            this.aura.setAttribute('position', { x: 0, y: 0, z: 0 });
        }
    },

    applyEyeFlattening: function (distortion) {
        if (distortion.type === 'tenderize') {
            // Eyes flatten moderately with tenderize
            const squashFactor = 1.0 - (distortion.amount * 0.5);
            this.eyeLeft.setAttribute('scale', { x: 1, y: squashFactor, z: 1 });
            this.eyeRight.setAttribute('scale', { x: 1, y: squashFactor, z: 1 });
        } else if (distortion.type === 'slice') {
            // Eyes flatten more pronounced with slice
            const squashFactor = 1.0 - (distortion.amount * 0.8);
            this.eyeLeft.setAttribute('scale', { x: 1, y: squashFactor, z: 1 });
            this.eyeRight.setAttribute('scale', { x: 1, y: squashFactor, z: 1 });
        } else {
            // Eyes normal
            this.eyeLeft.setAttribute('scale', { x: 1, y: 1, z: 1 });
            this.eyeRight.setAttribute('scale', { x: 1, y: 1, z: 1 });
        }
    },

    updateEyeBlink: function (t) {
        // Pseudo-random blink timing based on particle ID
        const cycleNum = Math.floor(t / 5000);
        const seed = this.el.id.charCodeAt(0) + cycleNum * 73; // Deterministic randomness
        const randomOffset = (Math.sin(seed) * 0.5 + 0.5) * 0.15; // 0 to 0.15 variation
        const blinkTrigger = 0.85 + randomOffset; // Blink trigger varies between 0.85 and 1.0

        const blinkCycle = (t % 5000) / 5000;
        let eyeScale = 1; // Y scale for eyes

        if (blinkCycle > blinkTrigger) {
            // Blink: close to thin lines and back over remaining cycle
            const remainingCycle = 1 - blinkTrigger;
            const blinkPhase = (blinkCycle - blinkTrigger) / remainingCycle;
            // Squash eyes to thin lines (0.05) and back to normal (0.55) using cosine
            eyeScale = Math.cos(blinkPhase * Math.PI) * 0.5 + 0.5; // 0.5 to 1.0
            eyeScale = eyeScale * 0.5 + 0.05; // Map to 0.05 (closed) to 0.55 (normal open)
        } else {
            // Normal open state
            eyeScale = 0.55;
        }

        this.eyeLeft.setAttribute('scale', { x: 1, y: eyeScale, z: 1 });
        this.eyeRight.setAttribute('scale', { x: 1, y: eyeScale, z: 1 });
    }
});
