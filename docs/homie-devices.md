# Homie v4 MQTT Specification — Cosmic Chef Game State

Reference for the Homie v4-compliant MQTT topic hierarchy that tracks real-time game state, player participation, and performance metrics. This bridges the game engine (running in the browser) to external systems (viz dashboards, physical displays, coaching apps, analytics).

## Overview

**Device Structure:** single MQTT topic namespace (`cosmic-chef`) organized by teams, games, and players.

**Root topic:** `cosmic-chef/`

**Topic hierarchy:** 
- Team in a game: `cosmic-chef/team-{team-id}/game-{game-id}/{node-id}/{property-id}`
- Global (per-game): `cosmic-chef/game-{game-id}/{node-id}/{property-id}`
- Global player registry: `cosmic-chef/player-{player-id}/{node-id}/{property-id}`

**Entities:**
- **Teams:** globally unique `team-id`; can participate in multiple games
- **Games:** unique `game-id` (UUID, timestamp, or human-readable name); contain multiple teams
- **Players:** globally unique `player-id`; can play multiple games in different roles (head-chef or sous-chef)

Each role (head-chef, sous-chef-{1,2,3}) in a team-game combination has a `player-id` property that references the global player registry, enabling tracking of individual player participation across all games and roles.

**Subscription patterns:**
- All data: `cosmic-chef/#`
- All games a team plays in: `cosmic-chef/team-1/#`
- Specific team in specific game: `cosmic-chef/team-1/game-session-001/#`
- All games a specific player participated in: `cosmic-chef/player-alice-001/#`
- Global game state: `cosmic-chef/game-session-001/#`

All properties are read-only (game → MQTT), except where noted (coaching signals → game).

---

## Node: Head Chef

**Node ID:** `head-chef`

**Topic path:** `cosmic-chef/team-{team-id}/game-{game-id}/head-chef/{property-id}`

Represents the primary player's spatial position, gestures, animations, and performance in a specific game.

### Properties

| Property | Type | Unit | Range | Settable | Notes |
|----------|------|------|-------|----------|-------|
| `player-id` | string | — | — | No | Globally unique player identifier for this role |
| `orientation/heading` | float | degrees | 0–360 | No | Compass heading (0=North); updated at 60Hz |
| `orientation/pitch` | float | degrees | -90–90 | No | Up/down tilt; updated at 60Hz |
| `orientation/roll` | float | degrees | -180–180 | No | Side lean; updated at 60Hz |
| `position/x` | float | meters | -∞–∞ | No | World X coordinate relative to world-root |
| `position/y` | float | meters | -∞–∞ | No | World Y coordinate (height); typically 1.5–2.0m |
| `position/z` | float | meters | -∞–∞ | No | World Z coordinate depth |
| `gesture/current` | enum | — | `idle`, `reaching`, `cutting`, `stirring`, `smashing`, `slicing`, `dicing`, `submitting` | No | Active gesture state; transitions per gesture FSM |
| `gesture/confidence` | float | — | 0–1 | No | ML confidence score for current gesture (0=uncertain, 1=certain) |
| `animation/capture-state` | enum | — | `idle`, `capturing`, `captured`, `failed` | No | Ingredient capture animation phase |
| `animation/submit-state` | enum | — | `idle`, `preparing`, `submitting`, `accepted`, `rejected` | No | Dish submission animation phase |
| `performance/gesture-count` | integer | count | 0–∞ | No | Total gestures performed in this round |
| `performance/error-count` | integer | count | 0–∞ | No | Total gesture recognition failures in this round |
| `performance/accuracy` | float | % | 0–100 | No | Accuracy rate: `(gesture-count - error-count) / gesture-count * 100` |
| `performance/speed` | float | gestures/min | 0–∞ | No | Gesture frequency: gestures in the last 60 seconds |
| `score/current` | integer | points | 0–∞ | No | Current score this round |
| `score/combo` | integer | count | 0–∞ | No | Current combo multiplier (dishes completed without error) |
| `avatar/name` | string | — | — | No | Display name of the head chef |
| `avatar/color` | string | hex | — | No | Color identifier (e.g. `#FF0000`) |

---

## Node: Sous Chef

**Node ID:** `sous-chef-{sous-id}` (where `sous-id` is 1, 2, or 3)

**Topic path:** `cosmic-chef/team-{team-id}/game-{game-id}/sous-chef-{sous-id}/{property-id}`

Represents each station-bound sous chef (right hand, left hand, idle/helpers) in a specific game.

### Properties

| Property | Type | Unit | Range | Settable | Notes |
|----------|------|------|-------|----------|-------|
| `player-id` | string | — | — | No | Globally unique player identifier for this role |
| `identity/station-id` | integer | — | 1–3 | No | Station assignment: 1=right, 2=left, 3=prep/helpers |
| `identity/role` | enum | — | `hand-right`, `hand-left`, `prep-station` | No | Functional role at this station |
| `gesture/current` | enum | — | `idle`, `reaching`, `cutting`, `stirring`, `smashing`, `slicing`, `dicing` | No | Active gesture state at this station |
| `gesture/confidence` | float | — | 0–1 | No | ML confidence for current gesture |
| `gesture/sustain-time` | float | seconds | 0–∞ | No | Duration of current gesture hold (for sustained gestures) |
| `performance/gesture-count` | integer | count | 0–∞ | No | Gestures performed at this station in this round |
| `performance/error-count` | integer | count | 0–∞ | No | Gesture recognition failures at this station |
| `performance/accuracy` | float | % | 0–100 | No | Accuracy rate at this station |
| `contribution/ingredients-processed` | integer | count | 0–∞ | No | Ingredients successfully handled by this sous chef |
| `contribution/steps-completed` | integer | count | 0–∞ | No | Recipe steps completed (or advanced) by this sous chef |

---

## Node: Team (sub-nodes)

**Topic path:** `cosmic-chef/team-{team-id}/game-{game-id}/{sub-node}/{property-id}`

Aggregates team-level state across identity, score, and performance sub-nodes in a specific game. The `player-ids` list reflects the current roster for that game; individual player identities are also tracked via `player-id` properties in each role (head-chef, sous-chef-{1,2,3}).

### Properties

### Sub-node: `identity`

| Property | Type | Unit | Range | Settable | Notes |
|----------|------|------|-------|----------|-------|
| `name` | string | — | — | No | Team display name (e.g. "Quark Squad") |
| `player-count` | integer | count | 1–4 | No | Number of active players on this team |
| `player-ids` | string | CSV | — | No | Comma-separated list of player IDs currently on this team in this game (most recent additions first) |

**Example topics:** `cosmic-chef/team-1/game-session-001/identity/name`, `cosmic-chef/team-1/game-session-001/identity/player-count`

### Sub-node: `score`

| Property | Type | Unit | Range | Settable | Notes |
|----------|------|------|-------|----------|-------|
| `current` | integer | points | 0–∞ | No | Total team score this session |
| `round` | integer | points | 0–∞ | No | Score earned this round only |
| `dishes-completed` | integer | count | 0–∞ | No | Number of dishes successfully submitted |

**Example topics:** `cosmic-chef/team-1/game-session-001/score/current`, `cosmic-chef/team-1/game-session-001/score/round`

### Sub-node: `performance`

| Property | Type | Unit | Range | Settable | Notes |
|----------|------|------|-------|----------|-------|
| `accuracy` | float | % | 0–100 | No | Weighted average accuracy across all players |
| `speed` | float | gestures/min | 0–∞ | No | Average gesture frequency across all players |
| `error-rate` | float | % | 0–100 | No | Total errors / total gestures * 100 |

**Example topics:** `cosmic-chef/team-1/game-session-001/performance/accuracy`, `cosmic-chef/team-1/game-session-001/performance/error-rate`

---

## Node: Game (global, per-game)

**Topic path:** `cosmic-chef/game-{game-id}/{sub-node}/{property-id}`

Global game and machine state shared by all teams in this game session.

### Sub-node: `session`

| Property | Type | Unit | Range | Settable | Notes |
|----------|------|------|-------|----------|-------|
| `id` | string | — | — | No | Unique session identifier (UUID or timestamp) |
| `status` | enum | — | `initializing`, `running`, `paused`, `ended` | Yes* | Game session status; set to `paused` to pause all teams |

**Example topics:** `cosmic-chef/game-session-001/session/id`, `cosmic-chef/game-session-001/session/status`

### Sub-node: `round`

| Property | Type | Unit | Range | Settable | Notes |
|----------|------|------|-------|----------|-------|
| `number` | integer | — | 1–∞ | No | Current round (multi-round sessions only) |
| `recipe` | string | — | — | No | Recipe ID being prepared (e.g. `muon-pie`, `quark-stew`) |
| `step-current` | integer | step | 0–∞ | No | Current step index in the recipe (0-indexed) |
| `step-total` | integer | step | 0–∞ | No | Total steps in this recipe |

**Example topics:** `cosmic-chef/game-session-001/round/recipe`, `cosmic-chef/game-session-001/round/step-current`

### Sub-node: `timer`

| Property | Type | Unit | Range | Settable | Notes |
|----------|------|------|-------|----------|-------|
| `remaining` | float | seconds | 0–∞ | No | Countdown to round end (0 = round over) |
| `elapsed` | float | seconds | 0–∞ | No | Time spent in current round |

**Example topics:** `cosmic-chef/game-session-001/timer/remaining`, `cosmic-chef/game-session-001/timer/elapsed`

### Sub-node: `machine`

| Property | Type | Unit | Range | Settable | Notes |
|----------|------|------|-------|----------|-------|
| `state` | string | — | — | No | Current XState machine state (hierarchical path, e.g. `"idle"`, `"active.blending"`, `"active.synchronized-step"`) |
| `context-recipe` | string | JSON | — | No | Recipe context (stringified for MQTT; contains step inventory, bindings) |
| `context-ingredients` | string | JSON | — | No | Ingredient inventory context (stringified) |

**Example topics:** `cosmic-chef/game-session-001/machine/state`, `cosmic-chef/game-session-001/machine/context-recipe`

### Sub-node: `statistics`

| Property | Type | Unit | Range | Settable | Notes |
|----------|------|------|-------|----------|-------|
| `total-dishes` | integer | count | 0–∞ | No | Cumulative dishes completed across all teams this session |
| `total-errors` | integer | count | 0–∞ | No | Cumulative gesture errors across all teams this session |
| `total-gestures` | integer | count | 0–∞ | No | Cumulative gestures recognized across all teams this session |

**Example topics:** `cosmic-chef/game-session-001/statistics/total-dishes`, `cosmic-chef/game-session-001/statistics/total-gestures`

### Sub-node: `arena`

| Property | Type | Unit | Range | Settable | Notes |
|----------|------|------|-------|----------|-------|
| `player-count` | integer | count | 0–∞ | No | Total active players (across all teams) |
| `team-count` | integer | count | 1–∞ | No | Number of teams competing |
| `location` | string | — | — | No | Human-readable venue / AR space name (e.g. "CERN Building 42, Hall A") |

**Example topics:** `cosmic-chef/game-session-001/arena/player-count`, `cosmic-chef/game-session-001/arena/location`

*Settable by external coaching/referee system; game respects pause signals.

---

## Node: Statistics (Optional, High-Frequency)

**Topic path:** `cosmic-chef/game-{game-id}/stats-live/{property-id}`

Aggregated statistics published at lower frequency (1 Hz or on-change) for analytics and viz dashboards. Reduces noise compared to per-player properties.

### Properties

| Property | Type | Unit | Range | Settable | Notes |
|----------|------|------|-------|----------|-------|
| `leaderboard/top-team` | string | — | — | No | Team ID with highest current score |
| `leaderboard/top-score` | integer | points | 0–∞ | No | Highest score so far |
| `leaderboard/second-team` | string | — | — | No | Team ID with second-highest score |
| `leaderboard/second-score` | integer | points | 0–∞ | No | Second-highest score |
| `aggregate/avg-accuracy` | float | % | 0–100 | No | Mean accuracy across all players |
| `aggregate/avg-speed` | float | gestures/min | 0–∞ | No | Mean gesture rate across all players |
| `snapshot/timestamp` | integer | ms | — | No | Unix timestamp of this snapshot |

---

## Node: Player Registry (Global)

**Topic path:** `cosmic-chef/player-{player-id}/{sub-node}/{property-id}`

Global player profiles and participation history. Every time a player takes a role (head-chef or sous-chef) in a team-game, a `player-id` property is set in that role node, linking to this registry. This enables tracking which games a player participated in, what roles they held, and cumulative statistics across all sessions.

**Key relationship:** 
- Role-specific `player-id` (e.g., `cosmic-chef/team-1/game-session-001/head-chef/player-id`) → points to global player (e.g., `cosmic-chef/player-alice-001/`)

### Sub-node: `profile`

| Property | Type | Unit | Range | Settable | Notes |
|----------|------|------|-------|----------|-------|
| `name` | string | — | — | No | Display name of the player |
| `avatar-color` | string | hex | — | No | Color identifier (e.g. `#FF0000`) for visual distinction |
| `first-appearance` | integer | ms | — | No | Unix timestamp (ms) of first game participation |

**Example topics:** `cosmic-chef/player-alice-001/profile/name`, `cosmic-chef/player-alice-001/profile/avatar-color`

### Sub-node: `participation`

| Property | Type | Unit | Range | Settable | Notes |
|----------|------|------|-------|----------|-------|
| `total-games` | integer | count | 0–∞ | No | Total number of games this player has participated in |
| `games-as-head-chef` | integer | count | 0–∞ | No | Games played in head-chef role |
| `games-as-sous-chef` | integer | count | 0–∞ | No | Games played in any sous-chef role |
| `game-history` | string | CSV | — | No | Comma-separated list of game IDs (most recent first) |
| `role-history` | string | CSV | — | No | Comma-separated list of roles per game, in same order as `game-history` |

**Example topics:** `cosmic-chef/player-alice-001/participation/total-games`, `cosmic-chef/player-alice-001/participation/game-history`

### Sub-node: `stats`

| Property | Type | Unit | Range | Settable | Notes |
|----------|------|------|-------|----------|-------|
| `total-dishes-contributed` | integer | count | 0–∞ | No | Cumulative dishes this player helped complete |
| `average-accuracy` | float | % | 0–100 | No | Mean accuracy across all games and roles |
| `average-speed` | float | gestures/min | 0–∞ | No | Mean gesture frequency across all games |

**Example topics:** `cosmic-chef/player-alice-001/stats/total-dishes-contributed`, `cosmic-chef/player-alice-001/stats/average-accuracy`

---

## MQTT Topic Hierarchy Diagram

```puml
!include ./diagrams/homie-mqtt-structure.puml
```

See also: [homie-mqtt-structure.puml](diagrams/homie-mqtt-structure.puml) (raw PlantUML source)

---

## Notes on Homie v4 Compliance

- **Device ID format:** kebab-case, lowercase, alphanumeric + hyphens only.
- **Property ID format:** kebab-case.
- **Data types:** align with Homie spec (`string`, `integer`, `float`, `boolean`, `enum`, `color`, `datetime`).
- **Units:** Homie standard units where applicable (e.g. `°C`, `%`); custom units noted above.
- **Settable properties:** marked with `Yes` or `Yes*`. Coaches/referees can set `session/status` to control global pause. Game publishes all others as read-only.
- **QoS:** retain flag set on all properties for late subscribers to catch up.
- **Update frequency:**
  - Head Chef orientation/position: 60 Hz (tied to frame rate).
  - Gestures, animations: event-based or 30 Hz (when changed).
  - Scores, stats: 1 Hz or on-change.
  - Global game state: 10 Hz or on-change.
  - Player registry: on-change (when joining a game, completing a round, or stats update).

---

## Connection Notes

**MQTT Broker:** configurable via `.env` (e.g. `MQTT_BROKER=mqtt://localhost:1883`).

**Subscription Patterns:**
- All topics: `cosmic-chef/#`
- All games a team participates in: `cosmic-chef/team-1/#`
- Team in a specific game: `cosmic-chef/team-1/game-session-001/#`
- All games a player participated in: `cosmic-chef/player-alice-001/#`
- Global game state only: `cosmic-chef/game-session-001/#`
- Single role in a game: `cosmic-chef/team-1/game-session-001/head-chef/#`
- Specific property: `cosmic-chef/team-1/game-session-001/head-chef/position/x`

**Namespace Lifecycle:**
- On startup, publish namespace metadata to `cosmic-chef/$metadata` (namespace name, version, homie version, publisher info).
- Publish online status to `cosmic-chef/$online: true` on connection; `cosmic-chef/$online: false` on graceful disconnect.
- Optionally publish `cosmic-chef/$last-activity: {timestamp}` to track when the namespace was last updated.

---

## Player Tracking: How It Works

Every player participating in a game is tracked through a two-level system:

1. **Role level** — at game time, each role (head-chef or sous-chef-{1,2,3}) publishes a `player-id` property:
   - Topic: `cosmic-chef/team-1/game-session-001/head-chef/player-id`
   - Value: `alice-001`
   - This tells you *who* is performing that role right now.

2. **Player registry** — aggregates the player's history and statistics:
   - Topic: `cosmic-chef/player-alice-001/participation/game-history`
   - Value: `game-session-001,game-session-002,...` (CSV, most recent first)
   - Topic: `cosmic-chef/player-alice-001/participation/role-history`
   - Value: `head-chef,sous-chef-1,...` (CSV, matching order of game-history)

**Use cases:**
- **Real-time:** subscribe to `cosmic-chef/team-1/game-session-001/head-chef/player-id` to see who's playing head-chef right now.
- **Analytics:** subscribe to `cosmic-chef/player-alice-001/#` to track all games Alice ever played in and her cumulative stats.
- **Coaching:** watch `cosmic-chef/player-alice-001/stats/average-accuracy` to monitor a player's performance trend across sessions.

---

## Future Extensions

- **Camera feed state:** which camera is active, resolution, frame rate (for AR debugging).
- **Hand pose detail:** per-finger joint angles (if available from ML backend).
- **Haptic feedback:** queue haptic pulses to hands (device-to-controller signal, settable).
- **Custom gestures:** extensible gesture registry with dynamic binding.
- **Physics state:** current particles in dish, binding state, charge balance (for debugging).
