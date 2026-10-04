import { describe, test, expect } from "bun:test";
import { Subject } from "rxjs";
import { TestScheduler } from "rxjs/testing";
import { createActor } from "xstate";
import { preparationMachine, RECIPES } from "../public/xstate/preparation-machine.js";
import {
  gameSubscriptions,
  headChefSubmitTopic,
  parseTopic,
  recipeTopic,
  sousChefGestureTopic,
} from "../src/client/topics";
import {
  chefIdFor,
  createGestureEventStream,
  headChefMessageToEvent,
  recipeMessageToEvent,
} from "../src/client/adapters";

describe("topics", () => {
  test("builds the documented topic layout", () => {
    expect(sousChefGestureTopic("team-1", "default", 2)).toBe(
      "cosmic-chef/team-team-1/game-default/sous-chef-2/gesture/current"
    );
    expect(headChefSubmitTopic("team-1", "default")).toBe(
      "cosmic-chef/team-team-1/game-default/head-chef/animation/submit-state"
    );
    expect(recipeTopic("team-1", "default")).toBe("cosmic-chef/team-team-1/game-default/round/recipe");
  });

  test("subscriptions cover head chef, recipe and every sous-chef", () => {
    expect(gameSubscriptions("t", "g", 3)).toEqual([
      headChefSubmitTopic("t", "g"),
      recipeTopic("t", "g"),
      sousChefGestureTopic("t", "g", 1),
      sousChefGestureTopic("t", "g", 2),
      sousChefGestureTopic("t", "g", 3),
    ]);
  });

  test("parseTopic round-trips built topics and rejects other games", () => {
    expect(parseTopic(sousChefGestureTopic("t", "g", 3), "t", "g")).toEqual({ kind: "sous-chef-gesture", sousChef: 3 });
    expect(parseTopic(headChefSubmitTopic("t", "g"), "t", "g")).toEqual({ kind: "head-chef-submit" });
    expect(parseTopic(recipeTopic("t", "g"), "t", "g")).toEqual({ kind: "recipe" });
    expect(parseTopic(recipeTopic("t", "other"), "t", "g")).toBeNull();
    expect(parseTopic("cosmic-chef/team-t/game-g/unknown", "t", "g")).toBeNull();
  });
});

describe("head-chef and recipe adapters", () => {
  test("head-chef submit-state maps to cancel / submit", () => {
    expect(headChefMessageToEvent("idle")).toEqual({ type: "CANCEL_ORDER" });
    expect(headChefMessageToEvent("submitting")).toEqual({ type: "SUBMIT_RECIPE" });
    expect(headChefMessageToEvent("SUBMITTING ")).toEqual({ type: "SUBMIT_RECIPE" });
    expect(headChefMessageToEvent("dancing")).toBeNull();
  });

  test("recipe payload maps to CAPTURE_RECIPE, garbage to null", () => {
    const proton = RECIPES.find((r) => r.name === "proton");
    expect(recipeMessageToEvent(JSON.stringify(proton))).toEqual({ type: "CAPTURE_RECIPE", recipe: proton });
    expect(recipeMessageToEvent("not json")).toBeNull();
    expect(recipeMessageToEvent(JSON.stringify({ name: "x" }))).toBeNull();
  });

  test("chefIdFor matches the machine's station chef ids", () => {
    expect(chefIdFor(1)).toBe("chef-1");
  });
});

describe("gesture event stream", () => {
  const options = (scheduler: TestScheduler) => ({ tickMs: 10, maxGestureMs: 35, scheduler });

  function run(marbles: string, values: Record<string, { chefId: string; gesture: string }>) {
    const scheduler = new TestScheduler((actual, expected) => expect(actual).toEqual(expected));
    const frames: Record<number, any[]> = {};
    scheduler.run(({ cold }) => {
      createGestureEventStream(cold(marbles, values), options(scheduler)).subscribe((e) => {
        (frames[scheduler.now()] ||= []).push(e);
      });
    });
    return frames;
  }

  test("emits START, then TICKs until idle, then STOP", () => {
    const frames = run("a 24ms b", {
      a: { chefId: "chef-1", gesture: "slice" },
      b: { chefId: "chef-1", gesture: "idle" },
    });
    expect(frames).toEqual({
      0: [{ type: "GESTURE_START", chefId: "chef-1", gesture: "slice" }],
      10: [{ type: "GESTURE_TICK", chefId: "chef-1", gesture: "slice" }],
      20: [{ type: "GESTURE_TICK", chefId: "chef-1", gesture: "slice" }],
      25: [{ type: "GESTURE_STOP", chefId: "chef-1" }],
    });
  });

  test("stops ticking after maxGestureMs", () => {
    const frames = run("a", { a: { chefId: "chef-1", gesture: "stir" } });
    const ticks = Object.values(frames).flat().filter((e) => e.type === "GESTURE_TICK");
    expect(ticks.length).toBe(3); // 10, 20, 30 — cut off at 35
  });

  test("chefs tick independently; repeated identical updates don't restart", () => {
    const frames = run("a b 3ms a", {
      a: { chefId: "chef-1", gesture: "slice" },
      b: { chefId: "chef-2", gesture: "stir" },
    });
    expect(frames[0]).toEqual([{ type: "GESTURE_START", chefId: "chef-1", gesture: "slice" }]);
    expect(frames[1]).toEqual([{ type: "GESTURE_START", chefId: "chef-2", gesture: "stir" }]);
    // chef-1 repeat at t=5 is ignored: its ticks stay on the original 10ms cadence
    expect(frames[10]).toEqual([{ type: "GESTURE_TICK", chefId: "chef-1", gesture: "slice" }]);
    expect(frames[11]).toEqual([{ type: "GESTURE_TICK", chefId: "chef-2", gesture: "stir" }]);
  });

  test("drives a full recipe through the real machine", () => {
    const actor = createActor(preparationMachine).start();
    actor.send({ type: "SET_ACTIVE_CHEFS", count: 2 });
    actor.send({ type: "CAPTURE_RECIPE", recipe: RECIPES.find((r) => r.name === "pion") });

    const input = new Subject<{ chefId: string; gesture: string }>();
    const scheduler = new TestScheduler(() => {});
    scheduler.run(() => {
      createGestureEventStream(input, { tickMs: 10, maxGestureMs: 1000, scheduler }).subscribe((e) => actor.send(e));
      input.next({ chefId: "chef-1", gesture: "tenderize" });
      input.next({ chefId: "chef-2", gesture: "stir" });
      scheduler.schedule(() => input.next({ chefId: "chef-1", gesture: "stir" }), 105);
      scheduler.schedule(() => {
        input.next({ chefId: "chef-1", gesture: "idle" });
        input.next({ chefId: "chef-2", gesture: "idle" });
      }, 300);
    });

    const { value, context } = actor.getSnapshot();
    expect(value).toBe("recipeReadyForSubmit");
    expect(context.chefGestures).toEqual({ "chef-1": "idle", "chef-2": "idle" });
  });
});
