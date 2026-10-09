import { describe, test, expect } from "bun:test";
import {
  GATEWAY_BAUD_RATE,
  MicrobitGateway,
  RADIO_GROUPS,
  TerminalRegistry,
  microbitStorageKey,
  parseGatewayLine,
  parseGestureMessage,
  radioGroupFor,
  terminalIdFromSerial,
  type GatewayMqttClient,
  type SerialPortLike,
  type TeamStorage,
} from "../src/client/microbit-gateway";

function memoryStorage(): TeamStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
}

const throwingStorage: TeamStorage = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
};

/** Fake serial port: push gateway lines in, read what the browser wrote. */
function fakePort() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const readable = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  const written: string[] = [];
  const writable = new WritableStream<Uint8Array>({
    write(chunk) {
      written.push(new TextDecoder().decode(chunk));
    },
  });
  const port: SerialPortLike & { opened: number[]; closed: boolean } = {
    opened: [],
    closed: false,
    async open(options) {
      this.opened.push(options.baudRate);
    },
    // Like Chrome's Web Serial: close() is refused while a stream is still locked.
    async close() {
      if (readable.locked || writable.locked) {
        throw new DOMException("Cannot close a locked port", "InvalidStateError");
      }
      this.closed = true;
    },
    readable,
    writable,
  };
  return {
    port,
    written,
    push: (text: string) => controller.enqueue(new TextEncoder().encode(text)),
  };
}

function fakeMqtt() {
  const published: { topic: string; payload: string; retain: boolean }[] = [];
  const client: GatewayMqttClient = {
    publish(topic, payload, options) {
      published.push({ topic, payload, retain: options?.retain ?? false });
    },
  };
  return { client, published };
}

const wait = () => new Promise((resolve) => setTimeout(resolve, 20));

// Terminal serial numbers used below.
const TERMINAL_A = 0x02b1cf45;
const TERMINAL_B = 0x11223344;
const TERMINAL_C = 0x55667788;
const TERMINAL_D = 0x99aabbcc;

describe("radio protocol", () => {
  test("each team uses its own radio group", () => {
    expect(RADIO_GROUPS).toEqual({ blue: 31, white: 32, red: 33 });
    expect(radioGroupFor("red")).toBe(33);
  });

  test("parses gateway lines", () => {
    expect(parseGatewayLine("READY,33\r")).toEqual({ type: "ready", group: 33 });
    expect(parseGatewayLine("RX,40468293,GEST,TEND,1")).toEqual({
      type: "rx",
      serial: 40468293,
      payload: "GEST,TEND,1",
    });
    expect(parseGatewayLine("RX,-5,GEST,STIR,0")?.type).toBe("rx");
    expect(parseGatewayLine("hello")).toBeNull();
  });

  test("parses gesture messages", () => {
    expect(parseGestureMessage("GEST,TEND,1")).toEqual({ gesture: "tenderize", active: true });
    expect(parseGestureMessage("GEST,SLIC,0")).toEqual({ gesture: "slice", active: false });
    expect(parseGestureMessage("GEST,STIR,1")).toEqual({ gesture: "stir", active: true });
    expect(parseGestureMessage("GEST,REST,1")).toEqual({ gesture: "idle", active: false });
    expect(parseGestureMessage("GEST,REST,0")).toEqual({ gesture: "idle", active: false });
    expect(parseGestureMessage("GEST,DICE,1")).toBeNull();
    expect(parseGestureMessage("GEST,TEND,2")).toBeNull();
    expect(parseGestureMessage("gest,tend,1")).toBeNull();
  });

  test("derives the Homie terminal id from the serial number", () => {
    expect(terminalIdFromSerial(0x02b1cf45)).toBe("terminal-02b1cf45");
    expect(terminalIdFromSerial(-1)).toBe("terminal-ffffffff");
  });
});

describe("TerminalRegistry", () => {
  test("binds new terminals to the lowest free slot, then leaves the rest unassigned", () => {
    const registry = new TerminalRegistry("blue", memoryStorage());
    expect(registry.observe("terminal-a").sousChef).toBe(1);
    expect(registry.observe("terminal-b").sousChef).toBe(2);
    expect(registry.observe("terminal-c").sousChef).toBe(3);
    expect(registry.observe("terminal-d").sousChef).toBeNull();
    expect(registry.observe("terminal-a").sousChef).toBe(1);
  });

  test("stores bindings per team and restores them", () => {
    const storage = memoryStorage();
    new TerminalRegistry("white", storage).observe("terminal-a");
    expect(storage.data.get(microbitStorageKey("white"))).toBe('{"terminal-a":1}');

    const restored = new TerminalRegistry("white", storage);
    expect(restored.binding("terminal-a")).toEqual({ terminalId: "terminal-a", sousChef: 1 });
    expect(new TerminalRegistry("red", storage).has("terminal-a")).toBe(false);
  });

  test("setSlot moves a terminal and displaces the previous holder", () => {
    const registry = new TerminalRegistry("blue", null);
    registry.observe("terminal-a"); // 1
    registry.observe("terminal-b"); // 2
    const changed = registry.setSlot("terminal-b", 1);
    expect(changed).toEqual([
      { terminalId: "terminal-a", sousChef: null },
      { terminalId: "terminal-b", sousChef: 1 },
    ]);
    expect(registry.list()).toEqual([
      { terminalId: "terminal-a", sousChef: null },
      { terminalId: "terminal-b", sousChef: 1 },
    ]);
  });

  test("forget frees the slot for the next terminal", () => {
    const registry = new TerminalRegistry("blue", null);
    registry.observe("terminal-a"); // 1
    registry.forget("terminal-a");
    expect(registry.has("terminal-a")).toBe(false);
    expect(registry.observe("terminal-b").sousChef).toBe(1);
  });

  test("keeps working when storage throws", () => {
    const registry = new TerminalRegistry("blue", throwingStorage);
    expect(registry.observe("terminal-a").sousChef).toBe(1);
    expect(new TerminalRegistry("blue", throwingStorage).list()).toEqual([]);
  });

  test("ignores corrupt stored data", () => {
    const storage = memoryStorage();
    storage.data.set(microbitStorageKey("blue"), "not json");
    expect(new TerminalRegistry("blue", storage).list()).toEqual([]);
    // "b" repeats slot 1 and "c" is not a slot: both entries are dropped, and b/c rebind on their next radio message.
    storage.data.set(microbitStorageKey("blue"), '{"a":1,"b":1,"c":7}');
    expect(new TerminalRegistry("blue", storage).list()).toEqual([{ terminalId: "a", sousChef: 1 }]);
  });
});

describe("MicrobitGateway", () => {
  function setup(storage: TeamStorage | null = memoryStorage()) {
    const serialPort = fakePort();
    const mqtt = fakeMqtt();
    const gateway = new MicrobitGateway({
      teamId: "red",
      gameId: "default",
      mqtt: mqtt.client,
      storage,
      serial: { requestPort: async () => serialPort.port },
    });
    return { gateway, serialPort, ...mqtt };
  }

  const gestureTopic = (slot: number) => `cosmic-chef/team-red/game-default/sous-chef-${slot}/gesture/current`;

  test("connects at 115200 baud and sets the team's radio group", async () => {
    const { gateway, serialPort } = setup();
    await gateway.connect();
    expect(serialPort.port.opened).toEqual([GATEWAY_BAUD_RATE]);
    expect(serialPort.written).toEqual(["GROUP,33\n"]);
    expect(gateway.connected).toBe(true);
    await gateway.disconnect();
    expect(gateway.connected).toBe(false);
    expect(serialPort.port.closed).toBe(true);
  });

  test("disconnect releases the port even after gateway traffic and reports close failures", async () => {
    const { gateway, serialPort } = setup();
    const errors: string[] = [];
    gateway.on("error", (e) => errors.push(e.message));

    await gateway.connect();
    serialPort.push("READY,33\n");
    serialPort.push(`RX,${TERMINAL_A},GEST,TEND,1\n`);
    await wait();
    await gateway.disconnect();

    expect(serialPort.port.closed).toBe(true);
    expect(errors).toEqual([]);
  });

  test("forwards gestures of a bound terminal to its sous-chef topic", async () => {
    const { gateway, serialPort, published } = setup();
    await gateway.connect();
    serialPort.push("READY,33\n");
    serialPort.push(`RX,${TERMINAL_A},GEST,TEND,1\n`);
    serialPort.push(`RX,${TERMINAL_A},GEST,TEND,0\n`);
    await wait();

    const sousChef = published.filter((p) => p.topic === gestureTopic(1));
    expect(sousChef.map((p) => p.payload)).toEqual(["tenderize", "idle"]);

    const homieGesture = published.filter((p) => p.topic === "homie/terminal-02b1cf45/controls/gesture");
    expect(homieGesture.map((p) => p.payload)).toEqual([expect.stringMatching(/^tenderize-\d{13}$/), "tenderize-0"]);
    await gateway.disconnect();
  });

  test("REST stops the bound sous-chef, even when no gesture was running", async () => {
    const { gateway, serialPort, published } = setup();
    await gateway.connect();
    serialPort.push(`RX,${TERMINAL_A},GEST,REST,1\n`);
    await wait();

    expect(published.filter((p) => p.topic === gestureTopic(1)).map((p) => p.payload)).toEqual(["idle"]);
    expect(published).toContainEqual({ topic: "homie/terminal-02b1cf45/controls/gesture", payload: "idle", retain: false });
    await gateway.disconnect();
  });

  test("REST ends a running gesture and the next start is published normally", async () => {
    const { gateway, serialPort, published } = setup();
    await gateway.connect();
    serialPort.push(`RX,${TERMINAL_A},GEST,SLIC,1\n`);
    serialPort.push(`RX,${TERMINAL_A},GEST,REST,0\n`);
    serialPort.push(`RX,${TERMINAL_A},GEST,SLIC,0\n`); // Late stop after REST: nothing to stop.
    serialPort.push(`RX,${TERMINAL_A},GEST,STIR,1\n`);
    await wait();

    expect(published.filter((p) => p.topic === gestureTopic(1)).map((p) => p.payload)).toEqual([
      "slice",
      "idle",
      "stir",
    ]);
    await gateway.disconnect();
  });

  test("publishes the Homie device and config for a new terminal", async () => {
    const { gateway, serialPort, published } = setup();
    await gateway.connect();
    serialPort.push(`RX,${TERMINAL_B},GEST,SLIC,0\n`);
    await wait();

    const config = Object.fromEntries(
      published.filter((p) => p.topic.startsWith("homie/terminal-11223344/config/")).map((p) => [p.topic, p])
    );
    expect(config["homie/terminal-11223344/config/team"]).toMatchObject({ payload: "red", retain: true });
    expect(config["homie/terminal-11223344/config/sousChef"]).toMatchObject({
      payload: "sous-chef-1",
      retain: true,
    });
    expect(published.find((p) => p.topic === "homie/terminal-11223344/$homie")?.payload).toBe("4.0.0");
    await gateway.disconnect();
  });

  test("unassigned terminals publish no game gestures", async () => {
    const { gateway, serialPort, published } = setup();
    await gateway.connect();
    serialPort.push(`RX,${TERMINAL_A},GEST,TEND,1\n`);
    serialPort.push(`RX,${TERMINAL_B},GEST,TEND,1\n`);
    serialPort.push(`RX,${TERMINAL_C},GEST,TEND,1\n`);
    serialPort.push(`RX,${TERMINAL_D},GEST,SLIC,1\n`);
    await wait();

    expect(published.some((p) => p.topic.includes("terminal-99aabbcc/controls/gesture"))).toBe(true);
    expect(published.some((p) => p.topic === "homie/terminal-99aabbcc/config/sousChef" && p.payload === "none")).toBe(
      true
    );
    const sousChefTopics = published.filter((p) => p.topic.includes("/sous-chef-")).map((p) => p.topic);
    expect(sousChefTopics.every((t) => [gestureTopic(1), gestureTopic(2), gestureTopic(3)].includes(t))).toBe(true);
    expect(sousChefTopics.filter((t) => t === gestureTopic(1)).length).toBe(1);
    await gateway.disconnect();
  });

  test("ignores malformed radio strings", async () => {
    const { gateway, serialPort, published } = setup();
    await gateway.connect();
    serialPort.push(`RX,${TERMINAL_A},GEST,DICE,1\n`);
    await wait();
    expect(published.some((p) => p.topic.includes("/sous-chef-"))).toBe(false);
    await gateway.disconnect();
  });

  test("resends GROUP when the gateway reports a different group", async () => {
    const { gateway, serialPort } = setup();
    await gateway.connect();
    serialPort.push("READY,31\n");
    await wait();
    expect(serialPort.written).toEqual(["GROUP,33\n", "GROUP,33\n"]);
    await gateway.disconnect();
  });

  test("reassigning a sending terminal stops its old slot and moves the gesture on the next message", async () => {
    const { gateway, serialPort, published } = setup();
    await gateway.connect();
    serialPort.push(`RX,${TERMINAL_A},GEST,STIR,1\n`);
    await wait();
    published.length = 0;

    gateway.setSousChef("terminal-02b1cf45", 2);
    expect(published.filter((p) => p.topic === gestureTopic(1)).map((p) => p.payload)).toEqual(["idle"]);
    expect(published.find((p) => p.topic === "homie/terminal-02b1cf45/config/sousChef")?.payload).toBe("sous-chef-2");

    serialPort.push(`RX,${TERMINAL_A},GEST,STIR,1\n`);
    serialPort.push(`RX,${TERMINAL_A},GEST,STIR,0\n`);
    await wait();
    expect(published.filter((p) => p.topic === gestureTopic(2)).map((p) => p.payload)).toEqual(["stir", "idle"]);
    await gateway.disconnect();
  });

  test("forget publishes none and the next radio message binds the terminal again", async () => {
    const { gateway, serialPort, published } = setup();
    await gateway.connect();
    serialPort.push(`RX,${TERMINAL_A},GEST,TEND,0\n`);
    await wait();
    published.length = 0;

    gateway.forget("terminal-02b1cf45");
    expect(published).toContainEqual({
      topic: "homie/terminal-02b1cf45/config/sousChef",
      payload: "none",
      retain: true,
    });
    expect(gateway.registry.has("terminal-02b1cf45")).toBe(false);

    serialPort.push(`RX,${TERMINAL_A},GEST,TEND,0\n`);
    await wait();
    expect(gateway.registry.binding("terminal-02b1cf45")?.sousChef).toBe(1);
    await gateway.disconnect();
  });

  test("emits events for terminals, gestures and connection state", async () => {
    const { gateway, serialPort } = setup();
    const seen: string[] = [];
    gateway.on("connection", (e) => seen.push(`connection:${e.connected}`));
    gateway.on("terminal", (e) => seen.push(`terminal:${e.terminalId}:${e.sousChef}`));
    gateway.on("gesture", (e) => seen.push(`gesture:${e.gesture}:${e.active}`));

    await gateway.connect();
    serialPort.push(`RX,${TERMINAL_A},GEST,SLIC,1\n`);
    await wait();
    await gateway.disconnect();

    expect(seen).toEqual([
      "connection:true",
      "terminal:terminal-02b1cf45:1",
      "gesture:slice:true",
      "connection:false",
    ]);
  });

  test("throws a clear error when Web Serial is missing", async () => {
    const gateway = new MicrobitGateway({
      teamId: "blue",
      gameId: "default",
      mqtt: fakeMqtt().client,
      storage: null,
      serial: null,
    });
    await expect(gateway.connect()).rejects.toThrow("Web Serial is not available");
  });
});
