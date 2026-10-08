/**
 * head-chef-mqtt-client.js
 * The single MQTT connection for head-chef.html, scoped to the head chef's team.
 *
 * - Subscribes to the team's state broadcast (published by index.html's mqtt-bridge) and
 *   re-emits it as 'game-state-changed' on the scene, so the head-chef components only
 *   ever see their own team's state.
 * - Exposes `client` and `data.teamId` so tractor-beam and recipe-status-button can publish
 *   capture / submit / cancel events to the same team.
 *
 * The team is resolved by the inline script in head-chef.html (window.CURRENT_TEAM).
 *
 * Usage: <a-scene head-chef-mqtt-client="gameId: default">
 */

AFRAME.registerComponent('head-chef-mqtt-client', {
    schema: {
        brokerUrl: { type: 'string', default: (window.COSMIC_CHEF_CONFIG && window.COSMIC_CHEF_CONFIG.MQTT_BROKER_URL) || 'ws://localhost:9001' },
        teamId: { type: 'string', default: '' }, // defaults to window.CURRENT_TEAM
        gameId: { type: 'string', default: 'default' }
    },

    init: function () {
        this.log = window.log.getLogger('head-chef-mqtt-client');
        this.log.debug('Initializing head-chef-mqtt-client');

        this.data.teamId = this.data.teamId || window.CURRENT_TEAM || 'blue';
        this.log.info(`Head chef plays for team ${this.data.teamId}`);

        this.connect();
    },

    connect: function () {
        if (!window.mqtt) {
            this.log.warn('mqtt.js not loaded — head-chef MQTT will not work');
            return;
        }

        const { brokerUrl, teamId, gameId } = this.data;
        const stateTopic = window.CosmicChef.gameStateTopic(teamId, gameId);

        this.log.info(`Connecting to MQTT broker at ${brokerUrl}...`);
        this.client = window.mqtt.connect(brokerUrl, {
            clientId: 'cosmic-chef-head-chef-' + teamId + '-' + Math.random().toString(36).slice(2),
            reconnectPeriod: 1000
        });

        this.client.on('connect', () => {
            this.log.info('✓ Connected to MQTT broker');
            this.client.subscribe(stateTopic, (err) => {
                if (err) {
                    this.log.error('Subscription failed:', err);
                } else {
                    this.log.info(`Subscribed to ${stateTopic}`);
                }
            });
        });
        this.client.on('error', (err) => this.log.warn('MQTT connection error:', err.message));
        this.client.on('message', (topic, message) => this.onMessage(topic, message.toString()));
    },

    onMessage: function (topic, payload) {
        const { teamId, gameId } = this.data;
        const parsed = window.CosmicChef.parseTopic(topic, teamId, gameId);
        if (!parsed || parsed.kind !== 'game-state') return;

        try {
            const { state, context } = JSON.parse(payload);
            this.el.emit('game-state-changed', { state, context });
            this.log.debug(`📊 Received state: ${state}`);
        } catch (e) {
            this.log.error('Failed to parse game state:', e.message);
        }
    },

    remove: function () {
        if (this.client) {
            this.client.end();
        }
        this.log.debug('Head Chef MQTT client removed');
    }
});
