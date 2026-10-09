#!/usr/bin/env node

/**
 * Team & Game Registration Script
 *
 * Registers a new game session with a team, head chef, and sous-chefs.
 * Usage: node scripts/register-team.ts <team-id> <num-sous-chefs>
 *
 * Example: node scripts/register-team.ts blue 3
 *
 * Runs under Node, not Bun: mqtt.js's wss:// transport uses the `ws` package,
 * which Bun does not support ("Not supported yet in Bun").
 */

import mqtt from "mqtt";

const MQTT_BROKER = process.env.MQTT_BROKER || "mqtt://localhost:1883";
const RETAIN = true;
const QOS = 1;

async function registerTeam() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error(
      "Usage: bun scripts/register-team.ts <team-id> <num-sous-chefs>"
    );
    console.error("Example: bun scripts/register-team.ts blue 3");
    process.exit(1);
  }

  const teamId = args[0];
  const numSousChefs = parseInt(args[1], 10);

  if (isNaN(numSousChefs) || numSousChefs < 1 || numSousChefs > 3) {
    console.error("num-sous-chefs must be 1-3");
    process.exit(1);
  }

  console.log(`🎮 Registering team: ${teamId}`);
  console.log(`👨‍🍳 Sous-chefs: ${numSousChefs}`);
  console.log(`🔌 MQTT Broker: ${MQTT_BROKER}\n`);

  const client = mqtt.connect(MQTT_BROKER);

  return new Promise<void>((resolve, reject) => {
    client.on("connect", async () => {
      try {
        const gameId = "default";  // Use fixed gameId so all teams share the same game session
        const headChefId = `player-head-${teamId}`;
        const sousChefIds = Array.from({ length: numSousChefs }, (_, i) =>
          `player-sous-${teamId}-${i + 1}`
        );

        console.log("📋 Creating game session...");
        const sessionTopic = `cosmic-chef/game-${gameId}`;

        // Game session
        await publish(
          client,
          `${sessionTopic}/session/id`,
          gameId,
          "Game ID"
        );
        await publish(
          client,
          `${sessionTopic}/session/status`,
          "initializing",
          "Session status"
        );
        await publish(
          client,
          `${sessionTopic}/round/number`,
          "0",
          "Current round"
        );
        await publish(
          client,
          `${sessionTopic}/timer/remaining`,
          "300",
          "Session timer (5 min)"
        );
        await publish(
          client,
          `${sessionTopic}/arena/player-count`,
          `${numSousChefs + 1}`,
          "Total players (head + sous)"
        );
        await publish(
          client,
          `${sessionTopic}/arena/team-count`,
          "1",
          "Teams in session"
        );

        console.log("👨‍🍳 Registering head chef...");
        const teamTopic = `cosmic-chef/team-${teamId}/game-${gameId}`;

        // Head chef role
        await publish(
          client,
          `${teamTopic}/head-chef/player-id`,
          headChefId,
          "Head chef player ID"
        );
        await publish(
          client,
          `${teamTopic}/head-chef/gesture/current`,
          "idle",
          "Head chef gesture"
        );
        await publish(
          client,
          `${teamTopic}/head-chef/animation/capture-state`,
          "idle",
          "Capture animation"
        );
        await publish(
          client,
          `${teamTopic}/head-chef/animation/submit-state`,
          "idle",
          "Head chef submit/cancel state"
        );

        // Head chef player profile
        await publish(
          client,
          `cosmic-chef/player-${headChefId}/profile/name`,
          `Head Chef (${teamId})`,
          "Head chef name"
        );
        await publish(
          client,
          `cosmic-chef/player-${headChefId}/profile/avatar-color`,
          "#FF6B6B",
          "Head chef color"
        );

        // Team roster
        await publish(
          client,
          `${teamTopic}/identity/name`,
          `Team ${teamId}`,
          "Team name"
        );

        // Team color (used for galley ring color)
        const teamColors: Record<string, string> = {
          'blue': '#0066ff',
          'white': '#ffffff',
          'red': '#ff0033'
        };
        const teamColor = teamColors[teamId] || '#cccccc';
        await publish(
          client,
          `${teamTopic}/identity/color`,
          teamColor,
          "Team color"
        );

        await publish(
          client,
          `${teamTopic}/identity/player-count`,
          `${numSousChefs + 1}`,
          "Player count"
        );

        // Register sous-chefs
        for (let i = 1; i <= numSousChefs; i++) {
          const sousChefId = sousChefIds[i - 1];
          console.log(`🔪 Registering sous-chef ${i}...`);

          // Sous-chef role
          await publish(
            client,
            `${teamTopic}/sous-chef-${i}/player-id`,
            sousChefId,
            `Sous-chef ${i} player ID`
          );
          await publish(
            client,
            `${teamTopic}/sous-chef-${i}/identity/station-id`,
            `${i}`,
            `Sous-chef ${i} station`
          );
          await publish(
            client,
            `${teamTopic}/sous-chef-${i}/gesture/current`,
            "idle",
            `Sous-chef ${i} gesture`
          );
          await publish(
            client,
            `${teamTopic}/sous-chef-${i}/gesture/confidence`,
            "0",
            `Sous-chef ${i} confidence`
          );

          // Sous-chef player profile
          const colors = ["#8bcd4e", "#45B7D1", "#FFA07A"];
          await publish(
            client,
            `cosmic-chef/player-${sousChefId}/profile/name`,
            `Sous-Chef ${i} (${teamId})`,
            `Sous-chef ${i} name`
          );
          await publish(
            client,
            `cosmic-chef/player-${sousChefId}/profile/avatar-color`,
            colors[i - 1],
            `Sous-chef ${i} color`
          );
          await publish(
            client,
            `cosmic-chef/player-${sousChefId}/participation/total-games`,
            "1",
            `Sous-chef ${i} total games`
          );
        }

        // Team stats
        await publish(
          client,
          `${teamTopic}/score/current`,
          "0",
          "Team score"
        );
        await publish(
          client,
          `${teamTopic}/score/round`,
          "0",
          "Round score"
        );
        await publish(
          client,
          `${teamTopic}/performance/accuracy`,
          "0",
          "Team accuracy"
        );

        console.log("\n✅ Team registered successfully!\n");
        console.log(`📍 Game ID: ${gameId}`);
        console.log(`👥 Team ID: ${teamId}`);
        console.log(`👨‍🍳 Head Chef: ${headChefId}`);
        console.log(`🔪 Sous-Chefs: ${sousChefIds.join(", ")}\n`);

        console.log("🎮 Ready for testing!");
        console.log(`Start the keyboard interface and test gestures.\n`);

        setTimeout(() => {
          client.end();
          resolve();
        }, 500);
      } catch (err) {
        reject(err);
      }
    });

    client.on("error", reject);
  });
}

async function publish(
  client: mqtt.MqttClient,
  topic: string,
  message: string,
  description: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    client.publish(topic, message, { retain: RETAIN, qos: QOS }, (err) => {
      if (err) {
        reject(err);
      } else {
        console.log(`  ✓ ${description}: ${topic} = ${message}`);
        resolve();
      }
    });
  });
}

registerTeam().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
