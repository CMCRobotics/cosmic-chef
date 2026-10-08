/**
 * tractor-beam.js
 * Lets the head chef capture a falling recipe crate.
 * Aim with the crosshair (the centre of the view) to highlight the crate under it.
 * Right click selects the aimed crate, right click again captures it. The captured
 * crate is pulled to the closest intake, and the capture is published to its team.
 */

// A captured crate is scaled to this and rests on top of its intake (the crate is 1.6 units wide)
const PLACED_CRATE_SCALE = 0.6;
const PLACED_CRATE_HALF_HEIGHT = (1.6 / 2) * PLACED_CRATE_SCALE;
const CRATE_SHRINK_MS = 500; // how long a finished crate takes to shrink away

AFRAME.registerComponent('tractor-beam', {
    schema: {
        maxDistance: { type: 'number', default: 100 }, // used to scale the crate while it is pulled
        highlightEmissive: { type: 'string', default: '#ffff00' }, // yellow glow for the selected crate
        highlightIntensity: { type: 'number', default: 0.8 } // glow intensity
    },

    init: function () {
        this.log = window.log.getLogger('tractor-beam');
        this.log.debug('Initializing tractor-beam');

        this.camera = document.querySelector('a-camera');
        this.aimedRecipe = null; // crate under the crosshair
        this.selectedRecipe = null; // crate locked by the first right click
        this.highlightedRecipe = null; // crate currently glowing
        this.capturedRecipe = null; // crate being pulled to intake
        this.originalMaterial = null; // store original recipe material for unhighlighting

        // Right click: first click selects the aimed crate, second click captures it
        this.onMouseDown = this.onMouseDown.bind(this);
        this.onContextMenu = (evt) => evt.preventDefault();
        document.addEventListener('mousedown', this.onMouseDown);
        document.addEventListener('contextmenu', this.onContextMenu);

        // A submitted or cancelled order removes its crate from the intake
        this.onStateChanged = (evt) => {
            const { state } = evt.detail;
            if (state === 'orderSuccess' || state === 'orderPenalized') {
                this.disposeCapturedRecipes();
            }
        };
        this.el.sceneEl.addEventListener('game-state-changed', this.onStateChanged);

        // Aim each frame, and pull the captured crate toward the intake
        this.tick = AFRAME.utils.throttleTick(this.tick.bind(this), 60); // 60fps cap

        this.log.debug('Tractor beam ready - aim with the crosshair, right click to select, right click again to capture');
    },

    onMouseDown: function (evt) {
        if (evt.button !== 2) return; // right button only
        if (this.capturedRecipe) return; // a crate is already on its way to the intake

        if (!this.aimedRecipe) {
            this.selectedRecipe = null; // right click on nothing clears the selection
        } else if (this.aimedRecipe === this.selectedRecipe) {
            this.captureRecipe(this.selectedRecipe);
        } else {
            this.selectedRecipe = this.aimedRecipe;
        }
        this.updateHighlight();
    },

    tick: function () {
        this.aimedRecipe = this.raycastForRecipe();
        this.updateHighlight();

        if (this.capturedRecipe) {
            this.pullRecipeToIntake(this.capturedRecipe);
        }
    },

    // The selected crate keeps its glow while the aim moves on; otherwise the aimed crate glows
    updateHighlight: function () {
        const target = this.selectedRecipe || this.aimedRecipe;
        if (target === this.highlightedRecipe) return;

        this.unhighlightRecipe(this.highlightedRecipe);
        this.highlightedRecipe = target;
        this.highlightRecipe(target);
    },

    raycastForRecipe: function () {
        if (!this.camera || !this.camera.object3D) return null;

        // Ray from the camera through the centre of the view
        const cameraObj3D = this.camera.object3D;
        const origin = new THREE.Vector3();
        cameraObj3D.getWorldPosition(origin);
        const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(cameraObj3D.getWorldQuaternion(new THREE.Quaternion()));
        const raycaster = new THREE.Raycaster(origin, direction.normalize(), 0, this.data.maxDistance);

        // Only crates that are still falling can be aimed at
        const meshes = [];
        document.querySelectorAll('.fallable-recipe:not([data-captured="true"])').forEach((el) => {
            if (!el.object3D) return;
            el.object3D.traverse((child) => {
                if (child.isMesh) {
                    child.userData.recipeEl = el;
                    meshes.push(child);
                }
            });
        });
        if (meshes.length === 0) return null;

        const hits = raycaster.intersectObjects(meshes);
        return hits.length > 0 ? hits[0].object.userData.recipeEl : null;
    },

    highlightRecipe: function (recipeEl) {
        if (!recipeEl) return;

        // Copy the values (not the live attribute object) so unhighlighting restores them exactly
        const { color, emissive, emissiveIntensity, opacity, transparent } = recipeEl.getAttribute('material');
        this.originalMaterial = { color, emissive, emissiveIntensity, opacity, transparent };

        recipeEl.setAttribute('material', {
            ...this.originalMaterial,
            emissive: this.data.highlightEmissive,
            emissiveIntensity: this.data.highlightIntensity
        });

        this.log.debug(`Highlighted recipe: ${recipeEl.id}`);
    },

    unhighlightRecipe: function (recipeEl) {
        if (!recipeEl || !this.originalMaterial) return;

        recipeEl.setAttribute('material', this.originalMaterial);
        this.originalMaterial = null;

        this.log.debug(`Unhighlighted recipe: ${recipeEl.id}`);
    },

    captureRecipe: function (recipeEl) {
        this.unhighlightRecipe(this.highlightedRecipe);
        this.highlightedRecipe = null;
        this.selectedRecipe = null;
        this.aimedRecipe = null;

        // Stop the fall animation so it does not fight the pull toward the intake
        recipeEl.removeAttribute('animation');

        this.capturedRecipe = recipeEl;
        this.log.info(`Captured recipe: ${recipeEl.id}`);
    },

    pullRecipeToIntake: function (recipeEl) {
        const intakeEls = document.querySelectorAll('.recipe-team-intake');
        if (intakeEls.length === 0) {
            this.log.error('No recipe intake in the scene - dropping the capture');
            this.capturedRecipe = null;
            return;
        }

        // Work in world space: the crate and the intake have different parents
        const crateObj = recipeEl.object3D;
        const crateWorld = crateObj.getWorldPosition(new THREE.Vector3());

        // Closest intake by world distance
        let intakeEl = null;
        let intakeWorld = null;
        let minDist = Infinity;
        intakeEls.forEach((el) => {
            const pos = el.object3D.getWorldPosition(new THREE.Vector3());
            const dist = pos.distanceTo(crateWorld);
            if (dist < minDist) {
                minDist = dist;
                intakeEl = el;
                intakeWorld = pos;
            }
        });

        const target = this.landingPoint(intakeEl, intakeWorld);

        // Smoothly lerp the crate toward the landing point
        const lerpFactor = 0.1; // adjust for speed
        const next = crateWorld.clone().lerp(target, lerpFactor);
        const local = crateObj.parent.worldToLocal(next.clone());
        recipeEl.setAttribute('position', `${local.x} ${local.y} ${local.z}`);

        // Scale up as it gets closer
        const distance = next.distanceTo(target);
        const scaleFactor = Math.max(0.6, 1.5 - (distance / this.data.maxDistance));
        recipeEl.setAttribute('scale', `${scaleFactor} ${scaleFactor} ${scaleFactor}`);

        // Landed: sit exactly on top of the intake and finalize the capture once
        if (distance < 0.1) {
            const placed = crateObj.parent.worldToLocal(target.clone());
            recipeEl.setAttribute('position', `${placed.x} ${placed.y} ${placed.z}`);
            recipeEl.setAttribute('scale', `${PLACED_CRATE_SCALE} ${PLACED_CRATE_SCALE} ${PLACED_CRATE_SCALE}`);

            this.capturedRecipe = null;
            this.finalizeCaptureOnIntake(recipeEl);
        }
    },

    // World position on top of the intake, where a placed crate rests
    landingPoint: function (intakeEl, intakeWorld) {
        const box = new THREE.Box3().setFromObject(intakeEl.object3D);
        if (box.isEmpty()) {
            // Model not loaded yet: fall back to the intake's origin
            return intakeWorld.clone().add(new THREE.Vector3(0, PLACED_CRATE_HALF_HEIGHT, 0));
        }
        const centre = box.getCenter(new THREE.Vector3());
        return new THREE.Vector3(centre.x, box.max.y + PLACED_CRATE_HALF_HEIGHT, centre.z);
    },

    finalizeCaptureOnIntake: function (recipeEl) {
        // Add captured class and mark as placed
        recipeEl.classList.add('captured-recipe');
        recipeEl.setAttribute('data-captured', 'true');

        // Extract the recipe from the crate
        const recipeDataStr = recipeEl.getAttribute('data-recipe');
        let recipe = null;
        if (recipeDataStr) {
            try {
                recipe = JSON.parse(recipeDataStr);
                this.log.info(`Captured recipe: ${recipe.name}`, recipe);
            } catch (e) {
                this.log.error('Failed to parse recipe from crate', e);
            }
        }

        // Publish MQTT capture event and recipe data to the crate's team
        this.publishCaptureToMQTT(recipe, recipeEl);

        // Notify recipe-spawner that recipe was captured
        const spawner = document.querySelector('[recipe-spawner]');
        if (spawner && spawner.components['recipe-spawner']) {
            const recipeId = recipeEl.getAttribute('data-recipe-id');
            spawner.components['recipe-spawner'].captureRecipe(recipeId);
            this.log.info(`Recipe captured: ${recipeId}`);
        }
    },

    publishCaptureToMQTT: function (recipe, recipeEl) {
        const scene = document.querySelector('a-scene');
        const mqttComponent = scene?.components['mqtt-bridge'] || scene?.components['head-chef-mqtt-client'];

        if (mqttComponent && mqttComponent.client && mqttComponent.client.connected) {
            const gameId = mqttComponent.data.gameId;
            // Each crate is tagged with the team whose spawner produced it
            const teamId = recipeEl.getAttribute('data-team-id') || mqttComponent.data.teamId;

            // Publish recipe data to recipe-desired topic (if available)
            if (recipe && recipe.ingredientSequences) {
                const topic = window.CosmicChef.recipeDesiredTopic(teamId, gameId);
                const recipePayload = JSON.stringify(recipe);
                mqttComponent.client.publish(topic, recipePayload, { qos: 1 });
                this.log.info(`Published recipe for team ${teamId} to MQTT: ${topic}`);
            }

            // Publish capture state to trigger the capture in state machine
            const submitTopic = window.CosmicChef.headChefSubmitTopic(teamId, gameId);
            mqttComponent.client.publish(submitTopic, 'captured', { qos: 1 });
            this.log.info(`Published CAPTURE state for team ${teamId} to MQTT: ${submitTopic}`);
        } else {
            this.log.warn('MQTT client not available or not connected');
        }
    },

    // Shrink the captured crates away, then remove them. Marked so repeated state updates do not restart it.
    disposeCapturedRecipes: function () {
        document.querySelectorAll('.captured-recipe:not([data-disposing])').forEach((el) => {
            el.setAttribute('data-disposing', 'true');
            el.setAttribute('animation__shrink', { property: 'scale', to: '0 0 0', dur: CRATE_SHRINK_MS, easing: 'easeInQuad' });
            el.addEventListener('animationcomplete__shrink', () => el.remove(), { once: true });
        });
    },

    remove: function () {
        this.el.sceneEl.removeEventListener('game-state-changed', this.onStateChanged);
        document.removeEventListener('mousedown', this.onMouseDown);
        document.removeEventListener('contextmenu', this.onContextMenu);
        this.unhighlightRecipe(this.highlightedRecipe);
        this.log.debug('Tractor beam removed');
    }
});
