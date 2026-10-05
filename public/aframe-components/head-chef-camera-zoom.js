/**
 * head-chef-camera-zoom.js
 * Analog camera zoom for head chef.
 * VR: trigger on right hand to zoom in/out
 * Desktop: +/- keys to zoom in/out
 * FOV narrows when zooming in (sniper-like effect)
 */

AFRAME.registerComponent('head-chef-camera-zoom', {
    schema: {
        minZoom: { type: 'number', default: 0.2 }, // minimum zoom (furthest out)
        maxZoom: { type: 'number', default: 20.0 }, // maximum zoom (closest in)
        defaultZoom: { type: 'number', default: 1.0 }, // starting distance multiplier
        zoomSpeed: { type: 'number', default: 0.8 }, // zoom speed per frame
        zoomSmoothness: { type: 'number', default: 0.5 }, // lerp smoothness (higher = faster catch-up)
        minFOV: { type: 'number', default: 65 }, // narrowest field of view when zoomed
        maxFOV: { type: 'number', default: 75 } // widest field of view when zoomed out
    },

    init: function () {
        this.log = window.log.getLogger('head-chef-camera-zoom');
        this.log.debug('Initializing head-chef-camera-zoom');

        this.currentZoom = this.data.defaultZoom;
        this.targetZoom = this.data.defaultZoom;
        this.baseDistance = 4; // Default camera distance from rig (from head-chef.html)
        this.triggerPressed = false;

        // The component is attached to the a-camera element itself
        this.log.info('Camera element:', this.el.tagName, 'Position:', this.el.getAttribute('position'));

        // Get VR right hand controller
        this.rightHand = document.querySelector('#rightHand');
        if (this.rightHand) {
            this.rightHand.addEventListener('triggerdown', () => this.onTriggerDown());
            this.rightHand.addEventListener('triggerup', () => this.onTriggerUp());
        }

        // Listen for keyboard zoom (+/- keys)
        document.addEventListener('keydown', (e) => this.onKeyDown(e));
        document.addEventListener('keyup', (e) => this.onKeyUp(e));

        // Track which keys are currently held
        this.keysPressed = {
            zoomIn: false,
            zoomOut: false
        };

        // Update loop
        this.tick = AFRAME.utils.throttleTick(this.tick.bind(this), 60);

        this.log.debug('Head chef camera zoom ready - VR: trigger to zoom, Desktop: +/- keys');
    },

    onTriggerDown: function () {
        this.log.debug('Trigger down - analog zoom enabled');
        this.triggerPressed = true;
    },

    onTriggerUp: function () {
        this.log.debug('Trigger up - analog zoom disabled');
        this.triggerPressed = false;
        // Keep current zoom level, don't reset
    },

    onKeyDown: function (e) {
        if (e.key === '+' || e.key === '=') {
            e.preventDefault();
            this.keysPressed.zoomIn = true;
            this.log.info('Zoom IN key held');
        } else if (e.key === '-' || e.key === '_') {
            e.preventDefault();
            this.keysPressed.zoomOut = true;
            this.log.info('Zoom OUT key held');
        } else if (e.key === '0') {
            e.preventDefault();
            this.resetZoom();
            this.log.info('Zoom reset to default');
        }
    },

    onKeyUp: function (e) {
        if (e.key === '+' || e.key === '=') {
            this.keysPressed.zoomIn = false;
            this.log.debug('Zoom IN key released');
        } else if (e.key === '-' || e.key === '_') {
            this.keysPressed.zoomOut = false;
            this.log.debug('Zoom OUT key released');
        }
    },

    resetZoom: function () {
        // Only set target; let the lerp smoothly transition to it
        this.targetZoom = this.data.defaultZoom;
    },

    tick: function () {
        // In VR, use trigger + hand motion for analog zoom
        if (this.triggerPressed && this.rightHand) {
            // Get right hand position for analog input
            const rightHandPos = this.rightHand.getAttribute('position');
            // Use hand Y position to control zoom (up = zoom in, down = zoom out)
            // Normalize to -1 to 1 range (rough estimate)
            const handZoom = rightHandPos.y / 2; // adjust divisor for sensitivity
            const zoomDirection = Math.max(-1, Math.min(1, handZoom));

            // Update zoom while trigger pressed (very gradual)
            if (Math.abs(zoomDirection) > 0.1) { // dead zone to prevent jitter
                this.targetZoom += zoomDirection * this.data.zoomSpeed;
                this.targetZoom = Math.max(this.data.minZoom, Math.min(this.data.maxZoom, this.targetZoom));
            }
        }

        // Update zoom from keyboard (held keys)
        if (this.keysPressed.zoomIn) {
            this.targetZoom += this.data.zoomSpeed;
            this.targetZoom = Math.max(this.data.minZoom, Math.min(this.data.maxZoom, this.targetZoom));
        }
        if (this.keysPressed.zoomOut) {
            this.targetZoom -= this.data.zoomSpeed;
            this.targetZoom = Math.max(this.data.minZoom, Math.min(this.data.maxZoom, this.targetZoom));
        }

        // Very smooth lerp current zoom toward target (maintains zoom when keys released)
        const oldZoom = this.currentZoom;
        this.currentZoom += (this.targetZoom - this.currentZoom) * this.data.zoomSmoothness;

        // Log if zoom changed
        if (Math.abs(this.currentZoom - oldZoom) > 0.001) {
            this.log.debug(`Zoom changed: ${oldZoom.toFixed(3)} → ${this.currentZoom.toFixed(3)}, target: ${this.targetZoom.toFixed(3)}`);
            // Only update camera position if zoom actually changed
            this.updateCameraZoom();
        }
    },

    updateCameraZoom: function () {
        // Zoom by narrowing FOV slightly (don't move camera position)
        // Map zoom 0.2-20 to FOV range 70-50 (very subtle change)
        const fovRange = 20; // maxFOV - minFOV = 20 degrees total
        const fov = this.data.maxFOV - (this.currentZoom - this.data.minZoom) * fovRange / (this.data.maxZoom - this.data.minZoom);

        this.log.debug(`Setting FOV to: ${fov.toFixed(1)}° (currentZoom: ${this.currentZoom.toFixed(2)})`);
        this.el.setAttribute('camera', 'fov', fov);
    },

    remove: function () {
        this.log.debug('Head chef camera zoom removed');
    }
});
