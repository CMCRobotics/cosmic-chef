/**
 * preparation-machine.js
 * State machine definition for Cosmic Chef.
 * Supports both browser and Node/Bun test environments.
 */

const getLogger = () => {
    if (typeof window !== 'undefined' && window.log && typeof window.log.getLogger === 'function') {
        return window.log.getLogger('preparation-manager');
    }
    return {
        debug: () => {},
        info: (...args) => console.log('[Test Log Info]', ...args),
        warn: (...args) => console.warn('[Test Log Warn]', ...args),
        error: (...args) => console.error('[Test Log Error]', ...args)
    };
};

const _XState = typeof window !== 'undefined' && window.XState ? window.XState : require('xstate');
const { createMachine, assign } = _XState;

const preparationMachine = createMachine({
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
        selectNewOrder: assign(({ context }) => {
            const recipes = [
                { name: 'proton', formula: ['u', 'u', 'd'] },
                { name: 'neutron', formula: ['u', 'd', 'd'] },
                { name: 'pion π⁺', formula: ['u', 'd_anti'] }
            ];
            const index = Math.floor(Math.random() * recipes.length);
            const currentOrder = recipes[index];
            const currentIngredients = [];
            getLogger().info('New Order:', currentOrder.name);
            return { currentOrder, currentIngredients };
        }),
        addIngredient: assign(({ context, event }) => {
            const currentIngredients = [...context.currentIngredients, event.ingredient];
            getLogger().debug(`Added: ${event.ingredient}. Current:`, currentIngredients);
            return { currentIngredients };
        }),
        clearIngredients: assign(() => {
            getLogger().debug('Cleared ingredients.');
            return { currentIngredients: [] };
        }),
        incrementScore: assign(({ context }) => {
            const score = context.score + 100;
            getLogger().info(`Score: ${score}`);
            return { score };
        })
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

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { preparationMachine };
} else {
    window.preparationMachine = preparationMachine;
}
