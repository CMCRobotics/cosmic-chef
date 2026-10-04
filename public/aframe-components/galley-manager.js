/**
 * galley-manager.js
 * Manages ingredient entity lifecycle and animation on the assembly line.
 * Subscribes to preparation-manager state changes and syncs ingredient positions/animations.
 */

AFRAME.registerComponent('galley-manager', {
    schema: {
        deliveryAreaPosition: { type: 'vec3', default: { x: -2, y: 1.7, z: 3 } },
        vacuumDuration: { type: 'number', default: 2000 },
        vacuumResetDelay: { type: 'number', default: 2500 }
    },

    init: function () {
        this.log = window.log.getLogger('galley-manager');
        this.log.setLevel('info');
        this.log.debug('Initializing galley-manager');

        // Cache of discovered station positions (lazy-loaded)
        this.stationPositionCache = new Map();

        // Track active ingredient entities
        this.ingredientEntities = new Map(); // ingredientId → { el, stationId, progress }
        this.lastRecipeName = null;
        this.vacuumInProgress = false;
        this.invalidIndicators = {}; // stationId → { el, timeout }

        // Listen for state changes from preparation-manager
        const scene = document.querySelector('a-scene');
        scene.addEventListener('game-state-changed', (evt) => {
            this.onStateChange(evt.detail.state, evt.detail.context);
        });

        // Listen for invalid gestures
        scene.addEventListener('invalid-gesture', (evt) => {
            this.showInvalidGestureIndicator(evt.detail.stationId, evt.detail.chefId);
        });

        this.log.debug(`Galley manager ready. Delivery area position: ${JSON.stringify(this.data.deliveryAreaPosition)}`);
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

    onStateChange: function (state, context) {
        this.log.debug(`State: ${state}, Ingredients: ${context.ingredients.length}, Stations: ${context.stations.length}`);

        // Handle new recipe: clear old ingredient entities when recipe changes
        if (context.currentOrder && context.currentOrder.name !== this.lastRecipeName) {
            this.clearAllIngredients();
            this.lastRecipeName = context.currentOrder.name;
        }

        // Sync ingredient entities with context.stations
        this.syncIngredientsWithStations(context);

        // Update gesture animations based on progress
        this.updateGestureAnimations(context);

        // Handle state-specific transitions
        if (state === 'readyForFinalStir') {
            this.convergeToDeliveryArea(context);
        }

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
        el.setAttribute('id', `ingredient_${ingredientId}`);
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
                gesture: firstGesture.gesture
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
                    if (station.progress % 25 === 0 && station.progress !== data.lastLoggedProgress) {
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
            duration,
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

        const startPos = el.getAttribute('position');
        const startTime = Date.now();


        // Manual interpolation using tick
        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Easing: easeInOutQuad
            const t = progress < 0.5
                ? 2 * progress * progress
                : -1 + (4 - 2 * progress) * progress;

            const newPos = {
                x: startPos.x + (deliveryPos.x - startPos.x) * t,
                y: startPos.y + (deliveryPos.y - startPos.y) * t,
                z: startPos.z + (deliveryPos.z - startPos.z) * t
            };

            el.setAttribute('position', newPos);

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                // Re-add floating animation after animation completes
                el.setAttribute('anim-space-float', {
                    speed: 0.8,
                    distance: 0.2
                });
            }
        };

        requestAnimationFrame(animate);
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
                    duration,
                    easing: 'easeInOutQuad'
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

        // If cancellation, schedule state reset after vacuum completes
        if (isCancellation) {
            setTimeout(() => {
                this.sendNextRound();
                this.vacuumInProgress = false;
            }, this.data.vacuumResetDelay);
        } else {
            this.vacuumInProgress = false;
        }
    },

    sendNextRound: function () {
        const prepMgr = this.el.sceneEl.components['preparation-manager'];
        if (prepMgr) {
            this.log.info('Sending NEXT_ROUND to state machine');
            prepMgr.send({ type: 'NEXT_ROUND' });
        } else {
            this.log.error('Could not find preparation-manager to send NEXT_ROUND');
        }
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
        // Cleanup: remove all ingredient entities
        this.ingredientEntities.forEach((data) => {
            if (data.el && data.el.parentNode) {
                data.el.remove();
            }
        });
        this.ingredientEntities.clear();
        this.log.debug('Galley manager removed');
    }
});
