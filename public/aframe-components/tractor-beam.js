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

        // Listen for controller events
        this.controller.addEventListener('triggerdown', () => this.onTriggerDown());
        this.controller.addEventListener('triggerup', () => this.onTriggerUp());

        // Update loop for pulling recipe toward hand
        this.tick = AFRAME.utils.throttleTick(this.tick.bind(this), 60); // 60fps cap

        this.log.debug('Tractor beam ready');
    },

    onTriggerDown: function () {
        this.log.debug('Trigger pressed');
        this.triggerPressed = true;

        // Raycast for recipes
        const intersection = this.findClosestRecipe();
        if (intersection) {
            this.targetRecipe = intersection.el;
            this.isActive = true;
            this.log.info(`Locked onto recipe: ${this.targetRecipe.id}`);

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
        if (!this.isActive || !this.targetRecipe) return;

        // Lerp recipe position toward controller hand
        const recipePos = this.targetRecipe.getAttribute('position');
        const controllerPos = this.controller.getAttribute('position');

        const newPos = {
            x: recipePos.x + (controllerPos.x - recipePos.x) * this.data.pullSpeed,
            y: recipePos.y + (controllerPos.y - recipePos.y) * this.data.pullSpeed,
            z: recipePos.z + (controllerPos.z - recipePos.z) * this.data.pullSpeed
        };

        this.targetRecipe.setAttribute('position', `${newPos.x} ${newPos.y} ${newPos.z}`);

        // Scale up recipe as it gets closer (visual effect)
        const distance = this.distance(newPos, controllerPos);
        const scaleFactor = Math.max(0.6, 1.5 - (distance / this.data.maxDistance));
        this.targetRecipe.setAttribute('scale', `${scaleFactor} ${scaleFactor} ${scaleFactor}`);

        // Update beam height to follow recipe
        if (this.beamVisual) {
            this.beamVisual.setAttribute('scale', `1 ${distance / 10} 1`);
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
