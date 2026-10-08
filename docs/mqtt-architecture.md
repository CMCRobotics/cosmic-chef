# Cosmic Chef — MQTT Architecture & Topic Interactions

Reference document for component responsibilities, MQTT topic layouts, and cross-window coordination.

---

## 1. System Topology & Component Roles

Each client window (`index.html`) represents a view for a specific team (set via URL param `?team=blue|red|white`). The team is remembered in localStorage (`cosmic-chef.team`) and a `?team=` in the URL replaces it. `head-chef.html` uses the same team and only subscribes to its own team's state. A circular galley layout allows viewing all teams simultaneously, while each window runs its own local state machine for its active team.

```
                      ┌────────────────────────────────────────┐
                      │             MQTT Broker                │
                      └─────────────────┬──────────────────────┘
                                        │
                 ┌──────────────────────┴──────────────────────┐
                 │                                             │
      [Inbound Inputs / Commands]                   [State Broadcasts]
      - sous-chef-{n}/gesture/current               - state/broadcast
      - head-chef/animation/submit-state
      - round/recipe-desired
                 │                                             │
                 ▼                                             ▼
     ┌───────────────────────┐                    ┌─────────────────────────┐
     │      mqtt-bridge      │                    │  team-galley-receiver   │
     │  (1 per scene, local) │                    │ (1 per remote galley)   │
     └───────────┬───────────┘                    └────────────┬────────────┘
                 │ .send(event)                                │ 'game-state-changed'
                 ▼                                             ▼ (scoped to entity)
     ┌───────────────────────┐                    ┌─────────────────────────┐
     │  preparation-manager  │                    │     galley-manager      │
     │   (XState v5 Actor)   │                    │ (Remote 3D rendering)   │
     └───────────┬───────────┘                    └─────────────────────────┘
                 │ 'game-state-changed' (sceneEl)
                 ├───────────────────────────────┐
                 ▼                               ▼
     ┌───────────────────────┐       ┌───────────────────────┐
     │      mqtt-bridge      │       │     galley-manager    │
     │ (publishes broadcast) │       │ (Local 3D rendering)  │
     └───────────────────────┘       └───────────────────────┘
```

### Component Responsibility Matrix

| Component | Scope | Role | Subscribes (MQTT) | Publishes (MQTT) | DOM Events Handled / Emitted |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`preparation-manager`** | Scene (`<a-scene>`) | **Local State Machine Owner.** Runs the pure XState v5 actor for the local team. | *None (No network awareness)* | *None (No network awareness)* | - Receives `.send(event)` calls from `mqtt-bridge` / console.<br>- Emits `game-state-changed` and `invalid-gesture` on the scene element. |
| **`mqtt-bridge`** | Scene (`<a-scene>`) | **Local Controller / Bridge.** Translates inbound MQTT messages to local XState events, and publishes state changes to `state/broadcast`. | - `sous-chef-{n}/gesture/current`<br>- `head-chef/animation/submit-state`<br>- `round/recipe-desired` | - `state/broadcast` (when state value changes)<br>- *(Optional)* `round/recipe-actual` (dish completed) | - Listens to `game-state-changed` on scene.<br>- Calls `.send(event)` on `preparation-manager`. |
| **`team-galley-receiver`** | Entity (`<a-entity>`) | **Remote Observer.** Listens to MQTT broadcasts for a specific remote team and relays state to its child/peer `galley-manager`. | - `state/broadcast` (for that specific team)<br>- `identity/color` | *None (Read-only observer)* | - Dormant if `teamId === window.CURRENT_TEAM`.<br>- Emits `game-state-changed` **on its own entity** for remote teams. |


---

## 2. Topic Taxonomy for `team-{teamId}` / `game-{gameId}`

All game topics follow the Homie v4 convention under `cosmic-chef/team-{teamId}/game-{gameId}/`:

### 1. `.../round/recipe-desired`
- **Direction:** External Controller / Head Chef $\rightarrow$ `mqtt-bridge`
- **Purpose:** Requests a new recipe to be prepared.
- **Payload:** Recipe JSON definition (e.g. `{ name: "proton", composition: "uud", ... }`).
- **Handler:** `mqtt-bridge` parses it via `recipeMessageToEvent(payload)` and dispatches `{ type: 'CAPTURE_RECIPE', recipe }` to `preparation-manager`.
- **CRITICAL RULE:** `mqtt-bridge` must **never** publish to `recipe-desired`. Doing so triggers an infinite echo feedback loop.

### 2. `.../state/broadcast`
- **Direction:** `mqtt-bridge` $\rightarrow$ Remote `team-galley-receiver`s, dashboards, external observers
- **Purpose:** Full game state synchronization.
- **Payload:** `{ state: string, context: object }`.
- **Publish Trigger:** Published by `mqtt-bridge` **only when the state value changes** (e.g. `waitingForRecipe` $\rightarrow$ `preparingIngredients`).
- **Handler:** `team-galley-receiver` parses JSON and emits `game-state-changed` on its entity for `galley-manager` to render.

### 3. `.../head-chef/animation/submit-state`
- **Direction:** Head Chef view / UI $\rightarrow$ `mqtt-bridge`
- **Purpose:** Head chef actions (cancel order or submit prepared dish).
- **Payload:**
  - `"idle"` $\rightarrow$ `{ type: 'CANCEL_ORDER' }`
  - `"submitting"` $\rightarrow$ `{ type: 'SUBMIT_RECIPE' }`
- **Publishers:** `recipe-status-button.js`, keyboard simulator (`test-sous-chefs.html`).

### 4. `.../sous-chef-{n}/gesture/current`
- **Direction:** Motion sensors / keyboard simulator $\rightarrow$ `mqtt-bridge`
- **Purpose:** Real-time stream of physical gesture inputs from sous-chef $n$ ($1 \le n \le 3$).
- **Payload:** Gesture name (`"tenderize"`, `"slice"`, `"stir"`) or `"idle"`.
- **Handler:** `mqtt-bridge.pushGesture(chefId, gesture)` streams into RxJS pipeline, which emits `GESTURE_START`, `GESTURE_TICK` (every 100ms), and `GESTURE_STOP` into `preparation-manager`.

---

## 3. Anti-Patterns & Loop Hazards

### The Infinite "Echo" Loop
**Symptom:**
Rapid-fire oscillation between `recipe-desired`, `waitingForRecipe`, and `preparingIngredients`, repeating indefinitely on the broker.

**Cause:**
If `mqtt-bridge` subscribes to `round/recipe-desired`, and upon entering `preparingIngredients` also **publishes** the recipe back to `round/recipe-desired`, the broker echos the published message back to `mqtt-bridge`. When any order reset or cancellation occurs, the echoed message is consumed as a fresh order, re-entering `preparingIngredients` and republishing again.

**Rule:**
- Input topics are write-only for clients/controllers, read-only for `mqtt-bridge`.
- Broadcast topics (`state/broadcast`, `round/recipe-actual`) are write-only for `mqtt-bridge`, read-only for observers.

| **`galley-manager`** | Entity (`<a-entity>`) | **3D Visualizer.** Spawns, positions, animates, and vacuums 3D particle ingredients. | *None (No network awareness)* | *None (No network awareness)* | - If entity has active `team-galley-receiver`, listens to that entity.<br>- Otherwise falls back to scene (local team).<br>- Emits `next-round-requested` on scene when round reset completes. |
