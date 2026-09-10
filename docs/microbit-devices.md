# Cosmic Chef — Sous-chef motion sensors as game controllers using BBC Microbit V2 devices

> **Scope:** Architecture, data flow, and Homie convention mapping for the agnostic BBC micro:bit v2 hardware terminals used as sous-chef gesture controllers in *Cosmic Chef*.


---

## Device Lifecycle

Unlike fixed-pairing hardware, the micro:bit v2 devices act as **generic hardware terminals** (e.g., Terminal A, Terminal B, Terminal C). 

1. **Agnostic Startup:** When powered on, a micro:bit terminal connects over radio to the WebUSB gateway, which publishes it to the MQTT broker as an unassigned Homie device (e.g., `terminal-02b1cf45`).
2. **Lobby Binding Phase:** During game setup, the team is registered with a randomly generated name and assigned an in-game team color (`red`, `blue`, or `white`). The Head Chef registers this team color and assigns each connected terminal to a specific sous-chef profile (e.g., binding `terminal-02b1cf45` to `Team Color: red`, `SousChef: Alice`).
3. **Dynamic Property Updates:** The gateway updates the terminal's Homie metadata properties (`team` and `sousChef`). The game backend tracks these bindings so incoming gestures route to the correct player in the XState machine.


## Communication Overview

To bridge physical cooking movements (slicing, dicing, stirring, smashing) into the game loop without complicated tethered wiring, *Cosmic Chef* utilizes a wireless hardware pipeline:

1. **The WebUSB Gateway:** A dedicated browser or companion application connected via WebUSB acts as a bridge, receiving the radio packets from the micro:bit network.
2. **MQTT / Homie Convention Bridge:** The gateway translates the micro:bit radio signals into standardized **Homie IoT Convention** messages published over MQTT, mapping cleanly to `Device / Node / Property` hierarchies.
3. **RxJS & XState Integration:** The game backend ingests these Homie updates reactively via RxJS, parsing them into valid gesture events (`SOUS_CHEF_GESTURE_START`, `SOUS_CHEF_GESTURE_TICK`, `SOUS_CHEF_GESTURE_STOP`) processed by the XState game engine.

---

## 3. Hardware Architecture & Radio Topology

```text
+-----------------------------+       Radio (2.4GHz)      +-----------------------------+
|   micro:bit v2 (Sous-Chef)  | ------------------------> |   micro:bit v2 (WebUSB)     |
|   - Accelerometer gestures  |                           |   (Gateway / Coordinator)   |
+-----------------------------+                           +-----------------------------+
                                                                         |
                                                                         | WebUSB API
                                                                         ▼
                                                          +-----------------------------+
                                                          |  Gateway Bridge Software    |
                                                          |  (Translates to MQTT/Homie) |
                                                          +-----------------------------+
                                                                         |
                                                                         | MQTT Broker
                                                                         ▼
                                                          +-----------------------------+
                                                          |   RxJS + XState Backend     |
                                                          |   (Cosmic Chef Game Engine) |
                                                          +-----------------------------+
```

* **Radio Protocol:** Micro:bit terminals communicate over the built-in 2.4GHz radio library, sending short line protocol-style text payloads containing the `chefId`, `action`, and `state`.

---

## Homie Convention Mapping (`Device / Node / Property`)

Following the standard Homie IoT convention, each micro:bit controller registers itself as an MQTT device. 

### Topic Structure
```text
homie/<device-id>/<node>/<property>
```

### Homie Node & Property Schema for a Terminal:

* **Device ID:** `microbit-terminal-01`
* **Node 1: `config`** (Metadata for binding)
  * Property `team`: String (`red`, `blue`, `white`, or `none`)
  * Property `sousChef`: String (Assigned player name or ID)
* **Node 2: `controls`** (Real-time telemetry)
  * Property `gesture`: String (`slice`, `dice`, `stir`, `smash`, or `idle`)
  * Property `confidence`: Integer (`0` to `100`)

#### Sample MQTT Broker Publish Payload:
```json
homie/terminal-02b1cf45/$name "Micro:bit Terminal 1"
homie/terminal-02b1cf45/$state "ready"
homie/terminal-02b1cf45/$nodes "config,controls"

homie/terminal-02b1cf45/config/$name "Terminal Configuration"
homie/terminal-02b1cf45/config/$properties "team,sousChef"
homie/terminal-02b1cf45/config/team "red"
homie/terminal-02b1cf45/config/sousChef "Alice"

homie/terminal-02b1cf45/controls/$name "Motion Controls"
homie/terminal-02b1cf45/controls/$properties "gesture-timestamp"
homie/terminal-02b1cf45/controls/gesture "slice-1053879"
```

When an ongoing gesture stops, the terminal will send :

```json
homie/terminal-02b1cf45/controls/gesture "slice-0"
```

---

## RxJS & Homie-Lit Adaptation Layer (`terminalAdapter.ts`)

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

1. **Flashing Firmware:** All micro:bit v2 terminals are flashed with identical generic firmware that listens to button inputs and accelerometer shakes, transmitting via the micro:bit radio layer.
2. **The WebUSB Gateway:** A dedicated browser session running on a machine near the micro:bit radio receiver captures the raw serial frames and publishes them to the local MQTT broker using standard Homie formatting.
3. **Lobby Assignment UI:** In the *Cosmic Chef* web interface, the Head Chef selects a team color (`red`, `blue`, or `white`), picks an online terminal from a dropdown list of detected Homie devices, and assigns a sous-chef's name. This writes to the MQTT topic `homie/<terminal-id>/config/team` and `homie/<terminal-id>/config/sousChef`, instantly pairing the hardware for that session.

## Troubleshooting
1. **WebUSB Permissions:** Browsers restrict WebUSB access for security. The gateway coordinator app must prompt the user via a physical browser interaction click ("Connect Microbit Gateway") before serial streams can open.
2. **Radio Interference:** The 2.4GHz radio band shared by micro:bits can experience interference in crowded rooms. Ensure micro:bits are flashed with matching group IDs (channels 0–83) corresponding to their game pod.
3. **Debouncing & Hold Tracking:** Fast accelerometer shakes can chatter (`slice` $\rightarrow$ `idle` $\rightarrow$ `slice`). The RxJS buffer layer combined with XState's internal `HoldingGesture` state absorbs micro-jitters, ensuring a smooth transition experience for the players.