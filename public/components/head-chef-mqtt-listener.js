/**
 * head-chef-mqtt-listener.js
 * Subscribes to MQTT head-chef submit-state topic and converts messages to game events.
 *
 * Listens to: cosmic-chef/team-{teamId}/game-{gameId}/head-chef/animation/submit-state
 * Converts: "idle" → CANCEL_ORDER, "submitting" → SUBMIT_RECIPE
 */

AFRAME.registerComponent('head-chef-mqtt-listener', {
  schema: {
    teamId: { type: 'string', default: 'team-1' },
    gameId: { type: 'string', default: 'default' }
  },

  init: function () {
    this.log = window.log?.getLogger('head-chef-mqtt-listener') || console;
    this.log.setLevel?.('debug');

    this.log.debug('Initializing head-chef MQTT listener');

    const scene = this.el.sceneEl;
    const self = this;

    // Wait for MQTT client to be available
    const waitForMqtt = setInterval(() => {
      if (window.mqttClient) {
        clearInterval(waitForMqtt);
        self.setupSubscription();
      }
    }, 100);

    // Timeout after 10 seconds
    setTimeout(() => {
      clearInterval(waitForMqtt);
      if (!window.mqttClient) {
        this.log.warn('MQTT client not available - head-chef MQTT listener will not work');
      }
    }, 10000);
  },

  setupSubscription: function () {
    const { teamId, gameId } = this.data;
    const topic = `cosmic-chef/team-${teamId}/game-${gameId}/head-chef/animation/submit-state`;

    const client = window.mqttClient;
    if (!client) return;

    client.subscribe(topic, (err) => {
      if (err) {
        this.log.error(`Failed to subscribe to ${topic}:`, err);
      } else {
        this.log.info(`Subscribed to head-chef actions: ${topic}`);
      }
    });

    // Listen for messages on this topic
    client.on('message', (msgTopic, message) => {
      if (msgTopic === topic) {
        this.onHeadChefAction(message.toString());
      }
    });
  },

  onHeadChefAction: function (state) {
    const self = this;

    // Convert MQTT message to action
    let action = null;
    if (state === 'idle') {
      action = 'cancel';
    } else if (state === 'submitting') {
      action = 'submit';
    } else {
      this.log.warn(`Unknown head-chef state: ${state}`);
      return;
    }

    this.log.debug(`Head-chef action: ${action}`);

    // Try multiple ways to publish the action

    // Method 1: Use direct window function (preferred)
    if (typeof window.publishHeadChefAction === 'function') {
      window.publishHeadChefAction(action);
      this.log.info(`Published head-chef action via window: ${action}`);
      return;
    }

    // Method 2: Use module function
    if (window.headChefAdapterModule?.publishHeadChefAction) {
      window.headChefAdapterModule.publishHeadChefAction(action);
      this.log.info(`Published head-chef action via module: ${action}`);
      return;
    }

    // Method 3: Initialize subject if needed and publish directly
    if (!window.headChefActionSubject && typeof window.initializeHeadChefActionSubject === 'function') {
      window.initializeHeadChefActionSubject();
      this.log.debug('Initialized headChefActionSubject');
    }

    if (window.headChefActionSubject) {
      window.headChefActionSubject.next({ action, timestamp: Date.now() });
      this.log.info(`Published head-chef action directly: ${action}`);
      return;
    }

    // All methods failed
    this.log.error('Could not publish head-chef action - adapter not available');
    this.log.error('Available:', {
      hasPublishHeadChefAction: typeof window.publishHeadChefAction === 'function',
      hasModule: !!window.headChefAdapterModule,
      hasSubject: !!window.headChefActionSubject,
      hasInitialize: typeof window.initializeHeadChefActionSubject === 'function'
    });
  }
});
