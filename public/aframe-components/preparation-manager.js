/**
 * preparation-manager.js
 * Game state management using XState v5.
 * Manages the core gameplay loop: order registration -> cooking -> evaluation -> serving.
 */

const { createActor } = XState;

AFRAME.registerComponent('preparation-manager', {
    init: function () {
        this.log = window.log.getLogger('preparation-manager');
        this.log.debug('Initializing preparation-manager');

        // Retrieve externalized state machine
        if (!window.preparationMachine) {
            this.log.error('preparationMachine is not defined on window! Make sure preparation-machine.js is loaded.');
            return;
        }

        // The game actor is owned here and only here. Other components read state from
        // 'game-state-changed' events and send events through send().
        this.gameActor = createActor(window.preparationMachine);
        this.gameActor.subscribe((state) => {
            this.log.info(`🎮 State: ${state.value}`);
            this.el.emit('game-state-changed', {
                state: state.value,
                context: state.context
            });
        });
        this.gameActor.on('invalid-gesture', ({ stationId, chefId, gesture }) => {
            this.log.warn(`Invalid gesture: ${gesture} from ${chefId} at station ${stationId}`);
            this.el.emit('invalid-gesture', { stationId, chefId, gesture }); 
        });

        this.gameActor.start();
    },

    send: function (event) {
        if (!this.gameActor) return;
        this.gameActor.send(event);
    },

    getSnapshot: function () {
        return this.gameActor ? this.gameActor.getSnapshot() : null;
    },

    remove: function () {
        if (this.gameActor) {
            this.gameActor.stop();
        }
    }
});
