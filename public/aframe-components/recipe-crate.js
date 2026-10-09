/**
 * recipe-crate.js
 * Builds the visual parts of a recipe crate: the box model as a 1.6-unit cube, with the
 * recipe name on every face. Used for the falling crates (recipe-spawner) and for the crate
 * shown on the team's intake in the sous-chef window (captured-recipe-display).
 *
 * window.buildRecipeCrateParts(recipeName) → array of a-entity parts to append to a crate entity.
 */

window.RECIPE_CRATE_HALF_SIZE = 0.8; // the crate is a 1.6-unit cube

window.buildRecipeCrateParts = function (recipeName) {
    const half = window.RECIPE_CRATE_HALF_SIZE;
    // The box model (box-large.glb) is 1.1 x 0.55 x 1.0 units, stretched to the cube
    const native = { x: 1.1, y: 0.55, z: 1.0 };
    const parts = [];

    // The model's origin is at its base, so lower it to centre it on the crate
    const model = document.createElement('a-entity');
    model.setAttribute('gltf-model', '#asset_box_large');
    model.setAttribute('scale', `${2 * half / native.x} ${2 * half / native.y} ${2 * half / native.z}`);
    model.setAttribute('position', `0 ${-half} 0`);
    parts.push(model);

    // Recipe name on all six faces, just outside the model
    const textConfig = {
        value: recipeName.toUpperCase(),
        align: 'center',
        anchor: 'center',
        baseline: 'center',
        color: '#ffffff',
        fontSize: 512,
        width: 4
    };
    const gap = 0.02;
    const labels = [
        { position: `0 0 ${half + gap}`, rotation: '0 0 0' }, // front
        { position: `0 0 ${-(half + gap)}`, rotation: '0 180 0' }, // back
        { position: `${-(half + gap)} 0 0`, rotation: '0 90 0' }, // left
        { position: `${half + gap} 0 0`, rotation: '0 -90 0' }, // right
        { position: `0 ${half + gap} 0`, rotation: '90 0 0' }, // top
        { position: `0 ${-(half + gap)} 0`, rotation: '-90 0 0' } // bottom
    ];
    labels.forEach(({ position, rotation }) => {
        const label = document.createElement('a-entity');
        label.setAttribute('text', textConfig);
        label.setAttribute('position', position);
        label.setAttribute('rotation', rotation);
        parts.push(label);
    });

    return parts;
};
