/**
 * crosshair.js
 * Semi-transparent crosshair at the centre of the view. Attach it to the camera:
 *   <a-camera crosshair="opacity: 0.5"></a-camera>
 * The bars are drawn without depth testing so falling crates never hide the aim point.
 * The crosshair is hidden while in VR, where the aim comes from the hand instead.
 */

AFRAME.registerComponent('crosshair', {
    schema: {
        distance: { type: 'number', default: 1 }, // metres in front of the camera
        size: { type: 'number', default: 0.04 }, // length of each bar
        thickness: { type: 'number', default: 0.004 }, // width of each bar
        color: { type: 'color', default: '#ffffff' },
        opacity: { type: 'number', default: 0.5 }
    },

    init: function () {
        this.log = window.log.getLogger('crosshair');
        const { distance, size, thickness, color, opacity } = this.data;

        this.bars = [
            { width: size, height: thickness },
            { width: thickness, height: size }
        ].map((geometry) => {
            const bar = document.createElement('a-entity');
            bar.setAttribute('geometry', { primitive: 'plane', width: geometry.width, height: geometry.height });
            bar.setAttribute('material', { color, opacity, transparent: true, shader: 'flat', depthTest: false });
            bar.setAttribute('position', `0 0 -${distance}`);
            bar.setAttribute('class', 'crosshair-bar');
            this.el.appendChild(bar);
            return bar;
        });

        this.onVRChange = () => this.setVisible(!this.el.sceneEl.is('vr-mode'));
        this.el.sceneEl.addEventListener('enter-vr', this.onVRChange);
        this.el.sceneEl.addEventListener('exit-vr', this.onVRChange);
        this.onVRChange();

        this.log.debug('Crosshair added to the camera');
    },

    setVisible: function (visible) {
        this.bars.forEach((bar) => bar.setAttribute('visible', visible));
    },

    remove: function () {
        this.el.sceneEl.removeEventListener('enter-vr', this.onVRChange);
        this.el.sceneEl.removeEventListener('exit-vr', this.onVRChange);
        this.bars.forEach((bar) => bar.remove());
    }
});
