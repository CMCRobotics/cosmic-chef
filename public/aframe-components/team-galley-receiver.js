/**
 * team-galley-receiver.js
 * Receives game state for a specific team from MQTT broadcasts.
 * Creates a colored ring and emits game-state-changed on this entity
 * so that a scoped galley-manager can track this team's ingredients.
 *
 * Usage: <a-entity team-galley-receiver="teamId: team-blue; gameId: default">
 */

AFRAME.registerComponent('team-galley-receiver', {
    schema: {
        brokerUrl: { type: 'string', default: 'ws://localhost:9001' },
        teamId: { type: 'string', default: 'team-1' },
        gameId: { type: 'string', default: 'default' },
        ringRadius: { type: 'number', default: 6.2 },
        ringInnerRadius: { type: 'number', default: 6 },
        ringOuterRadius: { type: 'number', default: 9 }
    },

    init: function () {
        this.log = window.log.getLogger('team-galley-receiver');
        // If this is the local team, we don't need to receive state via MQTT
        // because the local preparation-manager already handles it.
        // if (this.data.teamId === window.CURRENT_TEAM) {
        //     this.log.info(`Team ${this.data.teamId} is local team. Receiver will remain dormant to avoid latency/duplication.`);
        //     this.isLocalTeam = true;
        //     return;
        // }

        this.log.debug(`Initializing team-galley-receiver for team: ${this.data.teamId}`);

        this.currentState = null;
        this.currentContext = null;
        this.teamColor = '#cccccc'; // default
        this.ringCreated = false;

        this.connect();
    },

    connect: function () {
        if (!window.mqtt) {
            this.log.warn('mqtt.js not loaded — team galley display will not work');
            return;
        }

        const { teamId, gameId, brokerUrl } = this.data;
        const stateTopic = window.CosmicChef.gameStateTopic(teamId, gameId);
        const teamColorTopic = `cosmic-chef/team-${teamId}/game-${gameId}/identity/color`;

        this.log.info(`Connecting to MQTT broker at ${brokerUrl} for team ${teamId}...`);
        this.client = window.mqtt.connect(brokerUrl, {
            clientId: 'cosmic-chef-galley-' + teamId + '-' + Math.random().toString(36).slice(2),
            reconnectPeriod: 1000
        });

        this.client.on('connect', () => {
            this.log.info(`✓ Connected for team ${teamId}`);

            // Subscribe to game state
            this.client.subscribe(stateTopic, (err) => {
                if (err) {
                    this.log.error('Subscription failed for game state:', err);
                } else {
                    this.log.info(`Subscribed to ${stateTopic}`);
                }
            });

            // Subscribe to team color
            this.client.subscribe(teamColorTopic, (err) => {
                if (err) {
                    this.log.warn('Subscription failed for team color:', err);
                } else {
                    this.log.debug(`Subscribed to team color: ${teamColorTopic}`);
                }
            });
        });

        this.client.on('error', (err) => this.log.warn('MQTT connection error:', err.message));
        this.client.on('message', (topic, message) => this.onMessage(topic, message.toString()));
    },

    onMessage: function (topic, payload) {
        const { teamId, gameId } = this.data;

        // Check if this is a game state message
        const parsed = window.CosmicChef.parseTopic(topic, teamId, gameId);
        if (parsed && parsed.kind === 'game-state') {
            try {
                const { state, context } = JSON.parse(payload);
                this.currentState = state;
                this.currentContext = context;

                // Emit event so galley-manager can listen to this team's state
                this.el.emit('game-state-changed', {
                    state,
                    context
                }, false);

                this.log.trace(`📊 Received state for ${teamId}: ${state}`);
            } catch (e) {
                this.log.error('Failed to parse game state:', e.message);
            }
            return;
        }

        // Check if this is a team color message
        if (topic.includes('identity/color')) {
            try {
                this.teamColor = payload;
                this.log.debug(`🎨 Team ${teamId} color updated: ${this.teamColor}`);
                // Update ring color if already created
                if (this.ringCreated) {
                    this.updateRingColor();
                }
            } catch (e) {
                this.log.error('Failed to parse team color:', e.message);
            }
            return;
        }
    },

    createRing: function () {
        if (this.ringCreated) return;

        this.log.debug(`Creating colored ring for team ${this.data.teamId}`);

        const ringEl = document.createElement('a-entity');
        ringEl.setAttribute('class', 'galley-ring');
        ringEl.setAttribute('geometry', {
            primitive: 'ring',
            radiusInner: this.data.ringInnerRadius,
            radiusOuter: this.data.ringOuterRadius
        });
        ringEl.setAttribute('material', {
            color: this.teamColor,
            opacity: 0.8,
            transparent: true
        });
        ringEl.setAttribute('rotation', '-90 0 0');
        ringEl.setAttribute('position', '0 0.03 0');

        this.el.appendChild(ringEl);
        this.ringEl = ringEl;
        this.ringCreated = true;
    },

    updateRingColor: function () {
        if (this.ringEl) {
            this.ringEl.setAttribute('material', { color: this.teamColor });
        }
    },

    update: function () {
        // Create ring on first update if not already created
        if (!this.ringCreated && this.el.parentNode) {
            this.createRing();
        }
    },

    getSnapshot: function () {
        if (this.isLocalTeam) {
            const prepMgr = document.querySelector('a-scene').components['preparation-manager'];
            return prepMgr ? prepMgr.getSnapshot() : { value: null, context: null };
        }
        return {
            value: this.currentState,
            context: this.currentContext
        };
    },

    remove: function () {
        if (this.client) {
            this.client.end();
        }
        if (this.ringEl && this.ringEl.parentNode) {
            this.ringEl.remove();
        }
        this.log.debug(`Team galley receiver removed for ${this.data.teamId}`);
    }
});
