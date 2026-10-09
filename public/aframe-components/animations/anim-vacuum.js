/**
 * anim-vacuum.js
 * Animates an entity being sucked into a vacuum along a specified axis.
 * Phases: resist/elongate → regroup/compress → pull toward vacuum
 *
 * Parameters:
 * - distance: how far the entity gets pulled (default: 2.0)
 * - bounceDistance: fixed distance entity bounces back on impact (default: 0.3)
 * - duration: animation cycle time in ms (default: 2000)
 * - resistance: how much it elongates (default: 1.5)
 * - stretchAxis: axis to stretch along ('x', 'y', or 'z', default: 'y')
 * - stretchDirection: direction to pull (-1 for negative, 1 for positive, default: -1)
 * - loop: whether to loop the animation (default: false - runs once)
 * - enabled: whether the animation is active (default: true)
 */

AFRAME.registerComponent('anim-vacuum', {
    schema: {
        distance: { type: 'number', default: 2.0 },
        bounceDistance: { type: 'number', default: 0.1 },
        duration: { type: 'number', default: 2000 },
        resistance: { type: 'number', default: 1.5 },
        stretchAxis: { type: 'string', default: 'y' },
        stretchDirection: { type: 'number', default: -1 },
        enabled: { type: 'boolean', default: true },
        loop: { type: 'boolean', default: false }
    },

    init: function () {
        this.log = window.log.getLogger('vacuum-animation');
        this.log.setLevel('debug');

        this.startPosition = this.el.object3D.position.clone();
        this.startScale = this.el.object3D.scale.clone();
        this.startRotation = this.el.object3D.rotation.clone();
        this.animationStart = Date.now();
        this.isComplete = false;

        this.log.debug('Vacuum animation initialized');
    },

    tick: function (t, dt) {
        if (!this.data.enabled) return;

        const data = this.data;
        const elapsed = Date.now() - this.animationStart;

        // If not looping and animation is complete, stop updating
        if (!data.loop && this.isComplete) return;

        // Calculate cycle: loop if enabled, otherwise clamp at 1.0
        let cycle;
        if (data.loop) {
            cycle = (elapsed % data.duration) / data.duration;
        } else {
            cycle = Math.min(elapsed / data.duration, 1.0);
            if (cycle >= 1.0) {
                this.isComplete = true;
            }
        }

        let phase, phaseProgress;

        if (cycle < 0.4) {
            // Phase 1: Resistance - elongate and resist
            phase = 'resistance';
            phaseProgress = cycle / 0.4;
        } else if (cycle < 0.65) {
            // Phase 2: Regroup - compress suddenly
            phase = 'regroup';
            phaseProgress = (cycle - 0.4) / 0.25;
        } else {
            // Phase 3: Move down and bounce back
            phase = 'movedown';
            phaseProgress = (cycle - 0.65) / 0.35;
        }

        this.applyPhase(phase, phaseProgress, data);
    },

    applyPhase: function (phase, progress, data) {
        const startPos = this.startPosition;
        const startScale = this.startScale;
        const axis = data.stretchAxis.toLowerCase();
        const dir = data.stretchDirection >= 0 ? 1 : -1;

        // Maximum stretch reached at end of resistance phase (0.4 of cycle)
        const maxStretch = 0.3 * dir;

        if (phase === 'resistance') {
            // Linear movement for smooth resistance
            const easeOut = progress;

            const elongation = 1 + (easeOut * (data.resistance - 1));
            const compression = 1 - (easeOut * 0.3);

            const newScale = { x: startScale.x, y: startScale.y, z: startScale.z };
            if (axis === 'x') {
                newScale.x = startScale.x * elongation;
                newScale.y = startScale.y * compression;
                newScale.z = startScale.z * compression;
            } else if (axis === 'y') {
                newScale.y = startScale.y * elongation;
                newScale.x = startScale.x * compression;
                newScale.z = startScale.z * compression;
            } else if (axis === 'z') {
                newScale.z = startScale.z * elongation;
                newScale.x = startScale.x * compression;
                newScale.y = startScale.y * compression;
            }

            this.el.object3D.scale.set(newScale.x, newScale.y, newScale.z);

            // Move along the stretch direction with ease-out
            const stretchPull = easeOut * maxStretch;
            const newPos = { x: startPos.x, y: startPos.y, z: startPos.z };
            newPos[axis] += stretchPull;
            this.el.object3D.position.set(newPos.x, newPos.y, newPos.z);

            // Slight rotation as it struggles
            this.el.object3D.rotation.z = Math.sin(progress * Math.PI) * 0.2;

        } else if (phase === 'regroup') {
            // Linear movement for smooth regroup
            const easeInOut = progress;

            const squash = 1 - (easeInOut * 0.6);

            const newScale = { x: startScale.x, y: startScale.y, z: startScale.z };
            if (axis === 'x') {
                newScale.x = startScale.x * squash;
                newScale.y = startScale.y * (1 + easeInOut * 0.2);
                newScale.z = startScale.z * (1 + easeInOut * 0.2);
            } else if (axis === 'y') {
                newScale.y = startScale.y * squash;
                newScale.x = startScale.x * (1 + easeInOut * 0.2);
                newScale.z = startScale.z * (1 + easeInOut * 0.2);
            } else if (axis === 'z') {
                newScale.z = startScale.z * squash;
                newScale.x = startScale.x * (1 + easeInOut * 0.2);
                newScale.y = startScale.y * (1 + easeInOut * 0.2);
            }

            this.el.object3D.scale.set(newScale.x, newScale.y, newScale.z);

            // Compress from the furthest stretch point and continue being pulled with easing
            const pullIn = maxStretch + (easeInOut * 0.7 * dir);
            const newPos = { x: startPos.x, y: startPos.y, z: startPos.z };
            newPos[axis] += pullIn;
            this.el.object3D.position.set(newPos.x, newPos.y, newPos.z);

            this.el.object3D.rotation.z = 0;

        } else if (phase === 'movedown') {
            // Accelerate toward vacuum, then hit hard surface and regroup
            const regroup_end = maxStretch + 0.7 * dir;
            const remaining_distance = (data.distance - (0.3 + 0.7)) * dir;

            let vacuumMotion;
            let stretchAmount = 0;
            let compressionAmount = 0;
            let bounceEffect = 0;

            if (progress < 0.7) {
                // Acceleration phase: ease-in acceleration into the vacuum
                const easeIn = progress < 0.5
                    ? 2 * progress * progress
                    : -1 + (4 - 2 * progress) * progress;

                vacuumMotion = regroup_end + (easeIn * remaining_distance);

                // Continue stretching along axis while accelerating
                stretchAmount = 0.15 + (progress / 0.7) * 0.2;
                compressionAmount = 0.075;

            } else {
                // Impact phase: hit hard surface, stop, and bounce back
                const impactProgress = (progress - 0.7) / 0.3;

                // Smooth bounce: eases in then out gently (fixed distance)
                const bounceEase = Math.sin(impactProgress * Math.PI * 0.5);
                bounceEffect = -bounceEase * data.bounceDistance * dir;

                vacuumMotion = regroup_end + remaining_distance + bounceEffect;

                // Compress on impact then gradually recover with ease
                const compressEase = Math.sin(impactProgress * Math.PI * 0.5);
                stretchAmount = Math.max(0, 0.35 * (1 - impactProgress * 1.5));
                compressionAmount = 0.1 + (compressEase * 0.2);
            }

            const newPos = { x: startPos.x, y: startPos.y, z: startPos.z };
            newPos[axis] += vacuumMotion;
            this.el.object3D.position.set(newPos.x, newPos.y, newPos.z);

            const newScale = { x: startScale.x, y: startScale.y, z: startScale.z };
            if (axis === 'x') {
                newScale.x = startScale.x * (1 + stretchAmount);
                newScale.y = startScale.y * (1 - compressionAmount);
                newScale.z = startScale.z * (1 - compressionAmount);
            } else if (axis === 'y') {
                newScale.y = startScale.y * (1 + stretchAmount);
                newScale.x = startScale.x * (1 - compressionAmount);
                newScale.z = startScale.z * (1 - compressionAmount);
            } else if (axis === 'z') {
                newScale.z = startScale.z * (1 + stretchAmount);
                newScale.x = startScale.x * (1 - compressionAmount);
                newScale.y = startScale.y * (1 - compressionAmount);
            }

            this.el.object3D.scale.set(newScale.x, newScale.y, newScale.z);

            this.el.object3D.rotation.z = 0;
        }
    }
});
