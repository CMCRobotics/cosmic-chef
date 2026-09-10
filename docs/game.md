# Cosmic Chef — Game Reference

> **Purpose.** This is the single source of truth for the game behind *Cosmic Chef*. It serves two audiences at once:
>
> - **Humans** (designers, artists, physics reviewers) — to keep the gameplay coherent.
> - **Coding agents** — to author new content (ingredients, dishes, recipes, UI copy, tutorials) while sticking to the rules.
>
> **Authoring rule:** update this document *first*, then make game content mirror it. This doc is the authority; scene fragments, components and data files are its implementation.
>
> *Scope:* content correctness only. For code architecture, build and conventions, see [`AGENTS.md`](../AGENTS.md).

---

## 1. The pitch

You are a **cosmic chef**. The universe is the kitchen, fundamental particles are the **ingredients**, and the laws of the Standard Model are the **rules of the kitchen**. Combining ingredients the way nature actually allows produces **bound states** — the **dishes** you serve to the never-ending appetite of the primordial chaos.

Core loop: **capture a recipe → direct the sous-chefs to prepare it → serve the dish.**

Game setup : 
- Participants are regrouped in teams of :
  - One head chef.
  - One or more sous-chefs.
- Teams are registered :
  - Name of the team (with timestamp) - randomly generated with fun adjectives and name combinations (e.g., "Crimson Quarks"), and associated with an in-game team color (`red`, `blue`, or `white`).
  - Name of the chefs.
- One head chef wears an augmented reality headset. They capture and secure recipes falling from the sky and triggers dish preparation.
- At any point, the head chef can :
   - see the status of the current dish preparation.
   - cancel the order and have to go capture another recipe, the team is penalized for not fulfilling the order.
   - trigger the dish delivery - but the dish must be as expected, or the team is penalized.
- While the recipe is on, the sous-chefs are tasked with preparing it under the vocal direction of the head chef.
- The sous-chefs are sitting in front of a screen that reflects their interactions in-game.
- The sous-chefs are equipped with motion sensors which are used to trigger in-game preparation steps (we map usual cooking gestures such as slicing and dicing to trigger quarks transformations into different states).
- The sous-chefs can be up to three, but the recipe preparation only takes place as two possible preparation modes :
  - **Sequential Steps (Assembly Line):** A sequence of distinct preparation steps, during which one sous-chef cannot undertake two consecutive steps (another sous-chef must necessarily take over), unless there is only one sous-chef available at all.
  - **Synchronized Steps (Mega-Fusions):** A synchronized action during which all active sous-chefs must perform the required gesture simultaneously without interruption until completion.
- There are two types of preparation steps :
  - **Resumable (Cumulative) steps:** The time of active preparation is accrued even if the preparation is interrupted (e.g. the motion sensor detects the move is not accurately performed).
  - **Uninterruptible (Decay) steps:** The preparation resets the progress of that particular step back to 0% if the preparation is interrupted.
- When all the preparation steps have been fulfilled, the head chef can trigger the **dish delivery**. Points are scored according to whether the dish matches the recipe and how fast it was produced.
- After a given period of time, the entire game is stopped and all-time scores, game scores and per-team scores are being tallied and visualized :
  - How many completed dishes ? How many non-conformant dishes ? How many attempted recipes ? Overall average preparation time per dish ?
  - Most accurate individual sous-chef ? Best head chef ?
  - Top ten head chef ? top ten sous-chef ?


The design bet: the *presentation* is surreal and cosmic, relying on smooth animations and low-poly style assets.


## 7. From this doc to the game

This document defines the **content contract**, not the storage format. The current codebase has no physics data yet; when you add it, keep the factual tables centralized here and never scatter Standard Model facts across gameplay code.

Two options consistent with the existing architecture (see [`AGENTS.md`](../AGENTS.md)):

1. **Component-driven** — a new A-Frame component in `public/components/` that owns ingredient/dish behaviour, matching the existing `load-fragment` / `linear-animation` pattern.
2. **Fragment-driven** — declare entities directly in a scene fragment such as `public/scene.html`, for small fixed sets.

Whichever is chosen, the values above remain the ground truth.

---

*Keep this document in sync with any content change that touches gameplay facts.*
