import { describe, test, expect } from "bun:test";
import { describeHeadChefStatus, type StatusContext } from "../src/client/status";

const baseContext = (overrides: Partial<StatusContext> = {}): StatusContext => ({
  currentOrder: { name: "proton", composition: "uud", finalStep: { gesture: "stir" } },
  stations: [
    {
      stationId: "S1", chefId: "chef-1", ingredientId: "up-1", currentGestureIndex: 0, progress: 40,
      gesturesRequired: [{ gesture: "tenderize", preparedState: "Tender Up" }],
    },
    {
      stationId: "S2", chefId: "chef-2", ingredientId: "down-1", currentGestureIndex: 1, progress: 0,
      gesturesRequired: [{ gesture: "slice" }, { gesture: "stir" }],
    },
    { stationId: "S3", chefId: null, ingredientId: null, currentGestureIndex: 0, progress: 0, gesturesRequired: [] },
  ],
  ingredients: [
    { id: "up-1", completed: false },
    { id: "up-2", completed: true },
    { id: "down-1", completed: false },
  ],
  stirProgress: 0,
  chefGestures: { "chef-1": "tenderize", "chef-2": "idle" },
  score: 0,
  completedCount: 2,
  penalizedCount: 1,
  ...overrides,
});

describe("head-chef status panel", () => {
  test("no recipe: asks for a capture", () => {
    const lines = describeHeadChefStatus("waitingForRecipe", baseContext({ currentOrder: null, ingredients: [] }));
    expect(lines[0]).toBe("RECIPE: none");
    expect(lines[1]).toBe("Waiting for recipe capture");
  });

  test("preparing: shows recipe, progress and each sous-chef's next gesture", () => {
    const lines = describeHeadChefStatus("preparingIngredients", baseContext());
    expect(lines[0]).toBe("RECIPE: PROTON (uud)");
    expect(lines[1]).toBe("Next: sous-chefs prepare the ingredients (2 left)");
    expect(lines).toContain("Ingredients: 1/3 delivered");
    expect(lines).toContain("  Chef 1: TENDERIZE up-1 40%  [doing: tenderize]");
    // Multi-step ingredient shows the current step, not the first one
    expect(lines).toContain("  Chef 2: STIR down-1 step 2/2 0%");
    expect(lines).toContain("  S3: no chef assigned");
  });

  test("a chef with nothing at the station is idle", () => {
    const ctx = baseContext({
      stations: [{ stationId: "S1", chefId: "chef-1", ingredientId: null, currentGestureIndex: 0, progress: 0, gesturesRequired: [] }],
      chefGestures: {},
    });
    expect(describeHeadChefStatus("preparingIngredients", ctx)).toContain("  Chef 1: idle, nothing to prepare");
  });

  test("final stir: every chef is asked to stir and the stir progress is shown", () => {
    const ctx = baseContext({
      stations: [{ stationId: "S1", chefId: "chef-1", ingredientId: null, currentGestureIndex: 0, progress: 0, gesturesRequired: [] }],
      chefGestures: {},
      stirProgress: 60,
    });
    const lines = describeHeadChefStatus("readyForFinalStir", ctx);
    expect(lines[1]).toBe("Next: everyone stir together (60%)");
    expect(lines).toContain("  Chef 1: ready to stir");
    expect(lines).toContain("Final stir (all chefs): 60%");
  });

  test("dish ready: head chef is told to submit", () => {
    expect(describeHeadChefStatus("recipeReadyForSubmit", baseContext())[1]).toContain("press the floor button");
  });

  test("served and failed orders say what happens next", () => {
    expect(describeHeadChefStatus("orderSuccess", baseContext())[1]).toContain("dish served");
    expect(describeHeadChefStatus("orderPenalized", baseContext())[1]).toContain("cancelled or failed");
  });

  test("ends with the score line", () => {
    const lines = describeHeadChefStatus("preparingIngredients", baseContext());
    expect(lines[lines.length - 1]).toBe("Score 0  ·  served 2  ·  failed 1");
  });
});
