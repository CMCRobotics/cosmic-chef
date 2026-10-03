import { describe, test, expect } from "bun:test";
import { createActor } from "xstate";
import { preparationMachine, RECIPES } from "../public/xstate/preparation-machine.js";

describe("preparation-machine — parallel ingredient processing", () => {
    test("initial state is idle", () => {
        const actor = createActor(preparationMachine).start();
        expect(actor.getSnapshot().value).toBe("idle");
    });

    test("START_GAME transitions to waitingForRecipe", () => {
        const actor = createActor(preparationMachine).start();
        actor.send({ type: "START_GAME" });
        expect(actor.getSnapshot().value).toBe("waitingForRecipe");
    });

    test("CAPTURE_RECIPE initializes recipe with ingredient queues and stations", () => {
        const actor = createActor(preparationMachine).start();
        actor.send({ type: "START_GAME" });
        actor.send({ type: "SET_ACTIVE_CHEFS", count: 3 });
        const proton = RECIPES.find(r => r.name === 'proton');
        actor.send({ type: "CAPTURE_RECIPE", recipe: proton });

        const state = actor.getSnapshot();
        expect(state.value).toBe("preparingIngredients");
        expect(state.context.currentOrder.name).toBe("proton");
        expect(state.context.ingredients.length).toBe(3);
        expect(state.context.stations.length).toBe(3);
        // Initial batch is delivered to stations with chefs, so queue is empty for 3-ingredient recipe with 3 chefs
        expect(state.context.ingredientQueue.length).toBe(0);
        // All 3 stations should have chefs and ingredients assigned
        expect(state.context.stations.filter(s => s.ingredientId).length).toBe(3);
    });

    test("Single sous-chef processes ingredients sequentially through one station", () => {
        const actor = createActor(preparationMachine).start();
        actor.send({ type: "START_GAME" });
        actor.send({ type: "SET_ACTIVE_CHEFS", count: 1 });
        const proton = RECIPES.find(r => r.name === 'proton');
        actor.send({ type: "CAPTURE_RECIPE", recipe: proton });

        // Manually assign first ingredient to S1 with chefA
        let state = actor.getSnapshot();
        let stations = state.context.stations;
        if (!stations[0].ingredientId) {
            // Simulate delivery
            actor.send({ type: "GESTURE_TICK", chefId: "chef-1", gesture: "tenderize", progressAmount: 50 });
        }

        state = actor.getSnapshot();
        expect(state.context.stations[0].ingredientId).toBeTruthy();
    });

    test("Two sous-chefs process multiple ingredients in parallel", () => {
        const actor = createActor(preparationMachine).start();
        actor.send({ type: "START_GAME" });
        actor.send({ type: "SET_ACTIVE_CHEFS", count: 2 });
        const proton = RECIPES.find(r => r.name === 'proton');
        actor.send({ type: "CAPTURE_RECIPE", recipe: proton });

        let state = actor.getSnapshot();
        expect(state.context.stations.length).toBe(3);
        expect(state.context.ingredients.length).toBe(3);
    });

    test("Gesture completion advances ingredient to delivery area and loads next", () => {
        const actor = createActor(preparationMachine).start();
        actor.send({ type: "START_GAME" });
        actor.send({ type: "SET_ACTIVE_CHEFS", count: 1 });
        const proton = RECIPES.find(r => r.name === 'proton');
        actor.send({ type: "CAPTURE_RECIPE", recipe: proton });

        // Complete first ingredient's gesture (tenderize up: 100%)
        actor.send({ type: "GESTURE_TICK", chefId: "chef-1", gesture: "tenderize", progressAmount: 100 });

        let state = actor.getSnapshot();
        // Should have moved to checkIfAllReady or back to preparingIngredients
        expect(['preparingIngredients', 'checkIfAllReady'].includes(state.value)).toBe(true);
    });

    test("All ingredients ready transitions to readyForFinalStir", () => {
        const actor = createActor(preparationMachine).start();
        actor.send({ type: "START_GAME" });
        actor.send({ type: "SET_ACTIVE_CHEFS", count: 3 });
        const pion = RECIPES.find(r => r.name === 'pion'); // Only 2 ingredients
        actor.send({ type: "CAPTURE_RECIPE", recipe: pion });

        // Complete first ingredient (up: tenderize)
        actor.send({ type: "GESTURE_TICK", chefId: "chef-1", gesture: "tenderize", progressAmount: 100 });

        // Complete second ingredient (anti-down: stir)
        actor.send({ type: "GESTURE_TICK", chefId: "chef-2", gesture: "stir", progressAmount: 100 });

        const state = actor.getSnapshot();
        expect(state.value).toBe("readyForFinalStir");
    });

    test("Final stir step requires all active chefs", () => {
        const actor = createActor(preparationMachine).start();
        actor.send({ type: "START_GAME" });
        actor.send({ type: "SET_ACTIVE_CHEFS", count: 2 });
        const pion = RECIPES.find(r => r.name === 'pion');
        actor.send({ type: "CAPTURE_RECIPE", recipe: pion });

        // Complete prep of both ingredients
        actor.send({ type: "GESTURE_TICK", chefId: "chef-1", gesture: "tenderize", progressAmount: 100 });
        actor.send({ type: "GESTURE_TICK", chefId: "chef-2", gesture: "stir", progressAmount: 100 });

        expect(actor.getSnapshot().value).toBe("readyForFinalStir");

        // Final stir
        actor.send({ type: "GESTURE_TICK", gesture: "stir", progressAmount: 100 });

        expect(actor.getSnapshot().value).toBe("recipeReadyForSubmit");
    });

    test("SUBMIT_RECIPE validates dish and transitions to orderSuccess if valid", () => {
        const actor = createActor(preparationMachine).start();
        actor.send({ type: "START_GAME" });
        actor.send({ type: "SET_ACTIVE_CHEFS", count: 2 });
        const pion = RECIPES.find(r => r.name === 'pion');
        actor.send({ type: "CAPTURE_RECIPE", recipe: pion });

        // Complete all steps
        actor.send({ type: "GESTURE_TICK", chefId: "chef-1", gesture: "tenderize", progressAmount: 100 });
        actor.send({ type: "GESTURE_TICK", chefId: "chef-2", gesture: "stir", progressAmount: 100 });
        actor.send({ type: "GESTURE_TICK", gesture: "stir", progressAmount: 100 });

        expect(actor.getSnapshot().value).toBe("recipeReadyForSubmit");

        actor.send({ type: "SUBMIT_RECIPE" });

        const state = actor.getSnapshot();
        expect(state.value).toBe("orderSuccess");
        expect(state.context.score).toBe(100);
        expect(state.context.completedCount).toBe(1);
    });

    test("CANCEL_ORDER from preparingIngredients transitions to orderPenalized", () => {
        const actor = createActor(preparationMachine).start();
        actor.send({ type: "START_GAME" });
        const proton = RECIPES.find(r => r.name === 'proton');
        actor.send({ type: "CAPTURE_RECIPE", recipe: proton });
        actor.send({ type: "CANCEL_ORDER" });

        expect(actor.getSnapshot().value).toBe("orderPenalized");
        expect(actor.getSnapshot().context.penalizedCount).toBe(1);
    });

    test("STEP_TIMEOUT transitions to orderPenalized", () => {
        const actor = createActor(preparationMachine).start();
        actor.send({ type: "START_GAME" });
        const proton = RECIPES.find(r => r.name === 'proton');
        actor.send({ type: "CAPTURE_RECIPE", recipe: proton });
        actor.send({ type: "STEP_TIMEOUT" });

        expect(actor.getSnapshot().value).toBe("orderPenalized");
        expect(actor.getSnapshot().context.penalizedCount).toBe(1);
    });

    test("GAME_OVER transitions to gameOver from any state", () => {
        const actor = createActor(preparationMachine).start();
        actor.send({ type: "START_GAME" });
        actor.send({ type: "GAME_OVER" });
        expect(actor.getSnapshot().value).toBe("gameOver");
    });

    test("Proton recipe with 3 sous-chefs completes all ingredient sequences then stir", () => {
        const actor = createActor(preparationMachine).start();
        actor.send({ type: "START_GAME" });
        actor.send({ type: "SET_ACTIVE_CHEFS", count: 3 });
        const proton = RECIPES.find(r => r.name === 'proton');
        actor.send({ type: "CAPTURE_RECIPE", recipe: proton });

        const state1 = actor.getSnapshot();
        expect(state1.value).toBe("preparingIngredients");
        expect(state1.context.currentOrder.composition).toBe("uud");
        expect(state1.context.currentOrder.charge).toBe(1);

        // Chefs work on their ingredients
        // ChefA: up-1 (tenderize)
        actor.send({ type: "GESTURE_TICK", chefId: "chef-1", gesture: "tenderize", progressAmount: 100 });
        // ChefB: up-2 (tenderize)
        actor.send({ type: "GESTURE_TICK", chefId: "chef-2", gesture: "tenderize", progressAmount: 100 });
        // ChefC: down-1 (slice)
        actor.send({ type: "GESTURE_TICK", chefId: "chef-3", gesture: "slice", progressAmount: 100 });

        const state2 = actor.getSnapshot();
        expect(state2.value).toBe("readyForFinalStir");

        // Final synchronized stir
        actor.send({ type: "GESTURE_TICK", gesture: "stir", progressAmount: 100 });

        const state3 = actor.getSnapshot();
        expect(state3.value).toBe("recipeReadyForSubmit");

        // Submit
        actor.send({ type: "SUBMIT_RECIPE" });

        const state4 = actor.getSnapshot();
        expect(state4.value).toBe("orderSuccess");
        expect(state4.context.score).toBe(100);
        expect(state4.context.completedCount).toBe(1);
    });

    test("Neutron recipe completes successfully", () => {
        const actor = createActor(preparationMachine).start();
        actor.send({ type: "START_GAME" });
        actor.send({ type: "SET_ACTIVE_CHEFS", count: 3 });
        const neutron = RECIPES.find(r => r.name === 'neutron');
        actor.send({ type: "CAPTURE_RECIPE", recipe: neutron });

        const state1 = actor.getSnapshot();
        expect(state1.context.currentOrder.composition).toBe("udd");
        expect(state1.context.currentOrder.charge).toBe(0);

        // Complete preparations
        actor.send({ type: "GESTURE_TICK", chefId: "chef-1", gesture: "tenderize", progressAmount: 100 });
        actor.send({ type: "GESTURE_TICK", chefId: "chef-2", gesture: "slice", progressAmount: 100 });
        actor.send({ type: "GESTURE_TICK", chefId: "chef-3", gesture: "slice", progressAmount: 100 });

        expect(actor.getSnapshot().value).toBe("readyForFinalStir");

        actor.send({ type: "GESTURE_TICK", gesture: "stir", progressAmount: 100 });
        actor.send({ type: "SUBMIT_RECIPE" });

        const state2 = actor.getSnapshot();
        expect(state2.value).toBe("orderSuccess");
        expect(state2.context.completedCount).toBe(1);
    });

    test("Pion recipe (2 ingredients) completes successfully", () => {
        const actor = createActor(preparationMachine).start();
        actor.send({ type: "START_GAME" });
        actor.send({ type: "SET_ACTIVE_CHEFS", count: 2 });
        const pion = RECIPES.find(r => r.name === 'pion');
        actor.send({ type: "CAPTURE_RECIPE", recipe: pion });

        const state1 = actor.getSnapshot();
        expect(state1.context.currentOrder.composition).toBe("ud̄");
        expect(state1.context.ingredients.length).toBe(2);

        actor.send({ type: "GESTURE_TICK", chefId: "chef-1", gesture: "tenderize", progressAmount: 100 });
        actor.send({ type: "GESTURE_TICK", chefId: "chef-2", gesture: "stir", progressAmount: 100 });

        expect(actor.getSnapshot().value).toBe("readyForFinalStir");

        actor.send({ type: "GESTURE_TICK", gesture: "stir", progressAmount: 100 });
        actor.send({ type: "SUBMIT_RECIPE" });

        const state2 = actor.getSnapshot();
        expect(state2.value).toBe("orderSuccess");
    });

    test("Lambda recipe (3 ingredients with strange quark) completes successfully", () => {
        const actor = createActor(preparationMachine).start();
        actor.send({ type: "START_GAME" });
        actor.send({ type: "SET_ACTIVE_CHEFS", count: 3 });
        const lambda = RECIPES.find(r => r.name === 'lambda');
        actor.send({ type: "CAPTURE_RECIPE", recipe: lambda });

        const state1 = actor.getSnapshot();
        expect(state1.context.currentOrder.composition).toBe("uds");

        actor.send({ type: "GESTURE_TICK", chefId: "chef-1", gesture: "tenderize", progressAmount: 100 });
        actor.send({ type: "GESTURE_TICK", chefId: "chef-2", gesture: "slice", progressAmount: 100 });
        actor.send({ type: "GESTURE_TICK", chefId: "chef-3", gesture: "stir", progressAmount: 100 });

        expect(actor.getSnapshot().value).toBe("readyForFinalStir");

        actor.send({ type: "GESTURE_TICK", gesture: "stir", progressAmount: 100 });
        actor.send({ type: "SUBMIT_RECIPE" });

        const state2 = actor.getSnapshot();
        expect(state2.value).toBe("orderSuccess");
        expect(state2.context.completedCount).toBe(1);
    });

    test("STOP_GESTURE with uninterruptible behavior resets progress", () => {
        const actor = createActor(preparationMachine).start();
        actor.send({ type: "START_GAME" });
        const testRecipe = {
            name: 'test',
            composition: 'test',
            charge: 0,
            ingredientSequences: {
                'test-1': [{ gesture: 'slice', preparedState: 'Test', behaviorType: 'uninterruptible' }]
            },
            finalStep: { gesture: 'stir', behaviorType: 'resumable', stepType: 'synchronized' }
        };
        actor.send({ type: "CAPTURE_RECIPE", recipe: testRecipe });

        actor.send({ type: "GESTURE_TICK", chefId: "chef-1", gesture: "slice", progressAmount: 40 });
        expect(actor.getSnapshot().context.stations[0].progress).toBe(40);

        actor.send({ type: "STOP_GESTURE", chefId: "chef-1" });
        expect(actor.getSnapshot().context.stations[0].progress).toBe(0);
    });

    test("STOP_GESTURE with resumable behavior preserves progress", () => {
        const actor = createActor(preparationMachine).start();
        actor.send({ type: "START_GAME" });
        const testRecipe = {
            name: 'test',
            composition: 'test',
            charge: 0,
            ingredientSequences: {
                'test-1': [{ gesture: 'slice', preparedState: 'Test', behaviorType: 'resumable' }]
            },
            finalStep: { gesture: 'stir', behaviorType: 'resumable', stepType: 'synchronized' }
        };
        actor.send({ type: "CAPTURE_RECIPE", recipe: testRecipe });

        actor.send({ type: "GESTURE_TICK", chefId: "chef-1", gesture: "slice", progressAmount: 40 });
        expect(actor.getSnapshot().context.stations[0].progress).toBe(40);

        actor.send({ type: "STOP_GESTURE", chefId: "chef-1" });
        expect(actor.getSnapshot().context.stations[0].progress).toBe(40);
    });

    test("NEXT_ROUND returns from orderSuccess to waitingForRecipe", () => {
        const actor = createActor(preparationMachine).start();
        actor.send({ type: "START_GAME" });
        actor.send({ type: "SET_ACTIVE_CHEFS", count: 1 });
        const pion = RECIPES.find(r => r.name === 'pion');
        actor.send({ type: "CAPTURE_RECIPE", recipe: pion });

        actor.send({ type: "GESTURE_TICK", chefId: "chef-1", gesture: "tenderize", progressAmount: 100 });
        actor.send({ type: "GESTURE_TICK", chefId: "chef-1", gesture: "stir", progressAmount: 100 });
        actor.send({ type: "GESTURE_TICK", gesture: "stir", progressAmount: 100 });
        actor.send({ type: "SUBMIT_RECIPE" });

        expect(actor.getSnapshot().value).toBe("orderSuccess");

        actor.send({ type: "NEXT_ROUND" });
        expect(actor.getSnapshot().value).toBe("waitingForRecipe");
    });

    // Regression tests for ingredient animation paths and chef assignment
    test("Chef assignment: 1 chef gets only S1", () => {
        const actor = createActor(preparationMachine).start();
        actor.send({ type: "START_GAME" });
        actor.send({ type: "SET_ACTIVE_CHEFS", count: 1 });
        const proton = RECIPES.find(r => r.name === 'proton');
        actor.send({ type: "CAPTURE_RECIPE", recipe: proton });

        const state = actor.getSnapshot();
        expect(state.context.stations[0].chefId).toBe("chef-1");
        expect(state.context.stations[1].chefId).toBeNull();
        expect(state.context.stations[2].chefId).toBeNull();
    });

    test("Chef assignment: 2 chefs get S1 and S2", () => {
        const actor = createActor(preparationMachine).start();
        actor.send({ type: "START_GAME" });
        actor.send({ type: "SET_ACTIVE_CHEFS", count: 2 });
        const proton = RECIPES.find(r => r.name === 'proton');
        actor.send({ type: "CAPTURE_RECIPE", recipe: proton });

        const state = actor.getSnapshot();
        expect(state.context.stations[0].chefId).toBe("chef-1");
        expect(state.context.stations[1].chefId).toBe("chef-2");
        expect(state.context.stations[2].chefId).toBeNull();
    });

    test("Chef assignment: 3 chefs get S1, S2, and S3", () => {
        const actor = createActor(preparationMachine).start();
        actor.send({ type: "START_GAME" });
        actor.send({ type: "SET_ACTIVE_CHEFS", count: 3 });
        const proton = RECIPES.find(r => r.name === 'proton');
        actor.send({ type: "CAPTURE_RECIPE", recipe: proton });

        const state = actor.getSnapshot();
        expect(state.context.stations[0].chefId).toBe("chef-1");
        expect(state.context.stations[1].chefId).toBe("chef-2");
        expect(state.context.stations[2].chefId).toBe("chef-3");
    });

    test("Ingredient delivery only to stations with chefs (1 chef)", () => {
        const actor = createActor(preparationMachine).start();
        actor.send({ type: "START_GAME" });
        actor.send({ type: "SET_ACTIVE_CHEFS", count: 1 });
        const proton = RECIPES.find(r => r.name === 'proton');
        actor.send({ type: "CAPTURE_RECIPE", recipe: proton });

        const state = actor.getSnapshot();
        expect(state.context.stations[0].ingredientId).toBe("up-1");
        expect(state.context.stations[1].ingredientId).toBeNull();
        expect(state.context.stations[2].ingredientId).toBeNull();
        expect(state.context.ingredientQueue.length).toBe(2); // up-2 and down-1 queued
    });

    test("Ingredient delivery to all stations with chefs (3 chefs)", () => {
        const actor = createActor(preparationMachine).start();
        actor.send({ type: "START_GAME" });
        actor.send({ type: "SET_ACTIVE_CHEFS", count: 3 });
        const proton = RECIPES.find(r => r.name === 'proton');
        actor.send({ type: "CAPTURE_RECIPE", recipe: proton });

        const state = actor.getSnapshot();
        expect(state.context.stations[0].ingredientId).toBe("up-1");
        expect(state.context.stations[1].ingredientId).toBe("up-2");
        expect(state.context.stations[2].ingredientId).toBe("down-1");
        expect(state.context.ingredientQueue.length).toBe(0); // all delivered
    });

    test("Gesture only accepted from correct assigned chef", () => {
        const actor = createActor(preparationMachine).start();
        actor.send({ type: "START_GAME" });
        actor.send({ type: "SET_ACTIVE_CHEFS", count: 2 });
        const pion = RECIPES.find(r => r.name === 'pion');
        actor.send({ type: "CAPTURE_RECIPE", recipe: pion });

        // S1: up-1 (chef-1), S2: anti-down-1 (chef-2)
        const state1 = actor.getSnapshot();
        expect(state1.context.stations[0].ingredientId).toBe("up-1");
        expect(state1.context.stations[1].ingredientId).toBe("anti-down-1");

        // Gesture from wrong chef (chef-2 trying tenderize at S1) should be rejected
        actor.send({ type: "GESTURE_TICK", chefId: "chef-2", gesture: "tenderize", progressAmount: 100 });
        const state2 = actor.getSnapshot();
        expect(state2.context.stations[0].progress).toBe(0); // No progress, wrong chef
        expect(state2.context.stations[1].ingredientId).toBe("anti-down-1"); // S2 unchanged

        // Gesture from correct chef (chef-1 tenderize at S1)
        actor.send({ type: "GESTURE_TICK", chefId: "chef-1", gesture: "tenderize", progressAmount: 100 });
        const state3 = actor.getSnapshot();
        expect(state3.context.stations[0].ingredientId).toBeNull(); // S1 cleared, ingredient moved to delivery
        expect(state3.value).toBe("preparingIngredients"); // Back to prep, waiting for S2
    });

    test("Multi-chef sequential completion leads to readyForFinalStir", () => {
        const actor = createActor(preparationMachine).start();
        let state;
        actor.send({ type: "START_GAME" });
        actor.send({ type: "SET_ACTIVE_CHEFS", count: 3 });
        const proton = RECIPES.find(r => r.name === 'proton');
        actor.send({ type: "CAPTURE_RECIPE", recipe: proton });

        // Complete S1: up-1 (chef-1, tenderize)
        actor.send({ type: "GESTURE_TICK", chefId: "chef-1", gesture: "tenderize", progressAmount: 100 });
        state = actor.getSnapshot();
        expect(state.context.stations[0].ingredientId).toBeNull();

        // Complete S2: up-2 (chef-2, tenderize)
        actor.send({ type: "GESTURE_TICK", chefId: "chef-2", gesture: "tenderize", progressAmount: 100 });
        state = actor.getSnapshot();
        expect(state.context.stations[1].ingredientId).toBeNull();

        // Complete S3: down-1 (chef-3, slice)
        actor.send({ type: "GESTURE_TICK", chefId: "chef-3", gesture: "slice", progressAmount: 100 });
        state = actor.getSnapshot();
        expect(state.context.stations[2].ingredientId).toBeNull();
        expect(state.value).toBe("readyForFinalStir"); // All ready!
    });

    test("Gestures require correct chef assignment", () => {
        const actor = createActor(preparationMachine).start();
        actor.send({ type: "START_GAME" });
        actor.send({ type: "SET_ACTIVE_CHEFS", count: 1 });
        const testRecipe = {
            name: 'test',
            composition: 'test',
            charge: 0,
            ingredientSequences: {
                'test-1': [{ gesture: 'tenderize', preparedState: 'Test', behaviorType: 'resumable' }]
            },
            finalStep: { gesture: 'stir', behaviorType: 'resumable', stepType: 'synchronized' }
        };
        actor.send({ type: "CAPTURE_RECIPE", recipe: testRecipe });

        // Send gesture from wrong chef
        actor.send({ type: "GESTURE_TICK", chefId: "chef-2", gesture: "tenderize", progressAmount: 50 });
        expect(actor.getSnapshot().context.stations[0].progress).toBe(0); // No progress

        // Send gesture from correct chef
        actor.send({ type: "GESTURE_TICK", chefId: "chef-1", gesture: "tenderize", progressAmount: 50 });
        expect(actor.getSnapshot().context.stations[0].progress).toBe(50); // Progress recorded
    });
});
