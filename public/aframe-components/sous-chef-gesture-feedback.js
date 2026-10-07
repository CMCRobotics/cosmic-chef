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
    knife: { model: '#asset_cooking_knife', scale: '0.5 0.5 0.5', rotation: '-90 -90 0' },
    hammer: { model: '#asset_meat_tenderizer', scale: '1 1 1', rotation: '0 0 90' },
    spoon: { model: '#asset_cooking_spoon', scale: '0.5 0.5 0.5', rotation: '0 0 90' }
};

const GESTURE_FEEDBACK = {
    // Rapid up-down bouncing (hammering motion)
    tenderize: { utensil: 'hammer', animation: 'property: position; from: 0 0 0; to: 0 0.3 0; dur: 200; easing: easeInOutQuad; loop: true; dir: alternate' },
    // Fast down-bounce motion
    smash: { utensil: 'hammer', animation: 'property: position; from: 0 0 0; to: 0 -0.2 0; dur: 150; easing: easeInOutQuad; loop: true; dir: alternate' },
    // Fast side-to-side slashing motion
    slice: { utensil: 'knife', animation: 'property: rotation; from: 0 0 -20; to: 0 0 20; dur: 300; easing: easeInOutQuad; loop: true; dir: alternate' },
    dice: { utensil: 'knife', animation: 'property: rotation; from: 0 0 -20; to: 0 0 20; dur: 300; easing: easeInOutQuad; loop: true; dir: alternate' },
    // Circular rotation motion
    stir: { utensil: 'spoon', animation: 'property: rotation; from: 0 0 0; to: 0 360 0; dur: 1000; loop: true' }
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
            utensilEl.setAttribute('visible', false);
            this.el.appendChild(utensilEl);
            this.utensils[name] = utensilEl;
        });

        // Resolve event source: check closest ancestor with team-galley-receiver or galley-manager, fallback to scene
        const scopedAncestor = this.el.closest('[team-galley-receiver], [galley-manager]');
        this.stateSource = scopedAncestor || this.el.sceneEl;

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
        Object.values(this.utensils).forEach((utensilEl) => {
            utensilEl.setAttribute('visible', false);
            utensilEl.removeAttribute('animation');
        });

        const feedback = GESTURE_FEEDBACK[gesture];
        if (!feedback) return; // 'idle' or unknown gesture: nothing shown

        const utensilEl = this.utensils[feedback.utensil];
        utensilEl.setAttribute('visible', true);
        utensilEl.setAttribute('animation', feedback.animation);
    },

    remove: function () {
        if (this.stateSource) {
            this.stateSource.removeEventListener('game-state-changed', this.onStateChange);
        }
        Object.values(this.utensils).forEach((utensilEl) => utensilEl.remove());
    }
});
