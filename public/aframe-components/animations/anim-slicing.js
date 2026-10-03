AFRAME.registerComponent('slicing-animation', {
    schema: {
        speed: {type: 'number', default: 0.6},
        depth: {type: 'number', default: 0.6},
        angle: {type: 'number', default: 45},
        sideMotion: {type: 'number', default: 0.1},
        choppiness: {type: 'number', default: 0.01},
        randomness: {type: 'number', default: 0.1},
        gravity: {type: 'number', default: 1.5}
    },

    init: function () {
        var el = this.el;
        var pos = el.getAttribute('position');
        var rot = el.getAttribute('rotation');

        // Store the base position and rotation for the slicing motion
        this.baseX = pos.x;
        this.baseY = pos.y;
        this.baseZ = pos.z;
        this.baseRotX = rot.x;
        this.baseRotY = rot.y;
        this.baseRotZ = rot.z;

        // Random startup delay so blades don't slice in sync
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

        // Calculate progress through the current slice cycle (0 to 1)
        var progress = (cycleTime % cycleDuration) / cycleDuration;
        var cycleCount = Math.floor(cycleTime / cycleDuration);

        // Generate new random variations at the start of each cycle
        if (this.lastCycleCount !== cycleCount) {
            this.lastCycleCount = cycleCount;
            this.depthVariation = (Math.random() - 0.5) * data.randomness * 2;
            this.angleVariation = (Math.random() - 0.5) * data.randomness * 2;
            this.sideVariation = (Math.random() - 0.5) * data.randomness * 2;
        }

        // Asymmetric easing: fast forward, slow back (controlled by gravity)
        var moveForward;
        var downExponent = 1 + data.gravity; // Higher gravity = steeper acceleration
        var upExponent = 2 - (data.gravity - 1) * 0.5; // Higher gravity = slower recovery

        if (progress < 0.5) {
            // Forward phase - accelerate forward, exponent depends on gravity
            var forwardProgress = progress * 2; // 0 to 1
            moveForward = Math.pow(forwardProgress, downExponent) * (data.depth + this.depthVariation);
        } else {
            // Backward phase - decelerate backward, recovery speed depends on gravity
            var backwardProgress = (progress - 0.5) * 2; // 0 to 1
            var easedBack = Math.pow(backwardProgress, upExponent / 2);
            moveForward = (1 - easedBack) * (data.depth + this.depthVariation);
        }

        // Add choppiness - high frequency wobble
        var chopAmount = Math.sin(progress * 8 * Math.PI * 2) * data.choppiness;
        moveForward += chopAmount;

        // Use same easing for the tilt angle with randomness
        var rotateAngle;
        if (progress < 0.5) {
            var forwardProgress = progress * 2;
            rotateAngle = Math.pow(forwardProgress, downExponent) * (data.angle + this.angleVariation);
        } else {
            var backwardProgress = (progress - 0.5) * 2;
            var easedBack = Math.pow(backwardProgress, upExponent / 2);
            rotateAngle = (1 - easedBack) * (data.angle + this.angleVariation);
        }

        // Side motion with same easing and randomness
        var sideMove;
        if (progress < 0.5) {
            var forwardProgress = progress * 2;
            sideMove = Math.pow(forwardProgress, downExponent) * (data.sideMotion + this.sideVariation);
        } else {
            var backwardProgress = (progress - 0.5) * 2;
            var easedBack = Math.pow(backwardProgress, upExponent / 2);
            sideMove = (1 - easedBack) * (data.sideMotion + this.sideVariation);
        }

        // Update position and rotation
        el.setAttribute('position', {
            x: this.baseX + sideMove,
            y: this.baseY,
            z: this.baseZ + moveForward
        });

        el.setAttribute('rotation', {
            x: this.baseRotX,
            y: this.baseRotY + rotateAngle,
            z: this.baseRotZ
        });
    }
});
