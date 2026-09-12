# Cosmic Chef — Core Game Loop Summary

## Phase 1: Lobby & Setup
1. **Team Registration:** Players connect. The system registers the team with a randomly generated name (e.g., combining fun adjectives and names) and associates it with an active in-game color (`red`, `blue`, or `white`). The **Head Chef** (AR Headset) and active **Sous-Chefs** (Motion sensors via MQTT/Homie) are registered under this team.
2. **Game Start:** The session timer initializes (e.g., 5-minute arcade countdown).

## Phase 2: The Core Cooking Loop
1. **Capture Recipe:** 
   - The Head Chef secures a complex recipe falling from the sky.
   - The state transitions from `WaitingForRecipe` to `PreparingComplexDish`.
2. **Execution & Workload Management:**
   - **Sequential Steps (Assembly Line):** Sous-chefs perform gestures (`slice`, `dice`, `stir`, `smash`). Any available chef can claim the current step, but **the same chef cannot perform two sequential steps in a row** (enforcing teamwork, unless there is only one sous-chef available).
   - **Synchronized Steps (Mega-Fusions):** Occasionally, a step requires *all* active sous-chefs to perform the required gesture simultaneously.
   - **Hold & Progression Mechanics:** Gestures are held over time via ticks. Depending on the step's `behaviorType`:
     - *Uninterruptible (Decay):* Stopping mid-way resets progress to 0%.
     - *Resumable (Cumulative):* Stopping mid-way preserves progress for later completion.
3. **Step Completion & Progression:**
   - When a step reaches 100% progress, the system advances to the next step index (`AdvanceStep`).
   - If a step times out (60s) or the Head Chef cancels, the team enters `OrderPenalized` (score penalty, failed dish count increments).
4. **Order Success:**
   - Once all steps in the complex recipe sequence are fulfilled, the state hits `OrderSuccess` (points awarded, completed dish count increments).
   - Automatically loops back to `WaitingForRecipe`.

## Phase 3: Game Over & Analytics
- When the global session timer expires, the game transitions to `GameOver`.
- Final statistics are tallied and displayed: completed dishes, non-conformant/penalized orders, individual sous-chef precision, and all-time leaderboards.

