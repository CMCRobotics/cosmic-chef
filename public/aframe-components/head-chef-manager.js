/**
 * head-chef-manager.js
 * Manages Head Chef VR scene: recipe capture, display, and submission.
 * Listens to preparation-manager state changes and MQTT updates.
 */

AFRAME.registerComponent('head-chef-manager', {
    schema: {
        recipeSpawnRate: { type: 'number', default: 5000 }, // ms between recipe spawns
        tractorBeamDistance: { type: 'number', default: 20 } // max tractor beam reach
    },

    init: function () {
        this.log = window.log.getLogger('head-chef-manager');
        this.log.debug('Initializing head-chef-manager');

        // Track captured recipe
        this.capturedRecipe = null;
        this.lastRecipeId = null;

        // Track sous-chef states for display
        this.sousChefStates = {}; // chefId → { gesture, energy, stationId }
        this.ingredientCounts = {}; // ingredientType → count

        this.lastState = null;

        // Listen for state changes from preparation-manager
        const scene = document.querySelector('a-scene');
        scene.addEventListener('game-state-changed', (evt) => {
            this.onStateChange(evt.detail.state, evt.detail.context);
        });

        // Listen for invalid gestures
        scene.addEventListener('invalid-gesture', (evt) => {
            this.onInvalidGesture(evt.detail.chefId, evt.detail.stationId);
        });

        this.log.debug('Head Chef manager ready');
    },

    onStateChange: function (state, context) {
        this.log.debug(`Head Chef State: ${state}, Current Order: ${context.currentOrder ? context.currentOrder.name : 'none'}`);

        // Handle new recipe: clear old recipe when recipe changes
        if (context.currentOrder && context.currentOrder.name !== this.lastRecipeId) {
            this.clearCapturedRecipe();
            this.lastRecipeId = context.currentOrder.name;
            this.log.info(`New recipe: ${context.currentOrder.name}`);
        }

        // Update sous-chef and ingredient state
        this.updateSousChefState(context);
        this.updateIngredientCounts(context);

        // Handle state-specific transitions
        if (state === 'orderSuccess') {
            this.log.info('Recipe successful! Clearing display.');
            this.clearCapturedRecipe();
        } else if (state === 'orderPenalized') {
            this.log.warn('Recipe failed or cancelled.');
            this.clearCapturedRecipe();
        }

        this.lastState = state;
    },

    updateSousChefState: function (context) {
        // Update sous-chef gesture and station info from context
        // This will be displayed in the status panel later
        context.stations.forEach((station) => {
            const chefId = station.assignedChefs && station.assignedChefs[0]; // First assigned chef
            if (chefId) {
                this.sousChefStates[chefId] = {
                    gesture: station.gesturesRequired ? station.gesturesRequired[0]?.gesture : 'idle',
                    progress: station.progress,
                    stationId: station.stationId,
                    ingredientId: station.ingredientId
                };
            }
        });
    },

    updateIngredientCounts: function (context) {
        // Count ingredients by type at each station
        const counts = {};
        context.stations.forEach((station) => {
            if (station.ingredientId) {
                const type = station.ingredientType;
                counts[type] = (counts[type] || 0) + 1;
            }
        });
        this.ingredientCounts = counts;
        this.log.debug(`Ingredient counts: ${JSON.stringify(this.ingredientCounts)}`);
    },

    onInvalidGesture: function (chefId, stationId) {
        this.log.warn(`Invalid gesture from ${chefId} at ${stationId}`);
        // Visual feedback will be added in later phases
    },

    clearCapturedRecipe: function () {
        if (this.capturedRecipe) {
            const recipeEl = document.querySelector('#head-chef-captured-recipe');
            if (recipeEl) {
                recipeEl.remove();
            }
            this.capturedRecipe = null;
            this.log.debug('Cleared captured recipe');
        }
    },

    // Note: All state changes now go through MQTT only
    // The tractor-beam publishes CAPTURE_RECIPE via MQTT
    // The recipe-status-button publishes SUBMIT_RECIPE and CANCEL_ORDER via MQTT
    // This ensures all clients stay synchronized

    remove: function () {
        this.log.debug('Head Chef manager removed');
    }
});
