/**
 * ingredient-lifecycle.js
 * Manages ingredient entity lifecycle: positioning, resetting, cleanup
 *
 * - Tracks initial positions when recipe is captured
 * - Resets positions when recipe is cancelled or game resets
 * - Ensures ingredients are ready for next recipe
 */

AFRAME.registerComponent('ingredient-lifecycle', {
  schema: {
    enabled: { type: 'boolean', default: true }
  },

  init: function () {
    this.log = window.log?.getLogger('ingredient-lifecycle') || console;
    this.log.setLevel?.('debug');

    this.ingredientPositions = new Map(); // Store initial positions
    this.ingredientEntities = [];

    const scene = this.el.sceneEl;
    this.log.debug('ingredient-lifecycle initialized');

    // Listen for game state changes
    scene.addEventListener('game-state-changed', (evt) => {
      this.onGameStateChanged(evt.detail);
    });
  },

  onGameStateChanged: function (detail) {
    const { state, context } = detail;

    if (state === 'preparingIngredients' && context.currentOrder) {
      // Recipe was just captured - store ingredient positions
      this.captureIngredientPositions(context);
    } else if (state === 'waitingForRecipe') {
      // Game reset - reset all ingredient positions
      this.resetIngredientPositions();
    }
  },

  captureIngredientPositions: function (context) {
    this.log.debug('Capturing ingredient positions for new recipe');
    this.ingredientPositions.clear();

    // Try different selectors to find ingredient entities
    let ingredientEls = document.querySelectorAll('[ingredient-entity]');

    if (ingredientEls.length === 0) {
      ingredientEls = document.querySelectorAll('[id*="ingredient"]');
      this.log.debug(`No [ingredient-entity], trying id*="ingredient": ${ingredientEls.length}`);
    }

    if (ingredientEls.length === 0) {
      const galley = document.querySelector('[galley-manager]');
      if (galley) ingredientEls = galley.querySelectorAll('a-entity');
      this.log.debug(`Galley search: ${ingredientEls.length} entities`);
    }

    this.log.info(`Found ${ingredientEls.length} entities`);

    ingredientEls.forEach(el => {
      const ingredientId = el.getAttribute('data-ingredient-id') || el.id;
      const pos = el.object3D.position;

      this.ingredientPositions.set(ingredientId, {
        x: pos.x, y: pos.y, z: pos.z
      });

      this.log.debug(`Captured ${ingredientId}: y=${pos.y.toFixed(2)}`);
    });

    this.log.info(`Saved ${this.ingredientPositions.size} positions`);
  },

  resetIngredientPositions: function () {
    this.log.debug('Resetting ingredient positions');

    const ingredientEls = document.querySelectorAll('[ingredient-entity]');
    let resetCount = 0;

    ingredientEls.forEach(el => {
      const ingredientId = el.getAttribute('data-ingredient-id') || el.id;
      const savedPos = this.ingredientPositions.get(ingredientId);

      if (savedPos) {
        el.object3D.position.set(savedPos.x, savedPos.y, savedPos.z);

        // Remove the vacuum animation component if it exists
        if (el.hasAttribute('anim-vacuum')) {
          el.removeAttribute('anim-vacuum');
        }

        // Disable any active animations
        el.object3D.scale.set(1, 1, 1);
        el.object3D.rotation.set(0, 0, 0);

        this.log.debug(`Reset position for ${ingredientId}`);
        resetCount++;
      } else {
        this.log.warn(`No saved position for ${ingredientId}`);
      }
    });

    this.log.info(`Reset ${resetCount} ingredient positions`);
  }
});
