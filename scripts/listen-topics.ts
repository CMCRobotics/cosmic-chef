#!/usr/bin/env node

/**
 * MQTT Topic Listener
 *
 * Subscribes to a topic filter and prints every message as it arrives.
 * Retained messages are printed immediately on subscribe.
 *
 * Usage: node scripts/listen-topics.ts [topic-filter]
 *
 * Environment:
 *   MQTT_BROKER  broker URL (default: mqtt://localhost:1883)
 *   MQTT_USER    optional username
 *   MQTT_PASS    optional password
 *
 * Examples:
 *   node scripts/listen-topics.ts
 *   MQTT_BROKER="wss://cosmic-chef-mqtt.app.cern.ch" node scripts/listen-topics.ts 'cosmic-chef/team-blue/#'
 *
 * Runs under Node, not Bun: mqtt.js's wss:// transport uses the `ws` package,
 * which Bun does not support.
 */

import mqtt from "mqtt";

const MQTT_BROKER = process.env.MQTT_BROKER || "mqtt://localhost:1883";
const topicFilter = process.argv[2] || "cosmic-chef/#";

const client = mqtt.connect(MQTT_BROKER, {
  username: process.env.MQTT_USER,
  password: process.env.MQTT_PASS,
});

console.log(`🔌 Broker: ${MQTT_BROKER}`);
console.log(`👂 Topic filter: ${topicFilter}\n`);

client.on("connect", () => {
  console.log("✅ Connected\n");
  client.subscribe(topicFilter, { qos: 1 }, (err) => {
    if (err) {
      console.error("❌ Subscribe failed:", err.message);
      client.end();
      process.exit(1);
    }
  });
});

client.on("message", (topic, payload, packet) => {
  const time = new Date().toISOString();
  const retained = packet.retain ? " (retained)" : "";
  console.log(`[${time}] ${topic}${retained} = ${payload.toString()}`);
});

client.on("error", (err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});

client.on("close", () => {
  console.log("🔌 Connection closed");
});

process.on("SIGINT", () => {
  client.end(false, () => process.exit(0));
});
