/**
 * head-chef-controls.js
 * Provides Submit and Cancel buttons for the head chef to control the recipe.
 * Rendered as clickable world-space buttons.
 */

AFRAME.registerComponent('head-chef-controls', {
    schema: {
        buttonWidth: { type: 'number', default: 1 },
        buttonHeight: { type: 'number', default: 0.5 },
        buttonSpacing: { type: 'number', default: 1.5 },
        buttonDistance: { type: 'number', default: -2 } // Z distance in front of player
    },

    init: function () {
        this.log = window.log.getLogger('head-chef-controls');
        this.log.debug('Initializing head-chef-controls');

        this.submitButton = null;
        this.cancelButton = null;

        // Create control buttons
        this.createControlButtons();

        this.log.debug('Head Chef controls ready');
    },

    createControlButtons: function () {
        const basePosition = this.el.getAttribute('position') || { x: 0, y: 0, z: 0 };

        // Submit Button (right side)
        this.submitButton = this.createButton(
            'head-chef-submit-btn',
            'SUBMIT',
            {
                x: basePosition.x + (this.data.buttonSpacing / 2),
                y: basePosition.y - 1,
                z: basePosition.z + this.data.buttonDistance
            },
            '#00ff00', // green
            () => this.onSubmit()
        );
        this.el.appendChild(this.submitButton);

        // Cancel Button (left side)
        this.cancelButton = this.createButton(
            'head-chef-cancel-btn',
            'CANCEL',
            {
                x: basePosition.x - (this.data.buttonSpacing / 2),
                y: basePosition.y - 1,
                z: basePosition.z + this.data.buttonDistance
            },
            '#ff4444', // red
            () => this.onCancel()
        );
        this.el.appendChild(this.cancelButton);

        this.log.debug('Control buttons created');
    },

    createButton: function (id, label, position, color, onClickFn) {
        // Container for button
        const btnContainer = document.createElement('a-entity');
        btnContainer.setAttribute('id', id);
        btnContainer.setAttribute('position', `${position.x} ${position.y} ${position.z}`);
        btnContainer.setAttribute('class', 'clickable');

        // Button background
        const btnBg = document.createElement('a-entity');
        btnBg.setAttribute('geometry', {
            primitive: 'box',
            width: this.data.buttonWidth,
            height: this.data.buttonHeight,
            depth: 0.1
        });
        btnBg.setAttribute('material', {
            color: color,
            emissive: color,
            emissiveIntensity: 0.5,
            transparent: true,
            opacity: 0.8
        });
        btnContainer.appendChild(btnBg);

        // Button text
        const btnText = document.createElement('a-entity');
        btnText.setAttribute('text', {
            value: label,
            align: 'center',
            anchor: 'center',
            baseline: 'center',
            color: '#ffffff',
            width: this.data.buttonWidth * 2
        });
        btnText.setAttribute('position', '0 0 0.08'); // In front of button
        btnContainer.appendChild(btnText);

        // Click handler
        btnContainer.addEventListener('click', () => {
            this.log.info(`Button clicked: ${label}`);
            onClickFn();
        });

        // Hover effect
        btnContainer.addEventListener('mouseenter', () => {
            bgMaterial = btnBg.getAttribute('material');
            bgMaterial.emissiveIntensity = 1.0;
            btnBg.setAttribute('material', bgMaterial);
        });

        btnContainer.addEventListener('mouseleave', () => {
            bgMaterial = btnBg.getAttribute('material');
            bgMaterial.emissiveIntensity = 0.5;
            btnBg.setAttribute('material', bgMaterial);
        });

        return btnContainer;
    },

    onSubmit: function () {
        this.log.info('Submit button pressed');

        const headChefMgr = document.querySelector('#head-chef-root')?.components['head-chef-manager'];
        if (headChefMgr) {
            headChefMgr.sendRecipeSubmit();

            // Visual feedback: green pulse
            this.showFeedback(this.submitButton, '#00ff00');
        } else {
            this.log.error('head-chef-manager not found');
        }
    },

    onCancel: function () {
        this.log.info('Cancel button pressed');

        const headChefMgr = document.querySelector('#head-chef-root')?.components['head-chef-manager'];
        if (headChefMgr) {
            headChefMgr.sendRecipeCancel('manual');

            // Visual feedback: red pulse
            this.showFeedback(this.cancelButton, '#ff0000');
        } else {
            this.log.error('head-chef-manager not found');
        }
    },

    showFeedback: function (btnEl, color) {
        // Animate button scale for feedback
        const originalScale = btnEl.getAttribute('scale') || { x: 1, y: 1, z: 1 };

        btnEl.setAttribute('animation', {
            property: 'scale',
            to: `${originalScale.x * 1.2} ${originalScale.y * 1.2} ${originalScale.z * 1.2}`,
            dur: 100,
            easing: 'easeInOutQuad'
        });

        // Pulse color
        const btnBg = btnEl.querySelector('[geometry]');
        if (btnBg) {
            btnBg.setAttribute('material', { emissiveIntensity: 1.0 });
            setTimeout(() => {
                btnBg.setAttribute('material', { emissiveIntensity: 0.5 });
            }, 150);
        }

        // Scale back
        setTimeout(() => {
            btnEl.removeAttribute('animation');
            btnEl.setAttribute('scale', `${originalScale.x} ${originalScale.y} ${originalScale.z}`);
        }, 100);
    },

    remove: function () {
        if (this.submitButton && this.submitButton.parentNode) {
            this.submitButton.remove();
        }
        if (this.cancelButton && this.cancelButton.parentNode) {
            this.cancelButton.remove();
        }
        this.log.debug('Head Chef controls removed');
    }
});
