/**
 * final-stir-camera.js
 * Controls camera movement during the final stir phase.
 * Moves the active camera to adopt the world position of the camera "delivery_camera"
 * of the galley it is attached to when entering readyForFinalStir or recipeReadyForSubmit,
 * then returns to normal position when complete.
 */

AFRAME.registerComponent('final-stir-camera', {
    schema: {
        cameraRig: { type: 'selector' },
        transitionDuration: { type: 'number', default: 1200 },
        adoptRotation: { type: 'boolean', default: true },
        adoptFov: { type: 'boolean', default: true },
        skyTiltPitch: { type: 'number', default: 55 },
        skyFov: { type: 'number', default: 140 },
        skyFollowDuration: { type: 'number', default: 2500 },
        fovRestoreDuration: { type: 'number', default: 400 }
    },

    init: function () {
        this.log = window.log.getLogger('final-stir-camera');
        this.isInFinalStir = false;
        this.normalPosition = null;
        this.normalRotation = null;
        this.initialFov = null;
        this.animationFrameId = null;

        this.onGameStateChanged = this.onGameStateChanged.bind(this);

        // Listen for game state changes on this galley (if team-galley-receiver) or on the scene
        const stateSource = this.el.components?.['team-galley-receiver']
            ? this.el
            : (this.el.sceneEl || document.querySelector('a-scene'));

        this.stateSource = stateSource;
        if (stateSource) {
            stateSource.addEventListener('game-state-changed', this.onGameStateChanged);
        } else {
            document.addEventListener('DOMContentLoaded', () => {
                this.stateSource = this.el.sceneEl || document.querySelector('a-scene');
                this.stateSource?.addEventListener('game-state-changed', this.onGameStateChanged);
            });
        }
    },

    remove: function () {
        if (this.stateSource) {
            this.stateSource.removeEventListener('game-state-changed', this.onGameStateChanged);
        }
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    },

    onGameStateChanged: function (evt) {
        const state = evt.detail?.state;
        const context = evt.detail?.context;
        this.onStateChange(state, context);
    },

    getDeliveryCamera: function () {
        // Query within the galley this component is attached to (this.el).
        // Matches custom data-delivery-camera attribute as well as template-prefixed IDs (e.g. delivery_camera__template_0)
        let cam = this.el.querySelector('[data-delivery-camera], [id^="delivery_camera"], [id="delivery_camera"]');
        if (cam) return cam;

        // Fallback: if component was attached to cameraRig or scene instead of galley,
        // locate the galley for the current team or any galley in the scene
        const teamSuffix = window.CURRENT_TEAM || 'blue';
        const teamGalley = document.querySelector(`#galley-${teamSuffix}`);
        if (teamGalley) {
            cam = teamGalley.querySelector('[data-delivery-camera], [id^="delivery_camera"], [id="delivery_camera"]');
            if (cam) return cam;
        }

        return document.querySelector('[data-delivery-camera], [id^="delivery_camera"], [id="delivery_camera"]');
    },

    getCameraRig: function () {
        if (this.data.cameraRig) return this.data.cameraRig;

        const rig = document.querySelector('#cameraRig');
        if (rig) return rig;

        return this.el.sceneEl?.camera?.el || document.querySelector('a-camera, [camera]');
    },

    getCameraEl: function (cameraRig) {
        if (!cameraRig) return null;
        return cameraRig.querySelector('a-camera, [camera]') || cameraRig;
    },

    getFov: function (cameraRig) {
        const camEl = this.getCameraEl(cameraRig);
        const camAttr = camEl?.getAttribute('camera');
        if (camAttr && typeof camAttr.fov === 'number') {
            return camAttr.fov;
        }
        if (camEl?.components?.camera?.camera?.fov) {
            return camEl.components.camera.camera.fov;
        }
        return 80;
    },

    setFov: function (cameraRig, fov) {
        const camEl = this.getCameraEl(cameraRig);
        if (!camEl) return;
        camEl.setAttribute('camera', 'fov', fov);
        const threeCam = camEl.components?.camera?.camera;
        if (threeCam) {
            threeCam.fov = fov;
            threeCam.updateProjectionMatrix();
        }
    },

    onStateChange: function (state, context) {
        this.log.debug(`[Camera] state=${state}, isInFinalStir=${this.isInFinalStir}`);

        if ((state === 'readyForFinalStir' || state === 'recipeReadyForSubmit') && !this.isInFinalStir) {
            this.log.info(`📷 ENTER delivery camera view (${state})`);
            this.transitionToDeliveryView();
            this.isInFinalStir = true;
        } else if (state !== 'readyForFinalStir' && state !== 'recipeReadyForSubmit' && this.isInFinalStir) {
            this.log.info(`📷 RETURN to normal (was in final stir, now: ${state})`);
            if (state === 'orderSuccess') {
                this.transitionToSkyThenNormalView();
            } else {
                this.transitionToNormalView();
            }
            this.isInFinalStir = false;
        } else {
            this.log.debug(`📷 Ignoring ${state}`);
        }
    },

    transitionToDeliveryView: function () {
        const cameraRig = this.getCameraRig();
        const deliveryCam = this.getDeliveryCamera();

        if (!cameraRig) {
            this.log.warn('Camera rig / active camera not found, cannot transition');
            return;
        }

        if (!deliveryCam) {
            this.log.warn('Delivery camera not found in galley, cannot transition');
            return;
        }

        // Snapshot current normal transform if not already recorded
        const curPos = cameraRig.getAttribute('position');
        const curRot = cameraRig.getAttribute('rotation');
        this.normalPosition = {
            x: (curPos && curPos.x !== undefined) ? curPos.x : 0,
            y: (curPos && curPos.y !== undefined) ? curPos.y : 0,
            z: (curPos && curPos.z !== undefined) ? curPos.z : 0
        };
        this.normalRotation = {
            x: (curRot && curRot.x !== undefined) ? curRot.x : 0,
            y: (curRot && curRot.y !== undefined) ? curRot.y : 0,
            z: (curRot && curRot.z !== undefined) ? curRot.z : 0
        };
        if (this.initialFov === null) {
            this.initialFov = this.getFov(cameraRig);
        }

        // Ensure world matrices are up-to-date
        if (deliveryCam.object3D) {
            deliveryCam.object3D.updateWorldMatrix(true, false);
        }

        // Calculate world position & orientation of the delivery camera
        const targetWorldPos = new THREE.Vector3();
        deliveryCam.object3D.getWorldPosition(targetWorldPos);

        const targetWorldQuat = new THREE.Quaternion();
        deliveryCam.object3D.getWorldQuaternion(targetWorldQuat);

        const targetWorldEuler = new THREE.Euler().setFromQuaternion(targetWorldQuat, 'YXZ');
        const targetWorldRot = {
            x: THREE.MathUtils.radToDeg(targetWorldEuler.x),
            y: THREE.MathUtils.radToDeg(targetWorldEuler.y),
            z: THREE.MathUtils.radToDeg(targetWorldEuler.z)
        };

        // If cameraRig has a child camera with a local position offset, offset the rig so the camera matches targetWorldPos
        let targetRigWorldPos = targetWorldPos.clone();
        const childCam = cameraRig.querySelector('a-camera, [camera]');
        if (childCam && childCam !== cameraRig && childCam.object3D) {
            const camOffset = childCam.object3D.position.clone();
            camOffset.applyQuaternion(targetWorldQuat);
            targetRigWorldPos.sub(camOffset);
        }

        // Convert world position to local space of cameraRig's parent
        const targetLocalPos = targetRigWorldPos.clone();
        if (cameraRig.object3D && cameraRig.object3D.parent) {
            cameraRig.object3D.parent.updateWorldMatrix(true, false);
            cameraRig.object3D.parent.worldToLocal(targetLocalPos);
        }

        const targetPos = {
            x: targetLocalPos.x,
            y: targetLocalPos.y,
            z: targetLocalPos.z
        };
        const targetRot = this.data.adoptRotation ? targetWorldRot : this.normalRotation;

        let targetFov = null;
        if (this.data.adoptFov) {
            const delivCamAttr = deliveryCam.getAttribute('camera');
            if (delivCamAttr && typeof delivCamAttr.fov === 'number') {
                targetFov = delivCamAttr.fov;
            } else if (deliveryCam.components?.camera?.camera?.fov) {
                targetFov = deliveryCam.components.camera.camera.fov;
            }
        }

        this.log.info(`Transitioning to delivery view: pos=${JSON.stringify(targetPos)}, rot=${JSON.stringify(targetRot)}, fov=${targetFov}`);
        this.animateRigTransition(cameraRig, targetPos, targetRot, targetFov, this.data.transitionDuration);
    },

    transitionToSkyThenNormalView: function () {
        const cameraRig = this.getCameraRig();
        if (!cameraRig || !this.normalPosition) {
            this.log.warn('Normal position or camera rig not set, cannot perform sky transition');
            return;
        }

        const curRot = cameraRig.getAttribute('rotation');
        const startRot = {
            x: (curRot && curRot.x !== undefined) ? curRot.x : 0,
            y: (curRot && curRot.y !== undefined) ? curRot.y : 0,
            z: (curRot && curRot.z !== undefined) ? curRot.z : 0
        };

        // Tilt pitch up towards the sky while preserving current yaw and roll
        const skyRot = {
            x: this.data.skyTiltPitch,
            y: startRot.y,
            z: startRot.z
        };

        const targetSkyFov = this.data.skyFov;
        const initialFov = this.initialFov !== null ? this.initialFov : this.getFov(cameraRig);

        this.log.info(`📷 Stage 1: Tilting up into sky (pitch ${skyRot.x}°, fov ${targetSkyFov})`);

        // Stage 1: Tilt camera and increase FOV to follow dish into the sky
        this.animateRigTransition(
            cameraRig,
            null, // Keep current position
            skyRot,
            targetSkyFov,
            this.data.skyFollowDuration,
            () => {
                this.log.info(`📷 Stage 2: Restoring initial fov (${initialFov}) before return`);

                // Stage 2: Restore initial FOV before returning to normal position
                this.animateRigTransition(
                    cameraRig,
                    null, // Keep current position
                    null, // Keep sky rotation
                    initialFov,
                    this.data.fovRestoreDuration,
                    () => {
                        this.log.info(`📷 Stage 3: Returning to normal position/rotation`);

                        // Stage 3: Return to initial position and rotation
                        this.transitionToNormalView();
                    }
                );
            }
        );
    },

    transitionToNormalView: function () {
        const cameraRig = this.getCameraRig();
        if (!cameraRig || !this.normalPosition) {
            this.log.warn('Normal position or camera rig not set, cannot return');
            return;
        }

        const targetFov = this.initialFov !== null ? this.initialFov : this.getFov(cameraRig);
        this.log.info(`Transitioning to normal view - Target: pos=${JSON.stringify(this.normalPosition)}, rot=${JSON.stringify(this.normalRotation)}, fov=${targetFov}`);
        this.animateRigTransition(cameraRig, this.normalPosition, this.normalRotation, targetFov, this.data.transitionDuration);
    },

    animateRigTransition: function (cameraRig, targetPos, targetRot, targetFov, duration, onComplete) {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }

        const curPos = cameraRig.getAttribute('position');
        const curRot = cameraRig.getAttribute('rotation');
        const startPos = {
            x: (curPos && curPos.x !== undefined) ? curPos.x : 0,
            y: (curPos && curPos.y !== undefined) ? curPos.y : 0,
            z: (curPos && curPos.z !== undefined) ? curPos.z : 0
        };
        const startRot = {
            x: (curRot && curRot.x !== undefined) ? curRot.x : 0,
            y: (curRot && curRot.y !== undefined) ? curRot.y : 0,
            z: (curRot && curRot.z !== undefined) ? curRot.z : 0
        };

        const startFov = this.getFov(cameraRig);
        const animDuration = duration || this.data.transitionDuration;
        const startTime = performance.now();

        this.log.debug(`Animating camera: pos=${JSON.stringify(startPos)} → ${JSON.stringify(targetPos)}, rot=${JSON.stringify(startRot)} → ${JSON.stringify(targetRot)}, fov=${startFov} → ${targetFov} over ${animDuration}ms`);

        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / animDuration, 1.0);

            // Easing: ease-in-out cubic
            const easeProgress = progress < 0.5
                ? 4 * progress * progress * progress
                : 1 - Math.pow(-2 * progress + 2, 3) / 2;

            if (targetPos) {
                const newPos = {
                    x: startPos.x + (targetPos.x - startPos.x) * easeProgress,
                    y: startPos.y + (targetPos.y - startPos.y) * easeProgress,
                    z: startPos.z + (targetPos.z - startPos.z) * easeProgress
                };
                cameraRig.setAttribute('position', newPos);
            }

            if (targetRot) {
                const newRot = {
                    x: this.lerpAngle(startRot.x, targetRot.x, easeProgress),
                    y: this.lerpAngle(startRot.y, targetRot.y, easeProgress),
                    z: this.lerpAngle(startRot.z, targetRot.z, easeProgress)
                };
                cameraRig.setAttribute('rotation', newRot);
            }

            if (typeof targetFov === 'number') {
                const newFov = startFov + (targetFov - startFov) * easeProgress;
                this.setFov(cameraRig, newFov);
            }

            if (progress < 1.0) {
                this.animationFrameId = requestAnimationFrame(animate);
            } else {
                this.animationFrameId = null;
                if (onComplete) {
                    onComplete();
                }
            }
        };

        this.animationFrameId = requestAnimationFrame(animate);
    },

    lerpAngle: function (from, to, t) {
        // Linear interpolation for angles, handling wraparound
        let delta = to - from;
        while (delta > 180) delta -= 360;
        while (delta < -180) delta += 360;
        return from + delta * t;
    }
});
