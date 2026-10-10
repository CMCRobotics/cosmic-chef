/**
 * scoring-mqtt-client.js
 * The single MQTT connection for scoring.html, covering every team.
 *
 * - Subscribes to each team's state broadcast and keeps the team's score from its context.
 * - Subscribes to each team's retained colour (identity/color) for the screen's team lines.
 * - Emits 'scores-changed' on the scene with the full list, one entry per team.
 * - resetScores() publishes "reset" to each team's score/reset topic. Each team's galley
 *   (mqtt-bridge in index.html) turns it into RESET_SCORE.
 *
 * Usage: <a-scene scoring-mqtt-client="gameId: default">
 */

AFRAME.registerComponent('scoring-mqtt-client', {
    schema: {
        brokerUrl: { type: 'string', default: (window.COSMIC_CHEF_CONFIG && window.COSMIC_CHEF_CONFIG.MQTT_BROKER_URL) || 'ws://localhost:9001' },
        gameId: { type: 'string', default: 'default' }
    },

    init: function () {
        this.log = window.log.getLogger('scoring-mqtt-client');
        this.log.debug('Initializing scoring-mqtt-client');

        // Score is null until the team's first broadcast; colour is null until its retained message arrives
        this.teams = {};
        window.CosmicChef.TEAM_IDS.forEach((teamId) => {
            this.teams[teamId] = { score: null, color: null };
        });

        this.connect();
    },

    connect: function () {
        if (!window.mqtt) {
            this.log.warn('mqtt.js not loaded — scores will not update');
            return;
        }

        const { brokerUrl, gameId } = this.data;
        const { TEAM_IDS, gameStateTopic, teamColorTopic } = window.CosmicChef;
        const topics = TEAM_IDS.flatMap((teamId) => [gameStateTopic(teamId, gameId), teamColorTopic(teamId, gameId)]);

        this.log.info(`Connecting to MQTT broker at ${brokerUrl}...`);
        this.client = window.mqtt.connect(brokerUrl, {
            clientId: 'cosmic-chef-scoring-' + Math.random().toString(36).slice(2),
            reconnectPeriod: 1000
        });

        this.client.on('connect', () => {
            this.log.info('✓ Connected to MQTT broker');
            this.client.subscribe(topics, (err) => {
                if (err) {
                    this.log.error('Subscription failed:', err);
                } else {
                    this.log.info(`Subscribed to ${topics.length} topics for ${TEAM_IDS.length} teams`);
                }
            });
        });
        this.client.on('error', (err) => this.log.warn('MQTT connection error:', err.message));
        this.client.on('message', (topic, message) => this.onMessage(topic, message.toString()));
    },

    onMessage: function (topic, payload) {
        const { parseTopic, TEAM_IDS } = window.CosmicChef;
        const { gameId } = this.data;

        const teamId = TEAM_IDS.find((id) => parseTopic(topic, id, gameId));
        if (!teamId) return;
        const parsed = parseTopic(topic, teamId, gameId);

        if (parsed.kind === 'game-state') {
            try {
                const { context } = JSON.parse(payload);
                this.teams[teamId].score = typeof context.score === 'number' ? context.score : null;
            } catch (e) {
                this.log.error(`Failed to parse game state for ${teamId}:`, e.message);
                return;
            }
        } else if (parsed.kind === 'team-color') {
            this.teams[teamId].color = payload.trim();
        } else {
            return;
        }

        this.emitScores();
    },

    /** One entry per team, in TEAM_IDS order. */
    getScores: function () {
        return window.CosmicChef.TEAM_IDS.map((teamId) => ({
            teamId,
            score: this.teams[teamId].score,
            color: this.teams[teamId].color
        }));
    },

    emitScores: function () {
        this.el.emit('scores-changed', { scores: this.getScores() });
    },

    /** Asks every team's galley to zero its score. The scores change when the galley broadcasts. */
    resetScores: function () {
        if (!this.client || !this.client.connected) {
            this.log.warn('MQTT not connected, reset not sent');
            return false;
        }
        const { gameId } = this.data;
        window.CosmicChef.TEAM_IDS.forEach((teamId) => {
            const topic = window.CosmicChef.scoreResetTopic(teamId, gameId);
            this.client.publish(topic, 'reset', { qos: 1 });
            this.log.info(`Published score reset to ${topic}`);
        });
        return true;
    },

    remove: function () {
        if (this.client) {
            this.client.end();
        }
        this.log.debug('Scoring MQTT client removed');
    }
});
