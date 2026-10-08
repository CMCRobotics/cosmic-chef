/**
 * recipe-spawner.js
 * Spawns recipe entities at configured intervals.
 * Recipes fall from sky and can be captured by the head chef.
 * Each spawner belongs to one team: its crates carry that team in data-team-id, so a
 * captured crate is published to the team it came from.
 */

AFRAME.registerComponent('recipe-spawner', {
    schema: {
        spawnInterval: { type: 'number', default: 5000 }, // ms between spawns
        fallSpeed: { type: 'number', default: 3 }, // units per second downward
        fallDistance: { type: 'number', default: 15 }, // how far down recipes fall before despawning
        timeout: { type: 'number', default: 15000 }, // ms before uncaptured recipe despawns
        spawnRadius: { type: 'number', default: 0.5 }, // crates spawn on a circle of this radius around the spawner
        spawnPoints: { type: 'int', default: 5 }, // positions on that circle, used round robin
        spawnJitter: { type: 'number', default: 1000 }, // extra random ms added to each gap between spawns
        teamId: { type: 'string', default: '' } // defaults to window.CURRENT_TEAM
    },

    init: function () {
        this.log = window.log.getLogger('recipe-spawner');
        this.data.teamId = this.data.teamId || window.CURRENT_TEAM || 'blue';
        this.log.debug('Initializing recipe-spawner');

        this.recipeCount = 0;
        this.activeRecipes = new Map(); // recipeId → { el, startTime }
        this.spawnHandle = null;
        this.nextSpawnIndex = 0; // next position on the spawn circle
        this.isSpawning = false;

        const scene = this.el.sceneEl;

        // Listen to game state to start/stop spawning
        scene.addEventListener('game-state-changed', (evt) => {
            this.onGameStateChange(evt.detail.state, evt.detail.context);
        });

        // Start spawning when scene is loaded, or immediately if already loaded
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

        // Then keep spawning, with a slightly random gap each time
        this.scheduleNextSpawn();
    },

    scheduleNextSpawn: function () {
        const delay = this.data.spawnInterval + Math.random() * this.data.spawnJitter;
        this.spawnHandle = setTimeout(() => {
            this.spawnRecipe();
            this.scheduleNextSpawn();
        }, delay);
    },

    stopSpawning: function () {
        if (!this.isSpawning) return;
        this.isSpawning = false;
        this.log.info('Stopping recipe spawn cycle');

        if (this.spawnHandle) {
            clearTimeout(this.spawnHandle);
            this.spawnHandle = null;
        }
    },

    // Round robin over spawnPoints positions on a circle around the centre (the spawner's position)
    nextSpawnPosition: function (centre) {
        const points = Math.max(1, this.data.spawnPoints);
        const angle = (2 * Math.PI * this.nextSpawnIndex) / points;
        this.nextSpawnIndex = (this.nextSpawnIndex + 1) % points;
        return {
            x: centre.x + this.data.spawnRadius * Math.cos(angle),
            y: centre.y,
            z: centre.z + this.data.spawnRadius * Math.sin(angle)
        };
    },

    spawnRecipe: function () {
        const recipeId = `recipe-${this.recipeCount++}`;
        const spawnPos = this.nextSpawnPosition(this.el.getAttribute('position'));

        // Pick a random recipe for this crate
        const availableRecipes = window.RECIPES || [];
        const selectedRecipe = availableRecipes[Math.floor(Math.random() * availableRecipes.length)];
        const recipeName = selectedRecipe?.name || 'RECIPE';
        this.log.info(`Spawning crate with recipe: ${recipeName}`, selectedRecipe);

        // Create recipe entity
        const recipeEl = document.createElement('a-entity');
        recipeEl.setAttribute('id', recipeId);
        recipeEl.setAttribute('class', 'fallable-recipe clickable');
        recipeEl.setAttribute('data-recipe-id', recipeId);
        recipeEl.setAttribute('data-team-id', this.data.teamId);
        recipeEl.setAttribute('data-recipe', JSON.stringify(selectedRecipe)); // Store recipe data

        // Visual: the recipe crate (see recipe-crate.js)
        window.buildRecipeCrateParts(recipeName).forEach((part) => recipeEl.appendChild(part));

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

        // The crate is pulled to the intake by tractor-beam, which publishes the capture
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
