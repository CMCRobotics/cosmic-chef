/**
 * galley-layout.js
 * Arranges child galley entities in a circle, each facing the center.
 * Auto-discovers children with team-galley-receiver.
 *
 * Usage:
 * <a-entity galley-layout="radius: 15; height: 0; rotationOffset: 0">
 *   <a-entity team-galley-receiver="teamId: team-blue; gameId: default" galley-manager="galleryId: galley-blue">
 *     <a-entity load-fragment="src: /galley.html; templateId: cosmic-chef-galley-blue"></a-entity>
 *   </a-entity>
 *   ... more galleys
 * </a-entity>
 */

AFRAME.registerComponent('galley-layout', {
    schema: {
        radius: { type: 'number', default: 15 },
        height: { type: 'number', default: 0 },
        rotationOffset: { type: 'number', default: 0 }
    },

    init: function () {
        this.log = window.log.getLogger('galley-layout');
        this.log.debug('Initializing galley-layout');
    },

    update: function () {
        this.arrangeGalleys();
    },

    arrangeGalleys: function () {
        const { radius, height, rotationOffset } = this.data;

        // Discover all child galley entities (those with team-galley-receiver)
        const galleys = Array.from(this.el.querySelectorAll(':scope > [team-galley-receiver]'));

        if (galleys.length === 0) {
            this.log.warn('No galley entities found');
            return;
        }

        this.log.debug(`Arranging ${galleys.length} galleys in circle with radius ${radius}`);

        galleys.forEach((galley, index) => {
            // Calculate position in circle
            const angleStep = 360 / galleys.length;
            const angle = (index * angleStep + rotationOffset) * (Math.PI / 180);

            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;

            // Set position
            galley.setAttribute('position', `${x} ${height} ${z}`);

            // Orient to face center (0, height, 0)
            // Calculate direction vector from galley to center
            const dirX = -x;
            const dirZ = -z;

            // Calculate rotation to face center (0, 0) on the XZ plane
            // atan2 gives angle in radians; convert to degrees
            let yaw = Math.atan2(dirX, dirZ) * (180 / Math.PI);

            galley.setAttribute('rotation', `0 ${yaw} 0`);

            this.log.debug(
                `Galley ${index + 1}: position=(${x.toFixed(1)}, ${height}, ${z.toFixed(1)}) rotation=(0, ${yaw.toFixed(1)}, 0)`
            );
        });
    },

    remove: function () {
        this.log.debug('Galley layout removed');
    }
});
