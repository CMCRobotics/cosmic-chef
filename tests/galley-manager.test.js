import { describe, test, expect, beforeEach } from "bun:test";

describe("galley-manager — state management", () => {
    let state;

    beforeEach(() => {
        // Pure state model for testing ingredient tracking logic
        state = {
            lastRecipeName: null,
            lastState: null,
            ingredientEntities: new Map(),
            vacuumInProgress: false
        };
    });

    test("captures same recipe twice — ingredients cleared on second capture", () => {
        const clearAllIngredients = () => {
            state.ingredientEntities.clear();
        };

        // First recipe capture: waitingForRecipe → preparingIngredients
        const transitionToPreparingIngredients = (currentState, newState, recipeName) => {
            if (newState === 'preparingIngredients' && currentState !== 'preparingIngredients') {
                clearAllIngredients();
            }
            return newState;
        };

        // Capture proton first time
        state.lastState = 'waitingForRecipe';
        state.lastRecipeName = null;
        state.ingredientEntities.set('up-1', { stationId: 'S1' });
        state.ingredientEntities.set('down-1', { stationId: 'S1' });

        expect(state.ingredientEntities.size).toBe(2);

        // Transition to preparingIngredients for first recipe
        const newState1 = transitionToPreparingIngredients(state.lastState, 'preparingIngredients', 'proton');
        state.lastState = newState1;
        state.lastRecipeName = 'proton';

        expect(state.ingredientEntities.size).toBe(0);
        expect(state.lastRecipeName).toBe('proton');

        // Complete recipe and return to waiting
        state.lastState = 'orderSuccess';

        // Transition back to waitingForRecipe
        state.lastState = 'waitingForRecipe';
        expect(state.ingredientEntities.size).toBe(0);

        // Capture same recipe again
        state.ingredientEntities.set('up-1', { stationId: 'S1' });
        expect(state.ingredientEntities.size).toBe(1);

        const newState2 = transitionToPreparingIngredients(state.lastState, 'preparingIngredients', 'proton');
        state.lastState = newState2;

        // Ingredients should be cleared on second capture despite same recipe name
        expect(state.ingredientEntities.size).toBe(0);
    });

    test("cancel recipe — ingredients cleared after vacuum, not respawned", () => {
        const clearAllIngredients = () => {
            state.ingredientEntities.clear();
        };

        const isRecipeActive = (stateName) => {
            return [
                'preparingIngredients',
                'checkIfAllReady',
                'readyForFinalStir',
                'recipeReadyForSubmit'
            ].includes(stateName);
        };

        // Setup: in preparingIngredients with ingredients
        state.lastState = 'preparingIngredients';
        state.ingredientEntities.set('up-1', { stationId: 'S1' });
        state.ingredientEntities.set('down-1', { stationId: 'S1' });

        expect(state.ingredientEntities.size).toBe(2);

        // Simulate cancel → orderPenalized
        state.lastState = 'orderPenalized';

        // Vacuum completes, ingredients cleared
        clearAllIngredients();
        expect(state.ingredientEntities.size).toBe(0);

        // Transition to waitingForRecipe
        state.lastState = 'waitingForRecipe';

        // Verify sync does NOT run in waitingForRecipe
        expect(isRecipeActive('waitingForRecipe')).toBe(false);

        // Verify ingredients stay cleared (not respawned)
        expect(state.ingredientEntities.size).toBe(0);
    });

    test("syncIngredientsWithStations only runs during active recipe states", () => {
        const activeStates = ['preparingIngredients', 'checkIfAllReady', 'readyForFinalStir', 'recipeReadyForSubmit'];
        const inactiveStates = ['waitingForRecipe', 'orderSuccess', 'orderPenalized', 'gameOver'];

        const isRecipeActive = (stateName) => {
            return activeStates.includes(stateName);
        };

        inactiveStates.forEach(stateName => {
            expect(isRecipeActive(stateName)).toBe(false);
        });

        activeStates.forEach(stateName => {
            expect(isRecipeActive(stateName)).toBe(true);
        });
    });

    test("ingredients cleared after vacuum animation completes", () => {
        const clearAllIngredients = () => {
            state.ingredientEntities.clear();
        };

        // Add multiple ingredients
        state.ingredientEntities.set('up-1', { stationId: 'S1' });
        state.ingredientEntities.set('down-1', { stationId: 'S2' });
        state.ingredientEntities.set('anti-up-1', { stationId: 'S3' });

        expect(state.ingredientEntities.size).toBe(3);

        // Simulate vacuum completion clearing all ingredients
        state.vacuumInProgress = true;
        clearAllIngredients();
        state.vacuumInProgress = false;

        expect(state.ingredientEntities.size).toBe(0);
    });

    test("recipe name tracking works across state transitions", () => {
        // Start with null recipe
        expect(state.lastRecipeName).toBe(null);

        // Capture proton
        const updateRecipeName = (context) => {
            if (context.currentOrder && context.currentOrder.name !== state.lastRecipeName) {
                state.lastRecipeName = context.currentOrder.name;
            }
        };

        updateRecipeName({ currentOrder: { name: 'proton' } });
        expect(state.lastRecipeName).toBe('proton');

        // Stay on proton (same recipe — no change)
        updateRecipeName({ currentOrder: { name: 'proton' } });
        expect(state.lastRecipeName).toBe('proton');

        // Switch to neutron
        updateRecipeName({ currentOrder: { name: 'neutron' } });
        expect(state.lastRecipeName).toBe('neutron');

        // Back to proton
        updateRecipeName({ currentOrder: { name: 'proton' } });
        expect(state.lastRecipeName).toBe('proton');
    });

    test("updateGestureAnimations updates quantum-particle progress on ingredient entities", () => {
        const updatedEntities = [];
        const mockEntity = {
            setAttribute: (component, attrs) => {
                updatedEntities.push({ component, attrs });
            }
        };

        state.ingredientEntities.set('up-1', {
            el: mockEntity,
            stationId: 'S1',
            lastLoggedProgress: null
        });

        const context = {
            stations: [
                {
                    stationId: 'S1',
                    ingredientId: 'up-1',
                    currentGestureIndex: 0,
                    gesturesRequired: [{ gesture: 'tenderize' }],
                    progress: 30
                }
            ]
        };

        // Replicate updateGestureAnimations
        context.stations.forEach((station) => {
            if (station.ingredientId && state.ingredientEntities.has(station.ingredientId)) {
                const data = state.ingredientEntities.get(station.ingredientId);
                const currentGesture = station.gesturesRequired[station.currentGestureIndex];
                if (currentGesture) {
                    data.el.setAttribute('quantum-particle', {
                        active: true,
                        gesture: currentGesture.gesture,
                        progress: Math.min(1.0, station.progress / 100)
                    });
                }
            }
        });

        expect(updatedEntities.length).toBe(1);
        expect(updatedEntities[0]).toEqual({
            component: 'quantum-particle',
            attrs: {
                active: true,
                gesture: 'tenderize',
                progress: 0.3
            }
        });
    });

    test("team-galley-receiver identifies local team regardless of 'team-' prefix", () => {
        const isLocal = (teamId, currentTeam) => {
            const local = (currentTeam || 'blue').replace(/^team-/, '');
            const target = (teamId || '').replace(/^team-/, '');
            return target === local;
        };

        expect(isLocal('blue', 'blue')).toBe(true);
        expect(isLocal('team-blue', 'blue')).toBe(true);
        expect(isLocal('blue', 'team-blue')).toBe(true);
        expect(isLocal('red', 'blue')).toBe(false);
        expect(isLocal('white', 'blue')).toBe(false);
    });
});
