# Cosmic Chef — Head Chef controls

Reference for how the head chef plays `vr.html`, on desktop and in VR (Meta Quest).

> **Scope:** Input controls and what they do. The sous-chef side is in [`game.md`](game.md) and the MQTT flow in [`mqtt-architecture.md`](mqtt-architecture.md).

---

## 1. What the head chef does

1. **Aim** at a falling recipe crate. On desktop, use the crosshair (the centre of the view). In VR, point with the right hand.
2. **Select** the crate that is under the crosshair.
3. **Capture** the selected crate. It is pulled to the team's intake, and the recipe is sent to the team's sous-chefs.
4. **Submit or cancel** the dish with the floor button, once the sous-chefs are done.

Only one crate can be captured at a time. Crates can only be captured while the team is waiting for a recipe (see [Team busy](#team-busy)).

---

## 2. VR controls (Meta Quest)

| Input | Action |
| :--- | :--- |
| **Either hand's laser** (aim) | The laser points at the crates. The crate the laser passes through is highlighted, as drawn on screen. No crosshair is shown in VR. |
| **Either trigger** | **Select** the aimed crate. Press again on the same crate to **capture** it. Press on empty space to clear the selection. |
| **Left thumbstick** (push up / pull down) | **Zoom** in and out. The further the stick is pushed, the faster it zooms. Release to keep the current zoom. |
| **Left thumbstick press** | **Reset** the zoom to the default. |
| **Either hand's trigger** (on the floor button) | **Press the floor button**: submit (green O) or cancel (red X). |

Notes:

- The laser of the hand whose trigger was pressed last is the one that aims. Right is the default.
- The floor button is pressed with the hand's laser pointer, so aim it at the button and pull the trigger.
- The hands are part of the camera rig, so they stay in front of the player wherever the rig is moved.

---

## 3. Desktop controls

| Input | Action |
| :--- | :--- |
| **Crosshair** (centre of the view) | Aims at the crates. Shown on desktop only. |
| **Mouse pointer** | Points at the floor button and clicks it (left button). |
| **Right mouse button** | Same as the right trigger: select the aimed crate, click again to capture. Right-click empty space to clear the selection. |
| **`+` / `=`** | Zoom in (hold). |
| **`-` / `_`** | Zoom out (hold). |

The browser's right-click menu is disabled on the head-chef page.

---

## 4. The floor button

The floor button shows the state of the dish:

| Symbol | Colour | Meaning |
| :--- | :--- | :--- |
| **X** | Red | Dish in progress. Press to **cancel** the order. |
| **O** | Green | Dish ready. Press to **submit** it. |
| **X** | Grey | Order already submitted or cancelled. Wait for the next crate. |

After a submit or cancel, the crate on the intake shrinks away.

---

## 5. The status panel

The large screen shows the team's current state:

- The team name, and the recipe being prepared (or `RECIPE: none` between orders).
- The next action for the team, for example *sous-chefs prepare the ingredients (2 left)*.
- Each sous-chef's next gesture and progress.
- The score: served and failed orders.

---

## 6. Team busy

A crate can only be captured while the team is waiting for a recipe. If the team is still busy with the previous order, the capture is blocked. The console logs `Team is busy (…)`, and the crate stays on the belt.

If no state has been received yet (for example, the sous-chef window has not started), the capture is allowed.

---

## 7. Team selection

The team comes from the `?team=` URL parameter, for example `vr.html?team=red`. It is remembered in localStorage, so a reload keeps the team. A `?team=` in the URL replaces the remembered team.

Valid teams: `blue`, `red`, `white`. The default is `blue`.

---

## 8. Known gaps

- VR controls have been written against the Quest 3S but not yet tested on the headset. The hand position, the crosshair hiding, the right-hand aim and the team-coloured ring need a check there.
