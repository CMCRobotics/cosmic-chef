/**
 * preparation-machine.js
 * State machine definition for Cosmic Chef.
 */

const getLogger = () => {
    if (typeof window !== 'undefined' && window.log && typeof window.log.getLogger === 'function') {
        return window.log.getLogger('preparation-manager');
    }
    return {
        debug: () => {},
        info: (...args) => console.log('[Test Info]', ...args),
        warn: (...args) => console.warn('[Test Warn]', ...args)
    };
};

const _XState = typeof window !== 'undefined' && window.XState ? window.XState : require('xstate');
const { createMachine, assign } = _XState;

function isSynchronizedStep(step) {
    return !!step && step.stepType === 'synchronized';
}

function synchronizedChefIds(event) {
    return Array.isArray(event.chefIds) ? Array.from(new Set(event.chefIds)) : [];
}

const RECIPES = [
    {
        name: 'proton',
        composition: 'uud',
        charge: 1,
        steps: [
            { ingredient: 'up', gesture: 'tenderize', preparedState: 'Tender Up', behaviorType: 'resumable' },
            { ingredient: 'up', gesture: 'tenderize', preparedState: 'Tender Up', behaviorType: 'resumable' },
            { ingredient: 'down', gesture: 'slice', preparedState: 'Sliced Down', behaviorType: 'resumable' },
            { ingredient: null, gesture: 'stir', preparedState: null, behaviorType: 'resumable', stepType: 'synchronized' }
        ]
    },
    {
        name: 'neutron',
        composition: 'udd',
        charge: 0,
        steps: [
            { ingredient: 'up', gesture: 'tenderize', preparedState: 'Tender Up', behaviorType: 'resumable' },
            { ingredient: 'down', gesture: 'slice', preparedState: 'Sliced Down', behaviorType: 'resumable' },
            { ingredient: 'down', gesture: 'slice', preparedState: 'Sliced Down', behaviorType: 'resumable' },
            { ingredient: null, gesture: 'stir', preparedState: null, behaviorType: 'resumable', stepType: 'synchronized' }
        ]
    },
    {
        name: 'pion',
        composition: 'ud̄',
        charge: 1,
        steps: [
            { ingredient: 'up', gesture: 'tenderize', preparedState: 'Tender Up', behaviorType: 'resumable' },
            { ingredient: 'anti-down', gesture: 'stir', preparedState: 'Stirred Anti-Down', behaviorType: 'resumable' },
            { ingredient: null, gesture: 'stir', preparedState: null, behaviorType: 'resumable', stepType: 'synchronized' }
        ]
    },
    {
        name: 'lambda',
        composition: 'uds',
        charge: 0,
        steps: [
            { ingredient: 'up', gesture: 'tenderize', preparedState: 'Tender Up', behaviorType: 'resumable' },
            { ingredient: 'down', gesture: 'slice', preparedState: 'Sliced Down', behaviorType: 'resumable' },
            { ingredient: 'strange', gesture: 'stir', preparedState: 'Stirred Strange', behaviorType: 'resumable' },
            { ingredient: null, gesture: 'stir', preparedState: null, behaviorType: 'resumable', stepType: 'synchronized' }
        ]
    }
];

const preparationMachine = createMachine({
    id: 'cosmic-chef',
    initial: 'idle',
    context: {
        currentOrder: null,
        currentStepIndex: 0,
        stepProgress: 0,
        activeChefsCount: 1,
        lastChefId: null,
        score: 0,
        completedCount: 0,
        penalizedCount: 0
    },
    states: {
        idle: {
            on: { START_GAME: 'waitingForRecipe' }
        },
        waitingForRecipe: {
            on: {
                CAPTURE_RECIPE: { target: 'preparingComplexDish', actions: 'selectNewComplexRecipe' },
                SET_ACTIVE_CHEFS: { actions: 'setActiveChefs' },
                GAME_OVER: 'gameOver'
            }
        },
        preparingComplexDish: {
            on: {
                GESTURE_TICK: [
                    { guard: 'isStepComplete', target: 'evaluatingStep', actions: 'incrementStepProgress' },
                    { guard: 'isValidGestureAndChef', actions: 'incrementStepProgress' }
                ],
                STOP_GESTURE: { actions: 'handleStopGesture' },
                STEP_TIMEOUT: 'orderPenalized',
                CANCEL_ORDER: 'orderPenalized',
                SET_ACTIVE_CHEFS: { actions: 'setActiveChefs' },
                GAME_OVER: 'gameOver'
            }
        },
        evaluatingStep: {
            always: [
                { guard: 'hasMoreSteps', target: 'preparingComplexDish', actions: 'advanceStep' },
                { target: 'orderSuccess' }
            ]
        },
        orderSuccess: {
            entry: ['incrementScore', 'incrementSuccessCount'],
            on: {
                NEXT_ROUND: 'waitingForRecipe',
                SET_ACTIVE_CHEFS: { actions: 'setActiveChefs' },
                GAME_OVER: 'gameOver'
            }
        },
        orderPenalized: {
            entry: ['applyPenalty', 'incrementPenalizedCount'],
            on: {
                NEXT_ROUND: 'waitingForRecipe',
                SET_ACTIVE_CHEFS: { actions: 'setActiveChefs' },
                GAME_OVER: 'gameOver'
            }
        },
        gameOver: { type: 'final' }
    }
}, {
    actions: {
        setActiveChefs: assign(({ event }) => ({
            activeChefsCount: typeof event.count === 'number' ? event.count : 1
        })),
        selectNewComplexRecipe: assign(({ event }) => {
            const selectedRecipe = (event.recipe && event.recipe.steps) ? event.recipe : RECIPES[Math.floor(Math.random() * RECIPES.length)];
            getLogger().info('Recipe Captured:', selectedRecipe.name);
            return { currentOrder: selectedRecipe, currentStepIndex: 0, stepProgress: 0, lastChefId: null };
        }),
        incrementStepProgress: assign(({ context, event }) => {
            const amount = event.progressAmount !== undefined ? event.progressAmount : 10;
            return { stepProgress: Math.min(100, context.stepProgress + amount) };
        }),
        handleStopGesture: assign(({ context }) => {
            if (!context.currentOrder) return {};
            const currentStep = context.currentOrder.steps[context.currentStepIndex];
            if (currentStep && currentStep.behaviorType === 'uninterruptible') {
                return { stepProgress: 0 };
            }
            return {};
        }),
        advanceStep: assign(({ context, event }) => {
            const completedStep = context.currentOrder.steps[context.currentStepIndex];
            return {
                currentStepIndex: context.currentStepIndex + 1,
                stepProgress: 0,
                lastChefId: isSynchronizedStep(completedStep) ? null : (event.chefId || null)
            };
        }),
        incrementScore: assign(({ context }) => ({ score: context.score + 100 })),
        incrementSuccessCount: assign(({ context }) => ({ completedCount: context.completedCount + 1 })),
        applyPenalty: assign(({ context }) => ({ score: Math.max(0, context.score - 50) })),
        incrementPenalizedCount: assign(({ context }) => ({ penalizedCount: context.penalizedCount + 1 }))
    },
    guards: {
        isValidGestureAndChef: ({ context, event }) => {
            if (!context.currentOrder) return false;
            const step = context.currentOrder.steps[context.currentStepIndex];
            if (!step || event.gesture !== step.gesture) return false;

            if (isSynchronizedStep(step)) {
                return synchronizedChefIds(event).length >= context.activeChefsCount;
            }

            if (context.activeChefsCount > 1 && context.lastChefId !== null && event.chefId === context.lastChefId) {
                getLogger().warn(`Chef ${event.chefId} attempted consecutive step!`);
                return false;
            }
            return true;
        },
        isStepComplete: ({ context, event }) => {
            if (!context.currentOrder) return false;
            const step = context.currentOrder.steps[context.currentStepIndex];
            if (!step || event.gesture !== step.gesture) return false;
            const amount = event.progressAmount !== undefined ? event.progressAmount : 10;

            if (isSynchronizedStep(step)) {
                if (synchronizedChefIds(event).length < context.activeChefsCount) return false;
                return (context.stepProgress + amount) >= 100;
            }

            if (context.activeChefsCount > 1 && context.lastChefId !== null && event.chefId === context.lastChefId) return false;
            return (context.stepProgress + amount) >= 100;
        },
        hasMoreSteps: ({ context }) => {
            if (!context.currentOrder) return false;
            return (context.currentStepIndex + 1) < context.currentOrder.steps.length;
        }
    }
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { preparationMachine, RECIPES };
} else {
    window.preparationMachine = preparationMachine;
}
