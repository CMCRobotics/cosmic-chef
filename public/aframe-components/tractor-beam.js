/**
 * tractor-beam.js
 * Captures recipes with a semi-transparent cylinder visual.
 * Attached to controller; trigger to activate, release to place on intake.
 */

AFRAME.registerComponent('tractor-beam', {
    schema: {
        maxDistance: { type: 'number', default: 30 }, // max reach in units
        pullSpeed: { type: 'number', default: 0.15 }, // lerp factor per frame
        cylinderRadius: { type: 'number', default: 0.5 }, // tractor beam width
        cylinderOpacity: { type: 'number', default: 0.3 } // transparency
    },

    init: function () {
        this.log = window.log.getLogger('tractor-beam');
        this.log.debug('Initializing tractor-beam');

        this.isActive = false;
        this.targetRecipe = null;
        this.beamVisual = null;
        this.controller = this.el; // The controller this is attached to

        // Track trigger state
        this.triggerPressed = false;
        this.mouseDown = false;

        // Listen for VR controller events
        this.controller.addEventListener('triggerdown', () => this.onTriggerDown());
        this.controller.addEventListener('triggerup', () => this.onTriggerUp());

        // Listen for mouse events (desktop testing)
        document.addEventListener('mousedown', (e) => this.onMouseDown(e));
        document.addEventListener('mouseup', () => this.onMouseUp());
        document.addEventListener('mousemove', () => this.tick());

        // Update loop for pulling recipe toward hand
        this.tick = AFRAME.utils.throttleTick(this.tick.bind(this), 60); // 60fps cap

        this.log.debug('Tractor beam ready');
    },

    onTriggerDown: function () {
        this.log.debug('Trigger pressed');
        this.triggerPressed = true;
        this.activateTractorBeam();
    },

    onMouseDown: function (e) {
        // Only use mouse if clicking on a recipe
        const intersected = this.getIntersectedRecipe(e);
        if (intersected) {
            this.log.debug('Mouse clicked on recipe');
            this.mouseDown = true;
            this.activateTractorBeam();
        }
    },

    activateTractorBeam: function () {
        // Raycast for recipes
        const intersection = this.findClosestRecipe();
        if (intersection) {
            this.targetRecipe = intersection.el;
            this.isActive = true;

            // Find intake hopper target position
            this.intakeHopper = document.querySelector('.recipe-team-intake');
            if (!this.intakeHopper) {
                this.log.warn('Intake hopper not found');
                this.isActive = false;
                return;
            }

            this.log.info(`Locked onto recipe: ${this.targetRecipe.id}, pulling to intake`);

            // Create tractor beam visual
            this.createBeamVisual();
        } else {
            this.log.debug('No recipe in range');
        }
    },

    onTriggerUp: function () {
        this.log.debug('Trigger released');
        this.triggerPressed = false;

        if (this.targetRecipe && this.isActive) {
            // Place recipe on intake hopper
            this.placeRecipeOnIntake(this.targetRecipe);
        }

        // Clean up
        this.isActive = false;
        this.targetRecipe = null;
        this.removeBeamVisual();
    },

    onMouseUp: function () {
        this.log.debug('Mouse released');
        this.mouseDown = false;

        if (this.targetRecipe && this.isActive) {
            // Place recipe on intake hopper
            this.placeRecipeOnIntake(this.targetRecipe);
        }

        // Clean up
        this.isActive = false;
        this.targetRecipe = null;
        this.removeBeamVisual();
    },

    getIntersectedRecipe: function (e) {
        // Simple raycast from mouse position
        const canvas = document.querySelector('a-scene').canvas;
        const x = (e.clientX / canvas.clientWidth) * 2 - 1;
        const y = -(e.clientY / canvas.clientHeight) * 2 + 1;

        // Get recipes in scene
        const recipes = document.querySelectorAll('.fallable-recipe');
        if (recipes.length === 0) return null;

        // For simplicity, find closest recipe to mouse
        // In full VR, this would be a proper raycast
        return recipes[0]; // Click any recipe to activate (closest found during findClosestRecipe)
    },

    findClosestRecipe: function () {
        // Query for all fallable-recipe entities
        const recipes = document.querySelectorAll('.fallable-recipe');
        let closest = null;
        let minDistance = this.data.maxDistance;

        const controllerPos = this.controller.getAttribute('position');

        recipes.forEach((recipeEl) => {
            const recipePos = recipeEl.getAttribute('position');
            const distance = this.distance(controllerPos, recipePos);

            if (distance < minDistance) {
                minDistance = distance;
                closest = {
                    el: recipeEl,
                    distance: distance,
                    pos: recipePos
                };
            }
        });

        return closest;
    },

    distance: function (p1, p2) {
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        const dz = p1.z - p2.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    },

    createBeamVisual: function () {
        if (this.beamVisual) {
            this.removeBeamVisual();
        }

        const beam = document.createElement('a-entity');
        beam.setAttribute('id', 'tractor-beam-visual');
        beam.setAttribute('geometry', {
            primitive: 'cylinder',
            radius: this.data.cylinderRadius,
            height: this.data.maxDistance
        });
        beam.setAttribute('material', {
            color: '#00ffff',
            emissive: '#00ffff',
            emissiveIntensity: 0.6,
            transparent: true,
            opacity: this.data.cylinderOpacity
        });

        // Position at controller origin pointing toward recipe
        beam.setAttribute('position', '0 0 0');
        beam.setAttribute('rotation', '90 0 0'); // Orient cylinder along Z-axis

        this.controller.appendChild(beam);
        this.beamVisual = beam;

        this.log.debug('Tractor beam visual created');
    },

    removeBeamVisual: function () {
        if (this.beamVisual && this.beamVisual.parentNode) {
            this.beamVisual.remove();
        }
        this.beamVisual = null;
    },

    tick: function () {
        if (!this.isActive || !this.targetRecipe || !this.intakeHopper) return;

        // Lerp recipe position toward intake hopper
        const recipePos = this.targetRecipe.getAttribute('position');
        const intakePos = this.intakeHopper.getAttribute('position');

        // Pull recipe upward and toward intake
        const newPos = {
            x: recipePos.x + (intakePos.x - recipePos.x) * this.data.pullSpeed,
            y: recipePos.y + (intakePos.y - recipePos.y) * this.data.pullSpeed,
            z: recipePos.z + (intakePos.z - recipePos.z) * this.data.pullSpeed
        };

        this.targetRecipe.setAttribute('position', `${newPos.x} ${newPos.y} ${newPos.z}`);

        // Scale up recipe as it gets closer (visual effect)
        const distance = this.distance(newPos, intakePos);
        const scaleFactor = Math.max(0.6, 1.5 - (distance / this.data.maxDistance));
        this.targetRecipe.setAttribute('scale', `${scaleFactor} ${scaleFactor} ${scaleFactor}`);

        // Update beam to point from recipe to intake
        if (this.beamVisual) {
            this.beamVisual.setAttribute('scale', `1 ${distance / 10} 1`);
        }

        // Check if recipe reached intake (close enough to place)
        if (distance < 1.0) {
            this.placeRecipeOnIntake(this.targetRecipe);
            this.isActive = false;
            this.targetRecipe = null;
            this.removeBeamVisual();
        }
    },

    placeRecipeOnIntake: function (recipeEl) {
        // Find the closest recipe-team-intake hopper (galley intake)
        const intakeEls = document.querySelectorAll('.recipe-team-intake');
        if (intakeEls.length === 0) {
            this.log.error('Recipe intake hoppers not found');
            return;
        }

        // Find closest intake
        const recipePos = recipeEl.getAttribute('position');
        let closest = intakeEls[0];
        let minDist = Infinity;

        intakeEls.forEach((el) => {
            const intakePos = el.getAttribute('position');
            const dx = recipePos.x - intakePos.x;
            const dy = recipePos.y - intakePos.y;
            const dz = recipePos.z - intakePos.z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (dist < minDist) {
                minDist = dist;
                closest = el;
            }
        });

        const intakeEl = closest;

        const intakePos = intakeEl.getAttribute('position');
        const intakeScale = intakeEl.getAttribute('scale') || { x: 1, y: 1, z: 1 };

        // Position recipe on top of intake (slightly above)
        const placedPos = {
            x: intakePos.x,
            y: intakePos.y + (intakeScale.y * 1.2), // slightly above hopper
            z: intakePos.z
        };

        // Smoothly animate recipe to intake position
        recipeEl.setAttribute('animation', {
            property: 'position',
            to: `${placedPos.x} ${placedPos.y} ${placedPos.z}`,
            dur: 300,
            easing: 'easeInOutQuad'
        });

        // Reset scale
        recipeEl.setAttribute('scale', '0.6 0.6 0.6');

        // Add captured class and mark as placed
        recipeEl.classList.add('captured-recipe');
        recipeEl.setAttribute('data-captured', 'true');

        // Publish MQTT capture event (will update state machine via adapter)
        this.publishCaptureToMQTT();

        // Notify recipe-spawner that recipe was captured
        const spawner = document.querySelector('[recipe-spawner]');
        if (spawner && spawner.components['recipe-spawner']) {
            const recipeId = recipeEl.getAttribute('data-recipe-id');
            spawner.components['recipe-spawner'].captureRecipe(recipeId);
            this.log.info(`Recipe placed on intake: ${recipeId}`);
        }
    },

    publishCaptureToMQTT: function () {
        // Publish MQTT event — adapter will convert to CAPTURE_RECIPE
        const scene = document.querySelector('a-scene');
        const mqttBridge = scene?.components['mqtt-bridge'];

        if (mqttBridge && mqttBridge.client && mqttBridge.client.connected) {
            const gameId = mqttBridge.data?.gameId || 'default';
            const teamId = mqttBridge.data?.teamId || 'team-1';
            const topic = `cosmic-chef/team-${teamId}/game-${gameId}/head-chef/animation/submit-state`;

            // "captured" → adapter converts to CAPTURE_RECIPE event
            mqttBridge.client.publish(topic, 'captured', { qos: 1 });
            this.log.info(`Published CAPTURE to MQTT: ${topic}`);
        } else {
            this.log.warn('MQTT client not available or not connected');
        }
    },

    remove: function () {
        this.removeBeamVisual();
        this.log.debug('Tractor beam removed');
    }
});
