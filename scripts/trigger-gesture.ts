#!/usr/bin/env node

/**
 * Sous-Chef Gesture Trigger
 *
 * Publishes a gesture for one sous-chef of one team, the same way a micro:bit
 * gateway does, then (unless --hold 0) publishes 'idle' to end it.
 *
 * Usage: node scripts/trigger-gesture.ts <team> <chef> <gesture> [--hold ms] [--game id]
 *
 *   team     blue | red | white
 *   chef     1 | 2 | 3 (sous-chef number)
 *   gesture  tenderize | slice | stir | idle
 *   --hold   milliseconds before publishing 'idle' (default 2000, 0 = leave the gesture on)
 *   --game   game id (default 'default')
 *
 * Environment:
 *   MQTT_BROKER  broker URL (default: ws://localhost:9001, the local dev broker)
 *   MQTT_USER    optional username
 *   MQTT_PASS    optional password
 *
 * Examples:
 *   node scripts/trigger-gesture.ts white 3 tenderize
 *   node scripts/trigger-gesture.ts red 1 slice --hold 0
 *
 * Runs under Node, not Bun: mqtt.js's ws transport uses the `ws` package,
 * which Bun does not support.
 */

import mqtt from "mqtt";

const TEAMS = ["blue", "red", "white"];
const GESTURES = ["tenderize", "slice", "stir", "idle"];

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const i = args.indexOf(name);
  if (i === -1) return fallback;
  const value = args[i + 1];
  args.splice(i, 2);
  return value;
};
const hold = Number(flag("--hold", "2000"));
const gameId = flag("--game", "default");
const [team, chef, gesture] = args;

if (!TEAMS.includes(team) || !["1", "2", "3"].includes(chef) || !GESTURES.includes(gesture)) {
  console.error("Usage: node scripts/trigger-gesture.ts <blue|red|white> <1|2|3> <tenderize|slice|stir|idle> [--hold ms] [--game id]");
  process.exit(1);
}

const MQTT_BROKER = process.env.MQTT_BROKER || "ws://localhost:9001";
// Same topic the micro:bit gateway publishes to (src/client/topics.ts sousChefGestureTopic)
const topic = `cosmic-chef/team-${team}/game-${gameId}/sous-chef-${chef}/gesture/current`;

const client = mqtt.connect(MQTT_BROKER, {
  username: process.env.MQTT_USER,
  password: process.env.MQTT_PASS,
});

const publish = (payload: string) =>
  new Promise<void>((resolve, reject) => {
    client.publish(topic, payload, { qos: 1 }, (err) => (err ? reject(err) : resolve()));
  });

client.on("connect", async () => {
  try {
    console.log(`🔌 Broker: ${MQTT_BROKER}`);
    console.log(`▶️  ${topic} = ${gesture}`);
    await publish(gesture);
    if (hold > 0 && gesture !== "idle") {
      await new Promise((resolve) => setTimeout(resolve, hold));
      console.log(`⏹  ${topic} = idle`);
      await publish("idle");
    }
  } catch (err) {
    console.error("❌ Publish failed:", (err as Error).message);
    process.exitCode = 1;
  } finally {
    client.end();
  }
});

client.on("error", (err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
