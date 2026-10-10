# Cosmic Chef — MQTT Architecture & Topic Interactions

Reference document for component responsibilities, MQTT topic layouts, and cross-window coordination.

---

## 1. System Topology & Component Roles

Each client window (`index.html`) represents a view for a specific team (set via URL param `?team=blue|red|white`). The team is remembered in localStorage (`cosmic-chef.team`) and a `?team=` in the URL replaces it. `vr.html` uses the same team and only subscribes to its own team's state. A circular galley layout allows viewing all teams simultaneously, while each window runs its own local state machine for its active team.

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
| **`mqtt-bridge`** | Scene (`<a-scene>`) | **Local Controller / Bridge.** Translates inbound MQTT messages to local XState events, and publishes state changes to `state/broadcast`. | - `sous-chef-{n}/gesture/current`<br>- `head-chef/animation/submit-state`<br>- `round/recipe-desired`<br>- `score/reset` | - `state/broadcast` (retained, when state value changes)<br>- *(Optional)* `round/recipe-actual` (dish completed) | - Listens to `game-state-changed` on scene.<br>- Calls `.send(event)` on `preparation-manager`. |
| **`head-chef-mqtt-client`** | Scene (`<a-scene>`) | **Head-Chef Client** (`vr.html`). Re-emits the team's state, and publishes head-chef actions. | - `state/broadcast` (own team)<br>- `identity/color` (own team, retained) | - `head-chef/animation/submit-state` (from tractor-beam and recipe-status-button) | - Emits `game-state-changed` and `team-color-changed` on the scene. |
| **`scoring-mqtt-client`** | Scene (`<a-scene>`, `scoring.html`) | **Scoring Client.** Keeps every team's score for the scoring screen, and publishes the score reset. | - `state/broadcast` (every team)<br>- `identity/color` (every team) | - `score/reset` (every team, on the reset button) | - Emits `scores-changed` on the scene. Read by `scoring-screen` and `scoring-reset-button`. |
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
- **Direction:** `mqtt-bridge` $\rightarrow$ Remote `team-galley-receiver`s, `scoring-mqtt-client`, dashboards, external observers
- **Purpose:** Full game state synchronization.
- **Payload:** `{ state: string, context: object }`. `context.score` is the team's score.
- **Retained:** yes. A window that opens later (for example the scoring screen) gets the current state at once.
- **Publish Trigger:** Published by `mqtt-bridge` **when the state value changes** (e.g. `waitingForRecipe` $\rightarrow$ `preparingIngredients`), and throttled while a gesture changes the context.
- **Handler:** `team-galley-receiver` parses JSON and emits `game-state-changed` on its entity for `galley-manager` to render.

### 3. `.../head-chef/animation/submit-state`
- **Direction:** Head Chef view / UI $\rightarrow$ `mqtt-bridge`
- **Purpose:** Head chef actions (cancel order or submit prepared dish).
- **Payload:**
  - `"idle"` $\rightarrow$ `{ type: 'CANCEL_ORDER' }`
  - `"submitting"` $\rightarrow$ `{ type: 'SUBMIT_RECIPE' }`
- **Publishers:** `recipe-status-button.js`, keyboard simulator (`dev/test-sous-chefs.html`).

### 4. `.../sous-chef-{n}/gesture/current`
- **Direction:** Motion sensors / keyboard simulator / micro:bit radio gateway $\rightarrow$ `mqtt-bridge`
- **Purpose:** Real-time stream of physical gesture inputs from sous-chef $n$ ($1 \le n \le 3$).
- **Payload:** Gesture name (`"tenderize"`, `"slice"`, `"stir"`) or `"idle"`.
- **Handler:** `mqtt-bridge.pushGesture(chefId, gesture)` streams into RxJS pipeline, which emits `GESTURE_START`, `GESTURE_TICK` (every 100ms), and `GESTURE_STOP` into `preparation-manager`.
- **micro:bit publisher:** `MicrobitGateway` (`src/client/microbit-gateway.ts`, page `/dev/microbit-gateway.html`) publishes here for each bound terminal. A start (`GEST,<g>,1`) sends the gesture name and a stop sends `idle`. Radio protocol: [`microbit-devices.md`](microbit-devices.md#radio-gesture-protocol).

### 4a. `.../score/reset`
- **Direction:** Scoring screen (`scoring.html`) $\rightarrow$ `mqtt-bridge` (one publish per team)
- **Purpose:** Zero the team's score, served count and failed count.
- **Payload:** `"reset"`. Anything else is ignored.
- **Not retained.** A retained reset would apply again on every reconnect and wipe a game in progress. The reset reaches only the galleys that are open when it is sent.
- **Handler:** `mqtt-bridge` maps it to `RESET_SCORE` with `scoreResetMessageToEvent`. The machine handles `RESET_SCORE` in every state and leaves the current order alone. The new scores reach the screen through the next `state/broadcast`.

### 4b. `homie/terminal-{serialHex}/...` (micro:bit terminals)
- **Direction:** micro:bit radio gateway $\rightarrow$ observers (dashboards, Homie consumers). Not read by the game.
- **Purpose:** Homie v4 device per micro:bit terminal, with its sous-chef binding and live gesture.
- **Topics:** `config/team` and `config/sousChef` (retained, `sous-chef-N` or `none`), `controls/gesture` (`<gesture>-<ms>` / `<gesture>-0`, not retained), plus retained `$homie`, `$name`, `$state`, `$nodes` and `$properties`.
- **Builder:** `terminalTopic(terminalId, path)` in `src/client/topics.ts`. Full schema in [`homie-devices.md`](homie-devices.md) and [`microbit-devices.md`](microbit-devices.md).

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
