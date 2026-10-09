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
    };
};

const _XState = typeof window !== 'undefined' && window.XState ? window.XState : require('xstate');
const { createMachine, assign, emit } = _XState;

const STATION_COUNT = 3;

function allIngredientsReady(ingredients) {
    return ingredients.every(ing => ing.completed);
}

// 'anti-down-1' -> 'anti-down'
function ingredientTypeOf(ingredientId) {
    return ingredientId.replace(/-\d+$/, '');
}

function currentGestureOf(station) {
    return station.gesturesRequired[station.currentGestureIndex];
}

function findEmptyStation(stations) {
    return stations.findIndex(s => !s.ingredientId && s.chefId);
}

function findStationByGesture(stations, gesture, chefId) {
    return stations.findIndex(s => {
        if (!s.ingredientId) return false;
        if (s.chefId !== chefId) return false;
        const currentGesture = currentGestureOf(s);
        return currentGesture && gesture === currentGesture.gesture;
    });
}

function loadStation(station, recipe, ingredientId) {
    return {
        ...station,
        ingredientId,
        ingredientType: ingredientTypeOf(ingredientId),
        gesturesRequired: recipe.ingredientSequences[ingredientId],
        currentGestureIndex: 0,
        progress: 0
    };
}

function clearStation(station) {
    return {
        ...station,
        ingredientId: null,
        ingredientType: null,
        gesturesRequired: [],
        currentGestureIndex: 0,
        progress: 0
    };
}

function progressAmountOf(event) {
    return event.progressAmount !== undefined ? event.progressAmount : 10;
}

const RECIPES = [
    {
        name: 'proton',
        composition: 'uud',
        charge: 1,
        ingredientSequences: {
            'up-1': [{ gesture: 'tenderize', preparedState: 'Tender Up', behaviorType: 'resumable' }],
            'up-2': [{ gesture: 'tenderize', preparedState: 'Tender Up', behaviorType: 'resumable' }],
            'down-1': [{ gesture: 'slice', preparedState: 'Sliced Down', behaviorType: 'resumable' }]
        },
        finalStep: { gesture: 'stir', preparedState: null, behaviorType: 'resumable', stepType: 'synchronized' }
    },
    {
        name: 'neutron',
        composition: 'udd',
        charge: 0,
        ingredientSequences: {
            'up-1': [{ gesture: 'tenderize', preparedState: 'Tender Up', behaviorType: 'resumable' }],
            'down-1': [{ gesture: 'slice', preparedState: 'Sliced Down', behaviorType: 'resumable' }],
            'down-2': [{ gesture: 'slice', preparedState: 'Sliced Down', behaviorType: 'resumable' }]
        },
        finalStep: { gesture: 'stir', preparedState: null, behaviorType: 'resumable', stepType: 'synchronized' }
    },
    {
        name: 'pion',
        composition: 'ud̄',
        charge: 1,
        ingredientSequences: {
            'up-1': [{ gesture: 'tenderize', preparedState: 'Tender Up', behaviorType: 'resumable' }],
            'anti-down-1': [{ gesture: 'stir', preparedState: 'Stirred Anti-Down', behaviorType: 'resumable' }]
        },
        finalStep: { gesture: 'stir', preparedState: null, behaviorType: 'resumable', stepType: 'synchronized' }
    },
    {
        name: 'lambda',
        composition: 'uds',
        charge: 0,
        ingredientSequences: {
            'up-1': [{ gesture: 'tenderize', preparedState: 'Tender Up', behaviorType: 'resumable' }],
            'down-1': [{ gesture: 'slice', preparedState: 'Sliced Down', behaviorType: 'resumable' }],
            'strange-1': [{ gesture: 'stir', preparedState: 'Stirred Strange', behaviorType: 'resumable' }]
        },
        finalStep: { gesture: 'stir', preparedState: null, behaviorType: 'resumable', stepType: 'synchronized' }
    }
];

/**
 * Events (one vocabulary for every input source):
 *   GESTURE_START { chefId, gesture }
 *   GESTURE_TICK  { chefId, gesture, progressAmount? }  (chefId optional for the final stir)
 *   GESTURE_STOP  { chefId }
 *   CAPTURE_RECIPE { recipe }, SUBMIT_RECIPE, CANCEL_ORDER, STEP_TIMEOUT,
 *   NEXT_ROUND, SET_ACTIVE_CHEFS { count }, GAME_OVER
 *
 * Emitted: 'invalid-gesture' { stationId, chefId, gesture } when a chef with an
 * ingredient performs the wrong gesture.
 */
const preparationMachine = createMachine({
    id: 'cosmic-chef',
    initial: 'waitingForRecipe',
    context: {
        currentOrder: null,
        activeChefsCount: 3,
        stations: [],
        ingredientQueue: [],
        ingredients: [],
        stirProgress: 0,
        score: 0,
        completedCount: 0,
        penalizedCount: 0,
        // chefId -> gesture currently performed ('idle' when not gesturing)
        chefGestures: {}
    },
    on: {
        GESTURE_START: { actions: 'setChefGesture' },
        GESTURE_STOP: { actions: 'clearChefGesture' },
        SET_ACTIVE_CHEFS: { actions: 'setActiveChefs' },
        GAME_OVER: '.gameOver'
    },
    states: {
        waitingForRecipe: {
            on: {
                CAPTURE_RECIPE: { target: 'preparingIngredients', actions: 'initializeRecipe' }
            }
        },
        preparingIngredients: {
            on: {
                GESTURE_TICK: [
                    { guard: 'isIngredientGestureComplete', actions: ['setChefGesture', 'incrementIngredientProgress', 'moveToDeliveryArea', 'deliverNextIngredient'], target: 'checkIfAllReady' },
                    { guard: 'isValidIngredientGesture', actions: ['setChefGesture', 'incrementIngredientProgress'] },
                    { guard: 'chefHasIngredient', actions: 'emitInvalidGesture' }
                ],
                GESTURE_STOP: { actions: ['handleStopGesture', 'clearChefGesture'] },
                STEP_TIMEOUT: 'orderPenalized',
                CANCEL_ORDER: 'orderPenalized'
            }
        },
        checkIfAllReady: {
            always: [
                { guard: 'allIngredientsReady', target: 'readyForFinalStir' },
                { target: 'preparingIngredients' }
            ]
        },
        readyForFinalStir: {
            on: {
                GESTURE_TICK: [
                    { guard: 'isFinalStirComplete', actions: ['setChefGesture', 'completeFinalStir'], target: 'recipeReadyForSubmit' },
                    { guard: 'isValidFinalStir', actions: ['setChefGesture', 'incrementStirProgress'] }
                ],
                CANCEL_ORDER: 'orderPenalized'
            }
        },
        recipeReadyForSubmit: {
            on: {
                SUBMIT_RECIPE: [
                    { guard: 'dishMatches', target: 'orderSuccess' },
                    { target: 'orderPenalized' }
                ],
                CANCEL_ORDER: 'orderPenalized'
            }
        },
        orderSuccess: {
            entry: ['incrementScore', 'incrementSuccessCount'],
            on: { NEXT_ROUND: { target: 'waitingForRecipe', actions: 'resetRecipeState' } }
        },
        orderPenalized: {
            entry: ['applyPenalty', 'incrementPenalizedCount'],
            on: { NEXT_ROUND: { target: 'waitingForRecipe', actions: 'resetRecipeState' } }
        },
        gameOver: { type: 'final' }
    }
}, {
    actions: {
        setActiveChefs: assign(({ event }) => ({
            activeChefsCount: typeof event.count === 'number' ? event.count : 1
        })),
        resetRecipeState: assign(({ context }) => ({
            currentOrder: null,
            stations: context.stations.map(station => clearStation({ stationId: station.stationId, chefId: station.chefId })),
            ingredients: [],
            ingredientQueue: [],
            stirProgress: 0
        })),
        initializeRecipe: assign(({ event, context }) => {
            getLogger().info('initializeRecipe called with event.recipe:', event.recipe);
            const hasIngredients = event.recipe && event.recipe.ingredientSequences;
            getLogger().info('Has ingredientSequences?', hasIngredients);
            const recipe = hasIngredients ? event.recipe : RECIPES[Math.floor(Math.random() * RECIPES.length)];
            getLogger().info('Recipe Captured:', recipe.name, '| From crate?', hasIngredients);

            const ingredientIds = Object.keys(recipe.ingredientSequences);
            const ingredientQueue = ingredientIds.slice();

            // Assign chefs to the first N stations, and deliver the initial batch to them
            const stations = [];
            for (let i = 0; i < STATION_COUNT; i++) {
                const chefId = i < context.activeChefsCount ? `chef-${i + 1}` : null;
                const station = clearStation({ stationId: `S${i + 1}`, chefId });
                stations.push(chefId && ingredientQueue.length > 0
                    ? loadStation(station, recipe, ingredientQueue.shift())
                    : station);
            }

            const ingredients = ingredientIds.map(id => ({
                id,
                type: ingredientTypeOf(id),
                completed: false
            }));

            return {
                currentOrder: recipe,
                stations,
                ingredientQueue,
                ingredients,
                stirProgress: 0
            };
        }),
        deliverNextIngredient: assign(({ context }) => {
            if (context.ingredientQueue.length === 0) return {};

            const emptyStationIdx = findEmptyStation(context.stations);
            if (emptyStationIdx === -1) return {};

            const [nextIngredientId, ...remainingQueue] = context.ingredientQueue;
            const stations = context.stations.map((s, i) =>
                i === emptyStationIdx ? loadStation(s, context.currentOrder, nextIngredientId) : s
            );

            return { stations, ingredientQueue: remainingQueue };
        }),
        incrementIngredientProgress: assign(({ context, event }) => {
            const stationIdx = findStationByGesture(context.stations, event.gesture, event.chefId);
            if (stationIdx === -1) return {};

            const stations = context.stations.map((s, i) => {
                if (i !== stationIdx) return s;
                const progress = Math.min(100, s.progress + progressAmountOf(event));
                const isLastGesture = s.currentGestureIndex === s.gesturesRequired.length - 1;
                // A finished intermediate gesture hands over to the next one in the sequence
                if (progress >= 100 && !isLastGesture) {
                    return { ...s, currentGestureIndex: s.currentGestureIndex + 1, progress: 0 };
                }
                return { ...s, progress };
            });

            return { stations };
        }),
        moveToDeliveryArea: assign(({ context, event }) => {
            const stationIdx = findStationByGesture(context.stations, event.gesture, event.chefId);
            if (stationIdx === -1) return {};

            const ingredientId = context.stations[stationIdx].ingredientId;

            return {
                stations: context.stations.map((s, i) => i === stationIdx ? clearStation(s) : s),
                ingredients: context.ingredients.map(i =>
                    i.id === ingredientId ? { ...i, completed: true } : i
                )
            };
        }),
        handleStopGesture: assign(({ context, event }) => {
            // If gesture is specified, find station with that gesture,
            // otherwise the first station with this chef that has progress > 0
            const stationIdx = event.gesture
                ? findStationByGesture(context.stations, event.gesture, event.chefId)
                : context.stations.findIndex(s => s.chefId === event.chefId && s.progress > 0);
            if (stationIdx === -1) return {};

            const currentGesture = currentGestureOf(context.stations[stationIdx]);
            if (!currentGesture || currentGesture.behaviorType !== 'uninterruptible') return {};

            return {
                stations: context.stations.map((s, i) => i === stationIdx ? { ...s, progress: 0 } : s)
            };
        }),
        incrementStirProgress: assign(({ context, event }) => ({
            stirProgress: Math.min(100, context.stirProgress + progressAmountOf(event))
        })),
        completeFinalStir: assign(() => ({
            stirProgress: 0
        })),
        incrementScore: assign(({ context }) => ({ score: context.score + 100 })),
        incrementSuccessCount: assign(({ context }) => ({ completedCount: context.completedCount + 1 })),
        applyPenalty: assign(({ context }) => ({ score: Math.max(0, context.score - 50) })),
        incrementPenalizedCount: assign(({ context }) => ({ penalizedCount: context.penalizedCount + 1 })),
        setChefGesture: assign(({ context, event }) => {
            if (!event.chefId) return {};
            return { chefGestures: { ...context.chefGestures, [event.chefId]: event.gesture } };
        }),
        clearChefGesture: assign(({ context, event }) => ({
            chefGestures: { ...context.chefGestures, [event.chefId]: 'idle' }
        })),
        emitInvalidGesture: emit(({ context, event }) => ({
            type: 'invalid-gesture',
            stationId: context.stations.find(s => s.chefId === event.chefId).stationId,
            chefId: event.chefId,
            gesture: event.gesture
        }))
    },
    guards: {
        isValidIngredientGesture: ({ context, event }) => {
            return findStationByGesture(context.stations, event.gesture, event.chefId) !== -1;
        },
        isIngredientGestureComplete: ({ context, event }) => {
            const stationIdx = findStationByGesture(context.stations, event.gesture, event.chefId);
            if (stationIdx === -1) return false;

            const station = context.stations[stationIdx];
            const isLastGesture = station.currentGestureIndex === station.gesturesRequired.length - 1;
            return isLastGesture && station.progress + progressAmountOf(event) >= 100;
        },
        chefHasIngredient: ({ context, event }) => {
            return context.stations.some(s => s.chefId === event.chefId && s.ingredientId);
        },
        allIngredientsReady: ({ context }) => {
            return allIngredientsReady(context.ingredients);
        },
        isValidFinalStir: ({ context, event }) => {
            return event.gesture === context.currentOrder.finalStep.gesture;
        },
        isFinalStirComplete: ({ context, event }) => {
            if (event.gesture !== context.currentOrder.finalStep.gesture) return false;
            return (context.stirProgress + progressAmountOf(event)) >= 100;
        },
        dishMatches: ({ context }) => {
            if (!context.currentOrder) return false;
            return allIngredientsReady(context.ingredients);
        }
    }
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { preparationMachine, RECIPES };
} else {
    window.preparationMachine = preparationMachine;
    window.RECIPES = RECIPES;
}
