/**
 * recipe-status-button.js
 * Displays recipe status on the floor button:
 * - Red X: recipe under preparation
 * - Green O: recipe ready to submit (clickable)
 * Updates based on game state and allows submission when ready.
 */

AFRAME.registerComponent('recipe-status-button', {
    schema: {
        scale: { type: 'number', default: 0.8 }
    },

    init: function () {
        this.log = window.log.getLogger('recipe-status-button');
        this.log.debug('Initializing recipe-status-button');

        this.statusOverlay = null;
        this.statusText = null;
        this.isReady = false;
        this.currentRecipe = null;
        this.lastState = null;
        this.isDisabled = false;

        // Listen for state changes
        const scene = document.querySelector('a-scene');
        scene.addEventListener('game-state-changed', (evt) => {
            this.onStateChange(evt.detail.state, evt.detail.context);
        });

        // Create status overlay
        this.createStatusOverlay();

        // Add click handler
        this.el.addEventListener('click', () => this.onButtonClick());

        this.log.debug('Recipe status button ready');
    },

    createStatusOverlay: function () {
        // Get button position
        const buttonPos = this.el.getAttribute('position') || { x: 0, y: 0, z: 0 };

        // Create container for overlay (positioned above button)
        const overlay = document.createElement('a-entity');
        overlay.setAttribute('id', 'recipe-status-overlay');
        overlay.setAttribute('position', `${buttonPos.x} ${buttonPos.y + 0.4} ${buttonPos.z}`);
        // Rotate 90 degrees around X axis to lie flat on ground
        overlay.setAttribute('rotation', '-90 0 0');
        // Add material for opacity control
        overlay.setAttribute('material', { transparent: true, opacity: 1.0 });

        // Create text for status symbol (X or O)
        const textEl = document.createElement('a-entity');
        textEl.setAttribute('text', {
            value: 'X',
            align: 'center',
            anchor: 'center',
            baseline: 'center',
            color: '#ff0000',
            fontSize: 200,
            wrapCount: 20
        });
        textEl.setAttribute('position', '0 0 0');
        // 10x larger scale
        textEl.setAttribute('scale', `${this.data.scale * 10} ${this.data.scale * 10} ${this.data.scale * 10}`);

        overlay.appendChild(textEl);
        this.el.parentNode.appendChild(overlay);

        this.statusOverlay = overlay;
        this.statusText = textEl;

        this.log.debug('Status overlay created - flat on ground, 10x larger');
    },

    onStateChange: function (state, context) {
        this.log.debug(`Recipe Status - State: ${state}, Order: ${context.currentOrder?.name || 'none'}`);

        // Check for new recipe (different from current)
        const hasNewRecipe = context.currentOrder && context.currentOrder !== this.currentRecipe;

        // Check for successful submission
        if (state === 'orderSuccess' || state === 'orderPenalized') {
            this.isDisabled = true; // Disable button after submit
            this.log.info('Recipe submitted, button disabled');
        }
        // Re-enable when new recipe arrives in preparing state
        else if (hasNewRecipe && state === 'preparingIngredients') {
            this.isDisabled = false; // Re-enable for new recipe
            this.log.info(`New recipe available: ${context.currentOrder.name}, button re-enabled`);
        }

        // Update current recipe reference
        if (context.currentOrder && context.currentOrder !== this.currentRecipe) {
            this.currentRecipe = context.currentOrder;
        } else if (!context.currentOrder) {
            this.currentRecipe = null;
        }

        // Determine if recipe is ready to submit
        this.updateButtonState(state, context);

        this.lastState = state;
    },

    // Called by tractor beam when recipe is manually captured
    enableForNewRecipe: function () {
        this.isDisabled = false;
        this.log.info('New recipe manually captured, button re-enabled');
        this.updateButtonState(this.lastState, { currentOrder: this.currentRecipe, stations: [] });
    },

    updateButtonState: function (state, context) {
        // Determine if recipe is ready based on state
        this.isReady = state === 'recipeReadyForSubmit' && context.currentOrder !== null && !this.isDisabled;

        // Update visual
        let color, symbol, opacity;
        if (this.isDisabled) {
            color = '#444444'; // Dark grey when disabled
            symbol = '';
            opacity = 0.3;
        } else if (this.isReady) {
            color = '#00ff00'; // Green when ready
            symbol = 'O';
            opacity = 1.0;
        } else {
            color = '#ff0000'; // Red when preparing
            symbol = 'X';
            opacity = 1.0;
        }

        // Update text
        if (this.statusText) {
            const textAttr = this.statusText.getAttribute('text');
            textAttr.value = symbol;
            textAttr.color = color;
            this.statusText.setAttribute('text', textAttr);

            // Set opacity on the parent overlay
            if (this.statusOverlay) {
                const material = { transparent: true, opacity: opacity };
                this.statusOverlay.setAttribute('material', material);
            }
        }

        // Update button appearance
        this.updateButtonAppearance(color, this.isReady, this.isDisabled);

        this.log.debug(`Button updated: ${symbol} (${color}), Ready: ${this.isReady}, Disabled: ${this.isDisabled}`);
    },

    updateButtonAppearance: function (color, isReady, isDisabled) {
        // Add glow effect
        if (this.statusOverlay) {
            if (isDisabled) {
                // No glow when disabled
                this.statusOverlay.removeAttribute('light');
            } else if (isReady) {
                // Green glow when ready
                this.statusOverlay.setAttribute('light', {
                    type: 'point',
                    color: color,
                    intensity: 1.5,
                    distance: 5
                });
            } else {
                // Red glow when preparing
                this.statusOverlay.setAttribute('light', {
                    type: 'point',
                    color: color,
                    intensity: 0.8,
                    distance: 3
                });
            }
        }
    },

    onButtonClick: function () {
        this.log.info(`Button clicked - Ready: ${this.isReady}, Disabled: ${this.isDisabled}`);

        if (this.isDisabled) {
            this.log.warn('Button is disabled - waiting for new recipe');
            return;
        }

        if (this.isReady) {
            // Green O: submit recipe
            this.publishSubmitToMQTT();
        } else if (this.currentRecipe) {
            // Red X: cancel recipe
            this.publishCancelToMQTT();
        } else {
            this.log.warn('No recipe to cancel');
            return;
        }

        this.showSubmitFeedback();
    },

    publishSubmitToMQTT: function () {
        // Publish MQTT event — adapter will convert to SUBMIT_RECIPE
        // mqtt-bridge receives it back and updates state machine
        const scene = document.querySelector('a-scene');
        const mqttComponent = scene?.components['mqtt-bridge'] || scene?.components['head-chef-mqtt-client'];

        if (mqttComponent && mqttComponent.client && mqttComponent.client.connected) {
            const gameId = mqttComponent.data?.gameId || 'default';
            const teamId = mqttComponent.data?.teamId || 'team-1';
            const topic = `cosmic-chef/team-${teamId}/game-${gameId}/head-chef/animation/submit-state`;

            // "submitting" → adapter converts to SUBMIT_RECIPE event
            mqttComponent.client.publish(topic, 'submitting', { qos: 1 });
            this.log.info(`Published SUBMIT to MQTT: ${topic}`);
        } else {
            this.log.warn('MQTT client not available or not connected');
        }
    },

    publishCancelToMQTT: function () {
        // Publish MQTT event to cancel — state machine will receive it via mqtt-bridge
        const scene = document.querySelector('a-scene');
        const mqttComponent = scene?.components['mqtt-bridge'] || scene?.components['head-chef-mqtt-client'];

        if (mqttComponent && mqttComponent.client && mqttComponent.client.connected) {
            const gameId = mqttComponent.data?.gameId || 'default';
            const teamId = mqttComponent.data?.teamId || 'team-1';
            const topic = `cosmic-chef/team-${teamId}/game-${gameId}/head-chef/animation/submit-state`;

            // "idle" → adapter converts to CANCEL_ORDER event
            mqttComponent.client.publish(topic, 'idle', { qos: 1 });
            this.log.info(`Published CANCEL to MQTT: ${topic}`);
        } else {
            this.log.warn('MQTT client not available or not connected');
        }
    },

    showSubmitFeedback: function () {
        // Brief pulse animation to indicate submission
        if (this.statusOverlay) {
            const currentScale = this.statusOverlay.getAttribute('scale') || { x: 1, y: 1, z: 1 };

            this.statusOverlay.setAttribute('animation', {
                property: 'scale',
                to: `${currentScale.x * 1.3} ${currentScale.y * 1.3} ${currentScale.z * 1.3}`,
                dur: 150,
                easing: 'easeInOutQuad'
            });

            // Scale back
            setTimeout(() => {
                this.statusOverlay.removeAttribute('animation');
                this.statusOverlay.setAttribute('scale', `${currentScale.x} ${currentScale.y} ${currentScale.z}`);
            }, 150);

            this.log.info('Recipe submitted!');
        }
    },

    remove: function () {
        if (this.statusOverlay && this.statusOverlay.parentNode) {
            this.statusOverlay.remove();
        }
        this.log.debug('Recipe status button removed');
    }
});
