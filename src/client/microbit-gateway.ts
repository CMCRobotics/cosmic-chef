/**
 * micro:bit radio gateway: turns sous-chef motion terminals into game gestures.
 *
 * A gateway micro:bit is plugged into the browser's computer over USB. It listens on the
 * team's radio group and prints one line per radio packet. This module reads those lines
 * (Web Serial), works out which terminal sent them and which sous-chef it is bound to, and
 * publishes to MQTT:
 *   - cosmic-chef/team-{team}/game-{game}/sous-chef-{n}/gesture/current  (what mqtt-bridge consumes)
 *   - homie/terminal-{serialHex}/...                                     (Homie device for the terminal)
 *
 * Protocols are documented in docs/microbit-devices.md (section "Radio gesture protocol").
 * Pure parts are exported for tests. The class only touches the serial and MQTT objects it is given.
 */

import { sousChefGestureTopic, terminalTopic } from "./topics";
import type { TeamId, TeamStorage } from "./team";

/** Radio group each team's terminals broadcast on. Set on the gateway at connect time. */
export const RADIO_GROUPS: Record<TeamId, number> = { blue: 31, white: 32, red: 33 };

/** Serial speed between the browser and the gateway micro:bit. Must match the MakeCode code. */
export const GATEWAY_BAUD_RATE = 115200;

/** Four-letter gesture codes sent by the terminal, mapped to game gesture names. */
export const GESTURE_CODES: Record<string, string> = {
  TEND: "tenderize",
  SLIC: "slice",
  STIR: "stir",
  REST: "idle", // The sous-chef is resting: no gesture, whatever the on/off flag says.
};

export type SousChefSlot = 1 | 2 | 3;
export const SOUS_CHEF_SLOTS: readonly SousChefSlot[] = [1, 2, 3];

export function radioGroupFor(teamId: TeamId): number {
  return RADIO_GROUPS[teamId];
}

/** Homie device id of a terminal from its radio serial number, e.g. "terminal-02b1cf45". */
export function terminalIdFromSerial(serial: number): string {
  return `terminal-${(serial >>> 0).toString(16).padStart(8, "0")}`;
}

export type GatewayLine =
  | { type: "ready"; group: number }
  | { type: "rx"; serial: number; payload: string };

/**
 * Parses one line printed by the gateway micro:bit:
 *   READY,<group>            gateway booted, or confirmed a GROUP command
 *   RX,<serial>,<payload>    radio packet received from a terminal (payload may contain commas)
 * Returns null for anything else.
 */
export function parseGatewayLine(line: string): GatewayLine | null {
  const text = line.trim();
  const ready = text.match(/^READY,(\d+)$/);
  if (ready) return { type: "ready", group: parseInt(ready[1], 10) };
  const rx = text.match(/^RX,(-?\d+),(.*)$/);
  if (rx) return { type: "rx", serial: parseInt(rx[1], 10), payload: rx[2] };
  return null;
}

export interface GestureMessage {
  gesture: string;
  active: boolean;
}

/** Parses a terminal radio string "GEST,<TEND|SLIC|STIR>,<1|0>". Null when malformed. */
export function parseGestureMessage(payload: string): GestureMessage | null {
  const match = payload.trim().match(/^GEST,([A-Z]{4}),([01])$/);
  if (!match) return null;
  const gesture: string | undefined = GESTURE_CODES[match[1]];
  if (!gesture) return null;
  if (gesture === "idle") return { gesture, active: false };
  return { gesture, active: match[2] === "1" };
}

export interface TerminalBinding {
  terminalId: string;
  sousChef: SousChefSlot | null;
}

export function microbitStorageKey(teamId: TeamId): string {
  return `cosmic-chef.microbit.${teamId}`;
}

function isSlot(value: unknown): value is SousChefSlot {
  return value === 1 || value === 2 || value === 3;
}

function loadBindings(storage: TeamStorage | null, key: string): Map<string, SousChefSlot | null> {
  const bindings = new Map<string, SousChefSlot | null>();
  let raw: string | null = null;
  try {
    raw = storage?.getItem(key) ?? null;
  } catch {
    return bindings; // Storage unavailable: start empty.
  }
  if (!raw) return bindings;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return bindings;
  }
  if (!parsed || typeof parsed !== "object") return bindings;

  for (const [terminalId, slot] of Object.entries(parsed as Record<string, unknown>)) {
    if (slot === null) {
      bindings.set(terminalId, null);
    } else if (isSlot(slot) && ![...bindings.values()].includes(slot)) {
      bindings.set(terminalId, slot); // A slot held twice in storage is dropped on the second one.
    }
  }
  return bindings;
}

/**
 * Remembers which terminal is bound to which sous-chef slot for one team, in local storage.
 *
 * A terminal is bound on first sight: it takes the lowest free slot, or stays unassigned
 * (null) when all three are taken. Later changes come from setSlot / forget.
 */
export class TerminalRegistry {
  private readonly key: string;
  private readonly storage: TeamStorage | null;
  private readonly bindings: Map<string, SousChefSlot | null>;

  constructor(teamId: TeamId, storage: TeamStorage | null) {
    this.key = microbitStorageKey(teamId);
    this.storage = storage;
    this.bindings = loadBindings(storage, this.key);
  }

  has(terminalId: string): boolean {
    return this.bindings.has(terminalId);
  }

  binding(terminalId: string): TerminalBinding | undefined {
    if (!this.bindings.has(terminalId)) return undefined;
    return { terminalId, sousChef: this.bindings.get(terminalId) ?? null };
  }

  /** The terminal currently holding a slot, if any. */
  holderOf(slot: SousChefSlot): string | undefined {
    for (const [terminalId, held] of this.bindings) {
      if (held === slot) return terminalId;
    }
    return undefined;
  }

  /** Returns the binding of a terminal, binding it first (lowest free slot) if it is new. */
  observe(terminalId: string): TerminalBinding {
    const existing = this.binding(terminalId);
    if (existing) return existing;
    const free = SOUS_CHEF_SLOTS.find((slot) => this.holderOf(slot) === undefined) ?? null;
    this.bindings.set(terminalId, free);
    this.save();
    return { terminalId, sousChef: free };
  }

  /**
   * Binds a known terminal to a slot (or null to unassign it). A terminal already in that
   * slot is moved, so the slot is always held by at most one terminal. Returns every binding
   * that changed, including a terminal that was displaced.
   */
  setSlot(terminalId: string, slot: SousChefSlot | null): TerminalBinding[] {
    if (!this.bindings.has(terminalId)) throw new Error(`Unknown terminal ${terminalId}`);
    const changed: TerminalBinding[] = [];
    if (slot !== null) {
      const holder = this.holderOf(slot);
      if (holder !== undefined && holder !== terminalId) {
        this.bindings.set(holder, null);
        changed.push({ terminalId: holder, sousChef: null });
      }
    }
    this.bindings.set(terminalId, slot);
    changed.push({ terminalId, sousChef: slot });
    this.save();
    return changed;
  }

  /** Removes a terminal. Its next radio message binds it again as a new terminal. */
  forget(terminalId: string): void {
    if (this.bindings.delete(terminalId)) this.save();
  }

  list(): TerminalBinding[] {
    return [...this.bindings.keys()]
      .sort()
      .map((terminalId) => ({ terminalId, sousChef: this.bindings.get(terminalId) ?? null }));
  }

  private save(): void {
    try {
      this.storage?.setItem(this.key, JSON.stringify(Object.fromEntries(this.bindings)));
    } catch {
      // Storage unavailable: bindings still hold for this page session.
    }
  }
}

/** Minimal slice of the Web Serial SerialPort used by the gateway. */
export interface SerialPortLike {
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
}

/** Minimal slice of navigator.serial. */
export interface SerialLike {
  requestPort(): Promise<SerialPortLike>;
}

/** Minimal slice of an mqtt.js client. */
export interface GatewayMqttClient {
  publish(topic: string, message: string, options?: { qos?: 0 | 1 | 2; retain?: boolean }): unknown;
}

export interface GestureEvent {
  terminalId: string;
  gesture: string;
  active: boolean;
  sousChef: SousChefSlot | null;
}

export interface GatewayEvents {
  connection: { connected: boolean };
  ready: { group: number };
  terminal: TerminalBinding;
  "terminal-forgotten": { terminalId: string };
  gesture: GestureEvent;
  error: { message: string };
}

type Listener<T> = (event: T) => void;

function defaultSerial(): SerialLike | null {
  return (globalThis as { navigator?: { serial?: SerialLike } }).navigator?.serial ?? null;
}

export interface MicrobitGatewayOptions {
  teamId: TeamId;
  gameId: string;
  mqtt: GatewayMqttClient;
  /** Remembers the terminal bindings. Pass localStorage or null for session-only. */
  storage: TeamStorage | null;
  /** Defaults to navigator.serial. */
  serial?: SerialLike | null;
}

/**
 * Connects one gateway micro:bit and forwards its terminals' gestures to MQTT.
 *
 * connect() needs a user gesture (it opens the browser port picker). Gestures from a
 * terminal are published to its sous-chef topic only while it is bound to a slot.
 */
export class MicrobitGateway {
  readonly teamId: TeamId;
  readonly gameId: string;
  readonly radioGroup: number;
  readonly registry: TerminalRegistry;

  private readonly mqtt: GatewayMqttClient;
  private readonly serial: SerialLike | null;
  private readonly listeners = new Map<keyof GatewayEvents, Set<Listener<never>>>();
  private readonly activeGestures = new Map<string, string>();
  private port: SerialPortLike | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private reader: ReadableStreamDefaultReader<string> | null = null;
  private readLoopDone: Promise<void> = Promise.resolve();
  private readablePiped: Promise<void> = Promise.resolve();

  constructor(options: MicrobitGatewayOptions) {
    this.teamId = options.teamId;
    this.gameId = options.gameId;
    this.mqtt = options.mqtt;
    this.serial = options.serial === undefined ? defaultSerial() : options.serial;
    this.radioGroup = radioGroupFor(options.teamId);
    this.registry = new TerminalRegistry(options.teamId, options.storage);
  }

  get connected(): boolean {
    return this.port !== null;
  }

  /** Subscribes to a gateway event. Returns a function that unsubscribes. */
  on<K extends keyof GatewayEvents>(type: K, listener: Listener<GatewayEvents[K]>): () => void {
    let set = this.listeners.get(type) as Set<Listener<GatewayEvents[K]>> | undefined;
    if (!set) {
      set = new Set();
      this.listeners.set(type, set as Set<Listener<never>>);
    }
    set.add(listener);
    return () => {
      set?.delete(listener);
    };
  }

  /** Opens the port picker, opens the gateway and sets its radio group. Needs a user click. */
  async connect(): Promise<void> {
    if (!this.serial) throw new Error("Web Serial is not available in this browser");
    if (this.port) return;

    const port = await this.serial.requestPort();
    await port.open({ baudRate: GATEWAY_BAUD_RATE });
    if (!port.readable || !port.writable) throw new Error("Gateway serial port is not readable");

    this.port = port;
    this.writer = port.writable.getWriter();
    // pipeTo (not pipeThrough) so the port's readable is unlocked once the pipe has finished.
    // The port cannot be closed while it is locked.
    const decoder = new TextDecoderStream();
    this.readablePiped = port.readable.pipeTo(decoder.writable).catch(() => undefined);
    this.reader = decoder.readable.getReader();
    this.emit("connection", { connected: true });
    this.readLoopDone = this.readLoop(this.reader);
    await this.send(`GROUP,${this.radioGroup}`);
  }

  /** Closes the serial port. Bindings and MQTT state are kept. */
  async disconnect(): Promise<void> {
    const port = this.port;
    if (!port) return;
    try {
      await this.reader?.cancel();
    } catch {
      // The reader is already closed; the read loop finishes below either way.
    }
    await this.readLoopDone; // Releases the writer and the reader.
    await this.readablePiped; // Unlocks the port's readable.
    try {
      await port.close();
    } catch (err) {
      this.emitError(err);
    }
  }

  /** Binds a terminal to a sous-chef slot (null = unassigned). Republishes the Homie config. */
  setSousChef(terminalId: string, slot: SousChefSlot | null): void {
    if (!this.registry.has(terminalId)) throw new Error(`Unknown terminal ${terminalId}`);
    const holder = slot === null ? undefined : this.registry.holderOf(slot);
    this.stopGesture(terminalId);
    if (holder !== undefined && holder !== terminalId) this.stopGesture(holder);
    for (const binding of this.registry.setSlot(terminalId, slot)) {
      this.publishConfig(binding);
      this.emit("terminal", binding);
    }
  }

  /** Removes a terminal from the bindings. Its next radio message binds it again. */
  forget(terminalId: string): void {
    if (!this.registry.has(terminalId)) return;
    this.stopGesture(terminalId);
    this.registry.forget(terminalId);
    this.publish(terminalTopic(terminalId, "config/sousChef"), "none", { retain: true });
    this.emit("terminal-forgotten", { terminalId });
  }

  private async readLoop(reader: ReadableStreamDefaultReader<string>): Promise<void> {
    let buffer = "";
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        let newline: number;
        while ((newline = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, newline);
          buffer = buffer.slice(newline + 1);
          this.handleLine(line);
        }
      }
    } catch (err) {
      this.emit("error", { message: err instanceof Error ? err.message : String(err) });
    } finally {
      try {
        reader.releaseLock();
      } catch {
        // Already released.
      }
      this.handleDisconnect();
    }
  }

  private handleDisconnect(): void {
    if (!this.port) return;
    try {
      this.writer?.releaseLock();
    } catch {
      // Already released.
    }
    this.writer = null;
    this.reader = null;
    this.port = null;
    this.emit("connection", { connected: false });
  }

  private handleLine(line: string): void {
    const message = parseGatewayLine(line);
    if (!message) return;

    if (message.type === "ready") {
      this.emit("ready", { group: message.group });
      if (message.group !== this.radioGroup) {
        void this.send(`GROUP,${this.radioGroup}`).catch((err) => this.emitError(err));
      }
      return;
    }
    this.handleRadio(message.serial, message.payload);
  }

  private handleRadio(serial: number, payload: string): void {
    const terminalId = terminalIdFromSerial(serial);
    if (!this.registry.has(terminalId)) {
      const binding = this.registry.observe(terminalId);
      this.publishDevice(binding);
      this.emit("terminal", binding);
    }

    const gesture = parseGestureMessage(payload);
    if (!gesture) return;

    const sousChef = this.registry.binding(terminalId)?.sousChef ?? null;
    if (gesture.gesture === "idle") {
      // REST always stops the sous-chef, even if no start message was seen (a stop may have been lost).
      this.activeGestures.delete(terminalId);
      this.publishSousChef(sousChef, "idle");
      this.publish(terminalTopic(terminalId, "controls/gesture"), "idle");
      this.emit("gesture", { terminalId, gesture: "idle", active: false, sousChef });
      return;
    }
    if (gesture.active) {
      this.activeGestures.set(terminalId, gesture.gesture);
      this.publishSousChef(sousChef, gesture.gesture);
      this.publish(terminalTopic(terminalId, "controls/gesture"), `${gesture.gesture}-${Date.now()}`);
    } else if (this.activeGestures.get(terminalId) === gesture.gesture) {
      this.activeGestures.delete(terminalId);
      this.publishSousChef(sousChef, "idle");
      this.publish(terminalTopic(terminalId, "controls/gesture"), `${gesture.gesture}-0`);
    }
    this.emit("gesture", { terminalId, gesture: gesture.gesture, active: gesture.active, sousChef });
  }

  /** Ends a terminal's gesture (if one is running) on its current slot. */
  private stopGesture(terminalId: string): void {
    const gesture = this.activeGestures.get(terminalId);
    if (gesture === undefined) return;
    this.activeGestures.delete(terminalId);
    const sousChef = this.registry.binding(terminalId)?.sousChef ?? null;
    this.publishSousChef(sousChef, "idle");
    this.publish(terminalTopic(terminalId, "controls/gesture"), `${gesture}-0`);
    this.emit("gesture", { terminalId, gesture, active: false, sousChef });
  }

  private publishSousChef(slot: SousChefSlot | null, payload: string): void {
    if (slot === null) return; // Unassigned terminals drive no game topic.
    this.publish(sousChefGestureTopic(this.teamId, this.gameId, slot), payload);
  }

  private publishDevice(binding: TerminalBinding): void {
    const id = binding.terminalId;
    const retained = { retain: true };
    this.publish(terminalTopic(id, "$homie"), "4.0.0", retained);
    this.publish(terminalTopic(id, "$name"), `Micro:bit Terminal ${id.slice(-8)}`, retained);
    this.publish(terminalTopic(id, "$state"), "ready", retained);
    this.publish(terminalTopic(id, "$nodes"), "config,controls", retained);
    this.publish(terminalTopic(id, "config/$name"), "Terminal Configuration", retained);
    this.publish(terminalTopic(id, "config/$properties"), "team,sousChef", retained);
    this.publish(terminalTopic(id, "controls/$name"), "Motion Controls", retained);
    this.publish(terminalTopic(id, "controls/$properties"), "gesture", retained);
    this.publishConfig(binding);
  }

  private publishConfig(binding: TerminalBinding): void {
    const sousChef = binding.sousChef === null ? "none" : `sous-chef-${binding.sousChef}`;
    this.publish(terminalTopic(binding.terminalId, "config/team"), this.teamId, { retain: true });
    this.publish(terminalTopic(binding.terminalId, "config/sousChef"), sousChef, { retain: true });
  }

  private publish(topic: string, payload: string, options: { retain?: boolean } = {}): void {
    this.mqtt.publish(topic, payload, { qos: 1, retain: options.retain ?? false });
  }

  private async send(line: string): Promise<void> {
    if (!this.writer) throw new Error("Gateway is not connected");
    await this.writer.write(new TextEncoder().encode(`${line}\n`));
  }

  private emitError(err: unknown): void {
    this.emit("error", { message: err instanceof Error ? err.message : String(err) });
  }

  private emit<K extends keyof GatewayEvents>(type: K, event: GatewayEvents[K]): void {
    for (const listener of this.listeners.get(type) ?? []) {
      try {
        (listener as Listener<GatewayEvents[K]>)(event);
      } catch (err) {
        console.error(err);
      }
    }
  }
}
