/**
 * final-stir-camera.js
 * Controls camera movement during the final stir phase.
 * Moves camera to look down at the delivery area when entering readyForFinalStir,
 * then returns to normal position when complete.
 */

AFRAME.registerComponent('final-stir-camera', {
    schema: {
        deliveryAreaPosition: { type: 'vec3', default: { x: -2, y: 1.7, z: 3 } },
        cameraHeightAboveDelivery: { type: 'number', default: 3.0 },
        transitionDuration: { type: 'number', default: 1000 }
    },

    init: function () {
        this.log = window.log.getLogger('final-stir-camera');
        this.cameraRig = this.el;

        // Use hardcoded normal position (from HTML: position="0 0 -5.5" rotation="-10 180 0")
        this.normalPosition = { x: 0, y: 0, z: -5.5 };
        this.normalRotation = { x: -10, y: 180, z: 0 };
        this.log.info('INIT: normalPosition set to (0, 0, -5.5)');

        this.isInFinalStir = false;

        this.trySubscribe();
    },

    trySubscribe: function () {
        const scene = document.querySelector('a-scene');
        if (!scene) {
            setTimeout(() => this.trySubscribe(), 100);
            return;
        }

        const prepMgr = scene.components['preparation-manager'];

        if (!prepMgr) {
            this.log.warn('Waiting for preparation-manager...');
            setTimeout(() => this.trySubscribe(), 100);
            return;
        }

        if (!prepMgr.gameActor) {
            this.log.warn('Waiting for gameActor...');
            setTimeout(() => this.trySubscribe(), 100);
            return;
        }

        // Subscribe to ALL state changes including transient ones
        const unsubscribe = prepMgr.gameActor.subscribe((state) => {
            this.log.info(`[ActorSub] State: ${state.value}`);
            this.onStateChange(state.value, state.context);
        });

        this.log.info('SUCCESS: Camera subscribed to actor');
    },

    onStateChange: function (state) {
        this.log.debug(`[Camera] state=${state}, isInFinalStir=${this.isInFinalStir}`);

        // readyForFinalStir is transient, so we catch recipeReadyForSubmit (which means stir is done)
        // as the signal to move camera overhead to show the result
        if ((state === 'readyForFinalStir' || state === 'recipeReadyForSubmit') && !this.isInFinalStir) {
            this.log.info(`📷 ENTER overhead view (${state})`);
            this.transitionToOverheadView();
            this.isInFinalStir = true;
        } else if (state !== 'readyForFinalStir' && state !== 'recipeReadyForSubmit' && this.isInFinalStir) {
            this.log.info(`📷 RETURN to normal (was in final stir, now: ${state})`);
            this.transitionToNormalView();
            this.isInFinalStir = false;
        } else {
            this.log.debug(`📷 Ignoring ${state}`);
        }
    },

    transitionToOverheadView: function () {
        const data = this.data;
        const delivery = data.deliveryAreaPosition;

        // Position camera directly above the delivery area, looking down
        const overheadPos = {
            x: delivery.x,
            y: delivery.y + data.cameraHeightAboveDelivery,
            z: delivery.z
        };

        const overheadRot = {
            x: -90,  // Look straight down
            y: 0,
            z: 0
        };

        this.log.info('Transitioning to overhead view');
        this.animateRigTransition(overheadPos, overheadRot);
    },

    transitionToNormalView: function () {
        if (!this.normalPosition) {
            this.log.warn('Normal position not set, cannot return');
            return;
        }
        this.log.info(`Transitioning to normal view - Target: ${JSON.stringify(this.normalPosition)}, ${JSON.stringify(this.normalRotation)}`);
        this.animateRigTransition(this.normalPosition, this.normalRotation);
    },

    animateRigTransition: function (targetPos, targetRot) {
        const startPos = this.cameraRig.getAttribute('position');
        const startRot = this.cameraRig.getAttribute('rotation');
        const duration = this.data.transitionDuration;
        const startTime = performance.now();

        this.log.debug(`Animating camera: ${JSON.stringify(startPos)} → ${JSON.stringify(targetPos)} over ${duration}ms`);

        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1.0);

            // Easing: ease-in-out cubic
            const easeProgress = progress < 0.5
                ? 4 * progress * progress * progress
                : 1 - Math.pow(-2 * progress + 2, 3) / 2;

            const newPos = {
                x: startPos.x + (targetPos.x - startPos.x) * easeProgress,
                y: startPos.y + (targetPos.y - startPos.y) * easeProgress,
                z: startPos.z + (targetPos.z - startPos.z) * easeProgress
            };

            const newRot = {
                x: this.lerpAngle(startRot.x, targetRot.x, easeProgress),
                y: this.lerpAngle(startRot.y, targetRot.y, easeProgress),
                z: this.lerpAngle(startRot.z, targetRot.z, easeProgress)
            };

            this.cameraRig.setAttribute('position', newPos);
            this.cameraRig.setAttribute('rotation', newRot);

            if (progress < 1.0) {
                requestAnimationFrame(animate);
            }
        };

        requestAnimationFrame(animate);
    },

    lerpAngle: function (from, to, t) {
        // Linear interpolation for angles, handling wraparound
        let delta = to - from;
        while (delta > 180) delta -= 360;
        while (delta < -180) delta += 360;
        return from + delta * t;
    }
});
