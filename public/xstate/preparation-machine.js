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
const { createMachine, assign } = _XState;

function allIngredientsReady(ingredients) {
    return ingredients.every(ing => ing.completed);
}

function findEmptyStation(stations) {
    return stations.findIndex(s => !s.ingredientId && s.chefId);
}

function findStationByGesture(stations, gesture, chefId) {
    return stations.findIndex(s => {
        if (!s.ingredientId) return false;
        if (s.chefId !== chefId) return false;
        const currentGesture = s.gesturesRequired[s.currentGestureIndex];
        return currentGesture && gesture === currentGesture.gesture;
    });
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
        // Sous-chef gesture tracking
        sousChefs: {
            1: { gesture: 'idle', confidence: 0, isHolding: false },
            2: { gesture: 'idle', confidence: 0, isHolding: false },
            3: { gesture: 'idle', confidence: 0, isHolding: false }
        },
        activeGestureChef: null
    },
    states: {
        idle: {
            on: { START_GAME: 'waitingForRecipe' }
        },
        waitingForRecipe: {
            on: {
                CAPTURE_RECIPE: { target: 'preparingIngredients', actions: 'initializeRecipe' },
                SET_ACTIVE_CHEFS: { actions: 'setActiveChefs' },
                GAME_OVER: 'gameOver'
            }
        },
        preparingIngredients: {
            on: {
                GESTURE_TICK: [
                    { guard: 'isIngredientGestureComplete', actions: ['incrementIngredientProgress', 'moveToDeliveryArea', 'deliverNextIngredient'], target: 'checkIfAllReady' },
                    { guard: 'isValidIngredientGesture', actions: 'incrementIngredientProgress' }
                ],
                STOP_GESTURE: { actions: 'handleStopGesture' },
                // Sous-chef gesture events (from MQTT adapter)
                SOUS_CHEF_GESTURE_START: { actions: 'handleSousChefGestureStart' },
                SOUS_CHEF_GESTURE_TICK: [
                    { guard: 'isIngredientGestureComplete', actions: ['incrementIngredientProgress', 'updateSousChefGesture', 'moveToDeliveryArea', 'deliverNextIngredient'], target: 'checkIfAllReady' },
                    { guard: 'isValidIngredientGesture', actions: ['incrementIngredientProgress', 'updateSousChefGesture'] }
                ],
                SOUS_CHEF_GESTURE_STOP: { actions: ['handleStopGesture', 'clearSousChefGesture'] },
                STEP_TIMEOUT: 'orderPenalized',
                CANCEL_ORDER: 'orderPenalized',
                SET_ACTIVE_CHEFS: { actions: 'setActiveChefs' },
                GAME_OVER: 'gameOver'
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
                    { guard: 'isFinalStirComplete', actions: 'completeFinalStir', target: 'recipeReadyForSubmit' },
                    { guard: 'isValidFinalStir', actions: 'incrementStirProgress' }
                ],
                // Sous-chef gesture events (synchronized stir)
                SOUS_CHEF_GESTURE_START: { actions: ['handleSousChefGestureStart', 'updateSousChefGesture'] },
                SOUS_CHEF_GESTURE_TICK: [
                    { guard: 'isFinalStirComplete', actions: ['incrementStirProgress', 'updateSousChefGesture'], target: 'recipeReadyForSubmit' },
                    { guard: 'isValidFinalStir', actions: ['incrementStirProgress', 'updateSousChefGesture'] }
                ],
                SOUS_CHEF_GESTURE_STOP: { actions: 'clearSousChefGesture' },
                CANCEL_ORDER: 'orderPenalized',
                SET_ACTIVE_CHEFS: { actions: 'setActiveChefs' },
                GAME_OVER: 'gameOver'
            }
        },
        recipeReadyForSubmit: {
            on: {
                SUBMIT_RECIPE: [
                    { guard: 'dishMatches', target: 'orderSuccess', actions: 'validateRecipe' },
                    { target: 'orderPenalized', actions: 'validateRecipe' }
                ],
                CANCEL_ORDER: 'orderPenalized',
                SET_ACTIVE_CHEFS: { actions: 'setActiveChefs' },
                GAME_OVER: 'gameOver'
            }
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
        initializeRecipe: assign(({ event, context }) => {
            const recipe = (event.recipe && event.recipe.ingredientSequences) ? event.recipe : RECIPES[Math.floor(Math.random() * RECIPES.length)];
            getLogger().info('Recipe Captured:', recipe.name);

            const ingredientIds = Object.keys(recipe.ingredientSequences);
            const stations = [];

            // Create 3 stations, assign chefs to first N based on activeChefsCount
            for (let i = 0; i < 3; i++) {
                const chefId = i < context.activeChefsCount ? `chef-${i + 1}` : null;
                stations.push({
                    stationId: `S${i + 1}`,
                    chefId,
                    ingredientId: null,
                    ingredientType: null,
                    gesturesRequired: [],
                    currentGestureIndex: 0,
                    progress: 0
                });
            }

            const ingredients = ingredientIds.map(id => ({
                id,
                type: id.split('-')[0],
                gesturesRequired: recipe.ingredientSequences[id],
                currentGestureIndex: 0,
                progress: 0,
                completed: false
            }));

            let ingredientQueue = ingredientIds.slice();

            // Deliver initial batch of ingredients to stations with chefs assigned
            for (let i = 0; i < stations.length && ingredientQueue.length > 0; i++) {
                if (stations[i].chefId) {
                    const ingredientId = ingredientQueue.shift();
                    const gesturesRequired = recipe.ingredientSequences[ingredientId];
                    stations[i] = {
                        ...stations[i],
                        ingredientId,
                        ingredientType: ingredientId.split('-')[0],
                        gesturesRequired,
                        currentGestureIndex: 0,
                        progress: 0
                    };
                }
            }

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

            const nextIngredientId = context.ingredientQueue.shift();
            const recipe = context.currentOrder;
            const gesturesRequired = recipe.ingredientSequences[nextIngredientId];

            const updatedStations = [...context.stations];
            updatedStations[emptyStationIdx] = {
                ...updatedStations[emptyStationIdx],
                ingredientId: nextIngredientId,
                ingredientType: nextIngredientId.split('-')[0],
                gesturesRequired,
                currentGestureIndex: 0,
                progress: 0
            };

            return { stations: updatedStations };
        }),
        incrementIngredientProgress: assign(({ context, event }) => {
            // Map sous-chef ID to chef ID for lookup
            const chefId = event.chefId || `chef-${event.sousChef}`;
            const stationIdx = findStationByGesture(context.stations, event.gesture, chefId);
            if (stationIdx === -1) return {};

            const amount = event.progressAmount !== undefined ? event.progressAmount : 10;
            const updatedStations = [...context.stations];
            updatedStations[stationIdx].progress = Math.min(100, updatedStations[stationIdx].progress + amount);

            return { stations: updatedStations };
        }),
        moveToDeliveryArea: assign(({ context, event }) => {
            // Map sous-chef ID to chef ID for lookup
            const chefId = event.chefId || `chef-${event.sousChef}`;
            const stationIdx = findStationByGesture(context.stations, event.gesture, chefId);
            if (stationIdx === -1) return {};

            const station = context.stations[stationIdx];
            const ingredientId = station.ingredientId;

            const updatedIngredients = context.ingredients.map(i =>
                i.id === ingredientId ? { ...i, completed: true } : i
            );

            const updatedStations = [...context.stations];
            updatedStations[stationIdx] = {
                ...updatedStations[stationIdx],
                ingredientId: null,
                gesturesRequired: [],
                currentGestureIndex: 0,
                progress: 0
            };

            return { stations: updatedStations, ingredients: updatedIngredients };
        }),
        handleStopGesture: assign(({ context, event }) => {
            let stationIdx = -1;
            // Map sous-chef ID to chef ID for lookup
            const chefId = event.chefId || `chef-${event.sousChef}`;

            // If gesture is specified, find station with that gesture
            if (event.gesture) {
                stationIdx = findStationByGesture(context.stations, event.gesture, chefId);
            } else {
                // Otherwise, find first station with this chef that has progress > 0
                stationIdx = context.stations.findIndex(s => s.chefId === chefId && s.progress > 0);
            }

            if (stationIdx === -1) return {};

            const station = context.stations[stationIdx];
            const currentGesture = station.gesturesRequired[station.currentGestureIndex];

            if (currentGesture && currentGesture.behaviorType === 'uninterruptible') {
                const updatedStations = [...context.stations];
                updatedStations[stationIdx] = { ...updatedStations[stationIdx], progress: 0 };
                return { stations: updatedStations };
            }
            return {};
        }),
        incrementStirProgress: assign(({ context, event }) => {
            const amount = event.progressAmount !== undefined ? event.progressAmount : 10;
            return { stirProgress: Math.min(100, context.stirProgress + amount) };
        }),
        completeFinalStir: assign(() => ({
            stirProgress: 0
        })),
        validateRecipe: assign(({ context }) => {
            if (!context.currentOrder) return {};

            const recipeIngredients = Object.keys(context.currentOrder.ingredientSequences);
            const allPrepared = recipeIngredients.every(id =>
                context.ingredients.find(i => i.id === id)?.completed
            );

            return { recipeValidationResult: allPrepared };
        }),
        incrementScore: assign(({ context }) => ({ score: context.score + 100 })),
        incrementSuccessCount: assign(({ context }) => ({ completedCount: context.completedCount + 1 })),
        applyPenalty: assign(({ context }) => ({ score: Math.max(0, context.score - 50) })),
        incrementPenalizedCount: assign(({ context }) => ({ penalizedCount: context.penalizedCount + 1 })),
        // Sous-chef gesture actions
        handleSousChefGestureStart: assign(({ context, event }) => ({
            sousChefs: {
                ...context.sousChefs,
                [event.sousChef]: {
                    ...context.sousChefs[event.sousChef],
                    gesture: event.gesture,
                    isHolding: true
                }
            },
            activeGestureChef: event.sousChef
        })),
        updateSousChefGesture: assign(({ context, event }) => ({
            sousChefs: {
                ...context.sousChefs,
                [event.sousChef]: {
                    ...context.sousChefs[event.sousChef],
                    gesture: event.gesture,
                    confidence: event.confidence || 0.8
                }
            }
        })),
        clearSousChefGesture: assign(({ context, event }) => ({
            sousChefs: {
                ...context.sousChefs,
                [event.sousChef]: {
                    ...context.sousChefs[event.sousChef],
                    gesture: 'idle',
                    isHolding: false
                }
            },
            activeGestureChef: null
        }))
    },
    guards: {
        isValidIngredientGesture: ({ context, event }) => {
            // Map sous-chef ID to chef ID for lookup
            const chefId = event.chefId || `chef-${event.sousChef}`;
            return findStationByGesture(context.stations, event.gesture, chefId) !== -1;
        },
        isIngredientGestureComplete: ({ context, event }) => {
            // Map sous-chef ID to chef ID for lookup
            const chefId = event.chefId || `chef-${event.sousChef}`;
            const stationIdx = findStationByGesture(context.stations, event.gesture, chefId);
            if (stationIdx === -1) return false;

            const station = context.stations[stationIdx];
            const currentGesture = station.gesturesRequired[station.currentGestureIndex];
            if (!currentGesture || event.gesture !== currentGesture.gesture) return false;

            const amount = event.progressAmount !== undefined ? event.progressAmount : 10;
            const newProgress = station.progress + amount;

            if (newProgress >= 100) {
                const isLastGesture = station.currentGestureIndex === station.gesturesRequired.length - 1;
                return isLastGesture;
            }
            return false;
        },
        allIngredientsReady: ({ context }) => {
            return allIngredientsReady(context.ingredients);
        },
        isValidFinalStir: ({ context, event }) => {
            return event.gesture === context.currentOrder.finalStep.gesture;
        },
        isFinalStirComplete: ({ context, event }) => {
            if (event.gesture !== context.currentOrder.finalStep.gesture) return false;
            const amount = event.progressAmount !== undefined ? event.progressAmount : 10;
            return (context.stirProgress + amount) >= 100;
        },
        dishMatches: ({ context }) => {
            if (!context.currentOrder) return false;
            const recipeIngredients = Object.keys(context.currentOrder.ingredientSequences);
            return recipeIngredients.every(id =>
                context.ingredients.find(i => i.id === id)?.completed
            );
        }
    }
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { preparationMachine, RECIPES };
} else {
    window.preparationMachine = preparationMachine;
    window.RECIPES = RECIPES;
}
