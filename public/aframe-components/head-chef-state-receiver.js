/**
 * head-chef-state-receiver.js
 * Receives game state from MQTT broadcasts (published by the main index.html).
 * This component makes head-chef.html a pure display view that only reflects
 * the state computed by index.html, never registering or publishing progress.
 *
 * Usage: <a-scene head-chef-state-receiver="teamId: team-1; gameId: default">
 */

AFRAME.registerComponent('head-chef-state-receiver', {
    schema: {
        brokerUrl: { type: 'string', default: 'ws://localhost:9001' },
        teamId: { type: 'string', default: 'team-1' },
        gameId: { type: 'string', default: 'default' }
    },

    init: function () {
        this.log = window.log.getLogger('head-chef-state-receiver');
        this.log.debug('Initializing head-chef-state-receiver');

        this.currentState = null;
        this.currentContext = null;

        this.connect();
    },

    connect: function () {
        if (!window.mqtt) {
            this.log.warn('mqtt.js not loaded — head-chef state display will not work');
            return;
        }

        const { teamId, gameId, brokerUrl } = this.data;
        const stateTopic = window.CosmicChef.gameStateTopic(teamId, gameId);

        this.log.info(`Connecting to MQTT broker at ${brokerUrl}...`);
        this.client = window.mqtt.connect(brokerUrl, {
            clientId: 'cosmic-chef-head-chef-' + Math.random().toString(36).slice(2),
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
            this.currentState = state;
            this.currentContext = context;

            // Emit event so head-chef components can listen to state changes
            this.el.emit('game-state-changed', {
                state,
                context
            });

            this.log.debug(`📊 Received state: ${state}`);
        } catch (e) {
            this.log.error('Failed to parse game state:', e.message);
        }
    },

    getSnapshot: function () {
        return {
            value: this.currentState,
            context: this.currentContext
        };
    },

    remove: function () {
        if (this.client) {
            this.client.end();
        }
        this.log.debug('Head Chef state receiver removed');
    }
});
