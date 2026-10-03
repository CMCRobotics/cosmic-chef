/**
 * galley-manager.js
 * Manages ingredient entity lifecycle and animation on the assembly line.
 * Subscribes to preparation-manager state changes and syncs ingredient positions/animations.
 */

AFRAME.registerComponent('galley-manager', {
    schema: {
        deliveryAreaPosition: { type: 'vec3', default: { x: -2, y: 1.7, z: 3 } }
    },

    init: function () {
        this.log = window.log.getLogger('galley-manager');
        this.log.setLevel('info');
        this.log.debug('Initializing galley-manager');

        // Station definitions (assembly line positions)
        this.stations = [
            { id: 'S1', position: { x: 2, y: 1.5, z: -1 } },
            { id: 'S2', position: { x: 0, y: 1.5, z: -1 } },
            { id: 'S3', position: { x: -2, y: 1.5, z: -1 } }
        ];

        // Track active ingredient entities
        this.ingredientEntities = new Map(); // ingredientId → { el, stationId, progress }
        this.lastRecipeId = null;

        // Listen for state changes from preparation-manager
        const scene = document.querySelector('a-scene');
        scene.addEventListener('game-state-changed', (evt) => {
            this.onStateChange(evt.detail.state, evt.detail.context);
        });

        this.log.debug(`Galley manager ready. Delivery area position: ${JSON.stringify(this.data.deliveryAreaPosition)}`);
    },

    onStateChange: function (state, context) {
        this.log.debug(`State: ${state}, Ingredients: ${context.ingredients.length}, Stations: ${context.stations.length}`);

        // Handle new recipe: clear old ingredient entities if count mismatch
        if (state === 'preparingIngredients') {
            const stationsWithIngredients = context.stations.filter(s => s.ingredientId).length;
            if (stationsWithIngredients !== this.ingredientEntities.size) {
                this.clearAllIngredients();
            }
        }

        // Sync ingredient entities with context.stations
        this.syncIngredientsWithStations(context);

        // Update gesture animations based on progress
        this.updateGestureAnimations(context);

        // Handle state-specific transitions
        if (state === 'readyForFinalStir') {
            this.convergeToDeliveryArea(context);
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
                    this.spawnIngredient(
                        station.ingredientId,
                        stationIdx,
                        station.gesturesRequired
                    );
                } else {
                    // Update existing ingredient position/state
                    const data = this.ingredientEntities.get(station.ingredientId);
                    if (data.stationIdx !== stationIdx) {
                        this.moveIngredientToStation(station.ingredientId, stationIdx);
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

    spawnIngredient: function (ingredientId, stationIdx, gesturesRequired) {

        const station = this.stations[stationIdx];
        const el = document.createElement('a-entity');
        el.setAttribute('id', `ingredient_${ingredientId}`);
        el.setAttribute('class', 'ingredient-entity');

        // Position at station
        const pos = station.position;
        el.setAttribute('position', `${pos.x} ${pos.y} ${pos.z}`);

        // Face toward sous-chefs (rotate 180 degrees)
        el.setAttribute('rotation', '0 180 0');

        // Initial quantum-particle: first gesture in sequence
        if (gesturesRequired && gesturesRequired.length > 0) {
            const firstGesture = gesturesRequired[0];
            const ingredientType = ingredientId.split('-')[0]; // 'up', 'down', 'strange', 'anti-down', etc.
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
            stationIdx,
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

    moveIngredientToStation: function (ingredientId, newStationIdx) {
        const data = this.ingredientEntities.get(ingredientId);
        if (!data) return;

        const newStation = this.stations[newStationIdx];
        const el = data.el;

        // Animate movement between stations
        const fromPos = el.getAttribute('position');
        const toPos = newStation.position;

        this.log.debug(
            `Moving ${ingredientId} from station ${data.stationIdx} to station ${newStationIdx}`
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

        data.stationIdx = newStationIdx;
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
