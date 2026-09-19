AFRAME.registerComponent('stirring-animation', {
    schema: {
        speed: {type: 'number', default: 1.5},
        radius: {type: 'number', default: 0.3},
        depth: {type: 'number', default: 0.1},
        randomness: {type: 'number', default: 0.1},
        clockwise: {type: 'boolean', default: true},
        reverseRandomly: {type: 'boolean', default: false}
    },

    init: function () {
        var el = this.el;
        var pos = el.getAttribute('position');
        var rot = el.getAttribute('rotation');

        // Store the base position and rotation
        this.baseX = pos.x;
        this.baseY = pos.y;
        this.baseZ = pos.z;
        this.baseRotX = rot.x;
        this.baseRotY = rot.y;
        this.baseRotZ = rot.z;

        // Random startup delay so multiple spoons don't stir in sync
        var randomDelay = Math.random() * this.data.speed * 1000;
        this.startTime = performance.now() - randomDelay;

        this.lastCycleCount = 0;
        // Set initial direction based on clockwise flag or random if reverseRandomly is enabled
        this.direction = this.data.reverseRandomly ? (Math.random() > 0.5 ? 1 : -1) : (this.data.clockwise ? 1 : -1);
    },

    tick: function (t, dt) {
        var el = this.el;
        var data = this.data;
        var now = performance.now();
        var cycleTime = now - this.startTime;
        var cycleDuration = data.speed * 1000; // Convert to milliseconds

        // Calculate progress through the current stir cycle (0 to 1)
        var progress = (cycleTime % cycleDuration) / cycleDuration;
        var cycleCount = Math.floor(cycleTime / cycleDuration);

        // Randomly change direction each cycle if reverseRandomly is true
        if (this.lastCycleCount !== cycleCount) {
            this.lastCycleCount = cycleCount;
            if (data.reverseRandomly) {
                this.direction = Math.random() > 0.5 ? 1 : -1;
            }
        }

        // Smooth random variations using sine waves to avoid choppiness at cycle boundaries
        var smoothRadiusVariation = Math.sin(cycleTime / 1000 * 0.5) * data.randomness * 0.5;
        var smoothDepthVariation = Math.sin(cycleTime / 1000 * 0.3 + 1.5) * data.randomness * 0.3;

        // Circular motion: trace a circle in XZ plane
        var angle = progress * Math.PI * 2 * this.direction; // Full rotation per cycle, direction changes randomly
        var effectiveRadius = data.radius + smoothRadiusVariation;

        var circleX = Math.cos(angle) * effectiveRadius;
        var circleZ = Math.sin(angle) * effectiveRadius;

        // Bobbing motion: slight vertical variation
        var bobAmount = Math.sin(angle) * (data.depth + smoothDepthVariation) * 0.5;

        // Update position
        el.setAttribute('position', {
            x: this.baseX + circleX,
            y: this.baseY + bobAmount,
            z: this.baseZ + circleZ
        });

        // Keep original rotation (no spinning)
        el.setAttribute('rotation', {
            x: this.baseRotX,
            y: this.baseRotY,
            z: this.baseRotZ
        });
    }
});
