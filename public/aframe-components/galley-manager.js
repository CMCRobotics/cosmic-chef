/**
 * galley-manager.js
 * Manages ingredient entity lifecycle and animation on the assembly line.
 * Subscribes to preparation-manager state changes and syncs ingredient positions/animations.
 */

// Red sphere over a station when its chef's gesture is invalid. Off for now (wrong-gesture feedback is disabled).
const SHOW_INVALID_GESTURE_INDICATOR = false;

AFRAME.registerComponent('galley-manager', {
    schema: {
        deliveryAreaPosition: { type: 'vec3', default: { x: -2, y: 1.7, z: 3 } },
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

        // Handle state-specific transitions
        if (state === 'readyForFinalStir') {
            this.convergeToDeliveryArea(context);
            this.enableFinalStirAnimation();
        } else if (state !== 'readyForFinalStir' && this.lastState === 'readyForFinalStir') {
            this.disableFinalStirAnimation();
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
        const deliveryPos = this.data.deliveryAreaPosition;
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
            to: `${deliveryPos.x} ${deliveryPos.y} ${deliveryPos.z}`,
            dur: duration,
            easing: 'easeInOutQuad'
        });
    },

    convergeToDeliveryArea: function (context) {
        this.log.debug('All ingredients ready — final convergence to delivery area');

        const deliveryPos = this.data.deliveryAreaPosition;

        // All ingredients should already be at or near delivery area
        // Do a final subtle convergence for synchronized stir
        this.ingredientEntities.forEach((data, ingredientId) => {
            if (data.inDeliveryArea) {
                const el = data.el;
                const duration = 200; // ms (quick final adjustment)

                el.setAttribute('animation', {
                    property: 'position',
                    to: `${deliveryPos.x} ${deliveryPos.y} ${deliveryPos.z}`,
                    dur: duration,
                    easing: 'easeInOutQuad'
                });
            }
        });
    },

    enableFinalStirAnimation: function () {
        this.log.debug('Enabling final stir animation on all ingredients');
        this.ingredientEntities.forEach((data, ingredientId) => {
            const el = data.el;
            if (el && el.getAttribute('quantum-particle')) {
                el.setAttribute('quantum-particle', { isFinalStir: true });
            }
        });
    },

    disableFinalStirAnimation: function () {
        this.log.debug('Disabling final stir animation on all ingredients');
        this.ingredientEntities.forEach((data, ingredientId) => {
            const el = data.el;
            if (el && el.getAttribute('quantum-particle')) {
                el.setAttribute('quantum-particle', { isFinalStir: false });
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
        this.log.debug('Cleared all ingredient entities');
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

                vacuumedCount++;
                this.log.debug(`Applied vacuum animation to ${ingredientId}`);
            }
        });

        this.log.info(`Vacuumed ${vacuumedCount} ingredients`);

        // Schedule state reset after vacuum completes (for both cancellation and submission)
        setTimeout(() => {
            this.clearAllIngredients();
            this.requestNextRound();
            this.vacuumInProgress = false;
        }, this.data.vacuumResetDelay);
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
