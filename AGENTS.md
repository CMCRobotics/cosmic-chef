# AGENTS.md — Cosmic Chef

Orientation file for coding agents and new contributors. Read this before making changes.

## 1. What this project is

**Cosmic Chef** is an **Augmented Reality browser game**: you play a cosmic chef who assembles fundamental particles into dishes to satisfy the primordial chaos. It runs in WebXR-enabled browsers on mobile and desktop, and requires camera access for AR.

- **Goal:** teach real particle physics through a cooking metaphor. Presentation is surreal; the physics must stay accurate.
- **Domain reference:** [`docs/physics.md`](docs/physics.md) is the **single source of truth** for all physics facts (flavours, particles, binding rules) and for how they map onto game concepts. Consult it before authoring any gameplay content, ingredient, dish or UI copy.
- **Status:** early prototype. Very little gameplay exists yet — mostly scene scaffolding and dev tooling.

## 2. Stack

| Concern | Choice |
|---------|--------|
| Runtime / toolchain | **Bun** (not Node) |
| Dev server | custom, `src/server.ts` (TypeScript) |
| Game State Management | **XState** v5 |
| 3D / XR framework | **A-Frame** 1.7.1 (declarative HTML entity-component scene graph) |
| Live editing | `aframe-inspector` + `aframe-watcher-bun` (both CMCRobotics forks) |
| Logging | **loglevel** (`window.log`) |
| Config | **dotenv** (`.env`) |
| 3D assets | GLB models from `https://cmc-cdn.web.cern.ch/assets/...` |
| Testing | **Bun Test** (unit testing framework) |

There is no build step for client code, no bundler, and no linter configured. Client code is plain ES5/ES6 JavaScript served as-is. We use **Bun Test** for server and logic unit testing.

## 3. Quickstart

```bash
bun install
bun test             # runs the unit test suite
bun run dev          # serves http://localhost:3000
```

- `bun run dev` → runs `src/server.ts`.
- `bun run compile` → single Linux x64 binary named `cosmic-chef` (gitignored).
- Env vars: `PORT` (default `3000`), `PROJECT_DIR` (default `public`), `AFRAME_WATCHER_HTML`.
- The HTML target resolves as **CLI arg > `AFRAME_WATCHER_HTML` env > `public/*.html`**.

## 4. Layout

```
src/server.ts              Bun HTTP server: static files, A-Frame/Inspector bundles, POST /save
public/index.html          Entry point: the <a-scene>, asset declarations, camera rig, hands
public/scene.html          Scene fragment — game objects, injected at runtime
public/assets-furniture.html   Large <a-asset-item> catalogue of furniture GLBs
public/components/*.js     Custom A-Frame components (most work happens here)
docs/physics.md            Physics + game-design reference (content authority)
```

### How the server works (`src/server.ts`)
Request handling order: `/` → `public/index.html`; then any matching static file under `PROJECT_DIR`; then `/aframe.min.js` and `/aframe-inspector.min.js`, which are **imported as text at build time** from `node_modules` and served from memory; then `POST /save`; then CORS preflight; else 404.

`POST /save` receives Inspector changes and calls `sync()` from `aframe-watcher-bun`, **writing edits back into your HTML source files**.

### How scenes compose
`index.html` stays thin. Content lives in fragments pulled in by the `load-fragment` component:

```html
<a-entity load-fragment="src: /scene.html; templateId: cosmic-chef-scene"></a-entity>
```

`load-fragment` fetches the URL, wraps the HTML in a `<template>`, appends it to `<head>`, then clones the content into its own entity.

## 5. Conventions

Follow the patterns already present in the codebase.

**Behaviour goes in A-Frame components.** Never add loose scripts that poke at the DOM. Create `public/components/<name>.js`, register it, and add a `<script src="components/<name>.js">` tag in `index.html`:

```js
AFRAME.registerComponent('my-thing', {
    schema: {
        someValue: {type: 'number', default: 1}
    },
    init: function() {
        const log = window.log.getLogger('my-thing');
        log.setLevel('debug');
        // ...
    }
});
```

- **Naming:** kebab-case for components and entity ids (`load-fragment`, `world-root`, `table_low` for asset ids mirroring the CDN filename).
- **Logging:** use `window.log.getLogger('<component-name>')` from loglevel, not bare `console.log`. (`load-fragment.js` still uses `console.error` for its own errors — prefer loglevel in new code.)
- **Style:** 4-space indent, `function() {}` rather than arrow functions for A-Frame lifecycle methods, `const`/`let` in bodies.
- **Scene content:** add game objects to `public/scene.html` (or a new fragment), not directly into `index.html`.
- **Assets:** declare GLBs as `<a-asset-item>` and reference them with `gltf-model="#id"`. Assets are **always** loaded from the CERN CDN — never commit binary models to the repo.
- **Interaction:** clickable entities need the `clickable` class; the scene raycasters (mouse cursor and both `laser-controls` hands) filter on `objects: .clickable`.
- **World transform:** put world content under `#world-root`, which the `world-root` component repositions (and `start-experience` resets on `enter-vr`). Do not hardcode global offsets elsewhere.

## 6. Gotchas

- **Two different A-Frame versions.** `package.json` pins **1.7.1** and the server can serve it at `/aframe.min.js`, but `public/index.html` currently loads **1.4.2 from cdnjs**. The Inspector served at `/aframe-inspector.min.js` comes from the local 1.7.1-era fork. Known inconsistency — do not "fix" it casually, and be aware the running version is 1.4.2.
- **The Inspector rewrites your source.** `POST /save` writes changes back into the HTML files. Avoid hand-editing fragments while the Inspector is saving, or your edits may be clobbered.
- **Missing asset declarations.** `public/scene.html` references `#cupcake` and `#candy-cane-red`, but `index.html` only declares `#table_low`. Those two models will not render until the assets are declared.
- **`assets-furniture.html` is currently unused** — nothing loads it. It is a catalogue of available furniture GLBs (from a "winter" asset set), useful as a reference for asset URLs.
- **Static files win over built-in routes.** A real file in `public/` shadows `/aframe.min.js` and `/aframe-inspector.min.js`, because the static lookup runs first.
- **`@ts-ignore` in `server.ts` is intentional** — the `with { type: "text" }` imports of the A-Frame bundles have no type declarations. Leave them.
- **`node:fs` / path work must stay Bun-compatible** (`Bun.file`, `Bun.serve`). Do not introduce Node-only server APIs or an Express-style framework.
- **AR requires HTTPS** on real devices; `localhost` is exempt for desktop testing.

## 7. Verifying changes

We use automated unit tests alongside manual validation.

### Automated Tests
Run the test suite with:
```bash
bun test
```

### Manual Validation
1. `bun run dev` and open `http://localhost:3000`.
2. Check the browser console — loglevel output at debug level shows scene lifecycle (`Scene loaded`, `Entered VR/AR mode`, XR session start/end).
3. Confirm models actually appear (missing CDN assets fail silently apart from a network error).
4. For AR paths, test on a WebXR device or emulator; desktop falls back to mouse cursor plus the camera rig at `0 3 4`.

## 8. Workflow

- Default branch is **`develop`**; `origin/HEAD` points at it. Branch from and target `develop`.
- Keep commits scoped and imperative.
- **Maintenance rule:** when you discover a new convention, constraint or gotcha, add it to this file. When you change a physics fact or add gameplay content, update [`docs/physics.md`](docs/physics.md) first — it is the content authority.
