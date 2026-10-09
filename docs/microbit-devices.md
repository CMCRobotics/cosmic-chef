# Cosmic Chef — Sous-chef motion sensors as game controllers using BBC Microbit V2 devices

> **Scope:** Architecture, data flow, and Homie convention mapping for the agnostic BBC micro:bit v2 hardware terminals used as sous-chef gesture controllers in *Cosmic Chef*.


---

## Device Lifecycle

Unlike fixed-pairing hardware, the micro:bit v2 devices act as **generic hardware terminals** (e.g., Terminal A, Terminal B, Terminal C). 

1. **Agnostic Startup:** When powered on, a micro:bit terminal broadcasts its gestures on its team's radio group. The gateway publishes it to the MQTT broker as an unbound Homie device (`terminal-<serial hex>`, e.g. `terminal-02b1cf45`), with `config/sousChef` set to `none`.
2. **Binding:** The gateway binds a new terminal to the lowest free sous-chef slot (1, then 2, then 3). Any terminal beyond three stays unassigned. The operator can move or forget a terminal in the gateway page. Bindings are stored in the browser per team (see [Sous-chef assignment](#sous-chef-assignment)).
3. **Dynamic Property Updates:** Each binding change republishes `config/team` and `config/sousChef` (retained). Gestures from a bound terminal are published to the sous-chef's game topic, so incoming gestures route to the correct player in the XState machine.


## Communication Overview

To bridge physical cooking movements (slicing, tenderizing, stirring) into the game loop without complicated tethered wiring, *Cosmic Chef* utilizes a wireless hardware pipeline:

1. **The Radio Gateway:** A gateway micro:bit plugged into the computer running the browser page (`/dev/microbit-gateway.html`). It receives the terminals' radio packets and prints them on USB serial. The browser reads them with the Web Serial API (see [Gateway serial protocol](#gateway-serial-protocol)).
2. **MQTT / Homie Convention Bridge:** `src/client/microbit-gateway.ts` (`MicrobitGateway`) translates the packets into game topics `sous-chef-N/gesture/current` and Homie device topics `homie/terminal-<id>/...`.
3. **RxJS & XState Integration:** `mqtt-bridge` consumes `sous-chef-N/gesture/current` like any other gesture input, which becomes `GESTURE_START` / `GESTURE_TICK` / `GESTURE_STOP` for the XState game engine.
3. **RxJS & XState Integration:** The game backend ingests these Homie updates reactively via RxJS, parsing them into valid gesture events (`SOUS_CHEF_GESTURE_START`, `SOUS_CHEF_GESTURE_TICK`, `SOUS_CHEF_GESTURE_STOP`) processed by the XState game engine.

---

## 3. Hardware Architecture & Radio Topology

```text
+-----------------------------+       Radio (2.4GHz)      +-----------------------------+
|   micro:bit v2 (Sous-Chef)  | ------------------------> |   micro:bit v2 (Gateway)    |
|   - Accelerometer gestures  |                           |   gateway.py, USB serial    |
+-----------------------------+                           +-----------------------------+
                                                                         |
                                                                         | USB serial (Web Serial API)
                                                                         ▼
                                                          +-----------------------------+
                                                          |  microbit-gateway.html      |
                                                          |  MicrobitGateway (TS)       |
                                                          +-----------------------------+
                                                                         |
                                                                         | MQTT Broker
                                                                         ▼
                                                          +-----------------------------+
                                                          |   RxJS + XState Backend     |
                                                          |   (Cosmic Chef Game Engine) |
                                                          +-----------------------------+
```

* **Radio Protocol:** Terminals send a fixed text message `GEST,<gesture>,<onoff>` on their team's radio group. See [Radio gesture protocol](#radio-gesture-protocol).

---

## Radio gesture protocol

### Terminal side (existing MakeCode Python)

Each sous-chef terminal runs this setup:

1. `radio.set_transmit_serial_number(True)`: every packet carries the micro:bit's device serial number. This is what identifies the terminal.
2. The radio group is set on the device, one per team (below).
3. When a motion change is detected it sends:
   ```python
   radio.send_string("GEST" + "," + GESTURE + "," + str(ONOFF))
   ```
   - `GESTURE`: `TEND` (tenderizing), `SLIC` (slicing), or `STIR` (stirring).
   - `ONOFF`: `1` when the gesture starts or is ongoing, `0` when it stops.
   - Examples: `GEST,TEND,1`, `GEST,SLIC,0`. The string is always 11 characters, below the 19-character radio limit.

### Radio groups per team

| Team | Radio group (terminals and gateway) |
|------|-------------------------------------|
| `blue`  | 31 |
| `white` | 32 |
| `red`   | 33 |

The terminal's group is set on the device. The gateway's group is set by the browser on connect (`GROUP,<n>`), so one gateway serves one team. Only terminals of the same team are heard.

| Radio code | Game gesture (`gesture/current` payload) |
|------------|------------------------------------------|
| `TEND` | `tenderize` |
| `SLIC` | `slice` |
| `STIR` | `stir` |
| `REST` | `idle` (sous-chef resting) |

`GEST,REST,<onoff>` means the sous-chef is idle. The ONOFF flag is ignored. It always publishes `idle` to the bound sous-chef, even when no gesture was running, so a lost stop message cannot leave a sous-chef stuck. Any other code or ONOFF value is ignored.

### Gateway micro:bit (`microbit/gateway.py`)

The gateway micro:bit is flashed with `microbit/gateway.py` and plugged into the computer. It does not decode the message. It forwards the raw radio string, with the terminal's serial number, over USB serial.

### Gateway serial protocol

Browser ⇄ gateway, 115200 baud, one line per message, terminated by `\n`:

| Direction | Line | Meaning |
|-----------|------|---------|
| browser → gateway | `GROUP,<n>` | Set the radio group. Sent on connect. |
| gateway → browser | `READY,<n>` | Booted, or confirms `GROUP,<n>`. If the browser sees a different group it sends `GROUP` again. |
| gateway → browser | `RX,<serial>,<payload>` | A radio packet. `<serial>` is the decimal device serial number; `<payload>` is the raw radio string (for example `GEST,TEND,1`). |

### Browser transport: Web Serial, not WebUSB

The gateway is read with the **Web Serial API** (`navigator.serial`), not raw WebUSB. Chrome cannot claim a micro:bit's USB serial port through WebUSB on Linux or macOS because the OS driver owns it. Web Serial reaches the same port with a single port-picker click.

- Browsers: Chrome or Edge on desktop only. Firefox and Safari do not implement Web Serial.
- Secure context: `https://` or `localhost`.
- The user must click **Connect gateway micro:bit**. The browser requires a user gesture to open the port picker.

### Terminal identity

A terminal's Homie device id is `terminal-` followed by its serial number as 8 lowercase hex digits (`0x02b1cf45` → `terminal-02b1cf45`). Serial numbers are unsigned 32-bit values.

### Sous-chef assignment

Assignment is done in the gateway page (`/dev/microbit-gateway.html?team=<team>`):

- **Auto:** a terminal heard for the first time takes the lowest free sous-chef slot (1, 2, 3). If all three are taken it stays unassigned.
- **Manual:** the slot dropdown moves a terminal. If the slot is taken, the previous holder becomes unassigned.
- **Forget:** removes the terminal's binding and publishes `config/sousChef = none`. Its next radio message binds it again.
- **Unassigned terminals** publish Homie telemetry only. They publish nothing to the game topics.
- **Storage:** bindings are kept in localStorage under `cosmic-chef.microbit.<team>` as JSON, e.g. `{"terminal-02b1cf45":1,"terminal-11223344":null}`. They are per browser, not shared between windows or machines.

### Gesture publication

For a bound terminal, `GEST,<gesture>,1` publishes the gesture name to `cosmic-chef/team-<team>/game-<game>/sous-chef-<n>/gesture/current`. `GEST,<gesture>,0` publishes `idle`, but only if that same gesture was running on that terminal. A terminal reassigned mid-gesture publishes `idle` to its old slot, and its next start message goes to the new slot.

The gateway only publishes to `gesture/current` (the sous-chef topics). It never publishes to `round/recipe-desired` or other input topics.

---

## Homie Convention Mapping (`Device / Node / Property`)

Following the standard Homie IoT convention, each micro:bit controller registers itself as an MQTT device. 

### Topic Structure
```text
homie/<device-id>/<node>/<property>
```

### Homie Node & Property Schema for a Terminal:

* **Device ID:** `terminal-<serial hex>`, e.g. `terminal-02b1cf45` (see [Terminal identity](#terminal-identity))
* **Node 1: `config`** (binding, retained)
  * Property `team`: String (`red`, `blue`, or `white`)
  * Property `sousChef`: String (`sous-chef-1`, `sous-chef-2`, `sous-chef-3`, or `none`)
* **Node 2: `controls`** (telemetry)
  * Property `gesture`: String `<gesture>-<timestamp ms>` while running, `<gesture>-0` when it stops (gesture is `tenderize`, `slice` or `stir`)

Not retained: `controls/gesture` is live telemetry, so a late subscriber does not see a stale start message.

#### Sample MQTT Broker Publish Payload:
```json
homie/terminal-02b1cf45/$homie "4.0.0"                        (retained)
homie/terminal-02b1cf45/$name "Micro:bit Terminal 02b1cf45"  (retained)
homie/terminal-02b1cf45/$state "ready"                        (retained)
homie/terminal-02b1cf45/$nodes "config,controls"              (retained)

homie/terminal-02b1cf45/config/$properties "team,sousChef"    (retained)
homie/terminal-02b1cf45/config/team "red"                     (retained)
homie/terminal-02b1cf45/config/sousChef "sous-chef-1"         (retained)

homie/terminal-02b1cf45/controls/$properties "gesture"
homie/terminal-02b1cf45/controls/gesture "slice-1719999999999"
```

When the gesture stops, the terminal publishes:

```json
homie/terminal-02b1cf45/controls/gesture "slice-0"
```

The same start and stop also go to the game topic as `tenderize`/`slice`/`stir` and `idle` on `sous-chef-1/gesture/current`, but only when the terminal is bound to a slot.

---

## RxJS & Homie-Lit Adaptation Layer (`terminalAdapter.ts`) — alternative design, not used by the game

> **Status:** This section is an earlier design sketch. The game does not read `homie/terminal-*` topics. The gateway (`MicrobitGateway`) publishes straight to `sous-chef-N/gesture/current`, which `mqtt-bridge` already consumes. The Homie topics are published for dashboards and observers. This sketch also uses the older gesture names (`dice`, `smash`); the real names are `tenderize`, `slice` and `stir`.

Because terminals are dynamically bound, your RxJS stream needs to maintain a lookup map of `terminalId -> { team, sousChef }` based on changes to the `config` node, ensuring incoming gestures are correctly translated into XState events with the right player context.

```typescript
import { createMqttHomieObserver, HomiePropertyBuffer } from 'homie-lit';
import { Observable, map, filter, scan } from 'rxjs';

export interface TerminalRegistry {
  [terminalId: string]: { team: string; sousChef: string };
}

export function createTerminalBindingStream(brokerUrl: string): Observable<{ registry: TerminalRegistry; event?: any }> {
  const observer = createMqttHomieObserver(brokerUrl);
  observer.subscribe('terminal-+/#');

  const propertyBuffer = new HomiePropertyBuffer(observer, 50);

  return propertyBuffer.getBufferedUpdates().pipe(
    map(updates => updates || []),
    filter(updates => updates.length > 0),
    // Use RxJS scan to accumulate state changes for terminal-to-chef bindings and gestures
    scan(({ registry, event }: { registry: TerminalRegistry; event: any }, updates) => {
      const nextRegistry = { ...registry };
      let triggeredEvent = null;

      for (const u of updates) {
        // e.g., "microbit-terminal-01/config/team" or "microbit-terminal-01/controls/gesture"
        const [terminalId, node, property] = u.property.split('/');

        if (!nextRegistry[terminalId]) {
          nextRegistry[terminalId] = { team: 'none', sousChef: 'none' };
        }

        // 1. Handle dynamic configuration binding updates
        if (node === 'config' && property === 'team') {
          nextRegistry[terminalId].team = String(u.value);
        }
        if (node === 'config' && property === 'sousChef') {
          nextRegistry[terminalId].sousChef = String(u.value);
        }

        // 2. Handle active gesture updates mapped to the bound sous-chef
        if (node === 'controls' && property === 'gesture') {
          const binding = nextRegistry[terminalId];
          if (binding && binding.sousChef && binding.sousChef !== 'none') {
            const rawAction = String(u.value).toLowerCase();
            const chefId = `${binding.team}_${binding.sousChef}`; // Unique compound ID

            if (['idle', 'stop', 'none'].includes(rawAction)) {
              triggeredEvent = { type: 'SOUS_CHEF_GESTURE_STOP', chefId, terminalId };
            } else if (['slice', 'dice', 'stir', 'smash'].includes(rawAction)) {
              triggeredEvent = { type: 'SOUS_CHEF_GESTURE_START', chefId, action: rawAction, terminalId };
            }
          }
        }
      }

      return { registry: nextRegistry, event: triggeredEvent };
    }, { registry: {}, event: null }),
    filter(state => state.event !== null)
  );
}
```

---

## Hardware Deployment & Pairing Guide

1. **Flashing the terminals:** Each sous-chef terminal runs the MakeCode Python described in [Terminal side](#terminal-side-existing-makecode-python). Set its radio group to its team's group (31 blue, 32 white, 33 red).
2. **Flashing the gateway:** Flash `microbit/gateway.py` (MakeCode Python) on one micro:bit and plug it into the computer running the browser. Its LED shows the group once the browser has set it.
3. **The gateway page:** Open `/dev/microbit-gateway.html?team=<team>` in Chrome or Edge, then click **Connect gateway micro:bit** and pick the gateway's serial port. The page connects MQTT, sets the radio group, and lists terminals as they are heard.
4. **Binding:** New terminals are bound automatically to sous-chef 1, 2, 3 in the order they are heard. Use the slot dropdown to move a terminal, or **Forget** to unbind it.

## Troubleshooting
1. **Web Serial access:** The port picker only opens from a click on the page, and only on Chrome or Edge over `https://` or `localhost`. Close any other program that has the gateway's serial port open (for example MakeCode's serial console).
2. **Radio Interference:** The 2.4GHz radio band shared by micro:bits can experience interference in crowded rooms. Keep the three teams on their own groups (31/32/33). Teams on the same group hear each other's terminals.
3. **In the game scene:** `index.html` shows the same gateway as a HUD in the top-left corner of the camera (`microbit-hud.html` + `microbit-gateway-hud.js`). It has Connect/Disconnect, one row per bound terminal (its current gesture, and a button that cycles its sous-chef slot), and it is hidden in VR. Its MQTT output goes through `mqtt-bridge`.
4. **Terminals not appearing:** Check that the terminal and the gateway use the same group. The gateway page logs `Gateway radio group set to N` once it is set.
3. **Debouncing & Hold Tracking:** Fast accelerometer shakes can chatter (`slice` $\rightarrow$ `idle` $\rightarrow$ `slice`). The RxJS buffer layer combined with XState's internal `HoldingGesture` state absorbs micro-jitters, ensuring a smooth transition experience for the players.