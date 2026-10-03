/**
 * preparation-manager.js
 * Game state management using XState v5.
 * Manages the core gameplay loop: order registration -> cooking -> evaluation -> serving.
 */

const { createActor } = XState;

AFRAME.registerComponent('preparation-manager', {
    schema: {
        autoStart: { type: 'boolean', default: true }
    },

    init: function () {
        this.log = window.log.getLogger('preparation-manager');
        this.log.setLevel('info');
        this.log.debug('Initializing preparation-manager');

        // Retrieve externalized state machine
        if (!window.preparationMachine) {
            this.log.error('preparationMachine is not defined on window! Make sure preparation-machine.js is loaded.');
            return;
        }
        this.preparationMachine = window.preparationMachine;

        // Actor Lifecycle
        this.gameActor = createActor(this.preparationMachine);
        this.gameActor.subscribe((state) => {
            this.log.debug(`Game State changed: ${state.value}`);
            this.el.emit('game-state-changed', {
                state: state.value,
                context: state.context
            });
        });

        this.gameActor.start();

        if (this.data.autoStart) {
            this.el.addEventListener('loaded', () => {
                this.gameActor.send({ type: 'START_GAME' });
            });
        }
    },

    sendEvent: function (eventName, eventData = {}) {
        if (!this.gameActor) return;

        // Check for invalid gestures before sending
        if (eventName === 'GESTURE_TICK') {
            const state = this.gameActor.getSnapshot();
            const { gesture, chefId } = eventData;

            // Check if this gesture is valid for the current state
            const isValid = this.isValidGesture(state.value, state.context, gesture, chefId);
            if (!isValid && chefId) {
                // Emit invalid gesture event for UI feedback only if station has an ingredient
                const stations = state.context.stations;
                const station = stations.find(s => s.chefId === chefId);

                if (station && station.ingredientId) {
                    const stationId = station.stationId;
                    this.log.warn(`Invalid gesture: ${gesture} from ${chefId} at station ${stationId}`);

                    // Emit on scene so all components hear it
                    const scene = document.querySelector('a-scene');
                    if (scene) {
                        scene.dispatchEvent(new CustomEvent('invalid-gesture', {
                            detail: { stationId, chefId, gesture }
                        }));
                    }
                }
                return; // Don't send invalid gesture to state machine
            }
        }

        this.gameActor.send({ type: eventName, ...eventData });
    },

    isValidGesture: function (state, context, gesture, chefId) {
        // Check ingredient gestures at stations
        const stations = context.stations;
        for (let i = 0; i < stations.length; i++) {
            const station = stations[i];
            if (!station.ingredientId) continue;
            if (station.chefId !== chefId) continue;

            const currentGesture = station.gesturesRequired[station.currentGestureIndex];
            if (currentGesture && gesture === currentGesture.gesture) {
                return true;
            }
        }

        // Check final stir gesture (only valid in readyForFinalStir state)
        if (state === 'readyForFinalStir' && context.currentOrder && context.currentOrder.finalStep) {
            if (gesture === context.currentOrder.finalStep.gesture) {
                return true;
            }
        }

        return false;
    },

    remove: function () {
        if (this.gameActor) {
            this.gameActor.stop();
        }
    }
});
