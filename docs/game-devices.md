# Cosmic Chef — Game state as Homie IOT devices

Modeling the entire game state, events, and team states using the **Homie IoT Convention** over MQTT is a brilliant approach for a physical installation, arcade cabinet, or multi-screen party setup. It means your lighting effects, scoreboards, AR headset UI, and physical props can all "listen" and react to the exact same state machine.

Here is how you design the **Homie Device Topology**, map XState to MQTT publishing, and handle inbound events for **Cosmic Chef**.

---

### 1. Homie Device Topology Architecture

Under Homie, everything is organized into **Devices**, which contain **Nodes**, which contain **Properties**. For *Cosmic Chef*, we can split this into two types of Homie devices:
1. **The Game Session Device (`cosmic-chef-session`)**: Represents the global state of the game, active recipes, scores, and timers.
2. **The Team Devices (`cosmic-chef-team-red`, `cosmic-chef-team-blue`, etc.)**: Represent individual team states, active sous-chefs, and preparation metrics.

---

### 2. Homie Topic Tree & Schema Specifications

#### **Device A: Global Session (`cosmic-chef-session`)**
Tracks what the entire game/server is doing.
* `homie/cosmic-chef-session/$name` → `"Cosmic Chef Session Engine"`
* `homie/cosmic-chef-session/$state` → `"ready"`
* `homie/cosmic-chef-session/$nodes` → `"game,recipe"`
* **Node: `game`**
  * `homie/cosmic-chef-session/game/state` (String) → `LobbySetup`, `Playing`, `GameOver`
  * `homie/cosmic-chef-session/game/time-remaining` (Integer) → Seconds left in session
* **Node: `recipe`**
  * `homie/cosmic-chef-session/recipe/active-id` (String) → ID of the current recipe (e.g., `proton`)
  * `homie/cosmic-chef-session/recipe/current-step` (Integer) → Step index
  * `homie/cosmic-chef-session/recipe/progress` (Float 0-1) → Hold progress of the current step

#### **Device B: Team State (`cosmic-chef-team-red`)**
Tracks a specific team's score, performance, and bound micro:bit terminals.
* `homie/cosmic-chef-team-red/$name` → `"Team Red Kitchen"`
* `homie/cosmic-chef-team-red/$nodes` → `"metrics,status"`
* **Node: `metrics`**
  * `homie/cosmic-chef-team-red/metrics/score` (Integer) → Current team score
  * `homie/cosmic-chef-team-red/metrics/dishes-completed` (Integer)
  * `homie/cosmic-chef-team-red/metrics/dishes-failed` (Integer)
* **Node: `status`**
  * `homie/cosmic-chef-team-red/status/kitchen-state` (String) → `WaitingForRecipe`, `Preparing`, `Success`, `Penalized`
  * `homie/cosmic-chef-team-red/status/active-workers` (String/JSON) → Which micro:bits are actively holding gestures

---

### Benefits of Modeling Everything in Homie:
1. **Physical Lighting & Props Integration:** Because game states (`Success`, `Penalized`) are published to MQTT topics like `homie/cosmic-chef-team-red/status/kitchen-state`, you can easily hook up ESP8266/ESP32 LED strips around the physical kitchen counters to flash green on success or red on penalty automatically.
2. **Decoupled Dashboards:** Your AR headset UI, wall leaderboards, and debugging tools don't need direct access to the game server memory; they can just subscribe to the Homie broker.
3. **Unified Standard:** Both your micro:bit input terminals and your output game states share the exact same clean IoT convention (`Device/Node/Property`).