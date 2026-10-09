/**
 * debug-overlay.js
 * On-screen debug panel for vr.html, for when the headset's console is not reachable.
 * Only active with ?debug=true in the URL. It shows the latest warnings and errors
 * (from debug-console.js) and the hand controller events, in front of the head chef's view.
 *
 * Usage: <a-camera debug-overlay>
 */

const DEBUG_LINES = 10; // how many log entries the panel keeps
const DEBUG_LINE_LENGTH = 80; // longer entries are cut short
// Prefixed: classic scripts share one global scope, and head-chef-camera-zoom.js declares STICK_DEAD_ZONE
const DEBUG_STICK_DEAD_ZONE = 0.15; // thumbstick movements inside this are not logged
const DEBUG_STICK_LOG_INTERVAL_MS = 400; // at most one thumbstick line per interval

AFRAME.registerComponent('debug-overlay', {
    init: function () {
        this.enabled = new URLSearchParams(window.location.search).get('debug') === 'true';
        if (!this.enabled) return;

        this.lines = [];
        this.seenMessages = 0;
        this.lastStickLog = 0;
        this.lastHits = {}; // hand id → the last set of entities its laser hit

        this.buildPanel();
        this.listenToControllers();
        this.listenToScene();
        this.log('debug overlay on');

        this.tick = AFRAME.utils.throttleTick(this.tick.bind(this), 250);
    },

    buildPanel: function () {
        const panel = document.createElement('a-entity');
        panel.setAttribute('position', '0 0.2 -1');
        panel.setAttribute('geometry', 'primitive: plane; width: 0.9; height: 0.7');
        panel.setAttribute('material', 'color: #000; opacity: 0.75; transparent: true; shader: flat');

        this.textEl = document.createElement('a-entity');
        this.textEl.setAttribute('position', '-0.42 0.3 0.01');
        this.textEl.setAttribute('scale', '0.16 0.16 0.16');
        this.textEl.setAttribute('text', 'value: ; color: #0f0; align: left; anchor: left; baseline: top; wrapCount: 40; width: 3');

        panel.appendChild(this.textEl);
        this.el.appendChild(panel);
    },

    listenToControllers: function () {
        ['leftHand', 'rightHand'].forEach((id) => {
            const hand = document.querySelector(`#${id}`);
            if (!hand) return;

            ['controllerconnected', 'controllerdisconnected', 'triggerdown', 'triggerup', 'thumbstickdown'].forEach((name) => {
                hand.addEventListener(name, () => this.log(`${id} ${name}`));
            });

            // What the hand's laser is pointing at (the floor button and crates are .clickable)
            hand.addEventListener('raycaster-intersection', (evt) => {
                const hits = evt.detail.els.map((el) => el.id || el.className || el.tagName).join(', ');
                if (hits === this.lastHits[id]) return;
                this.lastHits[id] = hits;
                this.log(`${id} laser hits: ${hits}`);
            });
            hand.addEventListener('raycaster-intersection-cleared', () => {
                if (!this.lastHits[id]) return;
                this.lastHits[id] = '';
                this.log(`${id} laser hits: nothing`);
            });

            hand.addEventListener('thumbstickmoved', (evt) => {
                const now = performance.now();
                if (Math.abs(evt.detail.y) < DEBUG_STICK_DEAD_ZONE || now - this.lastStickLog < DEBUG_STICK_LOG_INTERVAL_MS) return;
                this.lastStickLog = now;
                this.log(`${id} stick y=${evt.detail.y.toFixed(2)}`);
            });
        });
    },

    // Events that tractor-beam and head-chef-camera-zoom emit on the scene
    listenToScene: function () {
        const scene = this.el.sceneEl;
        scene.addEventListener('crate-highlighted', (evt) => this.log(`crate highlight: ${evt.detail.crate || 'none'}`));
        scene.addEventListener('crate-action', (evt) => this.log(`crate ${evt.detail.action}`));
        scene.addEventListener('zoom-input', (evt) => this.log(`zoom ${evt.detail.source || 'stopped'}`));
        scene.addEventListener('zoom-reset', () => this.log('zoom reset'));
    },

    // Move any new warnings and errors from debug-console.js onto the panel
    tick: function () {
        const messages = window.DEBUG_MESSAGES || [];
        messages.slice(this.seenMessages).forEach((message) => this.log(message));
        this.seenMessages = messages.length;
    },

    log: function (message) {
        const time = (performance.now() / 1000).toFixed(1);
        this.lines = this.lines.concat(`${time} ${message}`.slice(0, DEBUG_LINE_LENGTH)).slice(-DEBUG_LINES);
        this.textEl.setAttribute('text', 'value', this.lines.join('\n'));
    },

    remove: function () {
        if (this.textEl) this.textEl.parentNode.remove();
    }
});
