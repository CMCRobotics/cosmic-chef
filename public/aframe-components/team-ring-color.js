/**
 * team-ring-color.js
 * Colours the galley ring with the head chef's team colour. The colour comes from the
 * retained identity/color topic, read by head-chef-mqtt-client.
 *
 * Usage: <a-entity geometry="primitive: ring; ..." team-ring-color></a-entity>
 */

AFRAME.registerComponent('team-ring-color', {
    schema: {
        defaultColor: { type: 'color', default: '#cccccc' } // grey until the team colour arrives
    },

    init: function () {
        this.log = window.log.getLogger('team-ring-color');
        this.sceneEl = this.el.sceneEl;

        // The colour can arrive before this ring is created, so start from the client's last value
        const client = this.sceneEl.components['head-chef-mqtt-client'];
        this.setColor((client && client.teamColor) || this.data.defaultColor);

        this.onTeamColor = (evt) => this.setColor(evt.detail.color);
        this.sceneEl.addEventListener('team-color-changed', this.onTeamColor);
    },

    setColor: function (color) {
        this.el.setAttribute('material', 'color', color);
        this.log.debug(`Galley ring colour: ${color}`);
    },

    remove: function () {
        this.sceneEl.removeEventListener('team-color-changed', this.onTeamColor);
    }
});
