/**
 * camera-focus-galley.js
 * Positions the camera to focus on the local team's galley.
 * Uses per-team configuration to account for different galley positions in the circle.
 */

AFRAME.registerComponent('camera-focus-galley', {
    schema: {
        backwardDistance: { type: 'number', default: 8 },
        strafeOffset: { type: 'number', default: 0 },
        upwardOffset: { type: 'number', default: 0 },
        pitch: { type: 'number', default: -30 }
    },

    init: function () {
        this.log = window.log.getLogger('camera-focus-galley');

        // Per-team camera configuration (fine-tuned for each galley's position in the circle)
        // backwardDistance: how far back from galley (negative = forward/closer)
        // strafeOffset: anti-clockwise around circle (positive = counter-clockwise, negative = clockwise)
        this.teamConfigs = {
            'team-blue': { backwardDistance: -4.5, strafeOffset: -1.1, pitch: -9 },
            'team-white': { backwardDistance: -3.5, strafeOffset: 0, pitch: -9 },
            'team-red': { backwardDistance: -5.5, strafeOffset: 0, pitch: -9 }
        };

        // Wait for scene to be ready
        if (!this.el.sceneEl.hasLoaded) {
            this.el.sceneEl.addEventListener('loaded', () => this.focusOnTeamGalley());
        } else {
            this.focusOnTeamGalley();
        }
    },

    focusOnTeamGalley: function () {
        const teamId = window.CURRENT_TEAM || 'team-blue';
        this.log.debug(`Focusing camera on team: ${teamId}`);

        // Find the galley element for this team
        const galleryId = teamId.replace('team-', 'galley-');
        const galleryEl = document.querySelector(`#${galleryId}`);

        if (!galleryEl) {
            this.log.warn(`Galley element not found: #${galleryId}`);
            return;
        }

        // Get the galley's position and rotation
        const galleryPos = galleryEl.getAttribute('position');
        const galleryRot = galleryEl.getAttribute('rotation');

        if (!galleryPos || !galleryRot) {
            this.log.warn(`Galley position or rotation not set: #${galleryId}`);
            return;
        }

        // Use team-specific config if available, otherwise fall back to schema defaults
        const teamConfig = this.teamConfigs[teamId] || {};
        const backwardDistance = teamConfig.backwardDistance !== undefined ? teamConfig.backwardDistance : this.data.backwardDistance;
        const strafeOffset = teamConfig.strafeOffset !== undefined ? teamConfig.strafeOffset : this.data.strafeOffset;
        const pitch = teamConfig.pitch !== undefined ? teamConfig.pitch : this.data.pitch;
        const upwardOffset = this.data.upwardOffset;

        // Convert galley's yaw (Y rotation) to radians
        const galleyYaw = galleryRot.y * (Math.PI / 180);

        // Create offset vectors:
        // - backward: along galley's forward axis (toward/away from center)
        // - strafe: perpendicular to forward, along the station line (anti-clockwise = positive)
        const offsetBackward = backwardDistance;

        // Forward (inward toward center): (sin(galleyYaw), cos(galleyYaw))
        // Perpendicular (tangent/stations): (cos(galleyYaw), -sin(galleyYaw))
        const offsetX = Math.sin(galleyYaw) * offsetBackward + Math.cos(galleyYaw) * strafeOffset;
        const offsetZ = Math.cos(galleyYaw) * offsetBackward - Math.sin(galleyYaw) * strafeOffset;

        // Calculate camera position
        const camX = galleryPos.x + offsetX;
        const camY = 2.5 + upwardOffset;
        const camZ = galleryPos.z + offsetZ;

        this.el.setAttribute('position', `${camX} ${camY} ${camZ}`);

        // Calculate yaw: look at galley center
        const lookYaw = galleyYaw * (180 / Math.PI) + 180;

        this.el.setAttribute('rotation', `${pitch} ${lookYaw} 0`);

        this.log.info(
            `📹 Camera focused on ${teamId}: position=(${camX.toFixed(2)}, ${camY.toFixed(2)}, ${camZ.toFixed(2)}) rotation=(${pitch}, ${lookYaw.toFixed(2)}, 0)`
        );
    }
});
