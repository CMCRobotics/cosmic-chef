import { describe, test, expect } from "bun:test";
import { createActor } from "xstate";
import { preparationMachine, RECIPES } from "../public/xstate/preparation-machine.js";

describe("preparation-machine", () => {
    test("initial state is idle", () => {
        const actor = createActor(preparationMachine).start();
        expect(actor.getSnapshot().value).toBe("idle");
    });

    test("START_GAME transitions to waitingForRecipe", () => {
        const actor = createActor(preparationMachine).start();
        actor.send({ type: "START_GAME" });
        expect(actor.getSnapshot().value).toBe("waitingForRecipe");
    });

    test("CAPTURE_RECIPE sets recipe context", () => {
        const actor = createActor(preparationMachine).start();
        actor.send({ type: "START_GAME" });
        actor.send({
            type: "CAPTURE_RECIPE",
            recipe: {
                name: "test-meson",
                steps: [
                    { gesture: "slice", behaviorType: "resumable" },
                    { gesture: "stir", behaviorType: "uninterruptible" }
                ]
            }
        });
        const state = actor.getSnapshot();
        expect(state.value).toBe("preparingComplexDish");
        expect(state.context.currentOrder.name).toBe("test-meson");
        expect(state.context.currentStepIndex).toBe(0);
        expect(state.context.stepProgress).toBe(0);
    });

    test("GESTURE_TICK increments progress and completes order", () => {
        const actor = createActor(preparationMachine).start();
        actor.send({ type: "START_GAME" });
        actor.send({
            type: "CAPTURE_RECIPE",
            recipe: {
                name: "single-step",
                steps: [{ gesture: "slice", behaviorType: "resumable" }]
            }
        });
        actor.send({ type: "GESTURE_TICK", gesture: "slice", progressAmount: 30 });
        expect(actor.getSnapshot().context.stepProgress).toBe(30);

        // Incorrect gesture ignored
        actor.send({ type: "GESTURE_TICK", gesture: "invalid", progressAmount: 30 });
        expect(actor.getSnapshot().context.stepProgress).toBe(30);

        // Complete step
        actor.send({ type: "GESTURE_TICK", gesture: "slice", progressAmount: 70 });
        expect(actor.getSnapshot().value).toBe("orderSuccess");
        expect(actor.getSnapshot().context.score).toBe(100);
        expect(actor.getSnapshot().context.completedCount).toBe(1);
    });

    test("STOP_GESTURE handles uninterruptible vs resumable decay", () => {
        // Uninterruptible test
        const actor1 = createActor(preparationMachine).start();
        actor1.send({ type: "START_GAME" });
        actor1.send({
            type: "CAPTURE_RECIPE",
            recipe: {
                name: "decay-test",
                steps: [{ gesture: "dice", behaviorType: "uninterruptible" }]
            }
        });
        actor1.send({ type: "GESTURE_TICK", gesture: "dice", progressAmount: 40 });
        expect(actor1.getSnapshot().context.stepProgress).toBe(40);
        actor1.send({ type: "STOP_GESTURE" });
        expect(actor1.getSnapshot().context.stepProgress).toBe(0);

        // Resumable test
        const actor2 = createActor(preparationMachine).start();
        actor2.send({ type: "START_GAME" });
        actor2.send({
            type: "CAPTURE_RECIPE",
            recipe: {
                name: "resumable-test",
                steps: [{ gesture: "slice", behaviorType: "resumable" }]
            }
        });
        actor2.send({ type: "GESTURE_TICK", gesture: "slice", progressAmount: 40 });
        expect(actor2.getSnapshot().context.stepProgress).toBe(40);
        actor2.send({ type: "STOP_GESTURE" });
        expect(actor2.getSnapshot().context.stepProgress).toBe(40);
    });

    test("Active chefs > 1 enforces non-consecutive gesture rule", () => {
        const actor = createActor(preparationMachine).start();
        actor.send({ type: "START_GAME" });
        actor.send({ type: "SET_ACTIVE_CHEFS", count: 2 });
        actor.send({
            type: "CAPTURE_RECIPE",
            recipe: {
                name: "multi-chef-test",
                steps: [
                    { gesture: "slice", behaviorType: "resumable" },
                    { gesture: "dice", behaviorType: "resumable" }
                ]
            }
        });

        actor.send({ type: "GESTURE_TICK", chefId: "chefA", gesture: "slice", progressAmount: 100 });
        expect(actor.getSnapshot().context.currentStepIndex).toBe(1);
        expect(actor.getSnapshot().context.lastChefId).toBe("chefA");

        // Same chef fails
        actor.send({ type: "GESTURE_TICK", chefId: "chefA", gesture: "dice", progressAmount: 50 });
        expect(actor.getSnapshot().context.stepProgress).toBe(0);

        // Other chef succeeds
        actor.send({ type: "GESTURE_TICK", chefId: "chefB", gesture: "dice", progressAmount: 50 });
        expect(actor.getSnapshot().context.stepProgress).toBe(50);
    });

    test("STEP_TIMEOUT or CANCEL_ORDER penalizes current order", () => {
        const actor = createActor(preparationMachine).start();
        actor.send({ type: "START_GAME" });
        actor.send({
            type: "CAPTURE_RECIPE",
            recipe: { name: "cancel", steps: [{ gesture: "slice", behaviorType: "resumable" }] }
        });
        actor.send({ type: "CANCEL_ORDER" });
        expect(actor.getSnapshot().value).toBe("orderPenalized");
        expect(actor.getSnapshot().context.penalizedCount).toBe(1);
    });

    test("GAME_OVER event transitions to gameOver", () => {
        const actor = createActor(preparationMachine).start();
        actor.send({ type: "START_GAME" });
        actor.send({ type: "GAME_OVER" });
        expect(actor.getSnapshot().value).toBe("gameOver");
    });

    test("Recipe 1 (Proton) matches docs/recipes.md and completes via tenderize/tenderize/slice/synchronized-stir", () => {
        const proton = RECIPES.find(r => r.name === 'proton');
        const actor = createActor(preparationMachine).start();
        actor.send({ type: "START_GAME" });
        actor.send({ type: "SET_ACTIVE_CHEFS", count: 2 });
        actor.send({
            type: "CAPTURE_RECIPE",
            recipe: proton
        });
        const state1 = actor.getSnapshot();
        expect(state1.value).toBe("preparingComplexDish");
        expect(state1.context.currentOrder.composition).toBe("uud");
        expect(state1.context.currentOrder.charge).toBe(1);

        // First tenderize (up quark)
        actor.send({ type: "GESTURE_TICK", chefId: "chefA", gesture: "tenderize", progressAmount: 100 });
        expect(actor.getSnapshot().context.currentStepIndex).toBe(1);

        // Second tenderize (up quark)
        actor.send({ type: "GESTURE_TICK", chefId: "chefB", gesture: "tenderize", progressAmount: 100 });
        expect(actor.getSnapshot().context.currentStepIndex).toBe(2);

        // Slice (down quark)
        actor.send({ type: "GESTURE_TICK", chefId: "chefA", gesture: "slice", progressAmount: 100 });
        expect(actor.getSnapshot().context.currentStepIndex).toBe(3);

        // Synchronized Stir - both chefs required
        actor.send({ type: "GESTURE_TICK", gesture: "stir", chefIds: ["chefA", "chefB"], progressAmount: 100 });
        expect(actor.getSnapshot().value).toBe("orderSuccess");
        expect(actor.getSnapshot().context.score).toBe(100);
        expect(actor.getSnapshot().context.completedCount).toBe(1);
    });

    test("Recipe 2 (Neutron) matches docs/recipes.md and completes via tenderize/slice/slice/synchronized-stir", () => {
        const neutron = RECIPES.find(r => r.name === 'neutron');
        const actor = createActor(preparationMachine).start();
        actor.send({ type: "START_GAME" });
        actor.send({ type: "SET_ACTIVE_CHEFS", count: 2 });
        actor.send({
            type: "CAPTURE_RECIPE",
            recipe: neutron
        });
        const state1 = actor.getSnapshot();
        expect(state1.value).toBe("preparingComplexDish");
        expect(state1.context.currentOrder.composition).toBe("udd");
        expect(state1.context.currentOrder.charge).toBe(0);

        // Tenderize (up quark)
        actor.send({ type: "GESTURE_TICK", chefId: "chefA", gesture: "tenderize", progressAmount: 100 });
        expect(actor.getSnapshot().context.currentStepIndex).toBe(1);

        // First slice (down quark)
        actor.send({ type: "GESTURE_TICK", chefId: "chefB", gesture: "slice", progressAmount: 100 });
        expect(actor.getSnapshot().context.currentStepIndex).toBe(2);

        // Second slice (down quark)
        actor.send({ type: "GESTURE_TICK", chefId: "chefA", gesture: "slice", progressAmount: 100 });
        expect(actor.getSnapshot().context.currentStepIndex).toBe(3);

        // Synchronized Stir - both chefs required
        actor.send({ type: "GESTURE_TICK", gesture: "stir", chefIds: ["chefA", "chefB"], progressAmount: 100 });
        expect(actor.getSnapshot().value).toBe("orderSuccess");
        expect(actor.getSnapshot().context.score).toBe(100);
        expect(actor.getSnapshot().context.completedCount).toBe(1);
    });

    test("Synchronized final Stir requires every active chef", () => {
        const proton = RECIPES.find(r => r.name === 'proton');
        const actor = createActor(preparationMachine).start();
        actor.send({ type: "START_GAME" });
        actor.send({ type: "SET_ACTIVE_CHEFS", count: 3 });
        actor.send({ type: "CAPTURE_RECIPE", recipe: proton });

        // Complete the first three prep steps
        actor.send({ type: "GESTURE_TICK", chefId: "chefA", gesture: "tenderize", progressAmount: 100 });
        actor.send({ type: "GESTURE_TICK", chefId: "chefB", gesture: "tenderize", progressAmount: 100 });
        actor.send({ type: "GESTURE_TICK", chefId: "chefC", gesture: "slice", progressAmount: 100 });

        // Try stir with only 2 of 3 chefs - should be no-op
        actor.send({ type: "GESTURE_TICK", gesture: "stir", chefIds: ["chefA", "chefB"], progressAmount: 100 });
        expect(actor.getSnapshot().value).toBe("preparingComplexDish");
        expect(actor.getSnapshot().context.stepProgress).toBe(0);
        expect(actor.getSnapshot().context.currentStepIndex).toBe(3);

        // Now with all 3 chefs - should complete
        actor.send({ type: "GESTURE_TICK", gesture: "stir", chefIds: ["chefA", "chefB", "chefC"], progressAmount: 100 });
        expect(actor.getSnapshot().value).toBe("orderSuccess");
    });
});

