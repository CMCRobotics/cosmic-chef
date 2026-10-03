/**
 * space-float.js
 * Makes an entity float in space with bouncing, gravity, and lateral sway.
 */

AFRAME.registerComponent('anim-space-float', {
    schema: {
        bounceHeight: { type: 'number', default: 0.2 },
        gravity: { type: 'number', default: 0.8 },
        swayWidth: { type: 'number', default: 0.05 },
        bobSpeed: { type: 'number', default: 2000 },
        swaySpeed: { type: 'number', default: 3000 },
        speed: { type: 'number', default: 1.0 }
    },

    init: function () {
        this.log = window.log.getLogger('space-float');
        this.log.setLevel('debug');

        this.startPosition = this.el.object3D.position.clone();
        this.log.debug('Starting position:', this.startPosition);
    },

    tick: function (t, dt) {
        const data = this.data;
        const startPos = this.startPosition;
        const scaledTime = t * data.speed;

        // Vertical bob: uses gravity to control frequency, bounceHeight for amplitude
        const bobFreq = Math.max(0.5, data.gravity);
        const verticalOffset = Math.sin((scaledTime / data.bobSpeed) * bobFreq) * data.bounceHeight;

        // Side-to-side sway
        const swayOffset = Math.sin(scaledTime / data.swaySpeed) * data.swayWidth;

        // Apply position
        this.el.object3D.position.set(
            startPos.x + swayOffset,
            startPos.y + verticalOffset,
            startPos.z
        );

        // Subtle rotation wobble (optional, adds more life)
        const wobbleX = Math.sin(scaledTime / (data.swaySpeed * 1.5)) * 5;
        const wobbleZ = Math.sin(scaledTime / (data.bobSpeed * 1.5)) * 5;

        this.el.object3D.rotation.x = THREE.MathUtils.degToRad(wobbleX);
        this.el.object3D.rotation.z = THREE.MathUtils.degToRad(wobbleZ);
    }
});
