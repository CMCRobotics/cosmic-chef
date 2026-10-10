/**
 * scoring-reset-button.js
 * Floor button that resets every team's score. A click asks scoring-mqtt-client to publish
 * the reset; the scores change once each team's galley confirms it through its state broadcast.
 *
 * Put it on a .clickable entity with a gltf-model of its own (the laser only hits the root's mesh).
 * Usage: <a-entity class="clickable" scoring-reset-button gltf-model="#asset_button_floor_square" position="0 0.4 2"></a-entity>
 */

AFRAME.registerComponent('scoring-reset-button', {
    schema: {
        scale: { type: 'number', default: 0.8 }
    },

    init: function () {
        this.log = window.log.getLogger('scoring-reset-button');
        this.log.debug('Initializing scoring-reset-button');

        this.createLabel();
        this.onClick = () => this.resetScores();
        this.el.addEventListener('click', this.onClick);
    },

    createLabel: function () {
        // Flat on the floor, above the button, like the recipe status symbol
        const buttonPos = this.el.getAttribute('position') || { x: 0, y: 0, z: 0 };

        const labelEl = document.createElement('a-entity');
        labelEl.setAttribute('id', 'scoring-reset-label');
        labelEl.setAttribute('position', `${buttonPos.x} ${buttonPos.y + 0.4} ${buttonPos.z}`);
        labelEl.setAttribute('rotation', '-90 180 0');
        labelEl.setAttribute('text', {
            value: 'RESET',
            align: 'center',
            anchor: 'center',
            baseline: 'center',
            color: '#ff0000',
            fontSize: 200,
            wrapCount: 20
        });
        labelEl.setAttribute('scale', `${this.data.scale * 10} ${this.data.scale * 10} ${this.data.scale * 10}`);

        this.el.parentNode.appendChild(labelEl);
        this.labelEl = labelEl;
    },

    resetScores: function () {
        const client = this.el.sceneEl.components['scoring-mqtt-client'];
        if (!client) {
            this.log.warn('No scoring-mqtt-client on the scene, reset not sent');
            return;
        }
        if (client.resetScores()) {
            this.log.info('Scores reset requested');
            this.showFeedback();
        }
    },

    showFeedback: function () {
        // Pulse from the fixed base scale, so a second click during the pulse does not compound
        this.el.setAttribute('animation__pulse', {
            property: 'scale',
            from: '1 1 1',
            to: '1.1 1.1 1.1',
            dur: 150,
            dir: 'alternate',
            loop: 2,
            easing: 'easeInOutQuad'
        });
    },

    remove: function () {
        this.el.removeEventListener('click', this.onClick);
        if (this.labelEl && this.labelEl.parentNode) {
            this.labelEl.remove();
        }
        this.log.debug('Scoring reset button removed');
    }
});
