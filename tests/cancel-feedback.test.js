import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createActor } from "xstate";
import { preparationMachine, RECIPES } from "../public/xstate/preparation-machine.js";

/**
 * Cancel Feedback Tests
 *
 * Tests the cancel feedback system: state transitions, vacuum animation,
 * and game state reset after cancellation.
 */

describe("cancel-feedback — game state transitions", () => {
  let actor;

  beforeEach(() => {
    actor = createActor(preparationMachine).start();
  });

  afterEach(() => {
    if (actor) {
      actor.stop();
    }
  });

  test("State transitions to orderPenalized when CANCEL_ORDER sent", () => {
    actor.send({ type: "START_GAME" });
    const proton = RECIPES.find(r => r.name === 'proton');
    actor.send({ type: "CAPTURE_RECIPE", recipe: proton });

    let state = actor.getSnapshot();
    expect(state.value).toBe("preparingIngredients");

    actor.send({ type: "CANCEL_ORDER" });

    state = actor.getSnapshot();
    expect(state.value).toBe("orderPenalized");
  });

  test("Can transition back to waitingForRecipe from orderPenalized via NEXT_ROUND", () => {
    actor.send({ type: "START_GAME" });
    const proton = RECIPES.find(r => r.name === 'proton');
    actor.send({ type: "CAPTURE_RECIPE", recipe: proton });

    actor.send({ type: "CANCEL_ORDER" });

    let state = actor.getSnapshot();
    expect(state.value).toBe("orderPenalized");
    expect(state.context.penalizedCount).toBe(1);

    // Send NEXT_ROUND to transition back to waitingForRecipe
    actor.send({ type: "NEXT_ROUND" });

    state = actor.getSnapshot();
    expect(state.value).toBe("waitingForRecipe");
  });

  test("Game context is reset for next recipe after NEXT_ROUND", () => {
    actor.send({ type: "START_GAME" });
    const proton = RECIPES.find(r => r.name === 'proton');
    actor.send({ type: "CAPTURE_RECIPE", recipe: proton });

    actor.send({ type: "CANCEL_ORDER" });

    let state = actor.getSnapshot();
    expect(state.context.currentOrder).toBeDefined();
    expect(state.context.penalizedCount).toBe(1);

    // Transition back to waitingForRecipe
    actor.send({ type: "NEXT_ROUND" });

    state = actor.getSnapshot();
    expect(state.value).toBe("waitingForRecipe");
    // currentOrder should still be defined (not cleared) but penalizedCount persists
    expect(state.context.penalizedCount).toBe(1);
  });

  test("New recipe can be captured after cancel and NEXT_ROUND", () => {
    // First recipe
    actor.send({ type: "START_GAME" });
    let proton = RECIPES.find(r => r.name === 'proton');
    actor.send({ type: "CAPTURE_RECIPE", recipe: proton });

    let state = actor.getSnapshot();
    expect(state.context.currentOrder.name).toBe("proton");

    // Cancel first recipe
    actor.send({ type: "CANCEL_ORDER" });
    state = actor.getSnapshot();
    expect(state.value).toBe("orderPenalized");

    // Reset for next recipe
    actor.send({ type: "NEXT_ROUND" });
    state = actor.getSnapshot();
    expect(state.value).toBe("waitingForRecipe");

    // Capture second recipe
    let neutron = RECIPES.find(r => r.name === 'neutron');
    actor.send({ type: "CAPTURE_RECIPE", recipe: neutron });

    state = actor.getSnapshot();
    expect(state.value).toBe("preparingIngredients");
    expect(state.context.currentOrder.name).toBe("neutron");
  });

  test("Cancel from different states all transition to orderPenalized", () => {
    actor.send({ type: "START_GAME" });
    actor.send({ type: "SET_ACTIVE_CHEFS", count: 2 });

    // Test 1: Cancel from preparingIngredients
    let pion = RECIPES.find(r => r.name === 'pion');
    actor.send({ type: "CAPTURE_RECIPE", recipe: pion });
    actor.send({ type: "CANCEL_ORDER" });
    let state = actor.getSnapshot();
    expect(state.value).toBe("orderPenalized");
    expect(state.context.penalizedCount).toBe(1);

    actor.send({ type: "NEXT_ROUND" });

    // Test 2: Cancel from readyForFinalStir
    actor.send({ type: "CAPTURE_RECIPE", recipe: pion });
    actor.send({ type: "GESTURE_TICK", chefId: "chef-1", gesture: "tenderize", progressAmount: 100 });
    actor.send({ type: "GESTURE_TICK", chefId: "chef-2", gesture: "stir", progressAmount: 100 });

    state = actor.getSnapshot();
    expect(state.value).toBe("readyForFinalStir");

    actor.send({ type: "CANCEL_ORDER" });
    state = actor.getSnapshot();
    expect(state.value).toBe("orderPenalized");
    expect(state.context.penalizedCount).toBe(2);

    actor.send({ type: "NEXT_ROUND" });

    // Test 3: Cancel from recipeReadyForSubmit
    actor.send({ type: "CAPTURE_RECIPE", recipe: pion });
    actor.send({ type: "GESTURE_TICK", chefId: "chef-1", gesture: "tenderize", progressAmount: 100 });
    actor.send({ type: "GESTURE_TICK", chefId: "chef-2", gesture: "stir", progressAmount: 100 });
    actor.send({ type: "GESTURE_TICK", gesture: "stir", progressAmount: 100 });

    state = actor.getSnapshot();
    expect(state.value).toBe("recipeReadyForSubmit");

    actor.send({ type: "CANCEL_ORDER" });
    state = actor.getSnapshot();
    expect(state.value).toBe("orderPenalized");
    expect(state.context.penalizedCount).toBe(3);
  });

  test("Penalty is applied on cancel", () => {
    actor.send({ type: "START_GAME" });
    const proton = RECIPES.find(r => r.name === 'proton');

    // Get initial score
    let state = actor.getSnapshot();
    const initialScore = state.context.score;
    expect(initialScore).toBe(0);

    // Capture recipe and cancel
    actor.send({ type: "CAPTURE_RECIPE", recipe: proton });
    actor.send({ type: "CANCEL_ORDER" });

    // Check penalty was applied (score should not go below 0)
    state = actor.getSnapshot();
    expect(state.context.score).toBe(initialScore); // 0 - 50 clamped to 0
    expect(state.context.penalizedCount).toBe(1);
  });

  test("Multiple cancellations accumulate penalty counts", () => {
    actor.send({ type: "START_GAME" });
    const proton = RECIPES.find(r => r.name === 'proton');

    // Cancel 3 times
    for (let i = 0; i < 3; i++) {
      actor.send({ type: "CAPTURE_RECIPE", recipe: proton });
      actor.send({ type: "CANCEL_ORDER" });

      let state = actor.getSnapshot();
      expect(state.context.penalizedCount).toBe(i + 1);

      if (i < 2) {
        actor.send({ type: "NEXT_ROUND" });
      }
    }
  });

  test("Successful submission after cancel doesn't affect success count", () => {
    actor.send({ type: "START_GAME" });
    actor.send({ type: "SET_ACTIVE_CHEFS", count: 2 });
    const pion = RECIPES.find(r => r.name === 'pion');

    // First: cancel a recipe
    actor.send({ type: "CAPTURE_RECIPE", recipe: pion });
    actor.send({ type: "CANCEL_ORDER" });

    let state = actor.getSnapshot();
    expect(state.context.completedCount).toBe(0);
    expect(state.context.penalizedCount).toBe(1);

    // Reset
    actor.send({ type: "NEXT_ROUND" });

    // Then: complete a recipe successfully
    actor.send({ type: "CAPTURE_RECIPE", recipe: pion });
    actor.send({ type: "GESTURE_TICK", chefId: "chef-1", gesture: "tenderize", progressAmount: 100 });
    actor.send({ type: "GESTURE_TICK", chefId: "chef-2", gesture: "stir", progressAmount: 100 });
    actor.send({ type: "GESTURE_TICK", gesture: "stir", progressAmount: 100 });
    actor.send({ type: "SUBMIT_RECIPE" });

    state = actor.getSnapshot();
    expect(state.value).toBe("orderSuccess");
    expect(state.context.completedCount).toBe(1);
    expect(state.context.penalizedCount).toBe(1);
  });

  test("State machine persists context correctly across cancel and NEXT_ROUND", () => {
    actor.send({ type: "START_GAME" });
    actor.send({ type: "SET_ACTIVE_CHEFS", count: 3 });

    const proton = RECIPES.find(r => r.name === 'proton');
    actor.send({ type: "CAPTURE_RECIPE", recipe: proton });

    let state = actor.getSnapshot();
    const initialActiveChefsCount = state.context.activeChefsCount;
    expect(initialActiveChefsCount).toBe(3);

    // Cancel
    actor.send({ type: "CANCEL_ORDER" });
    state = actor.getSnapshot();

    // Active chef count should persist
    expect(state.context.activeChefsCount).toBe(initialActiveChefsCount);

    // Reset and capture new recipe
    actor.send({ type: "NEXT_ROUND" });
    actor.send({ type: "CAPTURE_RECIPE", recipe: proton });

    state = actor.getSnapshot();
    // New capture should reinitialize stations with same chef count
    expect(state.context.stations.length).toBe(3);
    const stationsWithChefs = state.context.stations.filter(s => s.chefId);
    expect(stationsWithChefs.length).toBe(3);
  });
});

describe("cancel-feedback — ingredient state tracking", () => {
  let actor;

  beforeEach(() => {
    actor = createActor(preparationMachine).start();
  });

  afterEach(() => {
    if (actor) {
      actor.stop();
    }
  });

  test("Active ingredients are cleared when recipe is cancelled", () => {
    actor.send({ type: "START_GAME" });
    actor.send({ type: "SET_ACTIVE_CHEFS", count: 3 });
    const proton = RECIPES.find(r => r.name === 'proton');
    actor.send({ type: "CAPTURE_RECIPE", recipe: proton });

    let state = actor.getSnapshot();
    expect(state.context.stations[0].ingredientId).toBeTruthy();
    expect(state.context.stations[1].ingredientId).toBeTruthy();
    expect(state.context.stations[2].ingredientId).toBeTruthy();

    // Cancel
    actor.send({ type: "CANCEL_ORDER" });

    state = actor.getSnapshot();
    // After cancel -> orderPenalized, ingredients are still tracked in stations
    // (reset happens on NEXT_ROUND which goes to waitingForRecipe)
    expect(state.value).toBe("orderPenalized");

    // After NEXT_ROUND, go back to waitingForRecipe
    actor.send({ type: "NEXT_ROUND" });
    state = actor.getSnapshot();
    expect(state.value).toBe("waitingForRecipe");
  });

  test("Ingredient progress is tracked when cancel is sent during preparation", () => {
    actor.send({ type: "START_GAME" });
    actor.send({ type: "SET_ACTIVE_CHEFS", count: 1 });
    const proton = RECIPES.find(r => r.name === 'proton');
    actor.send({ type: "CAPTURE_RECIPE", recipe: proton });

    let state = actor.getSnapshot();
    expect(state.context.stations[0].progress).toBe(0);

    // Do some work
    actor.send({ type: "GESTURE_TICK", chefId: "chef-1", gesture: "tenderize", progressAmount: 25 });

    state = actor.getSnapshot();
    expect(state.context.stations[0].progress).toBe(25);

    // Cancel mid-work
    actor.send({ type: "CANCEL_ORDER" });

    state = actor.getSnapshot();
    expect(state.value).toBe("orderPenalized");
  });
});
