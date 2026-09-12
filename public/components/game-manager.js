/**
 * game-manager.js
 * Game state management using XState v5.
 * Manages the core gameplay loop: order registration -> cooking -> evaluation -> serving.
 */

const { createMachine, createActor } = XState;

AFRAME.registerComponent('game-manager', {
    schema: {
        autoStart: { type: 'boolean', default: true }
    },

    init: function () {
        this.log = window.log.getLogger('game-manager');
        this.log.setLevel('debug');
        this.log.debug('Initializing game-manager');

        // State Machine
        this.gameMachine = createMachine({
            id: 'cosmic-chef',
            initial: 'idle',
            context: {
                currentOrder: null,
                currentIngredients: [],
                score: 0
            },
            states: {
                idle: {
                    on: { START_GAME: 'orderRequested' }
                },
                orderRequested: {
                    entry: 'selectNewOrder',
                    on: { ORDER_ACCEPTED: 'cooking' }
                },
                cooking: {
                    on: {
                        ADD_INGREDIENT: { actions: 'addIngredient' },
                        CLEAR_KITCHEN: { actions: 'clearIngredients' },
                        SUBMIT_DISH: 'evaluating'
                    }
                },
                evaluating: {
                    always: [
                        { guard: 'isValidDish', target: 'serving' },
                        { target: 'roundFailed' }
                    ]
                },
                serving: {
                    on: { SERVING_COMPLETE: 'roundSuccess' }
                },
                roundSuccess: {
                    entry: 'incrementScore',
                    on: { NEXT_ROUND: 'orderRequested' }
                },
                roundFailed: {
                    on: {
                        RETRY: 'cooking',
                        NEXT_ROUND: 'orderRequested' }
                }
            }
        }, {
            actions: {
                selectNewOrder: ({ context }) => {
                    const recipes = [
                        { name: 'proton', formula: ['u', 'u', 'd'] },
                        { name: 'neutron', formula: ['u', 'd', 'd'] },
                        { name: 'pion π⁺', formula: ['u', 'd_anti'] }
                    ];
                    const index = Math.floor(Math.random() * recipes.length);
                    context.currentOrder = recipes[index];
                    context.currentIngredients = [];
                    this.log.info('New Order:', context.currentOrder.name);
                },
                addIngredient: ({ context, event }) => {
                    context.currentIngredients.push(event.ingredient);
                    this.log.debug(`Added: ${event.ingredient}. Current:`, context.currentIngredients);
                },
                clearIngredients: ({ context }) => {
                    context.currentIngredients = [];
                    this.log.debug('Cleared ingredients.');
                },
                incrementScore: ({ context }) => {
                    context.score += 100;
                    this.log.info(`Score: ${context.score}`);
                }
            },
            guards: {
                isValidDish: ({ context }) => {
                    if (!context.currentOrder) return false;
                    const needed = [...context.currentOrder.formula].sort();
                    const got = [...context.currentIngredients].sort();
                    return needed.length === got.length && needed.every((v, i) => v === got[i]);
                }
            }
        });

        // Actor Lifecycle
        this.gameActor = createActor(this.gameMachine);
        this.gameActor.subscribe((state) => {
            this.log.debug(`State changed: ${state.value}`);
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
