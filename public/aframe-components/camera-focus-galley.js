/**
 * camera-focus-galley.js
 * Positions the camera to focus on the local team's galley.
 * Auto-calculates distance to ensure all galley elements are visible.
 */

AFRAME.registerComponent('camera-focus-galley', {
    schema: {
        upwardOffset: { type: 'number', default: 0 },
        pitch: { type: 'number', default: -9 }
    },

    init: function () {
        this.log = window.log.getLogger('camera-focus-galley');

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

        // Per-team hardcoded adjustments
        const teamAdjustments = {
            'team-blue': { backwardDistance: -4.5, strafeOffset: -1.5 },
            'team-red': { backwardDistance: -5.2, strafeOffset: -0.3 },
            'team-white': { backwardDistance: -3.8, strafeOffset: -0.1 }
        };
        const adjustments = teamAdjustments[teamId] || { backwardDistance: -4.5, strafeOffset: 0.1 };

        // Find the galley element for this team
        const galleryId = teamId.replace('team-', 'galley-');
        const galleryEl = document.querySelector(`#${galleryId}`);

        // If galley not found, retry after a delay (fragments may not be loaded yet)
        if (!galleryEl) {
            if (!this.retryCount) this.retryCount = 0;
            if (this.retryCount < 5) {
                this.retryCount++;
                this.log.debug(`Galley #${galleryId} not found, retrying in 100ms...`);
                setTimeout(() => this.focusOnTeamGalley(), 100);
                return;
            }
            this.log.warn(`Galley element not found after 5 retries: #${galleryId}`);
            return;
        }

        this.log.info(`✓ Found galley: #${galleryId}`);

        // Get the galley's position and rotation
        const galleryPos = galleryEl.getAttribute('position');
        const galleryRot = galleryEl.getAttribute('rotation');

        if (!galleryPos || !galleryRot) {
            this.log.warn(`Galley position or rotation not set: #${galleryId}`);
            return;
        }

        const { upwardOffset, pitch } = this.data;
        const { backwardDistance, strafeOffset } = adjustments;

        // Convert galley's yaw (Y rotation) to radians
        const galleyYaw = galleryRot.y * (Math.PI / 180);

        // Create offset vectors:
        // - backward: along galley's forward axis (toward/away from center)
        // - strafe: perpendicular to forward, along the station line
        const offsetX = Math.sin(galleyYaw) * backwardDistance + Math.cos(galleyYaw) * strafeOffset;
        const offsetZ = Math.cos(galleyYaw) * backwardDistance - Math.sin(galleyYaw) * strafeOffset;

        // Calculate camera position
        const camX = galleryPos.x + offsetX;
        const camY = 2.5 + upwardOffset;
        const camZ = galleryPos.z + offsetZ;

        this.el.setAttribute('position', `${camX} ${camY} ${camZ}`);

        // Calculate yaw: look at galley center
        const lookYaw = galleyYaw * (180 / Math.PI) + 180;

        this.el.setAttribute('rotation', `${pitch} ${lookYaw} 0`);

        this.log.debug(
            `📹 Camera: pos=(${camX.toFixed(2)}, ${camY.toFixed(2)}, ${camZ.toFixed(2)}), rotation=(${pitch}, ${lookYaw.toFixed(2)}, 0)`
        );
    },

});
