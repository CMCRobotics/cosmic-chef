/**
 * Sous-Chef Integration Module
 *
 * Orchestrates the full pipeline:
 * MQTT → RxJS Adapter → XState Machine → A-Frame Components
 *
 * Call initializeSousChefIntegration() during game setup.
 */

import {
  initializeSousChefGestureSubject,
  publishSousChefGesture,
  connectSousChefGestures,
} from "../adapters/sousChefGestureAdapter";

const log = window.log?.getLogger("sous-chef-integration") || {
  debug: console.debug,
  info: console.info,
  warn: console.warn,
  error: console.error,
};

export interface SousChefIntegrationConfig {
  teamId: string;
  gameId: string;
  numSousChefs?: number;
  brokerUrl?: string;
}

/**
 * Initialize the full sous-chef integration pipeline.
 * Call this after the game machine is created and the MQTT connection is established.
 */
export function initializeSousChefIntegration(
  config: SousChefIntegrationConfig
): {
  cleanup: () => void;
  publishGesture: typeof publishSousChefGesture;
} {
  const numSousChefs = config.numSousChefs || 3;

  log.info("Initializing Sous-Chef Integration", {
    teamId: config.teamId,
    gameId: config.gameId,
    numSousChefs,
  });

  // Step 1: Initialize the RxJS subject that will receive MQTT updates
  initializeSousChefGestureSubject();

  // Step 2: Connect the gesture stream to the XState machine
  if (!window.gameActor) {
    log.error(
      "window.gameActor not found. Cannot connect sous-chef gestures to XState machine."
    );
    return { cleanup: () => {}, publishGesture };
  }

  const unsubscribeGestures = connectSousChefGestures(
    config.teamId,
    config.gameId,
    window.gameActor,
    numSousChefs
  );

  // Step 3: Set up MQTT listener (if in browser with MQTT client)
  setupMqttListener(config.teamId, config.gameId, numSousChefs);

  log.info("Sous-Chef Integration initialized successfully");

  return {
    cleanup: () => {
      log.info("Cleaning up Sous-Chef Integration");
      unsubscribeGestures();
    },
    publishGesture: publishSousChefGesture,
  };
}

/**
 * Sets up MQTT listener to forward updates to the gesture stream.
 * This bridges MQTT publishes to the RxJS adapter.
 */
function setupMqttListener(
  teamId: string,
  gameId: string,
  numSousChefs: number
): () => void {
  // Check if there's a global MQTT client
  const mqttClient = (window as any).mqttClient;

  if (!mqttClient) {
    log.warn(
      "MQTT client not found. Sous-chef gestures must be published via publishSousChefGesture()."
    );
    return () => {};
  }

  log.info("Setting up MQTT listener for sous-chef gestures");

  // Subscribe to specific sous-chef gesture topics (not using wildcards)
  const topics = [];
  for (let i = 1; i <= numSousChefs; i++) {
    topics.push(`cosmic-chef/team-${teamId}/game-${gameId}/sous-chef-${i}/gesture/current`);
  }

  topics.forEach((topic) => {
    mqttClient.subscribe(topic, (err: any) => {
      if (err) {
        log.error(`Failed to subscribe to ${topic}:`, err);
      } else {
        log.debug(`Subscribed to: ${topic}`);
      }
    });
  });

  log.info(`Subscribed to ${topics.length} gesture topic(s)`);

  // Listen for MQTT messages
  const handleMessage = (topic: string, message: Buffer) => {
    // Parse topic: cosmic-chef/team-{id}/game-{id}/sous-chef-{n}/gesture/current
    const match = topic.match(/sous-chef-(\d+)\/gesture\/current/);
    if (match) {
      const sousChef = parseInt(match[1], 10);
      const gesture = message.toString().toLowerCase();

      log.debug(`MQTT: Sous-Chef ${sousChef} → ${gesture}`);
      publishSousChefGesture(sousChef, gesture);
    }
  };

  mqttClient.on("message", handleMessage);

  // Return cleanup function
  return () => {
    topics.forEach((topic) => {
      mqttClient.unsubscribe(topic);
    });
    mqttClient.off("message", handleMessage);
    log.info("Cleaned up MQTT listener");
  };
}

/**
 * Export for direct use in browser console during testing.
 */
(window as any).publishSousChefGesture = publishSousChefGesture;
(window as any).initializeSousChefIntegration = initializeSousChefIntegration;

log.info("Sous-Chef Integration module loaded");
