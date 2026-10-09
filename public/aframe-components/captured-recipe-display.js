/**
 * captured-recipe-display.js
 * Shows the captured recipe crate on the team's intake in the sous-chef window (index.html).
 * The crate appears when the galley starts preparing a recipe, and shrinks away when the
 * order is submitted or cancelled. Only this window's own team is shown: the scene only sees
 * the local team's state, since remote galleys emit their events on their own entity.
 *
 * Usage: <a-scene captured-recipe-display>
 */

const CRATE_SHRINK_MS = 500; // how long the crate takes to shrink away

AFRAME.registerComponent('captured-recipe-display', {
    init: function () {
        this.log = window.log.getLogger('captured-recipe-display');
        this.lastState = null;
        this.crate = null;

        this.onStateChanged = (evt) => this.onStateChange(evt.detail.state, evt.detail.context);
        this.el.addEventListener('game-state-changed', this.onStateChanged);
    },

    onStateChange: function (state, context) {
        // A new recipe was captured: the machine goes from waiting to preparing
        if (state === 'preparingIngredients' && this.lastState === 'waitingForRecipe' && context.currentOrder) {
            this.showCrate(context.currentOrder);
        }
        if (state === 'orderSuccess' || state === 'orderPenalized') {
            this.removeCrate();
        }
        this.lastState = state;
    },

    showCrate: function (recipe) {
        this.removeCrate();

        const galley = document.querySelector(`#galley-${window.CURRENT_TEAM}`);
        const intake = galley && galley.querySelector('[data-recipe-team-intake="true"]');
        if (!intake) {
            this.log.warn(`No recipe intake found for team ${window.CURRENT_TEAM}`);
            return;
        }

        const crate = document.createElement('a-entity');
        crate.setAttribute('class', 'sous-chef-crate');
        window.buildRecipeCrateParts(recipe.name).forEach((part) => crate.appendChild(part));
        galley.appendChild(crate);

        // Rest on top of the intake, in the galley's own coordinates
        const box = new THREE.Box3().setFromObject(intake.object3D);
        let landing;
        if (box.isEmpty()) {
            // Model not loaded yet: use the intake's origin
            landing = intake.object3D.getWorldPosition(new THREE.Vector3());
        } else {
            const centre = box.getCenter(new THREE.Vector3());
            landing = new THREE.Vector3(centre.x, box.max.y, centre.z);
        }
        landing.y += window.RECIPE_CRATE_HALF_SIZE;
        const local = galley.object3D.worldToLocal(landing);
        crate.setAttribute('position', `${local.x} ${local.y} ${local.z}`);

        this.crate = crate;
        this.log.info(`Showing crate for recipe ${recipe.name} on the intake`);
    },

    // Shrink the crate away, then remove it
    removeCrate: function () {
        const crate = this.crate;
        if (!crate) return;
        this.crate = null;

        crate.setAttribute('animation__shrink', { property: 'scale', to: '0 0 0', dur: CRATE_SHRINK_MS, easing: 'easeInQuad' });
        crate.addEventListener('animationcomplete__shrink', () => crate.remove(), { once: true });
    },

    remove: function () {
        this.el.removeEventListener('game-state-changed', this.onStateChanged);
        if (this.crate) this.crate.remove();
    }
});
