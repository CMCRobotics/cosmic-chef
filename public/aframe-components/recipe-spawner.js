/**
 * recipe-spawner.js
 * Spawns recipe entities at configured intervals.
 * Recipes fall from sky and can be captured by the head chef.
 */

AFRAME.registerComponent('recipe-spawner', {
    schema: {
        spawnInterval: { type: 'number', default: 5000 }, // ms between spawns
        fallSpeed: { type: 'number', default: 3 }, // units per second downward
        fallDistance: { type: 'number', default: 10 }, // how far down recipes fall before despawning
        timeout: { type: 'number', default: 15000 }, // ms before uncaptured recipe despawns
        recipeModel: { type: 'string', default: '#asset_hopper_high_round' } // visual model for recipe
    },

    init: function () {
        this.log = window.log.getLogger('recipe-spawner');
        this.log.debug('Initializing recipe-spawner');

        this.recipeCount = 0;
        this.activeRecipes = new Map(); // recipeId → { el, startTime }
        this.spawnHandle = null;
        this.isSpawning = false;

        // Listen to game state to start/stop spawning
        const scene = document.querySelector('a-scene');
        scene.addEventListener('game-state-changed', (evt) => {
            this.onGameStateChange(evt.detail.state, evt.detail.context);
        });

        // Start spawning when scene is loaded, or immediately if already loaded
        const scene = this.el.sceneEl;
        if (scene.hasLoaded) {
            this.startSpawning();
        } else {
            scene.addEventListener('loaded', () => {
                this.startSpawning();
            });
        }

        this.log.debug(`Recipe spawner configured: interval=${this.data.spawnInterval}ms, fallSpeed=${this.data.fallSpeed}u/s`);
    },

    startSpawning: function () {
        if (this.isSpawning) return;
        this.isSpawning = true;
        this.log.info('Starting recipe spawn cycle');

        // Spawn first recipe immediately
        this.spawnRecipe();

        // Then spawn at intervals
        this.spawnHandle = setInterval(() => {
            this.spawnRecipe();
        }, this.data.spawnInterval);
    },

    stopSpawning: function () {
        if (!this.isSpawning) return;
        this.isSpawning = false;
        this.log.info('Stopping recipe spawn cycle');

        if (this.spawnHandle) {
            clearInterval(this.spawnHandle);
            this.spawnHandle = null;
        }
    },

    spawnRecipe: function () {
        const recipeId = `recipe-${this.recipeCount++}`;
        const spawnPos = this.el.getAttribute('position');

        // Create recipe entity
        const recipeEl = document.createElement('a-entity');
        recipeEl.setAttribute('id', recipeId);
        recipeEl.setAttribute('class', 'fallable-recipe');
        recipeEl.setAttribute('data-recipe-id', recipeId);

        // Visual: box with text
        recipeEl.setAttribute('geometry', {
            primitive: 'box',
            width: 0.8,
            height: 0.8,
            depth: 0.8
        });
        recipeEl.setAttribute('material', {
            color: '#ff6600',
            emissive: '#ff6600',
            emissiveIntensity: 0.3,
            transparent: true,
            opacity: 0.9
        });

        // Recipe name text
        const textEl = document.createElement('a-entity');
        textEl.setAttribute('text', {
            value: 'RECIPE',
            align: 'center',
            anchor: 'center',
            baseline: 'center',
            color: '#ffffff',
            fontSize: 40
        });
        textEl.setAttribute('position', '0 0 0.41'); // In front of box
        recipeEl.appendChild(textEl);

        // Position at spawn point
        recipeEl.setAttribute('position', `${spawnPos.x} ${spawnPos.y} ${spawnPos.z}`);

        // Add to scene (parent of recipe-spawner or world-root)
        this.el.parentNode.appendChild(recipeEl);

        // Track this recipe
        const startTime = Date.now();
        this.activeRecipes.set(recipeId, {
            el: recipeEl,
            startTime,
            startPos: { x: spawnPos.x, y: spawnPos.y, z: spawnPos.z }
        });

        this.log.debug(`Spawned recipe: ${recipeId} at ${spawnPos.x}, ${spawnPos.y}, ${spawnPos.z}`);

        // Animate falling
        this.animateRecipeFall(recipeId, spawnPos.y, this.data.fallDistance, this.data.fallSpeed);

        // Schedule despawn if not captured
        setTimeout(() => {
            this.despawnRecipeIfUncaptured(recipeId);
        }, this.data.timeout);
    },

    animateRecipeFall: function (recipeId, startY, fallDistance, fallSpeed) {
        const recipeData = this.activeRecipes.get(recipeId);
        if (!recipeData) return;

        const el = recipeData.el;
        const endY = startY - fallDistance;
        const duration = (fallDistance / fallSpeed) * 1000; // ms

        el.setAttribute('animation', {
            property: 'position',
            to: `${recipeData.startPos.x} ${endY} ${recipeData.startPos.z}`,
            dur: duration,
            easing: 'linear',
            loop: false
        });

        // After fall completes, despawn
        el.addEventListener('animationcomplete', () => {
            this.despawnRecipe(recipeId);
        }, { once: true });
    },

    despawnRecipeIfUncaptured: function (recipeId) {
        const recipeData = this.activeRecipes.get(recipeId);
        if (recipeData) {
            // Only despawn if still active (not captured)
            this.despawnRecipe(recipeId);
        }
    },

    despawnRecipe: function (recipeId) {
        const recipeData = this.activeRecipes.get(recipeId);
        if (!recipeData) return;

        const el = recipeData.el;
        if (el && el.parentNode) {
            el.remove();
        }

        this.activeRecipes.delete(recipeId);
        this.log.debug(`Despawned recipe: ${recipeId}`);
    },

    captureRecipe: function (recipeId) {
        const recipeData = this.activeRecipes.get(recipeId);
        if (!recipeData) {
            this.log.warn(`Cannot capture recipe ${recipeId}: not found`);
            return false;
        }

        this.log.info(`Captured recipe: ${recipeId}`);

        // Move recipe to intake hopper (handled by head-chef-manager)
        // Remove from active tracking
        this.activeRecipes.delete(recipeId);

        return true;
    },

    onGameStateChange: function (state, context) {
        // Stop spawning during certain states (optional)
        if (state === 'idle' && !this.isSpawning) {
            this.startSpawning();
        }
    },

    remove: function () {
        this.stopSpawning();
        this.activeRecipes.forEach((data, recipeId) => {
            if (data.el && data.el.parentNode) {
                data.el.remove();
            }
        });
        this.activeRecipes.clear();
        this.log.debug('Recipe spawner removed');
    }
});
