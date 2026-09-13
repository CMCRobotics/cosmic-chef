import { describe, test, expect } from "bun:test";
import { createActor } from "xstate";
import { preparationMachine } from "../public/xstate/preparation-machine.js";

describe("preparation-machine", () => {
    test("initial state is idle", () => {
        const actor = createActor(preparationMachine);
        actor.start();
        expect(actor.getSnapshot().value).toBe("idle");
    });

    test("START_GAME transitions to orderRequested and triggers selectNewOrder", () => {
        const actor = createActor(preparationMachine);
        actor.start();
        actor.send({ type: "START_GAME" });
        expect(actor.getSnapshot().value).toBe("orderRequested");
        expect(actor.getSnapshot().context.currentOrder).not.toBeNull();
        expect(actor.getSnapshot().context.currentIngredients).toEqual([]);
    });

    test("ORDER_ACCEPTED transitions to cooking", () => {
        const actor = createActor(preparationMachine);
        actor.start();
        actor.send({ type: "START_GAME" });
        actor.send({ type: "ORDER_ACCEPTED" });
        expect(actor.getSnapshot().value).toBe("cooking");
    });

    test("ADD_INGREDIENT pushes ingredients to currentIngredients", () => {
        const actor = createActor(preparationMachine);
        actor.start();
        actor.send({ type: "START_GAME" });
        actor.send({ type: "ORDER_ACCEPTED" });
        actor.send({ type: "ADD_INGREDIENT", ingredient: "u" });
        actor.send({ type: "ADD_INGREDIENT", ingredient: "d" });
        expect(actor.getSnapshot().context.currentIngredients).toEqual(["u", "d"]);
    });

    test("CLEAR_KITCHEN empties ingredients list", () => {
        const actor = createActor(preparationMachine);
        actor.start();
        actor.send({ type: "START_GAME" });
        actor.send({ type: "ORDER_ACCEPTED" });
        actor.send({ type: "ADD_INGREDIENT", ingredient: "u" });
        actor.send({ type: "CLEAR_KITCHEN" });
        expect(actor.getSnapshot().context.currentIngredients).toEqual([]);
    });

    test("SUBMIT_DISH evaluates dynamic validation", () => {
        const actor = createActor(preparationMachine);
        actor.start();
        actor.send({ type: "START_GAME" });
        
        // Check what recipe was selected
        const order = actor.getSnapshot().context.currentOrder;
        expect(order).not.toBeNull();
        
        actor.send({ type: "ORDER_ACCEPTED" });
        
        // Add matching formula
        order.formula.forEach(ing => {
            actor.send({ type: "ADD_INGREDIENT", ingredient: ing });
        });
        
        actor.send({ type: "SUBMIT_DISH" });
        expect(actor.getSnapshot().value).toBe("serving");
    });

    test("SUBMIT_DISH fails when ingredients are incorrect", () => {
        const actor = createActor(preparationMachine);
        actor.start();
        actor.send({ type: "START_GAME" });
        actor.send({ type: "ORDER_ACCEPTED" });
        
        // Add wrong ingredients
        actor.send({ type: "ADD_INGREDIENT", ingredient: "invalid" });
        
        actor.send({ type: "SUBMIT_DISH" });
        expect(actor.getSnapshot().value).toBe("roundFailed");
    });
    
    test("roundSuccess increments score by 100", () => {
        const actor = createActor(preparationMachine);
        actor.start();
        actor.send({ type: "START_GAME" });
        const order = actor.getSnapshot().context.currentOrder;
        actor.send({ type: "ORDER_ACCEPTED" });
        order.formula.forEach(ing => {
            actor.send({ type: "ADD_INGREDIENT", ingredient: ing });
        });
        actor.send({ type: "SUBMIT_DISH" });
        expect(actor.getSnapshot().value).toBe("serving");
        
        actor.send({ type: "SERVING_COMPLETE" });
        expect(actor.getSnapshot().value).toBe("roundSuccess");
        expect(actor.getSnapshot().context.score).toBe(100);
    });
});
