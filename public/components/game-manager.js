/**
 * Game Manager Component
 *
 * Initializes the XState game machine and connects the sous-chef gesture adapter.
 * This bridges MQTT gestures → RxJS → XState → A-Frame components.
 *
 * Usage: <a-entity game-manager></a-entity>
 */

AFRAME.registerComponent('game-manager', {
  schema: {
    teamId: { default: 'team-1' },
    numSousChefs: { type: 'number', default: 3 },
  },

  init: function () {
    const self = this;
    const log = window.log?.getLogger('game-manager') || console;

    log.info('🎮 Initializing Game Manager');

    // Wait for scene to load so preparation-manager is initialized first
    const scene = this.el.sceneEl;
    const waitForPrepManager = setInterval(() => {
      const prepMgr = scene.components['preparation-manager'];
      if (prepMgr && prepMgr.gameActor) {
        clearInterval(waitForPrepManager);
        this.initializeWithActor(prepMgr.gameActor, log);
      }
    }, 100);

    // Timeout after 15 seconds
    setTimeout(() => {
      if (waitForPrepManager) {
        clearInterval(waitForPrepManager);
        log.warn(
          '⚠ preparation-manager not found. Game-manager will create its own actor.'
        );
        this.createOwnActor(log);
      }
    }, 15000);
  },

  initializeWithActor: function (gameActor, log) {
    const self = this;
    window.gameActor = gameActor;
    log.info('✓ Using preparation-manager\'s game actor');

    // Initialize MQTT client
    this.setupMqttClient(log, self.data.teamId);

    // Subscribe to recipe updates from MQTT
    this.subscribeToRecipes(log, self.data.teamId);

    // Initialize sous-chef gesture adapter
    if (!window.initializeSousChefIntegration) {
      log.warn(
        '⚠ initializeSousChefIntegration not found. Sous-chef MQTT will not work.'
      );
      log.warn('Add sousChefIntegration.js to index.html');
    } else {
      // Use fixed session ID for testing consistency
      const gameId = 'default';
      const { cleanup } = window.initializeSousChefIntegration({
        teamId: self.data.teamId,
        gameId: gameId,
        numSousChefs: self.data.numSousChefs,
      });

      window.sousChefCleanup = cleanup;
      window.currentGameId = gameId;

      log.info('✓ Sous-chef integration initialized', {
        gameId,
        teamId: self.data.teamId,
        numSousChefs: self.data.numSousChefs,
      });
    }

    // Initialize head-chef action adapter
    if (!window.headChefAdapterModule) {
      log.warn(
        '⚠ headChefAdapterModule not found. Head-chef cancel/submit will not work.'
      );
      log.warn('Add headChefAdapter.js to index.html');
    } else {
      const gameId = window.currentGameId || 'default';
      window.headChefAdapterModule.initializeHeadChefActionSubject();
      const cleanup = window.headChefAdapterModule.connectHeadChefActions(
        self.data.teamId,
        gameId,
        gameActor
      );
      window.headChefCleanup = cleanup;
      log.info('✓ Head-chef adapter initialized', {
        gameId,
        teamId: self.data.teamId,
      });
    }

    // Subscribe to game state changes for logging and recipe publishing
    gameActor.subscribe((state) => {
      if (state.value !== self.lastState) {
        log.debug(`State: ${state.value}`, {
          score: state.context.score,
          completed: state.context.completedCount,
        });
        self.lastState = state.value;

        // Publish recipe to MQTT when captured
        if (state.context.currentOrder && window.mqttClient) {
          const topic = `cosmic-chef/team-${self.data.teamId}/game-${window.currentGameId}/round/recipe`;
          const recipeData = {
            name: state.context.currentOrder.name,
            composition: state.context.currentOrder.composition,
            charge: state.context.currentOrder.charge,
            ingredientSequences: state.context.currentOrder.ingredientSequences,
            finalStep: state.context.currentOrder.finalStep
          };
          window.mqttClient.publish(topic, JSON.stringify(recipeData), { qos: 1 });
          log.info(`Published recipe to ${topic}:`, recipeData.name);
        }
      }
    });

    log.info('✓ Game Manager ready');
  },

  subscribeToRecipes: function (log, teamId) {
    if (!window.mqttClient) {
      log.debug('MQTT client not ready for recipe subscription');
      return;
    }

    const recipeTopic = `cosmic-chef/team-${teamId}/game-default/round/recipe`;

    window.mqttClient.subscribe(recipeTopic, (err) => {
      if (err) {
        log.warn(`Failed to subscribe to recipes: ${err}`);
      } else {
        log.info(`Subscribed to recipes: ${recipeTopic}`);
      }
    });

    window.mqttClient.on('message', (topic, message) => {
      if (topic === recipeTopic) {
        try {
          const recipe = JSON.parse(message.toString());
          log.info(`Recipe received from MQTT: ${recipe.name}`);

          // Track globally for replay if actor is recreated
          window.lastCapturedRecipe = recipe;

          // Send to game actor
          if (window.gameActor) {
            window.gameActor.send({ type: 'CAPTURE_RECIPE', recipe });
            log.info(`Captured recipe: ${recipe.name}`);
          }
        } catch (err) {
          log.error(`Failed to parse recipe message: ${err.message}`);
        }
      }
    });
  },

  createOwnActor: function (log) {
    const self = this;
    const { createActor } = window.XState;
    const gameActor = createActor(window.preparationMachine).start();
    window.gameActor = gameActor;
    log.info('✓ Created standalone game actor');

    // If a recipe was previously captured, replay it to the new actor
    if (window.lastCapturedRecipe) {
      log.info('Replaying previously captured recipe:', window.lastCapturedRecipe.name);
      gameActor.send({ type: 'CAPTURE_RECIPE', recipe: window.lastCapturedRecipe });
    }

    // Initialize MQTT client
    this.setupMqttClient(log, self.data.teamId);

    // Subscribe to recipes
    this.subscribeToRecipes(log, self.data.teamId);

    // Initialize sous-chef integration
    if (window.initializeSousChefIntegration) {
      const gameId = 'session-' + Date.now();
      const { cleanup } = window.initializeSousChefIntegration({
        teamId: self.data.teamId,
        gameId: gameId,
        numSousChefs: self.data.numSousChefs,
      });
      window.sousChefCleanup = cleanup;
      window.currentGameId = gameId;
      log.info('✓ Sous-chef integration initialized');
    }

    // Initialize head-chef action adapter
    if (window.headChefAdapterModule) {
      const gameId = window.currentGameId || 'session-' + Date.now();
      window.headChefAdapterModule.initializeHeadChefActionSubject();
      const cleanup = window.headChefAdapterModule.connectHeadChefActions(
        self.data.teamId,
        gameId,
        gameActor
      );
      window.headChefCleanup = cleanup;
      log.info('✓ Head-chef adapter initialized');
    }
  },

  setupMqttClient: function (log, teamId) {
    if (window.mqttClient) {
      log.debug('MQTT client already initialized');
      return;
    }

    if (!window.mqtt) {
      log.warn('mqtt.js library not found. MQTT gestures will use publishSousChefGesture() only.');
      return;
    }

    const brokerUrl = 'ws://localhost:9001';
    log.info(`Connecting to MQTT broker at ${brokerUrl}...`);

    try {
      window.mqttClient = window.mqtt.connect(brokerUrl, {
        clientId: 'cosmic-chef-' + Math.random().toString(36).slice(2),
        reconnectPeriod: 1000,
      });

      window.mqttClient.on('connect', () => {
        log.info('✓ Connected to MQTT broker');
      });

      window.mqttClient.on('error', (err) => {
        log.warn('MQTT connection error:', err.message);
      });

      window.mqttClient.on('disconnect', () => {
        log.debug('Disconnected from MQTT broker');
      });
    } catch (err) {
      log.warn('Failed to initialize MQTT client:', err.message);
    }
  },


  remove: function () {
    const log = window.log?.getLogger('game-manager') || console;
    log.info('Cleaning up Game Manager');

    if (window.sousChefCleanup) {
      window.sousChefCleanup();
    }

    if (window.headChefCleanup) {
      window.headChefCleanup();
    }
  },
});

// Expose test helpers to window
window.getGameState = function () {
  if (!window.gameActor) {
    console.error('Game actor not initialized');
    return null;
  }
  return window.gameActor.getSnapshot();
};

window.sendGameEvent = function (eventType, data = {}) {
  if (!window.gameActor) {
    console.error('Game actor not initialized');
    return;
  }
  window.gameActor.send({ type: eventType, ...data });
  const logger = window.log?.getLogger('game-manager') || console;
  logger.info(`Sent event: ${eventType}`, data);
};

window.testSousChefGesture = function (sousChefId, gesture, duration = 1000) {
  const logger = window.log?.getLogger('game-manager') || console;

  if (!window.publishSousChefGesture) {
    logger.error('publishSousChefGesture not available');
    return;
  }

  logger.info(`Testing gesture: Sous-Chef ${sousChefId} ${gesture} for ${duration}ms`);

  // Start gesture
  window.publishSousChefGesture(sousChefId, gesture);

  // Stop gesture after duration
  setTimeout(() => {
    window.publishSousChefGesture(sousChefId, 'idle');
    logger.info(`Gesture ended`);
  }, duration);
};

// Log initialization info
if (window.log && window.log.getLogger) {
  const logger = window.log.getLogger('game-manager');
  logger.info('Game Manager component registered');
  logger.info('Test helpers available:');
  logger.info('  getGameState() — view current game state');
  logger.info('  sendGameEvent(type, data) — send XState event');
  logger.info('  testSousChefGesture(id, gesture, ms) — test a gesture');
}
