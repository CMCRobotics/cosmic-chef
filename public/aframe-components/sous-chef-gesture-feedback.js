/**
 * Sous-Chef Gesture Feedback Component
 *
 * Shows an animated utensil for the gesture a sous-chef is currently performing.
 * Reads chef gestures from 'game-state-changed' (context.chefGestures).
 *
 * Usage:
 * <a-entity sous-chef-gesture-feedback="chefId: chef-1" position="1 1.5 -2"></a-entity>
 */

const UTENSILS = {
    hammer: { model: '#asset_meat_tenderizer', scale: '2 2 2', rotation: '90 90 0', position: '0 0.6 0.1' },
    knife: { model: '#asset_cooking_knife', scale: '2 2 2', rotation: '90 90 0', position: '0 -0.1 0' },
    spoon: { model: '#asset_cooking_spoon', scale: '2 2 2', rotation: '0 0 85', position: '0 0.3 0' }
};

// One entry per gesture in the state machine (tenderize, slice, stir).
// Each anim-* component (public/aframe-components/animations/) drives the utensil's
// position/rotation while attached, and reads its base transform at init.
const GESTURE_FEEDBACK = {
    tenderize: { utensil: 'hammer', anim: 'anim-tenderizing' },
    slice: { utensil: 'knife', anim: 'anim-slicing' },
    stir: { utensil: 'spoon', anim: 'anim-stirring' }
};

AFRAME.registerComponent('sous-chef-gesture-feedback', {
    schema: {
        chefId: { type: 'string', default: 'chef-1' }
    },

    init: function () {
        this.log = window.log.getLogger('sous-chef-feedback');
        this.currentGesture = 'idle';

        this.utensils = {};
        Object.keys(UTENSILS).forEach((name) => {
            const spec = UTENSILS[name];
            const utensilEl = document.createElement('a-entity');
            utensilEl.setAttribute('gltf-model', spec.model);
            utensilEl.setAttribute('scale', spec.scale);
            utensilEl.setAttribute('rotation', spec.rotation);
            utensilEl.setAttribute('position', spec.position);
            utensilEl.setAttribute('visible', false);
            this.el.appendChild(utensilEl);
            this.utensils[name] = utensilEl;
        });

        // Match galley-manager: only a team-galley-receiver re-emits state on its own entity; otherwise listen on the scene
        const receiver = this.el.closest('[team-galley-receiver]');
        this.stateSource = receiver || this.el.sceneEl;

        this.onStateChange = this.onStateChange.bind(this);
        this.stateSource.addEventListener('game-state-changed', this.onStateChange);
    },

    onStateChange: function (evt) {
        const gestures = evt.detail.context.chefGestures || {};
        const gesture = gestures[this.data.chefId] || 'idle';
        if (gesture === this.currentGesture) return;

        this.log.debug(`${this.data.chefId}: gesture ${this.currentGesture} → ${gesture}`);
        this.currentGesture = gesture;
        this.showUtensil(gesture);
    },

    showUtensil: function (gesture) {
        Object.keys(this.utensils).forEach((name) => this.resetUtensil(name));

        const feedback = GESTURE_FEEDBACK[gesture];
        if (!feedback) return; // 'idle' or unknown gesture: nothing shown

        const utensilEl = this.utensils[feedback.utensil];
        utensilEl.setAttribute('visible', true);
        utensilEl.setAttribute(feedback.anim, '');
    },

    // Detach any anim-* component and put the utensil back at its base transform.
    // anim-* components read the transform at init, so this must run before the next one attaches.
    resetUtensil: function (name) {
        const utensilEl = this.utensils[name];
        const spec = UTENSILS[name];
        Object.values(GESTURE_FEEDBACK).forEach((feedback) => utensilEl.removeAttribute(feedback.anim));
        utensilEl.setAttribute('position', spec.position);
        utensilEl.setAttribute('rotation', spec.rotation);
        utensilEl.setAttribute('visible', false);
    },

    remove: function () {
        if (this.stateSource) {
            this.stateSource.removeEventListener('game-state-changed', this.onStateChange);
        }
        Object.values(this.utensils).forEach((utensilEl) => utensilEl.remove());
    }
});
