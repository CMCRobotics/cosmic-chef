import * as AFRAME from 'aframe';

AFRAME.registerComponent('look-towards', {
    schema: { type: 'selector' },
  
    init: function () {},
  
    tick: function () {
      let targetPos = this.data.object3D.position
      this.el.object3D.lookAt(targetPos.x, targetPos.y-0.5, this.el.object3D.position.z+1)
    }
  })