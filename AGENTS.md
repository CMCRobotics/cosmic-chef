# AGENTS.md — Cosmic Chef

Orientation file for coding agents and new contributors. Read this before making changes.

## 1. What this project is

**Cosmic Chef** is an **Augmented Reality browser game**: you play a cosmic chef who assembles fundamental particles into dishes to satisfy the primordial chaos. It runs in WebXR-enabled browsers on mobile and desktop, and requires camera access for AR.

- **Goal:** teach real particle physics through a cooking metaphor. Presentation is surreal; the physics must stay accurate.
- **Domain reference:** [`docs/physics.md`](docs/physics.md) is the **single source of truth** for all physics facts (flavours, particles, binding rules) and for how they map onto game concepts. Consult it before authoring any gameplay content, ingredient, dish or UI copy.
- **MQTT / Network reference:** [`docs/mqtt-architecture.md`](docs/mqtt-architecture.md) and [`docs/homie-devices.md`](docs/homie-devices.md) define the **single source of truth** for MQTT topics, payload contracts, and component boundaries (`mqtt-bridge`, `team-galley-receiver`, `preparation-manager`).
- **Status:** early prototype. Very little gameplay exists yet — mostly scene scaffolding and dev tooling.

## 2. Stack

| Concern | Choice |
|---------|--------|
| Runtime / toolchain | **Bun** (not Node) |
| Dev server | custom, `src/server.ts` (TypeScript) |
| Game State Management | **XState** v5 |
| Device input | **MQTT** (mqtt.js, Homie topics) → **RxJS** gesture streams |
| 3D / XR framework | **A-Frame** 1.7.1 (declarative HTML entity-component scene graph) |
| Live editing | `aframe-inspector` + `aframe-watcher-bun` (both CMCRobotics forks) |
| Logging | **loglevel** (`window.log`) |
| Config | **dotenv** (`.env`) |
| 3D assets | GLB models from the CMC CDN, served via `public/assets/models/` symlinks |
| Testing | **Bun Test** (unit testing framework) |

A-Frame components, the state machine and HTML are plain ES6 JavaScript served as-is. The one build step is `build:vendor`, which `bun run dev` runs automatically. It bundles the npm dependencies **and the TypeScript client logic in `src/client/`** into `public/vendor/bundle.js` (gitignored). The client logic is exposed as `window.CosmicChef`. There is no linter. **Bun Test** covers the state machine and the client logic.

## 3. Quickstart

```bash
bun install
bun test             # runs the unit test suite
bun run dev          # serves http://localhost:3000
```

- `bun run dev` → `build:vendor`, `build:presentation`, then `src/server.ts`. Re-run it after editing `src/client/*.ts`.
- Slides: `http://localhost:3000/presentation/` (reveal.js, Markdown source in `public/presentation/slides.md`).
- MQTT: the game connects to `ws://localhost:9001` (see the `mqtt-bridge` schema). `public/dev/test-sous-chefs.html` simulates the sous-chefs and the head chef from a keyboard.
- `bun run compile` → single Linux x64 binary named `cosmic-chef` (gitignored).
- Env vars: `PORT` (default `3000`), `PROJECT_DIR` (default `public`), `AFRAME_WATCHER_HTML`, `MQTT_BROKER_URL` (default `ws://localhost:9001`, served to the browser as `window.COSMIC_CHEF_CONFIG` via `/config.js`; set it in `.env`).
- The HTML target resolves as **CLI arg > `AFRAME_WATCHER_HTML` env > `public/*.html`**.

## 4. Layout

```
src/server.ts                   Bun HTTP server: static files, A-Frame/Inspector bundles, POST /save
src/vendor.js                   Bundle entry: npm deps + src/client → public/vendor/bundle.js
src/client/topics.ts            Builds/parses every MQTT topic
src/client/adapters.ts          Pure translators: MQTT payloads / gesture streams → machine events
src/client/microbit-gateway.ts  micro:bit radio gateway: Web Serial → terminal bindings → sous-chef gesture + Homie topics
public/index.html               Entry point: the <a-scene>, asset declarations, camera rig, hands
public/galley.html              Galley fragment (stations, conveyors), injected by load-fragment
public/scene.html               Particle showcase fragment (not loaded by default)
public/presentation/index.html  reveal.js deck page, loads slides.md via data-markdown
public/presentation/slides.md   Slide content (--- = new slide, -- = vertical slide, Note: = speaker notes)
public/presentation/vendor/     reveal.js copied from node_modules by build:presentation (gitignored)
public/vr.html                  Head-chef VR page (/vr.html), its own window; scene fragment is head-chef-scene.html
public/xstate/preparation-machine.js   Game state machine + RECIPES (pure, unit-tested)
public/aframe-components/*.js   Custom A-Frame components (most work happens here)
public/dev/console-helpers.js   Browser-console helpers: testRecipe(), testGesture(), ...
public/dev/test-sous-chefs.html     Keyboard MQTT simulator for sous-chefs / head chef
public/dev/microbit-gateway.html    micro:bit radio gateway page (Web Serial → MQTT), uses MicrobitGateway
public/microbit-hud.html        Gateway HUD fragment (top-left of the camera in index.html), behaviour in microbit-gateway-hud.js
microbit/gateway.py             MakeCode Python for the gateway micro:bit (radio → USB serial)
docs/physics.md                 Physics + game-design reference (content authority)
docs/head-chef-controls.md   Head-chef controls (desktop and VR), floor button, status panel
docs/vr-debugging-instructions.md   Running vr.html on a Meta Quest over adb reverse (no HTTPS needed)
```

### How the server works (`src/server.ts`)
Request handling order: `/` → `public/index.html`; then any matching static file under `PROJECT_DIR`; then `/aframe.min.js` and `/aframe-inspector.min.js`, which are **imported as text at build time** from `node_modules` and served from memory; then `POST /save`; then CORS preflight; else 404.

`POST /save` receives Inspector changes and calls `sync()` from `aframe-watcher-bun`, **writing edits back into your HTML source files**.

### How scenes compose
`index.html` stays thin. Content lives in fragments pulled in by the `load-fragment` component:

```html
<a-entity load-fragment="src: /galley.html; templateId: cosmic-chef-galley-1"></a-entity>
```

`load-fragment` fetches the URL, wraps the HTML in a `<template>`, appends it to `<head>`, then clones the content into its own entity.

### How game input flows
```
MQTT ─► mqtt-bridge ─► adapters (src/client) ─► preparation-manager.send(event) ─► XState actor
                                                                                       │
              galley-manager, sous-chef-gesture-feedback, ... ◄── 'game-state-changed' ┘
                                                              ◄── 'invalid-gesture'
```
- **`preparation-manager` is the only owner of the actor.** Other components read state from the scene's `game-state-changed` event, and send events via `sceneEl.components['preparation-manager'].send(event)`. Never subscribe to the actor directly, poll for it, or put it on `window`.
- **`mqtt-bridge` (index.html) and `head-chef-mqtt-client` (vr.html) are the only MQTT clients.** Other components in index.html publish through `mqtt-bridge.publish(topic, payload, options)`, as `microbit-gateway-hud` does; they must not create their own client. To support a new topic, add its builder/parser to `src/client/topics.ts`, a pure translator to `src/client/adapters.ts` (with a test), and a `case` in `mqtt-bridge.onMessage`. See [`docs/mqtt-architecture.md`](docs/mqtt-architecture.md) for full topic flow details. **Never publish to input topics that the bridge subscribes to** (such as `round/recipe-desired`), as this produces circular echo loops.
- **One event vocabulary** for every input source (MQTT, console, tests): `GESTURE_START` / `GESTURE_TICK` / `GESTURE_STOP` `{ chefId: 'chef-N', gesture, progressAmount? }`, plus `CAPTURE_RECIPE`, `SUBMIT_RECIPE`, `CANCEL_ORDER`, `NEXT_ROUND`, `SET_ACTIVE_CHEFS`. The machine validates gestures and *emits* `invalid-gesture`; `preparation-manager` re-emits it on the scene.
- **`galley-manager` owns all ingredient entities**: spawning, moving, animating, vacuuming. Don't position or animate ingredients from anywhere else.

## 5. Conventions

Follow the patterns already present in the codebase.

**Behaviour goes in A-Frame components.** Never add loose scripts that poke at the DOM. Create `public/aframe-components/<name>.js`, register it, and add a `<script src="aframe-components/<name>.js">` tag in `index.html`:

```js
AFRAME.registerComponent('my-thing', {
    schema: {
        someValue: {type: 'number', default: 1}
    },
    init: function() {
        const log = window.log.getLogger('my-thing');
        // ...
    }
});
```

- **Naming:** kebab-case for components and entity ids (`load-fragment`, `world-root`, `table_low` for asset ids mirroring the CDN filename).
- **Logging:** use `window.log.getLogger('<component-name>')` from loglevel, not bare `console.log`. Don't call `setLevel()` in components: the default (`info`) is set once in `src/vendor.js`, and `debug(true)` in the console switches every logger to debug.
- **Style:** 4-space indent, `function() {}` rather than arrow functions for A-Frame lifecycle methods, `const`/`let` in bodies.
- **Scene content:** add game objects to `public/scene.html` (or a new fragment), not directly into `index.html`.
- **Assets:** declare GLBs as `<a-asset-item>` and reference them with `gltf-model="#id"`. Models come from the CMC CDN asset folder (`public/assets/models/*` are symlinks to it). Never commit binary models to the repo.
- **Interaction:** clickable entities need the `clickable` class; the scene raycasters (mouse cursor and both `laser-controls` hands) filter on `objects: .clickable`.
- **World transform:** put world content under `#world-root`, which the `world-root` component repositions (and `start-experience` resets on `enter-vr`). Do not hardcode global offsets elsewhere.

## 6. Gotchas

- **A-Frame is bundled locally.** `public/index.html` loads `vendor/bundle.js`, which includes A-Frame 1.7.1 (pinned in `package.json`) bundled with dependencies. There is no version inconsistency—the running version matches `package.json`.
- **The Inspector rewrites your source.** `POST /save` writes changes back into the HTML files. Avoid hand-editing fragments while the Inspector is saving, or your edits may be clobbered.
- **Static files win over built-in routes.** A real file in `public/` shadows `/aframe.min.js` and `/aframe-inspector.min.js`, because the static lookup runs first.
- **MQTT broker URL is injected, not hardcoded.** Components read `window.COSMIC_CHEF_CONFIG.MQTT_BROKER_URL` from `/config.js` as their schema default, so `config.js` must load before any component script. Don't add new hardcoded broker URLs.
- **`@ts-ignore` in `server.ts` is intentional** — the `with { type: "text" }` imports of the A-Frame bundles have no type declarations. Leave them.
- **`node:fs` / path work must stay Bun-compatible** (`Bun.file`, `Bun.serve`). Do not introduce Node-only server APIs or an Express-style framework.
- **AR requires HTTPS** on real devices; `localhost` is exempt for desktop testing.
- **`RECIPES` in `public/xstate/preparation-machine.js` is the in-code mirror of [`docs/recipes.md`](docs/recipes.md).** Keep the `gesture`/`ingredient`/`composition`/`charge` fields synchronized whenever a recipe there changes. It is the only copy in code: `test-sous-chefs.html` loads the same file. A recipe's final assembly step is marked `stepType: 'synchronized'` (`docs/game.md`, "Synchronized Steps"), but the machine **does not enforce that every chef takes part yet**: any `GESTURE_TICK` with the final gesture advances `stirProgress`, and `chefId` is optional.
- **Ingredient ids encode their type:** `'<type>-<n>'`, e.g. `'anti-down-1'` → type `'anti-down'`. The type must be a key of `PARTICLE_METADATA` in `quantum-particle.js`.
- **The A-Frame `animation` component takes `dur`, not `duration`.** An unknown property is silently ignored and the animation runs at the 1000 ms default.
- **Team selection:** `index.html` and `vr.html` resolve their team with `resolveTeamId` (`src/client/team.ts`). A `?team=blue|red|white` URL parameter wins and is saved to localStorage (key `cosmic-chef.team`), so a reload or reconnect keeps the team; without the parameter the saved team is used, defaulting to `blue`. Components read `window.CURRENT_TEAM` rather than the URL.
- **Chef stations are discovered dynamically by `galley-manager.js`.** Each station in `public/galley.html` must have `class="chef-station"` and `data-station-id="SN"` (where N is 1, 2, or 3). The manager queries these attributes at runtime to look up station positions. **If you move a station's position in galley.html, no component code changes are needed** — the manager will discover the new position automatically. Stations are cached after first lookup for efficiency.
- **`vr.html` and `index.html` (galley) are separate HTML documents with separate `window` contexts.** The head-chef runs in its own window at `/vr.html`, the galley at `/`. They cannot share global variables or `window` state. All cross-window communication must go through **MQTT only** — never use `window._capturedRecipe` or other globals. Both windows subscribe to the same MQTT topics, so data sent through MQTT reaches both: when head-chef captures a recipe, it publishes to the recipe topic, and mqtt-bridge in the galley receives it.
- **VR hands live under `#cameraRig` in `vr.html`.** Controller poses are in the same floor-level frame as the head, so a hand outside the rig is drawn far below and in front of the player.
- **The galley ring colour comes from MQTT.** `head-chef-mqtt-client` re-emits the retained `identity/color` as `team-color-changed`, and `team-ring-color` applies it. Don't hard-code a team colour in a fragment.
- **Multiple galleys share one state machine, each with scoped managers.** `index.html` can instantiate many galleys (via `galley-layout`), all listening to the same `game-state-changed`. Each `galley-manager` listens to events on its own parent entity, so they don't interfere. **ID namespacing:** When `load-fragment` clones `galley.html` multiple times, all element IDs are automatically suffixed (`entity_chef_station_1__cosmic-chef-galley-1_0`). This avoids DOM collisions. `aframe-watcher` edits the clean source `galley.html`; IDs get fresh suffixes on reload. **Team galleys:** For each team's window to see all teams' galleys simultaneously, use `team-galley-receiver` (scoped MQTT subscriber for a team) paired with `galley-component` (renders that team's live state). Each team's window independently fetches other teams' state via MQTT, so all galleys animate in real-time showing different recipes.
- **A-Frame lasers only hit meshes on the `.clickable` entity itself, not on its children.** `raycaster` (and so `cursor` and laser hits) reads `el.object3DMap` of each clickable element, so a `gltf-model` on a child entity is invisible to lasers. Give the clickable root its own geometry, such as the invisible hitbox in `recipe-spawner.js`. Head-chef capture (`tractor-beam.js`) uses its own ray and is not affected.
- **The player camera is locked in `index.html`.** `camera-debug-controls` turns off WASD and mouse look unless the URL has `?debug=true`. Players steer with the sous-chef terminals, so keyboard and mouse must not move the view. The camera rig's own movement (final-stir, galley focus) is game behaviour and is unaffected.
- **The micro:bit radio gateway is a third publisher to `sous-chef-N/gesture/current`.** `MicrobitGateway` (`src/client/microbit-gateway.ts`, page `public/dev/microbit-gateway.html`) reads a gateway micro:bit over **Web Serial** (not WebUSB: Chrome cannot claim the micro:bit's serial port that way). It needs Chrome or Edge, `https://` or `localhost`, and a user click on "Connect". Radio groups are per team (blue 31, white 32, red 33) and are set by the browser on connect. The gateway publishes gestures only for terminals bound to a slot, and it never publishes to input topics other than `gesture/current`. Protocol: [`docs/microbit-devices.md`](docs/microbit-devices.md).

## 7. Verifying changes

We use automated unit tests alongside manual validation.

### Automated Tests
Run the test suite with:
```bash
bun test
```

### Manual Validation
1. `bun run dev` and open `http://localhost:3000`.
2. Check the browser console. It lists the console helpers. Run `testRecipe('proton')`, `testGesture('tenderize', 100, 'chef-1')` and so on, or `debug(true)` for verbose logs.
3. For the MQTT path, run a broker with websockets on `9001`, open `/dev/test-sous-chefs.html` in a second tab and drive gestures from the keyboard.
4. Confirm models actually appear (missing CDN assets fail silently apart from a network error).
5. For AR paths, test on a WebXR device or emulator; desktop falls back to mouse cursor plus the camera rig at `0 0 -5.5`.

## 8. Workflow

- Default branch is **`develop`**; `origin/HEAD` points at it. Branch from and target `develop`.
- Keep commits scoped and imperative.
- **Maintenance rule:** when you discover a new convention, constraint or gotcha, add it to this file. When you change a physics fact or add gameplay content, update [`docs/physics.md`](docs/physics.md) first — it is the content authority. When you change MQTT topics, subscriptions, or network contracts, update [`docs/mqtt-architecture.md`](docs/mqtt-architecture.md) and [`docs/homie-devices.md`](docs/homie-devices.md).
