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
        this.log.setLevel('debug');
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
        if (this.gameActor) {
            this.gameActor.send({ type: eventName, ...eventData });
        }
    },

    remove: function () {
        if (this.gameActor) {
            this.gameActor.stop();
        }
    }
});
