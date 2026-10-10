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
    expect(lines[0]).toBe("RECETTE : aucune");
    expect(lines[1]).toBe("En attente de recette");
  });

  test("preparing: shows recipe, progress and each sous-chef's next gesture", () => {
    const lines = describeHeadChefStatus("preparingIngredients", baseContext());
    expect(lines[0]).toBe("RECETTE : PROTON (uud)");
    expect(lines[1]).toBe("Suivant : preparer (2 restants)");
    expect(lines).toContain("Ingredients : 1/3 livres");
    expect(lines).toContain("  Chef 1 : Attendrir up-1 40%  [fait : Attendrir]");
    // Multi-step ingredient shows the current step, not the first one
    expect(lines).toContain("  Chef 2 : Remuer down-1 etape 2/2 0%");
    expect(lines).toContain("  S3 : aucun chef");
  });

  test("a chef with nothing at the station is idle", () => {
    const ctx = baseContext({
      stations: [{ stationId: "S1", chefId: "chef-1", ingredientId: null, currentGestureIndex: 0, progress: 0, gesturesRequired: [] }],
      chefGestures: {},
    });
    expect(describeHeadChefStatus("preparingIngredients", ctx)).toContain("  Chef 1 : libre");
  });

  test("final stir: every chef is asked to stir and the stir progress is shown", () => {
    const ctx = baseContext({
      stations: [{ stationId: "S1", chefId: "chef-1", ingredientId: null, currentGestureIndex: 0, progress: 0, gesturesRequired: [] }],
      chefGestures: {},
      stirProgress: 60,
    });
    const lines = describeHeadChefStatus("readyForFinalStir", ctx);
    expect(lines[1]).toBe("Suivant : tous melangent (60%)");
    expect(lines).toContain("  Chef 1 : pret a melanger");
    expect(lines).toContain("Melange final (tous) : 60%");
  });

  test("dish ready: head chef is told to submit", () => {
    expect(describeHeadChefStatus("recipeReadyForSubmit", baseContext())[1]).toContain("bouton vert au sol");
  });

  test("served and failed orders say what happens next", () => {
    expect(describeHeadChefStatus("orderSuccess", baseContext())[1]).toContain("servi");
    expect(describeHeadChefStatus("orderPenalized", baseContext())[1]).toContain("rate ou annule");
  });

  test("ends with the score line", () => {
    const lines = describeHeadChefStatus("preparingIngredients", baseContext());
    expect(lines[lines.length - 1]).toBe("Score 0  ·  servis 2  ·  rates 1");
  });
});
