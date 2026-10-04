/**
 * mqtt-bridge.js
 * The only component that talks to MQTT.
 *
 * Subscribes to the game's sous-chef, head-chef and recipe topics, translates each
 * message with the adapters in window.CosmicChef (src/client/), and sends the
 * resulting events to preparation-manager. Publishes the recipe once captured.
 *
 * Usage: <a-scene preparation-manager mqtt-bridge="teamId: team-1; gameId: default">
 */

AFRAME.registerComponent('mqtt-bridge', {
    dependencies: ['preparation-manager'],

    schema: {
        brokerUrl: { type: 'string', default: 'ws://localhost:9001' },
        teamId: { type: 'string', default: 'team-1' },
        gameId: { type: 'string', default: 'default' },
        numSousChefs: { type: 'number', default: 3 }
    },

    init: function () {
        this.log = window.log.getLogger('mqtt-bridge');
        this.prepMgr = this.el.components['preparation-manager'];

        const { createGestureInput } = window.CosmicChef;
        this.gestureInput = createGestureInput();
        this.gestureSubscription = this.gestureInput.events$.subscribe((event) => {
            this.log.debug(`${event.type} ${event.chefId}${event.gesture ? ` (${event.gesture})` : ''}`);
            this.prepMgr.send(event);
        });

        this.lastState = this.prepMgr.getSnapshot().value;
        this.onStateChange = this.onStateChange.bind(this);
        this.el.addEventListener('game-state-changed', this.onStateChange);

        this.connect();
    },

    connect: function () {
        if (!window.mqtt) {
            this.log.warn('mqtt.js not loaded — only console gestures (pushGesture) will work');
            return;
        }

        const { teamId, gameId, numSousChefs, brokerUrl } = this.data;
        const topics = window.CosmicChef.gameSubscriptions(teamId, gameId, numSousChefs);

        this.log.info(`Connecting to MQTT broker at ${brokerUrl}...`);
        this.client = window.mqtt.connect(brokerUrl, {
            clientId: 'cosmic-chef-' + Math.random().toString(36).slice(2),
            reconnectPeriod: 1000
        });

        this.client.on('connect', () => {
            this.log.info('✓ Connected to MQTT broker');
            this.client.subscribe(topics, (err) => {
                if (err) {
                    this.log.error('Subscription failed:', err);
                } else {
                    this.log.info(`Subscribed to ${topics.length} topics under ${window.CosmicChef.gameTopic(teamId, gameId)}`);
                }
            });
        });
        this.client.on('error', (err) => this.log.warn('MQTT connection error:', err.message));
        this.client.on('message', (topic, message) => this.onMessage(topic, message.toString()));
    },

    onMessage: function (topic, payload) {
        const { parseTopic, chefIdFor, headChefMessageToEvent, recipeMessageToEvent } = window.CosmicChef;
        const parsed = parseTopic(topic, this.data.teamId, this.data.gameId);
        if (!parsed) return;

        switch (parsed.kind) {
            case 'sous-chef-gesture':
                this.pushGesture(chefIdFor(parsed.sousChef), payload);
                break;

            case 'head-chef-submit': {
                // No dedup needed: CANCEL_ORDER and SUBMIT_RECIPE are only wired up in states
                // where they apply (preparingIngredients, readyForFinalStir, recipeReadyForSubmit).
                // XState silently ignores them elsewhere, and repeated identical deliveries within
                // a round are harmless. Dedup would break legitimate repeat actions across rounds.
                const event = headChefMessageToEvent(payload);
                if (!event) {
                    this.log.warn(`Unknown head-chef state: ${payload}`);
                    return;
                }
                this.log.info(`Head-chef: ${event.type}`);

                // Debug: log current state before sending event
                const beforeState = this.prepMgr.getSnapshot();
                this.log.info(`📊 Before ${event.type}: state=${beforeState.value}`);

                this.prepMgr.send(event);

                // Debug: log state after sending event
                setTimeout(() => {
                    const afterState = this.prepMgr.getSnapshot();
                    this.log.info(`📊 After ${event.type}: state=${afterState.value}`);
                }, 50);
                break;
            }

            case 'recipe': {
                const event = recipeMessageToEvent(payload);
                if (!event) {
                    this.log.error('Ignoring malformed recipe message');
                    return;
                }
                this.log.info(`Recipe received: ${event.recipe.name}`);
                this.prepMgr.send(event);
                break;
            }
        }
    },

    /** Feed a raw gesture update (as an MQTT sous-chef would) into the gesture stream. */
    pushGesture: function (chefId, gesture) {
        this.gestureInput.push(chefId, gesture);
    },

    onStateChange: function (evt) {
        const { state, context } = evt.detail;
        const recipeCaptured = state === 'preparingIngredients' && this.lastState === 'waitingForRecipe';
        this.lastState = state;

        if (!recipeCaptured || !this.client) return;

        // Announce the captured recipe (the round/recipe topic is also how recipes arrive;
        // the echo is ignored because the machine only captures in waitingForRecipe)
        const { name, composition, charge, ingredientSequences, finalStep } = context.currentOrder;
        const topic = window.CosmicChef.recipeTopic(this.data.teamId, this.data.gameId);
        this.client.publish(topic, JSON.stringify({ name, composition, charge, ingredientSequences, finalStep }), { qos: 1 });
        this.log.info(`Published recipe to ${topic}: ${name}`);
    },

    remove: function () {
        this.el.removeEventListener('game-state-changed', this.onStateChange);
        this.gestureSubscription.unsubscribe();
        if (this.client) {
            this.client.end();
        }
    }
});
