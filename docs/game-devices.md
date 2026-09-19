# Cosmic Chef — Game state as Homie IOT devices

Modeling the entire game state, events, and team states using the **Homie IoT Convention** over MQTT is a brilliant approach for a physical installation, arcade cabinet, or multi-screen party setup. It means your lighting effects, scoreboards, AR headset UI, and physical props can all "listen" and react to the exact same state machine.

By utilizing Homie's customizable base topic capability, we define the MQTT prefix as **`cosmic-chef`** instead of the default `homie`. This allows us to drop redundant `cosmic-chef-` prefixes from our device names entirely.

Here is how you design the **Homie Device Topology**, map XState to MQTT publishing, and handle inbound events for **Cosmic Chef**.

---

### 1. Homie Device Topology Architecture

Under Homie, everything is organized into **Devices**, which contain **Nodes**, which contain **Properties**. For *Cosmic Chef*, we split this into three types of Homie devices under the `cosmic-chef/` base topic:
1. **The Game Session Device (`session`)**: Represents the global state of the game, active recipes, scores, and timers.
2. **The Team Devices (`team-red`, `team-blue`, etc.)**: Represent individual team states, active sous-chefs, and preparation metrics.
3. **The Sous-Chef Devices (`chef-0` to `chef-9`)**: Represent individual sous-chef actors, their physical or virtual controllers, display names, and their active gesture states.

---

### 2. Homie Topic Tree & Schema Specifications

#### **Device A: Global Session (`session`)**
Tracks what the entire game/server is doing.
* `cosmic-chef/session/$name` → `"Cosmic Chef Session Engine"`
* `cosmic-chef/session/$state` → `"ready"`
* `cosmic-chef/session/$nodes` → `"game,recipe"`
* **Node: `game`**
  * `cosmic-chef/session/game/state` (String) → `LobbySetup`, `Playing`, `GameOver`
  * `cosmic-chef/session/game/time-remaining` (Integer) → Seconds left in session
* **Node: `recipe`**
  * `cosmic-chef/session/recipe/active-id` (String) → ID of the current recipe (e.g., `proton`)
  * `cosmic-chef/session/recipe/current-step` (Integer) → Step index
  * `cosmic-chef/session/recipe/progress` (Float 0-1) → Hold progress of the current step

#### **Device B: Team State (`team-red`)**
Tracks a specific team's score, performance, and bound micro:bit terminals.
* `cosmic-chef/team-red/$name` → `"Team Red Kitchen"`
* `cosmic-chef/team-red/$nodes` → `"metrics,status"`
* **Node: `metrics`**
  * `cosmic-chef/team-red/metrics/score` (Integer) → Current team score
  * `cosmic-chef/team-red/metrics/dishes-completed` (Integer)
  * `cosmic-chef/team-red/metrics/dishes-failed` (Integer)
* **Node: `status`**
  * `cosmic-chef/team-red/status/kitchen-state` (String) → `WaitingForRecipe`, `Preparing`, `Success`, `Penalized`
  * `cosmic-chef/team-red/status/active-workers` (String/JSON) → Which micro:bits are actively holding gestures

#### **Device C: Sous-Chef Controller (`chef-0`)**
Tracks an individual sous-chef, their display name, and their active cooking gesture.
* `cosmic-chef/chef-0/$name` → `"Sous-Chef Controller 0"`
* `cosmic-chef/chef-0/$state` → `"ready"`
* `cosmic-chef/chef-0/$nodes` → `"identity,gesture"`
* **Node: `identity`**
  * `cosmic-chef/chef-0/identity/name` (String, settable) → Current display/assigned name (e.g., `"Chef Gordon"`)
* **Node: `gesture`**
  * `cosmic-chef/chef-0/gesture/current` (String) → Currently performed gesture (e.g., `"none"`, `"slice"`, `"dice"`, `"stir"`, `"smash"`)
  * `cosmic-chef/chef-0/gesture/intensity` (Float 0-1) → Speed or force of gesture execution (0.0 for static, 1.0 for high activity)

---

### Benefits of Modeling Everything in Homie:
1. **Physical Lighting & Props Integration:** Because game states (`Success`, `Penalized`) are published to MQTT topics like `cosmic-chef/team-red/status/kitchen-state`, you can easily hook up ESP8266/ESP32 LED strips around the physical kitchen counters to flash green on success or red on penalty automatically.
2. **Decoupled Dashboards:** Your AR headset UI, wall leaderboards, and debugging tools don't need direct access to the game server memory; they can just subscribe to the Homie broker.
3. **Unified Standard:** Both your micro:bit input terminals and your output game states share the exact same clean IoT convention (`Device/Node/Property`).