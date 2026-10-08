/**
 * head-chef-mqtt-client.js
 * Provides MQTT publish-only connectivity for head-chef.html.
 * Allows tractor-beam and recipe-status-button to publish events
 * without running the full state machine.
 *
 * Usage: <a-scene head-chef-mqtt-client="teamId: team-1; gameId: default">
 */

AFRAME.registerComponent('head-chef-mqtt-client', {
    schema: {
        brokerUrl: { type: 'string', default: (window.COSMIC_CHEF_CONFIG && window.COSMIC_CHEF_CONFIG.MQTT_BROKER_URL) || 'ws://localhost:9001' },
        teamId: { type: 'string', default: 'team-1' },
        gameId: { type: 'string', default: 'default' }
    },

    init: function () {
        this.log = window.log.getLogger('head-chef-mqtt-client');
        this.log.debug('Initializing head-chef-mqtt-client');

        this.connect();
    },

    connect: function () {
        if (!window.mqtt) {
            this.log.warn('mqtt.js not loaded — publishing will not work');
            return;
        }

        const { brokerUrl, teamId, gameId } = this.data;

        this.log.info(`Connecting to MQTT broker at ${brokerUrl}...`);
        this.client = window.mqtt.connect(brokerUrl, {
            clientId: 'cosmic-chef-head-chef-publisher-' + Math.random().toString(36).slice(2),
            reconnectPeriod: 1000
        });

        this.client.on('connect', () => {
            this.log.info('✓ Connected to MQTT broker (publish-only)');
        });
        this.client.on('error', (err) => this.log.warn('MQTT connection error:', err.message));

        // Expose client for tractor-beam and recipe-status-button to use
        // They look for scene.components['mqtt-bridge'].client
        // We pretend to be mqtt-bridge's client interface
        this.data = { ...this.data, teamId, gameId };
    },

    remove: function () {
        if (this.client) {
            this.client.end();
        }
        this.log.debug('Head Chef MQTT client removed');
    }
});
