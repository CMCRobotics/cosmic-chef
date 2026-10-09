import * as AFRAME from 'aframe';

AFRAME.registerComponent('face-target', {
    schema: { type: 'selector' },
  
    init: function () {},
  
    tick: function () {
      let targetPos = this.data.object3D.position
      this.el.object3D.lookAt(targetPos.x, targetPos.y, targetPos.z)
    }
  })