/**
 * microbit-gateway-hud.js
 * Desktop HUD for the micro:bit radio gateway, shown top-left of the camera.
 *
 * Wraps window.CosmicChef.MicrobitGateway (src/client/microbit-gateway.ts). The gateway's MQTT
 * output goes through mqtt-bridge, which stays the only MQTT client in the scene.
 * The HUD is hidden in VR: the gateway's USB connection is on the desktop, not the headset.
 *
 * Usage: on the root of microbit-hud.html, loaded by load-fragment under the camera.
 */

AFRAME.registerComponent('microbit-gateway-hud', {
    schema: {
        // Size of the invisible corner square that shows/hides the panel, in CSS pixels.
        togglePixels: { type: 'number', default: 64 },
        // Gap between the top-left corner and the panel contents, in CSS pixels.
        padding: { type: 'number', default: 16 }
    },

    init: function () {
        this.log = window.log.getLogger('microbit-gateway-hud');
        const { MicrobitGateway } = window.CosmicChef;
        const sceneEl = this.el.sceneEl;

        this.gestures = new Map();
        this.lastError = '';

        this.gateway = new MicrobitGateway({
            teamId: window.CURRENT_TEAM || 'blue',
            gameId: window.GAME_ID || 'default',
            mqtt: { publish: (topic, payload, options) => this.publish(topic, payload, options) },
            storage: window.localStorage
        });
        this.gateway.on('connection', () => this.render());
        this.gateway.on('ready', () => this.render());
        this.gateway.on('terminal', () => this.render());
        this.gateway.on('terminal-forgotten', ({ terminalId }) => {
            this.gestures.delete(terminalId);
            this.render();
        });
        this.gateway.on('gesture', (event) => {
            this.gestures.set(event.terminalId, event);
            this.render();
        });
        this.gateway.on('error', ({ message }) => {
            this.lastError = message;
            this.log.warn(message);
            this.render();
        });

        this.panel = this.el.querySelector('[data-hud="panel"]');
        this.toggle = this.el.querySelector('[data-hud="toggle"]');
        this.panelOpen = false;

        this.onToggleClick = () => this.togglePanel();
        this.toggle.addEventListener('click', this.onToggleClick);

        this.onConnectClick = () => this.toggleConnection();
        this.el.querySelector('[data-hud="connect"]').addEventListener('click', this.onConnectClick);

        this.el.querySelectorAll('[data-row]').forEach((row, index) => {
            row.querySelector('[data-hud="row-slot"]').addEventListener('click', () => this.cycleSlot(index));
        });

        this.onEnterVR = () => this.el.setAttribute('visible', false);
        this.onExitVR = () => this.el.setAttribute('visible', true);
        sceneEl.addEventListener('enter-vr', this.onEnterVR);
        sceneEl.addEventListener('exit-vr', this.onExitVR);

        // The corner square depends on the camera and canvas, so place it once they exist, and on resize.
        this.onLayout = () => this.layout();
        sceneEl.addEventListener('loaded', this.onLayout);
        window.addEventListener('resize', this.onLayout);
        this.layout(); // The fragment can load after the scene has already fired 'loaded'.

        this.setText('[data-hud="title"]', `micro:bit gateway · team ${this.gateway.teamId}`);
        this.render();
    },

    /**
     * Puts the root in the top-left corner of the view and sizes the corner square to
     * togglePixels CSS pixels. Positions are in camera space, so they hold while the view turns.
     */
    layout: function () {
        const scene = this.el.sceneEl;
        const camera = scene.camera;
        const canvas = scene.canvas;
        if (!camera || !canvas || !canvas.clientHeight) return;

        const distance = 1; // metres in front of the eye
        const halfHeight = distance * Math.tan((camera.fov * Math.PI) / 360); // camera.fov is vertical, in degrees
        const halfWidth = halfHeight * (canvas.clientWidth / canvas.clientHeight);
        const metresPerPixel = (2 * halfHeight) / canvas.clientHeight;
        const size = this.data.togglePixels * metresPerPixel;
        const padding = this.data.padding * metresPerPixel;

        this.el.setAttribute('position', { x: -halfWidth, y: halfHeight, z: -distance });
        this.toggle.setAttribute('geometry', { primitive: 'plane', width: size, height: size });
        this.toggle.setAttribute('position', { x: size / 2, y: -size / 2, z: 0 });
        this.panel.setAttribute('position', { x: padding, y: -padding, z: 0 });
    },

    /** Panel buttons only respond while the panel is open and the HUD is not hidden for VR. */
    isInteractive: function () {
        return this.panelOpen && this.el.object3D.visible;
    },

    togglePanel: function () {
        this.panelOpen = !this.panelOpen;
        this.panel.setAttribute('visible', this.panelOpen);
        if (this.panelOpen) this.render();
    },

    /** Passes MQTT publishes to mqtt-bridge, the scene's only MQTT client. */
    publish: function (topic, payload, options) {
        const bridge = this.el.sceneEl.components['mqtt-bridge'];
        if (!bridge) {
            this.log.warn(`mqtt-bridge not ready, dropped publish to ${topic}`);
            return;
        }
        bridge.publish(topic, payload, options);
    },

    toggleConnection: async function () {
        if (!this.isInteractive()) return;
        try {
            if (this.gateway.connected) {
                await this.gateway.disconnect();
            } else {
                await this.gateway.connect();
            }
        } catch (err) {
            // Cancelling the port picker lands here too. Show the message and carry on.
            this.lastError = err.message;
            this.log.warn(err.message);
        }
        this.render();
    },

    /** Moves a terminal to the next slot: unassigned → 1 → 2 → 3 → unassigned. */
    cycleSlot: function (index) {
        if (!this.isInteractive()) return;
        const binding = this.gateway.registry.list()[index];
        if (!binding) return;
        const next = binding.sousChef === null ? 1 : binding.sousChef === 3 ? null : binding.sousChef + 1;
        try {
            this.gateway.setSousChef(binding.terminalId, next);
        } catch (err) {
            this.lastError = err.message;
            this.log.warn(err.message);
        }
        this.render();
    },

    setText: function (selector, value) {
        const el = this.el.querySelector(selector);
        if (el) el.setAttribute('value', value);
    },

    render: function () {
        const connected = this.gateway.connected;
        this.setText('[data-hud="status"]', `${connected ? 'Connected' : 'Disconnected'} · radio group ${this.gateway.radioGroup}`);
        this.setText('[data-hud="error"]', this.lastError);
        this.setText('[data-hud="connect-label"]', connected ? 'Disconnect gateway' : 'Connect gateway');

        const bindings = this.gateway.registry.list();
        this.el.querySelectorAll('[data-row]').forEach((row, index) => {
            const binding = bindings[index];
            row.setAttribute('visible', Boolean(binding));
            if (!binding) return;

            const gesture = this.gestures.get(binding.terminalId);
            const gestureText = gesture && gesture.active ? gesture.gesture : 'idle';
            row.querySelector('[data-hud="row-text"]').setAttribute('value', `${binding.terminalId}  ${gestureText}`);
            row.querySelector('[data-hud="slot-label"]').setAttribute(
                'value',
                binding.sousChef === null ? 'unassigned' : `sous-chef ${binding.sousChef}`
            );
        });
    },

    remove: function () {
        const sceneEl = this.el.sceneEl;
        sceneEl.removeEventListener('enter-vr', this.onEnterVR);
        sceneEl.removeEventListener('exit-vr', this.onExitVR);
        sceneEl.removeEventListener('loaded', this.onLayout);
        window.removeEventListener('resize', this.onLayout);
        this.gateway.disconnect();
    }
});
