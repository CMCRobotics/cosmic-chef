AFRAME.registerComponent('cutting-animation', {
    schema: {
        speed: {type: 'number', default: 0.6},
        depth: {type: 'number', default: 0.6},
        angle: {type: 'number', default: 45},
        sideMotion: {type: 'number', default: 0.2},
        choppiness: {type: 'number', default: 0.15},
        randomness: {type: 'number', default: 0.1},
        gravity: {type: 'number', default: 1}
    },

    init: function () {
        var el = this.el;
        var pos = el.getAttribute('position');
        var rot = el.getAttribute('rotation');

        // Store the base position and rotation for the cutting motion
        this.baseX = pos.x;
        this.baseY = pos.y;
        this.baseZ = pos.z;
        this.baseRotX = rot.x;
        this.baseRotY = rot.y;
        this.baseRotZ = rot.z;

        // Random startup delay so knives don't cut in sync
        var randomDelay = Math.random() * this.data.speed * 1000;
        this.startTime = performance.now() - randomDelay;

        this.lastCycleCount = 0;
        this.depthVariation = 0;
        this.angleVariation = 0;
        this.sideVariation = 0;
    },

    tick: function (t, dt) {
        var el = this.el;
        var data = this.data;
        var now = performance.now();
        var cycleTime = now - this.startTime;
        var cycleDuration = data.speed * 1000; // Convert to milliseconds

        // Calculate progress through the current cut cycle (0 to 1)
        var progress = (cycleTime % cycleDuration) / cycleDuration;
        var cycleCount = Math.floor(cycleTime / cycleDuration);

        // Generate new random variations at the start of each cycle
        if (this.lastCycleCount !== cycleCount) {
            this.lastCycleCount = cycleCount;
            this.depthVariation = (Math.random() - 0.5) * data.randomness * 2;
            this.angleVariation = (Math.random() - 0.5) * data.randomness * 2;
            this.sideVariation = (Math.random() - 0.5) * data.randomness * 2;
        }

        // Asymmetric easing: fast down, slow up (controlled by gravity)
        var moveDown;
        var downExponent = 1 + data.gravity; // Higher gravity = steeper acceleration
        var upExponent = 2 - (data.gravity - 1) * 0.5; // Higher gravity = slower recovery

        if (progress < 0.5) {
            // Down phase - accelerate downward, exponent depends on gravity
            var downProgress = progress * 2; // 0 to 1
            moveDown = Math.pow(downProgress, downExponent) * (data.depth + this.depthVariation);
        } else {
            // Up phase - decelerate upward, recovery speed depends on gravity
            var upProgress = (progress - 0.5) * 2; // 0 to 1
            var easedUp = Math.pow(upProgress, upExponent / 2);
            moveDown = (1 - easedUp) * (data.depth + this.depthVariation);
        }

        // Add choppiness - high frequency wobble
        var chopAmount = Math.sin(progress * 8 * Math.PI * 2) * data.choppiness;
        moveDown += chopAmount;

        // Use same easing for the tilt angle with randomness
        var rotateAngle;
        if (progress < 0.5) {
            var downProgress = progress * 2;
            rotateAngle = Math.pow(downProgress, downExponent) * (data.angle + this.angleVariation);
        } else {
            var upProgress = (progress - 0.5) * 2;
            var easedUp = Math.pow(upProgress, upExponent / 2);
            rotateAngle = (1 - easedUp) * (data.angle + this.angleVariation);
        }

        // Side motion with same easing and randomness
        var sideMove;
        if (progress < 0.5) {
            var downProgress = progress * 2;
            sideMove = Math.pow(downProgress, downExponent) * (data.sideMotion + this.sideVariation);
        } else {
            var upProgress = (progress - 0.5) * 2;
            var easedUp = Math.pow(upProgress, upExponent / 2);
            sideMove = (1 - easedUp) * (data.sideMotion + this.sideVariation);
        }

        // Update position and rotation
        el.setAttribute('position', {
            x: this.baseX + sideMove,
            y: this.baseY - moveDown,
            z: this.baseZ
        });

        el.setAttribute('rotation', {
            x: this.baseRotX + rotateAngle,
            y: this.baseRotY,
            z: this.baseRotZ
        });
    }
});
