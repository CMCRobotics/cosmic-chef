AFRAME.registerComponent('linear-animation', {
    schema: {
        startPosition: {type: 'vec3', default: {x: -20, y: 5, z: -10}},
        endPosition: {type: 'vec3', default: {x: 20, y: 5, z: -10}},
        duration: {type: 'number', default: 20}
    },

    init: function () {
        var el = this.el;
        var data = this.data;
        var startPosition = new THREE.Vector3(data.startPosition.x, data.startPosition.y, data.startPosition.z);
        var endPosition = new THREE.Vector3(data.endPosition.x, data.endPosition.y, data.endPosition.z);
        
        el.setAttribute('position', startPosition);
        
        function animate() {
            new TWEEN.Tween(startPosition)
                .to(endPosition, data.duration * 1000) // Convert seconds to milliseconds
                .easing(TWEEN.Easing.Sinusoidal.InOut)
                .onUpdate(function () {
                    el.setAttribute('position', startPosition);
                })
                .onComplete(function () {
                    // Reverse the animation
                    var temp = startPosition.clone();
                    startPosition.copy(endPosition);
                    endPosition.copy(temp);
                    el.setAttribute('rotation', '0 ' + (el.getAttribute('rotation').y + 180) + ' 0');
                    animate();
                })
                .start();
        }
        
        animate();
    },
    
    tick: function (t) {
        TWEEN.update(t);
    }
});