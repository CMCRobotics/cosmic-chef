/**
 * camera-focus-galley.js
 * Positions the camera to focus on the local team's galley.
 * Uses the team ID from URL parameter to find the galley and position the camera
 * at Y 2.5 facing the sous-chef stations.
 *
 * Usage: <a-entity id="cameraRig" camera-focus-galley>
 */

AFRAME.registerComponent('camera-focus-galley', {
    schema: {
        distance: { type: 'number', default: 5 },
        lookDownDegrees: { type: 'number', default: 15 }
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

        // Find the galley element for this team
        const galleryId = teamId.replace('team-', 'galley-');
        const galleryEl = document.querySelector(`#${galleryId}`);

        if (!galleryEl) {
            this.log.warn(`Galley element not found: #${galleryId}`);
            return;
        }

        // Get the galley's position
        const galleryPos = galleryEl.getAttribute('position');
        if (!galleryPos) {
            this.log.warn(`Galley position not set: #${galleryId}`);
            return;
        }

        // Calculate camera position: slightly toward center from the galley
        // This gives a good view of the stations
        const { distance } = this.data;
        const galleryDistance = Math.sqrt(galleryPos.x * galleryPos.x + galleryPos.z * galleryPos.z);

        // Direction from galley toward center (inward)
        const dirX = -galleryPos.x / galleryDistance;
        const dirZ = -galleryPos.z / galleryDistance;

        // Position camera at galley location, moved inward by 'distance', at height 2.5
        const camX = galleryPos.x + dirX * distance;
        const camY = 2.5;
        const camZ = galleryPos.z + dirZ * distance;

        this.el.setAttribute('position', `${camX} ${camY} ${camZ}`);

        // Rotation: look down at stations
        // Yaw: point toward galley center
        const yaw = Math.atan2(-dirX, -dirZ) * (180 / Math.PI);
        const pitch = this.data.lookDownDegrees;

        this.el.setAttribute('rotation', `${pitch} ${yaw} 0`);

        this.log.info(
            `📹 Camera focused on ${teamId}: position=(${camX.toFixed(1)}, ${camY}, ${camZ.toFixed(1)}) rotation=(${pitch}, ${yaw.toFixed(1)}, 0)`
        );
    }
});
