# Cosmic Chef — Head Chef controls

Reference for how the head chef plays `head-chef.html`, on desktop and in VR (Meta Quest).

> **Scope:** Input controls and what they do. The sous-chef side is in [`game.md`](game.md) and the MQTT flow in [`mqtt-architecture.md`](mqtt-architecture.md).

---

## 1. What the head chef does

1. **Aim** at a falling recipe crate with the crosshair (the centre of the view).
2. **Select** the crate that is under the crosshair.
3. **Capture** the selected crate. It is pulled to the team's intake, and the recipe is sent to the team's sous-chefs.
4. **Submit or cancel** the dish with the floor button, once the sous-chefs are done.

Only one crate can be captured at a time. Crates can only be captured while the team is waiting for a recipe (see [Team busy](#team-busy)).

---

## 2. VR controls (Meta Quest)

| Input | Action |
| :--- | :--- |
| **Head gaze** (aim) | Moves the crosshair. The crate under it is highlighted. |
| **Right trigger** | **Select** the aimed crate. Press again on the same crate to **capture** it. Press on empty space to clear the selection. |
| **Right grip** (squeeze) and hand movement | **Zoom** in and out. Hold to zoom, release to keep the current zoom. |
| **Either hand's trigger** (laser pointer) | **Press the floor button**: submit (green O) or cancel (red X). |

Notes:

- The floor button is pressed with the hand's laser pointer, so aim it at the button and pull the trigger.
- The right trigger is used for capture, so zooming uses the right grip instead.

---

## 3. Desktop controls

| Input | Action |
| :--- | :--- |
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

The team comes from the `?team=` URL parameter, for example `head-chef.html?team=red`. It is remembered in localStorage, so a reload keeps the team. A `?team=` in the URL replaces the remembered team.

Valid teams: `blue`, `red`, `white`. The default is `blue`.

---

## 8. Known gaps

- VR controls have been written against the Quest 3S but not yet tested on the headset.
