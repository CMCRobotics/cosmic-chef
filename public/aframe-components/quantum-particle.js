/**
 * quantum-particle.js
 * Visual representation of a fundamental particle (ingredient).
 * Maps physics properties (Generation, Charge, Matter/Antimatter) to visual attributes.
 * Listens for game-state-changed events and updates its appearance based on progress.
 */

const PARTICLE_METADATA = {
    // Quarks
    'up': { gen: 1, charge: 'up-type', color: '#FFD54F' },
    'down': { gen: 1, charge: 'down-type', color: '#4DD0E1' },
    'charm': { gen: 2, charge: 'up-type', color: '#FF9800' },
    'strange': { gen: 2, charge: 'down-type', color: '#2196F3' },
    'top': { gen: 3, charge: 'up-type', color: '#F44336' },
    'bottom': { gen: 3, charge: 'down-type', color: '#3F51B5' },
    
    // Antimatter Quarks (prefixed with anti-)
    'anti-up': { gen: 1, charge: 'down-type', color: '#FFD54F', isAntimatter: true },
    'anti-down': { gen: 1, charge: 'up-type', color: '#4DD0E1', isAntimatter: true },
    'anti-strange': { gen: 2, charge: 'up-type', color: '#2196F3', isAntimatter: true },
    'anti-charm': { gen: 2, charge: 'down-type', color: '#FF9800', isAntimatter: true },
    'anti-bottom': { gen: 3, charge: 'up-type', color: '#3F51B5', isAntimatter: true },
    'anti-top': { gen: 3, charge: 'down-type', color: '#F44336', isAntimatter: true },

    // Leptons
    'electron': { gen: 1, charge: 'lepton', color: '#E91E63' },
    'electron-neutrino': { gen: 1, charge: 'neutral', color: '#ECEFF1' },
    'muon': { gen: 2, charge: 'lepton', color: '#9C27B0' },
    'muon-neutrino': { gen: 2, charge: 'neutral', color: '#ECEFF1' },
    'tau': { gen: 3, charge: 'lepton', color: '#673AB7' },
    'tau-neutrino': { gen: 3, charge: 'neutral', color: '#ECEFF1' }
};

AFRAME.registerComponent('quantum-particle', {
    schema: {
        gesture: { type: 'string', default: '' },
        ingredient: { type: 'string', default: '' },
        inactiveColor: { type: 'color', default: '#37474f' }
    },

    init: function () {
        this.log = window.log.getLogger('quantum-particle');
        this.log.setLevel('debug');

        // Create the core - geometry will be updated based on particle type
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

        // Create the antimatter shell (only visible for antimatter)
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

        // Create a glow/aura for active state
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

        this.isPreparing = false;
        this.isActuallyInactive = true;
        this.progress = 0;
        this.currentIngredient = null;

        this.onGameStateChanged = this.onGameStateChanged.bind(this);
        this.el.sceneEl.addEventListener('game-state-changed', this.onGameStateChanged);

        if (this.data.ingredient) {
            this.updateParticleVisuals(this.data.ingredient);
            this.setActive(0.5);
        } else {
            this.updateParticleVisuals(null);
        }
    },

    tick: function (t, dt) {
        if (this.isPreparing) {
            // Rotation based on matter/antimatter
            const rotationSpeed = this.isAntimatter ? -0.02 : 0.02;
            this.core.object3D.rotation.y += rotationSpeed;
           this.core.object3D.rotation.x += rotationSpeed * 0.5;
            
            if (this.isAntimatter) {
                this.wireframe.object3D.rotation.y -= rotationSpeed * 1.5;
            }

            // Pulse based on progress
            const pulse = 1 + Math.sin(t / 200) * (0.1 + this.progress * 0.2);
            this.aura.setAttribute('scale', { x: pulse, y: pulse, z: pulse });
        } else {
            // Slow rotation when idle
            this.core.object3D.rotation.y += 0.005;
        }
    },

    onGameStateChanged: function (evt) {
        const { state, context } = evt.detail;
        
        if (state !== 'preparingComplexDish') {
            this.setInactive();
            return;
        }

        const currentStep = context.currentOrder.steps[context.currentStepIndex];
        if (!currentStep) {
            this.setInactive();
            return;
        }

        // Check if this station matches the current gesture
        const matchesGesture = !this.data.gesture || this.data.gesture === currentStep.gesture;
        
        if (matchesGesture) {
            // Update particle type if it changed
            if (this.currentIngredient !== currentStep.ingredient) {
                this.updateParticleVisuals(currentStep.ingredient);
            }
            this.setActive(context.stepProgress / 100);
        } else {
            this.setInactive();
        }
    },

    updateParticleVisuals: function (ingredient) {
        this.currentIngredient = ingredient;
        let meta = PARTICLE_METADATA[ingredient];

        // Default or "Fusion" state
        if (!meta) {
            this.core.setAttribute('geometry', {
                primitive: 'icosahedron',
                radius: 0.08,
                detail: 2
            });
            this.isAntimatter = false;
            this.wireframe.setAttribute('visible', false);
            return;
        }

        this.isAntimatter = !!meta.isAntimatter;

        // Shape based on Generation
        let primitive = 'tetrahedron';
        if (meta.gen === 2) primitive = 'octahedron';
        if (meta.gen === 3) primitive = 'icosahedron';

        const geoSettings = {
            primitive: primitive,
            radius: 0.15,
            detail: 0
        };

        this.core.setAttribute('geometry', geoSettings);
        this.wireframe.setAttribute('geometry', geoSettings);
        this.wireframe.setAttribute('visible', this.isAntimatter);
        
        // Aura color
        this.aura.setAttribute('material', 'color', meta.color);
    },

    setActive: function (progress) {
        this.isPreparing = true;
        this.isActuallyInactive = false;
        this.progress = progress;

        const meta = PARTICLE_METADATA[this.currentIngredient];
        const activeColor = meta ? meta.color : '#ffffff';
        const completeColor = '#76ff03'; // Lime

        // Progressive transformation:
        const coreScale = 1.0 + progress * 1.5;
        this.core.setAttribute('scale', { x: coreScale, y: coreScale, z: coreScale });
        if (this.isAntimatter) {
            this.wireframe.setAttribute('scale', { x: coreScale * 1.67, y: coreScale * 1.67, z: coreScale * 1.67 });
            this.wireframe.setAttribute('visible', true);
        }
        
        this.aura.setAttribute('material', {
            opacity: 0.2 + progress * 0.4,
            color: activeColor
        });
        
        // Color shift
        const targetColor = progress >= 1.0 ? completeColor : activeColor;
        this.core.setAttribute('material', {
            color: targetColor,
            emissive: targetColor,
            emissiveIntensity: 0.5 + progress * 2.0
        });
    },

    setInactive: function () {
        if (this.isActuallyInactive) return;

        this.isPreparing = false;
        this.isActuallyInactive = true;
        this.progress = 0;
        this.core.setAttribute('scale', { x: 1, y: 1, z: 1 });
        this.wireframe.setAttribute('visible', false);
        this.core.setAttribute('material', {
            color: this.data.inactiveColor,
            emissive: this.data.inactiveColor,
            emissiveIntensity: 0.5
        });
        this.aura.setAttribute('material', 'opacity', 0);
    },

    remove: function () {
        this.el.sceneEl.removeEventListener('game-state-changed', this.onGameStateChanged);
    }
});
