/**
 * tractor-beam.js
 * Allows head chef to aim and select recipes from falling recipes.
 * Raycasts from camera forward; highlights intersected recipe; capture on "b" press.
 */

AFRAME.registerComponent('tractor-beam', {
    schema: {
        maxDistance: { type: 'number', default: 100 }, // max raycast distance
        highlightEmissive: { type: 'string', default: '#ffff00' }, // yellow glow for targeted recipe
        highlightIntensity: { type: 'number', default: 0.8 } // glow intensity
    },

    init: function () {
        this.log = window.log.getLogger('tractor-beam');
        this.log.debug('Initializing tractor-beam');

        this.keyPressed = false;
        this.targetRecipe = null; // currently highlighted by raycast
        this.capturedRecipe = null; // recipe being pulled to intake
        this.originalMaterial = null; // store original recipe material for unhighlighting

        // Get camera for raycasting
        this.camera = document.querySelector('a-camera');
        if (!this.camera) {
            this.log.error('Camera not found - tractor beam cannot aim');
            return;
        }

        // Listen for keyboard events
        document.addEventListener('keydown', (e) => this.onKeyDown(e));
        document.addEventListener('keyup', (e) => this.onKeyUp(e));

        // Update loop for aiming beam and pulling recipe
        this.tick = AFRAME.utils.throttleTick(this.tick.bind(this), 60); // 60fps cap

        this.log.debug('Tractor beam ready - aim with camera, press "b" to capture');
    },

    onKeyDown: function (e) {
        if (e.key.toLowerCase() === 'b' && !this.keyPressed) {
            this.keyPressed = true;
            this.captureTargetRecipe();
        }
    },

    onKeyUp: function (e) {
        if (e.key.toLowerCase() === 'b') {
            this.keyPressed = false;
            if (this.capturedRecipe) {
                this.placeRecipeOnIntake(this.capturedRecipe);
            }
        }
    },

    tick: function () {
        // Continuously raycast to find what recipe the head chef is aiming at
        const raycasted = this.raycastForRecipe();

        // Update highlight on new target
        if (raycasted !== this.targetRecipe) {
            if (this.targetRecipe) {
                this.unhighlightRecipe(this.targetRecipe);
            }
            this.targetRecipe = raycasted;
            if (this.targetRecipe) {
                this.highlightRecipe(this.targetRecipe);
            }
        }

        // If holding a recipe, pull it toward intake
        if (this.capturedRecipe) {
            this.pullRecipeToIntake(this.capturedRecipe);
        }
    },

    raycastForRecipe: function () {
        // Get camera three.js object
        const cameraObj3D = this.camera.object3D;
        if (!cameraObj3D) return null;

        // Get camera world position and direction
        const worldPos = new THREE.Vector3();
        cameraObj3D.getWorldPosition(worldPos);

        const direction = new THREE.Vector3(0, 0, -1);
        direction.applyQuaternion(cameraObj3D.quaternion);

        // Raycast using three.js raycaster
        const raycaster = new THREE.Raycaster(worldPos, direction.normalize());

        // Get all recipe entities and their geometry
        const recipes = document.querySelectorAll('.fallable-recipe');
        const recipeMeshes = Array.from(recipes).map(el => {
            const obj3D = el.object3D;
            if (obj3D) {
                // Traverse the object to find all meshes
                const meshes = [];
                obj3D.traverse((child) => {
                    if (child.isMesh) {
                        child.userData.recipeEl = el;
                        meshes.push(child);
                    }
                });
                return meshes;
            }
            return [];
        }).flat();

        if (recipeMeshes.length === 0) return null;

        const intersects = raycaster.intersectObjects(recipeMeshes);
        if (intersects.length > 0) {
            const firstHit = intersects[0].object;
            return firstHit.userData.recipeEl;
        }

        return null;
    },

highlightRecipe: function (recipeEl) {
        if (!recipeEl) return;

        const materialComponent = recipeEl.getAttribute('material');
        this.originalMaterial = materialComponent;

        // Add yellow glow to highlight
        recipeEl.setAttribute('material', {
            color: materialComponent.color || '#ff6600',
            emissive: this.data.highlightEmissive,
            emissiveIntensity: this.data.highlightIntensity,
            transparent: true,
            opacity: materialComponent.opacity || 0.9
        });

        this.log.debug(`Highlighted recipe: ${recipeEl.id}`);
    },

    unhighlightRecipe: function (recipeEl) {
        if (!recipeEl || !this.originalMaterial) return;

        recipeEl.setAttribute('material', this.originalMaterial);
        this.originalMaterial = null;

        this.log.debug(`Unhighlighted recipe: ${recipeEl.id}`);
    },

    captureTargetRecipe: function () {
        if (!this.targetRecipe) {
            this.log.debug('No recipe targeted');
            return;
        }

        this.capturedRecipe = this.targetRecipe;
        this.log.info(`Captured recipe: ${this.capturedRecipe.id}`);
    },

    pullRecipeToIntake: function (recipeEl) {
        const intakeEls = document.querySelectorAll('.recipe-team-intake');
        if (intakeEls.length === 0) return;

        // Find closest intake
        const recipePos = recipeEl.getAttribute('position');
        let closestIntake = intakeEls[0];
        let minDist = Infinity;

        intakeEls.forEach((el) => {
            const intakePos = el.getAttribute('position');
            const dx = recipePos.x - intakePos.x;
            const dy = recipePos.y - intakePos.y;
            const dz = recipePos.z - intakePos.z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (dist < minDist) {
                minDist = dist;
                closestIntake = el;
            }
        });

        const intakePos = closestIntake.getAttribute('position');

        // Smoothly lerp recipe toward intake
        const lerpFactor = 0.1; // adjust for speed
        const newPos = {
            x: recipePos.x + (intakePos.x - recipePos.x) * lerpFactor,
            y: recipePos.y + (intakePos.y - recipePos.y) * lerpFactor,
            z: recipePos.z + (intakePos.z - recipePos.z) * lerpFactor
        };

        recipeEl.setAttribute('position', `${newPos.x} ${newPos.y} ${newPos.z}`);

        // Scale up as it gets closer
        const distance = Math.sqrt(
            (newPos.x - intakePos.x) ** 2 +
            (newPos.y - intakePos.y) ** 2 +
            (newPos.z - intakePos.z) ** 2
        );
        const scaleFactor = Math.max(0.6, 1.5 - (distance / this.data.maxDistance));
        recipeEl.setAttribute('scale', `${scaleFactor} ${scaleFactor} ${scaleFactor}`);

        // Check if reached intake
        if (distance < 1.0) {
            this.finalizeCaptureOnIntake(recipeEl);
        }
    },

    placeRecipeOnIntake: function (recipeEl) {
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
            y: intakePos.y + (intakeScale.y * 1.2),
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

        // Clean up
        this.unhighlightRecipe(recipeEl);
        this.capturedRecipe = null;

        this.finalizeCaptureOnIntake(recipeEl);
    },

    finalizeCaptureOnIntake: function (recipeEl) {
        // Add captured class and mark as placed
        recipeEl.classList.add('captured-recipe');
        recipeEl.setAttribute('data-captured', 'true');

        // Extract the recipe from the crate
        const recipeDataStr = recipeEl.getAttribute('data-recipe');
        this.log.info(`Recipe data from crate:`, recipeDataStr?.substring?.(0, 200));
        let recipe = null;
        if (recipeDataStr) {
            try {
                recipe = JSON.parse(recipeDataStr);
                this.log.info(`Captured recipe: ${recipe.name}`, recipe);
            } catch (e) {
                this.log.error('Failed to parse recipe from crate', e);
            }
        }

        // Publish MQTT capture event and recipe data
        this.publishCaptureToMQTT(recipe);

        // Notify recipe-spawner that recipe was captured
        const spawner = document.querySelector('[recipe-spawner]');
        if (spawner && spawner.components['recipe-spawner']) {
            const recipeId = recipeEl.getAttribute('data-recipe-id');
            spawner.components['recipe-spawner'].captureRecipe(recipeId);
            this.log.info(`Recipe captured: ${recipeId}`);
        }
    },

    publishCaptureToMQTT: function (recipe) {
        const scene = document.querySelector('a-scene');
        const mqttComponent = scene?.components['mqtt-bridge'] || scene?.components['head-chef-mqtt-client'];

        if (mqttComponent && mqttComponent.client && mqttComponent.client.connected) {
            const gameId = mqttComponent.data?.gameId || 'default';
            const teamId = mqttComponent.data?.teamId || 'team-1';

            // Publish recipe data to recipe topic (if available)
            if (recipe && recipe.ingredientSequences) {
                const recipeTopic = `cosmic-chef/team-${teamId}/game-${gameId}/round/recipe`;
                const recipePayload = JSON.stringify(recipe);
                mqttComponent.client.publish(recipeTopic, recipePayload, { qos: 1 });
                this.log.info(`Published recipe to MQTT: ${recipeTopic}`);
            }

            // Publish capture state to trigger the capture in state machine
            const submitTopic = `cosmic-chef/team-${teamId}/game-${gameId}/head-chef/animation/submit-state`;
            mqttComponent.client.publish(submitTopic, 'captured', { qos: 1 });
            this.log.info(`Published CAPTURE state to MQTT: ${submitTopic}`);
        } else {
            this.log.warn('MQTT client not available or not connected');
        }
    },

    remove: function () {
        if (this.targetRecipe) {
            this.unhighlightRecipe(this.targetRecipe);
        }
        this.log.debug('Tractor beam removed');
    }
});
