/**
 * galley-manager.js
 * Manages ingredient entity lifecycle and animation on the assembly line.
 * Subscribes to preparation-manager state changes and syncs ingredient positions/animations.
 */

// Red sphere over a station when its chef's gesture is invalid. Off for now (wrong-gesture feedback is disabled).
const SHOW_INVALID_GESTURE_INDICATOR = false;

// Scale of the plate that marks the recipe delivery area
const PLATE_SCALE = 2;

// Delivered ingredients arrange on a circle of this radius around the plate centre
const RING_RADIUS = 0.5;
// The ring draws in to this radius for the final stir
const FINAL_STIR_RING_RADIUS = 0.3;
// The orbit stops this long (ms) after the last stir tick
const STIR_HOLD_MS = 2000;

AFRAME.registerComponent('galley-manager', {
    schema: {
        deliveryAreaPosition: { type: 'vec3', default: { x: -2, y: 1.7, z: 3 } },
        // Centre of the plate in the galley (on the delivery piston), at plate height
        platePosition: { type: 'vec3', default: { x: -2.73654, y: 1.4, z: 3.02123 } },
        vacuumDuration: { type: 'number', default: 2000 },
        vacuumResetDelay: { type: 'number', default: 2500 },
        galleryId: { type: 'string', default: '' },
        // Passed to spawned particles: show gesture distortion before a chef performs it
        gestureHints: { type: 'boolean', default: false }
    },

    init: function () {
        this.log = window.log.getLogger('galley-manager');
        const galleryId = this.data.galleryId || this.el.id || 'galley-default';
        this.log.debug(`Initializing galley-manager for gallery: ${galleryId}`);

        // Cache of discovered station positions (lazy-loaded)
        this.stationPositionCache = new Map();

        // Track active ingredient entities (scoped to this gallery)
        this.ingredientEntities = new Map(); // ingredientId → { el, stationId, progress }
        this.lastRecipeName = null;
        this.lastState = null;
        this.vacuumInProgress = false;
        this.invalidIndicators = {}; // stationId → { el, timeout }
        this.feedbackEntities = new Map(); // stationId → el with sous-chef-gesture-feedback
        this.galleryId = galleryId;

        // Listen for state changes from preparation-manager or team-galley-receiver
        // If this entity has team-galley-receiver, listen to it; otherwise listen to scene
        const stateSource = this.el.components?.['team-galley-receiver'] ? this.el : document.querySelector('a-scene');
        this.stateSource = stateSource;

        this.onStateChange = this.onStateChange.bind(this);
        this.onInvalidGesture = this.onInvalidGesture.bind(this);

        stateSource.addEventListener('game-state-changed', this.onStateChange);

        // Listen for invalid gestures on the scene
        const scene = document.querySelector('a-scene');
        scene.addEventListener('invalid-gesture', this.onInvalidGesture);

        // Lazily ensure feedback indicators exist for stations
        this.ensureStationFeedbackEntities();

        this.log.debug(`Galley manager ready. Delivery area position: ${JSON.stringify(this.data.deliveryAreaPosition)}`);
    },

    ensureStationFeedbackEntities: function () {
        // Map station ID (S1, S2, S3) to chef ID (chef-1, chef-2, chef-3)
        const stationChefMap = {
            'S1': 'chef-1',
            'S2': 'chef-2',
            'S3': 'chef-3'
        };

        Object.keys(stationChefMap).forEach((stationId) => {
            if (this.feedbackEntities.has(stationId)) return;

            const pos = this.getStationPosition(stationId);
            if (!pos) return;

            const chefId = stationChefMap[stationId];
            const feedbackEl = document.createElement('a-entity');
            feedbackEl.setAttribute('id', `feedback_${stationId}__${this.galleryId}`);
            feedbackEl.setAttribute('sous-chef-gesture-feedback', { chefId });
            // Position above the station/board (pos.y is 1.5, board is 1.3; put utensil at 1.8)
            feedbackEl.setAttribute('position', `${pos.x} 1.8 ${pos.z}`);

            this.el.appendChild(feedbackEl);
            this.feedbackEntities.set(stationId, feedbackEl);
            this.log.debug(`Created gesture feedback entity for ${chefId} at station ${stationId}`);
        });
    },

    getStationPosition: function (stationId) {
        // Return cached position if available
        if (this.stationPositionCache.has(stationId)) {
            return this.stationPositionCache.get(stationId);
        }

        // Find station element by data-station-id
        const stationEl = this.el.querySelector(`[data-station-id="${stationId}"]`);
        if (!stationEl) {
            this.log.warn(`Station ${stationId} not found in scene`);
            return null;
        }

        const posStr = stationEl.getAttribute('position');
        const pos = this.parsePosition(posStr);
        if (!pos) {
            this.log.warn(`Could not parse position for station ${stationId}: ${posStr}`);
            return null;
        }

        // Adjust Y to position ingredients at desired height (between platform and board)
        // Boards are at y=1.3, so place ingredients at y=1.5
        const stationPos = { x: pos.x, y: 1.5, z: pos.z };
        this.stationPositionCache.set(stationId, stationPos);
        this.log.debug(`Discovered station ${stationId} at ${JSON.stringify(stationPos)}`);
        return stationPos;
    },

    parsePosition: function (posData) {
        if (!posData) return null;

        // A-Frame returns position as an object, not a string
        if (typeof posData === 'object' && posData.x !== undefined && posData.y !== undefined && posData.z !== undefined) {
            return { x: posData.x, y: posData.y, z: posData.z };
        }

        // Fallback: parse string format (e.g., "2 0.9 -1")
        if (typeof posData === 'string') {
            const parts = posData.split(' ').map(p => parseFloat(p));
            if (parts.length !== 3 || parts.some(isNaN)) return null;
            return { x: parts[0], y: parts[1], z: parts[2] };
        }

        return null;
    },

    onStateChange: function (evt) {
        const { state, context } = evt.detail;
        this.onStateChangeHandler(state, context);
    },

    onInvalidGesture: function (evt) {
        if (!SHOW_INVALID_GESTURE_INDICATOR) return;
        this.showInvalidGestureIndicator(evt.detail.stationId, evt.detail.chefId);
    },

    onStateChangeHandler: function (state, context) {
        this.log.debug(`State: ${state}, Ingredients: ${context.ingredients.length}, Stations: ${context.stations.length}`);

        // Ensure station feedback entities exist (in case stations loaded asynchronously via load-fragment)
        this.ensureStationFeedbackEntities();

        // Clear ingredients when entering preparingIngredients (new recipe captured)
        if (state === 'preparingIngredients' && this.lastState !== 'preparingIngredients') {
            this.clearAllIngredients();
            this.recipeIngredientCount = context.ingredients.length;
            this.spawnPlate();
        }

        // Also handle recipe name changes as a defensive check
        if (context.currentOrder && context.currentOrder.name !== this.lastRecipeName) {
            this.lastRecipeName = context.currentOrder.name;
        }

        // Only sync ingredients when actively in a recipe state
        const isRecipeActive = ['preparingIngredients', 'checkIfAllReady', 'readyForFinalStir', 'recipeReadyForSubmit'].includes(state);
        if (isRecipeActive) {
            this.syncIngredientsWithStations(context);
            this.updateGestureAnimations(context);
        }

        // Handle state-specific transitions: the orbit follows the stir tick by tick
        if (state === 'readyForFinalStir') {
            if (context.stirProgress !== this.lastStirProgress) {
                this.lastStirProgress = context.stirProgress;
                this.onFinalStirTick();
            }
        } else if (this.lastState === 'readyForFinalStir') {
            this.stopFinalStirOrbit();
        }

        this.lastState = state;

        // Handle cancellation or submission - vacuum and reset
        if (state === 'orderSuccess' || state === 'orderPenalized') {
            this.vacuumAllIngredientsAndReset(state === 'orderPenalized');
        }
    },

    syncIngredientsWithStations: function (context) {
        const currentStationIngredients = new Set();

        // Create or update ingredients at stations
        context.stations.forEach((station, stationIdx) => {

            if (station.ingredientId) {
                currentStationIngredients.add(station.ingredientId);

                if (!this.ingredientEntities.has(station.ingredientId)) {
                    // Spawn new ingredient
                    this.spawnIngredient(station);
                } else {
                    // Update existing ingredient position/state
                    const data = this.ingredientEntities.get(station.ingredientId);
                    if (data.stationId !== station.stationId) {
                        this.moveIngredientToStation(station.ingredientId, station.stationId);
                    }
                }
            }
        });

        // Move ingredients to delivery area when completed
        this.ingredientEntities.forEach((data, ingredientId) => {
            if (!currentStationIngredients.has(ingredientId) && !data.inDeliveryArea) {
                // Ingredient completed all gestures — update to completion state
                const el = data.el;
                el.setAttribute('quantum-particle', {
                    active: true,
                    progress: Math.min(1.0, 1.0)  // cap at 1.0
                });

                // Animate to delivery area
                data.inDeliveryArea = true;
                this.animateToDeliveryArea(ingredientId);
            }
        });
    },

    spawnIngredient: function (station) {
        const { ingredientId, ingredientType, stationId, gesturesRequired } = station;

        const pos = this.getStationPosition(stationId);
        if (!pos) {
            this.log.error(`Cannot spawn ingredient ${ingredientId}: station ${stationId} not found`);
            return;
        }

        const el = document.createElement('a-entity');
        // Namespace ingredient ID by gallery to avoid collisions when multiple galleys are active
        el.setAttribute('id', `ingredient_${ingredientId}__${this.galleryId}`);
        el.setAttribute('class', 'ingredient-entity');

        // Position at station
        el.setAttribute('position', `${pos.x} ${pos.y} ${pos.z}`);

        // Face toward sous-chefs (rotate 180 degrees)
        el.setAttribute('rotation', '0 180 0');

        // Initial quantum-particle: first gesture in sequence
        if (gesturesRequired && gesturesRequired.length > 0) {
            const firstGesture = gesturesRequired[0];
            el.setAttribute('quantum-particle', {
                ingredient: ingredientType,
                active: true,
                progress: 0,
                gesture: firstGesture.gesture,
                gestureHint: this.data.gestureHints
            });
        }

        // Add to scene
        this.el.appendChild(el);

        // Track it
        this.ingredientEntities.set(ingredientId, {
            el,
            stationId,
            progress: 0,
            gesturesRequired,
            currentGestureIndex: 0,
            inDeliveryArea: false
        });
    },

    updateGestureAnimations: function (context) {
        // Update progress and gesture for each ingredient at a station
        context.stations.forEach((station, stationIdx) => {
            if (station.ingredientId && this.ingredientEntities.has(station.ingredientId)) {
                const data = this.ingredientEntities.get(station.ingredientId);
                const currentGesture = station.gesturesRequired[station.currentGestureIndex];

                if (currentGesture) {
                    const el = data.el;
                    el.setAttribute('quantum-particle', {
                        active: true,
                        gesture: currentGesture.gesture,
                        progress: Math.min(1.0, station.progress / 100)
                    });

                    // Log progress for debugging
                    if (station.progress !== data.lastLoggedProgress) {
                        this.log.debug(
                            `${station.ingredientId}: ${currentGesture.gesture} ${station.progress}%`
                        );
                        data.lastLoggedProgress = station.progress;
                    }
                }
            }
        });
    },

    moveIngredientToStation: function (ingredientId, newStationId) {
        const data = this.ingredientEntities.get(ingredientId);
        if (!data) return;

        const toPos = this.getStationPosition(newStationId);
        if (!toPos) {
            this.log.error(`Cannot move ingredient ${ingredientId}: station ${newStationId} not found`);
            return;
        }

        const el = data.el;

        // Animate movement between stations
        const fromPos = el.getAttribute('position');

        this.log.debug(
            `Moving ${ingredientId} from station ${data.stationId} to station ${newStationId}`
        );

        // Use A-Frame animation
        const duration = 800; // ms
        el.setAttribute('animation', {
            property: 'position',
            from: `${fromPos.x} ${fromPos.y} ${fromPos.z}`,
            to: `${toPos.x} ${toPos.y} ${toPos.z}`,
            dur: duration,
            easing: 'easeInOutQuad'
        });

        data.stationId = newStationId;
    },

    animateToDeliveryArea: function (ingredientId) {
        const data = this.ingredientEntities.get(ingredientId);
        if (!data) return;

        const el = data.el;
        const ringPos = this.ringPosition(this.deliveredCount);
        data.deliverySlot = this.deliveredCount;
        this.deliveredCount++;
        const duration = 600; // ms

        // Remove floating animation temporarily
        el.removeAttribute('anim-space-float');
        el.removeAttribute('animation');

        el.addEventListener('animationcomplete', () => {
            // Re-add floating animation once the ingredient has arrived
            el.setAttribute('anim-space-float', {
                speed: 0.8,
                distance: 0.2
            });
        }, { once: true });

        el.setAttribute('animation', {
            property: 'position',
            to: `${ringPos.x} ${ringPos.y} ${ringPos.z}`,
            dur: duration,
            easing: 'easeInOutQuad'
        });
    },

    // Position of the delivery slot on the circle around the plate (slots spread over the whole recipe)
    ringPosition: function (slot, radius = RING_RADIUS) {
        const platePos = this.data.platePosition;
        const count = Math.max(this.recipeIngredientCount, slot + 1, 1);
        const angle = (2 * Math.PI * slot) / count;

        return {
            x: platePos.x + Math.cos(angle) * radius,
            y: this.data.deliveryAreaPosition.y,
            z: platePos.z + Math.sin(angle) * radius
        };
    },

    // Each stir tick keeps the orbit going; it stops once the ticks have been silent for STIR_HOLD_MS
    onFinalStirTick: function () {
        if (!this.orbitActive) {
            this.startFinalStirOrbit();
        }
        clearTimeout(this.stirHoldTimeout);
        this.stirHoldTimeout = setTimeout(() => this.stopFinalStirOrbit(), STIR_HOLD_MS);
    },

    startFinalStirOrbit: function () {
        this.orbitActive = true;
        this.log.debug('Final stir orbit started');

        this.ingredientEntities.forEach((data, ingredientId) => {
            if (data.inDeliveryArea) {
                const el = data.el;
                const platePos = this.data.platePosition;
                const count = Math.max(this.recipeIngredientCount, data.deliverySlot + 1, 1);

                // Stop floating: anim-stirring takes over the position
                el.removeAttribute('anim-space-float');
                // Orbit the plate centre, evenly spaced by delivery slot, starting on its ring spot
                el.setAttribute('anim-stirring', {
                    useOrigin: true,
                    origin: `${platePos.x} ${this.data.deliveryAreaPosition.y} ${platePos.z}`,
                    radius: this.finalStirDrawnIn ? FINAL_STIR_RING_RADIUS : RING_RADIUS,
                    speed: 1.5,
                    depth: 0,
                    randomness: 0,
                    clockwise: true,
                    phase: data.deliverySlot / count
                });
                // First orbit draws in from the ring radius to the final-stir radius
                if (!this.finalStirDrawnIn) {
                    el.setAttribute('animation__final-stir-ring', {
                        property: 'anim-stirring.radius',
                        from: RING_RADIUS,
                        to: FINAL_STIR_RING_RADIUS,
                        dur: 600, // ms
                        easing: 'easeInOutQuad'
                    });
                }
            }
        });
        this.finalStirDrawnIn = true;
    },

    // Stop orbiting and float again, where each ingredient stopped
    stopFinalStirOrbit: function () {
        clearTimeout(this.stirHoldTimeout);
        if (!this.orbitActive) return;

        this.orbitActive = false;
        this.log.debug('Final stir orbit stopped');

        this.ingredientEntities.forEach((data, ingredientId) => {
            const el = data.el;
            if (el && data.inDeliveryArea) {
                el.removeAttribute('animation__final-stir-ring');
                el.removeAttribute('anim-stirring');
                el.setAttribute('anim-space-float', {
                    speed: 0.8,
                    distance: 0.2
                });
            }
        });
    },

    clearAllIngredients: function () {
        this.ingredientEntities.forEach((data, ingredientId) => {
            if (data.el && data.el.parentNode) {
                data.el.remove();
            }
        });
        this.ingredientEntities.clear();
        this.deliveredCount = 0;
        this.orbitActive = false;
        this.finalStirDrawnIn = false;
        this.lastStirProgress = 0;
        clearTimeout(this.stirHoldTimeout);
        this.log.debug('Cleared all ingredient entities');

        if (this.plateEl) {
            this.plateEl.remove();
            this.plateEl = null;
        }
    },

    spawnPlate: function () {
        const platePos = this.data.platePosition;

        const el = document.createElement('a-entity');
        el.setAttribute('id', `plate_${this.galleryId}`);
        el.setAttribute('gltf-model', '#asset_plate_deep');
        el.setAttribute('position', `${platePos.x} ${platePos.y} ${platePos.z}`);
        el.setAttribute('scale', `${PLATE_SCALE} ${PLATE_SCALE} ${PLATE_SCALE}`);

        this.el.appendChild(el);
        this.plateEl = el;
    },

    vacuumAllIngredientsAndReset: function (isCancellation) {
        if (this.vacuumInProgress) {
            this.log.warn('Vacuum already in progress, skipping');
            return;
        }

        this.vacuumInProgress = true;
        this.log.info(`Vacuuming all ingredients${isCancellation ? ' (cancellation)' : ' (submission)'}`);

        let vacuumedCount = 0;
        this.ingredientEntities.forEach((data, ingredientId) => {
            const el = data.el;
            if (el) {
                this.applyVacuum(el);

                vacuumedCount++;
                this.log.debug(`Applied vacuum animation to ${ingredientId}`);
            }
        });

        if (this.plateEl) {
            this.applyVacuum(this.plateEl);
        }

        this.log.info(`Vacuumed ${vacuumedCount} ingredients`);

        // Schedule state reset after vacuum completes (for both cancellation and submission)
        setTimeout(() => {
            this.clearAllIngredients();
            this.requestNextRound();
            this.vacuumInProgress = false;
        }, this.data.vacuumResetDelay);
    },

    applyVacuum: function (el) {
        // Stop floating animation before vacuum
        el.removeAttribute('anim-space-float');

        // Apply vacuum animation: stretch upwards and move 10 units up
        el.setAttribute('anim-vacuum', {
            distance: 10,
            stretchAxis: 'y',
            stretchDirection: 1,  // positive = upward
            duration: this.data.vacuumDuration,
            resistance: 1.5,
            loop: false
        });
    },

    requestNextRound: function () {
        // Emit event for mqtt-bridge to handle (decoupled from preparation-manager)
        this.log.info('Requesting NEXT_ROUND');
        this.el.sceneEl.emit('next-round-requested');
    },

    showInvalidGestureIndicator: function (stationId, chefId) {
        // Gesture streams tick every 100ms: keep one indicator per station alive
        // while invalid ticks keep coming, instead of spawning one per tick.
        const existing = this.invalidIndicators[stationId];
        if (existing) {
            clearTimeout(existing.timeout);
            existing.timeout = this.scheduleIndicatorRemoval(stationId);
            return;
        }

        const stationPos = this.getStationPosition(stationId);
        if (!stationPos) {
            this.log.warn(`Cannot show indicator: station ${stationId} not found`);
            return;
        }

        // Create red sphere indicator above the station
        const xEl = document.createElement('a-entity');
        xEl.setAttribute('id', `invalid-gesture-${stationId}`);
        xEl.setAttribute('geometry', {
            primitive: 'sphere',
            radius: 0.5
        });
        xEl.setAttribute('material', {
            color: '#ff0000',
            emissive: '#ff0000',
            emissiveIntensity: 0.5,
            transparent: true,
            opacity: 0.4
        });
        xEl.setAttribute('position', `${stationPos.x} ${stationPos.y} ${stationPos.z}`);

        this.el.appendChild(xEl);

        this.log.info(`Invalid gesture from ${chefId} at ${stationId} — showing red indicator`);

        this.invalidIndicators[stationId] = {
            el: xEl,
            timeout: this.scheduleIndicatorRemoval(stationId)
        };
    },

    scheduleIndicatorRemoval: function (stationId) {
        return setTimeout(() => {
            const indicator = this.invalidIndicators[stationId];
            if (indicator && indicator.el.parentNode) {
                indicator.el.remove();
            }
            delete this.invalidIndicators[stationId];
        }, 800);
    },

    remove: function () {
        // Remove event listeners
        if (this.stateSource) {
            this.stateSource.removeEventListener('game-state-changed', this.onStateChange);
        }
        const scene = document.querySelector('a-scene');
        if (scene) {
            scene.removeEventListener('invalid-gesture', this.onInvalidGesture);
        }

        // Cleanup: remove all ingredient entities
        this.ingredientEntities.forEach((data) => {
            if (data.el && data.el.parentNode) {
                data.el.remove();
            }
        });
        this.ingredientEntities.clear();

        // Cleanup: remove gesture feedback entities
        this.feedbackEntities.forEach((el) => {
            if (el && el.parentNode) {
                el.remove();
            }
        });
        this.feedbackEntities.clear();

        this.log.debug('Galley manager removed');
    }
});
