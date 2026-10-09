/**
 * console-helpers.js
 * Browser-console helpers for driving the game without hardware.
 * Everything goes through preparation-manager (the actor owner) or mqtt-bridge.
 */

(function () {
    const log = window.log.getLogger('console');
    const scene = document.querySelector('a-scene');

    // Show which team is running this window
    if (window.CURRENT_TEAM) {
        log.info(`🎮 Running as team: ${window.CURRENT_TEAM.toUpperCase()}`);
    }

    setTimeout(() => {
        focusLog(['galley-manager','preparation-manager', 'mqtt-bridge', 'head-chef-mqtt-client', 'team-galley-receiver']);
    }, 100);

    function prepMgr() {
        return scene.components['preparation-manager'];
    }

    function snapshot() {
        return prepMgr().getSnapshot();
    }

    function sendAndReport(event) {
        const before = snapshot().value;
        prepMgr().send(event);
        const after = snapshot();
        if (after.value !== before) {
            log.info(`→ State changed to: ${after.value}`);
        } else {
            log.info(`State remains: ${after.value}`);
        }
        return after;
    }

    window.debug = function (enable = true) {
        const level = enable ? 'debug' : 'info';
        window.log.setLevel(level);
        window.log.rebuild(); // propagate to named loggers
        log.info(`Log level set to: ${level}`);
    };

    window.silence = function (loggerNames = []) {
        const defaults = ['preparation-manager', 'mqtt-bridge', 'head-chef-mqtt-client', 'team-galley-receiver', 'galley-manager'];
        const targets = loggerNames.length > 0 ? loggerNames : defaults;
        targets.forEach(name => {
            window.log.getLogger(name).setLevel('warn');
        });
        log.info(`Silenced loggers: ${targets.join(', ')}`);
    };

    window.focusLog = function (loggerNames = 'camera-focus-galley') {
        const allLoggers = ['preparation-manager', 'mqtt-bridge', 'head-chef-mqtt-client', 'team-galley-receiver', 'galley-manager', 'load-fragment', 'start-experience', 'world-root', 'galley-layout', 'final-stir-camera'];
        allLoggers.forEach(name => {
            window.log.getLogger(name).setLevel('warn');
        });
        const targets = Array.isArray(loggerNames) ? loggerNames : [loggerNames];
        targets.forEach(name => {
            window.log.getLogger(name).setLevel('info');
        });
        log.info(`Focusing on: ${targets.join(', ')}`);
    };

    window.getGameState = snapshot;

    window.testState = function () {
        const { value, context } = snapshot();
        log.info(`Current State: ${value}`);
        log.info(`Chefs: ${context.activeChefsCount}`);
        log.info(`Ingredients: ${context.ingredients.length}`);
        log.info(`Score: ${context.score}`);
        return value;
    };

    window.sendGameEvent = function (type, data = {}) {
        return sendAndReport({ type, ...data });
    };

    window.testRecipe = function (recipeName = 'proton') {
        const recipe = window.RECIPES.find(r => r.name === recipeName);
        if (!recipe) {
            log.error(`Recipe ${recipeName} not found`);
            return;
        }
        const state = snapshot().value;
        if (state === 'orderSuccess' || state === 'orderPenalized') {
            log.info(`Transitioning from ${state} → waitingForRecipe with NEXT_ROUND`);
            prepMgr().send({ type: 'NEXT_ROUND' });
        }
        log.info(`Sending CAPTURE_RECIPE: ${recipeName}`);
        return sendAndReport({ type: 'CAPTURE_RECIPE', recipe });
    };

    // Single GESTURE_TICK with an explicit progress amount
    window.testGesture = function (gesture, progress = 100, chefId) {
        log.info(`Sending GESTURE_TICK: ${gesture} +${progress}%${chefId ? ` (${chefId})` : ''}`);
        const after = sendAndReport({ type: 'GESTURE_TICK', gesture, progressAmount: progress, chefId });
        if (after.value === 'readyForFinalStir') {
            log.debug(`  Stir progress: ${after.context.stirProgress}/100`);
        } else if (after.value === 'preparingIngredients' && chefId) {
            const station = after.context.stations.find(s => s.chefId === chefId);
            if (station) log.debug(`  Progress at ${station.stationId}: ${station.progress}/100`);
        }
        return after;
    };

    // Hold a gesture for `duration` ms through the real gesture stream (as MQTT would)
    window.testSousChefGesture = function (sousChefId, gesture, duration = 1000) {
        const bridge = scene.components['mqtt-bridge'];
        const chefId = window.CosmicChef.chefIdFor(sousChefId);
        log.info(`Testing gesture: ${chefId} ${gesture} for ${duration}ms`);
        bridge.pushGesture(chefId, gesture);
        setTimeout(() => {
            bridge.pushGesture(chefId, 'idle');
            log.info('Gesture ended');
        }, duration);
    };

    window.testSubmit = function () {
        log.info('Sending SUBMIT_RECIPE');
        const { value, context } = sendAndReport({ type: 'SUBMIT_RECIPE' });
        if (value === 'orderSuccess') {
            log.info(`✓ Recipe matched! Order successful! Score: ${context.score}`);
        } else if (value === 'orderPenalized') {
            log.info(`✗ Recipe did not match. Order penalized. Score: ${context.score}`);
        }
    };

    window.setChefs = function (count) {
        log.info(`Setting active chefs to ${count}`);
        prepMgr().send({ type: 'SET_ACTIVE_CHEFS', count });
    };

    window.getDeliveryAreaPosition = function () {
        const galleyEl = document.querySelector('[galley-manager]');
        const pos = galleyEl.components['galley-manager'].data.deliveryAreaPosition;
        log.info(`Delivery Area Position: x=${pos.x}, y=${pos.y}, z=${pos.z}`);
        return pos;
    };

    log.info('Test helpers available:');
    log.info('  debug(true/false) — toggle debug logging');
    log.info('  testState() / getGameState() — show current state / snapshot');
    log.info('  testRecipe(name) — load a recipe (pion, proton, neutron, lambda)');
    log.info('  testGesture(gesture, progress, chefId) — one GESTURE_TICK, e.g. testGesture("slice", 50, "chef-2")');
    log.info('  testSousChefGesture(n, gesture, ms) — hold a gesture through the MQTT gesture stream');
    log.info('  testSubmit() — submit the dish');
    log.info('  setChefs(n) / sendGameEvent(type, data) / getDeliveryAreaPosition()');
})();
