/**
 * camera-debug-controls.js
 * Locks the player's camera in index.html: WASD movement and mouse look are off unless the
 * URL has ?debug=true (the same flag as debug-console.js and debug-overlay.js).
 *
 * Players steer with the motion-sensor controllers, so keyboard and mouse must not move the view.
 * Headset tracking is not affected: it does not go through look-controls.
 *
 * Usage: <a-camera camera-debug-controls></a-camera>
 */

AFRAME.registerComponent('camera-debug-controls', {
    init: function () {
        const debug = new URLSearchParams(window.location.search).get('debug') === 'true';
        this.el.setAttribute('look-controls', 'enabled', debug);
        this.el.setAttribute('wasd-controls', 'enabled', debug);
    }
});
