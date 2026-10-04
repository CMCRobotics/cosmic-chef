(() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  function __accessProp(key) {
    return this[key];
  }
  var __toCommonJS = (from) => {
    var entry = (__moduleCache ??= new WeakMap).get(from), desc;
    if (entry)
      return entry;
    entry = __defProp({}, "__esModule", { value: true });
    if (from && typeof from === "object" || typeof from === "function") {
      for (var key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(entry, key))
          __defProp(entry, key, {
            get: __accessProp.bind(from, key),
            enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
          });
    }
    __moduleCache.set(from, entry);
    return entry;
  };
  var __moduleCache;
  var __returnValue = (v) => v;
  function __exportSetter(name, newValue) {
    this[name] = __returnValue.bind(null, newValue);
  }
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, {
        get: all[name],
        enumerable: true,
        configurable: true,
        set: __exportSetter.bind(all, name)
      });
  };

  // src/modules/sousChefIntegration.ts
  var exports_sousChefIntegration = {};
  __export(exports_sousChefIntegration, {
    initializeSousChefIntegration: () => initializeSousChefIntegration
  });

  // src/adapters/sousChefGestureAdapter.ts
  var RxJS = window.RxJS || {};
  var {
    Observable,
    Subject,
    map,
    merge,
    interval,
    switchMap,
    mergeMap,
    groupBy,
    timeout,
    distinctUntilChanged
  } = RxJS;
  var log = window.log?.getLogger("sous-chef-adapter") || {
    debug: console.debug,
    info: console.info,
    warn: console.warn,
    error: console.error
  };
  function createSousChefGestureStream(teamId, gameId, numSousChefs = 3) {
    return new Observable((observer) => {
      const subject = window.sousChefGestureSubject;
      if (subject) {
        const subscription = subject.subscribe(observer);
        return () => subscription.unsubscribe();
      } else {
        observer.error(new Error("sousChefGestureSubject not initialized. Ensure MQTT connection is established."));
      }
    }).pipe(distinctUntilChanged((a, b) => a.sousChef === b.sousChef && a.gesture === b.gesture));
  }
  function createSousChefEventStream(gestureStream, numSousChefs = 3) {
    return gestureStream.pipe(groupBy((g) => g.sousChef), mergeMap((chefStream$) => {
      const sousChefId = chefStream$.key;
      return chefStream$.pipe(switchMap((gesture) => {
        const currentGesture = gesture.gesture;
        if (currentGesture === "idle") {
          log.debug(`Sous-Chef ${sousChefId}: STOP`);
          return new Observable((observer) => {
            observer.next({
              type: "SOUS_CHEF_GESTURE_STOP",
              sousChef: sousChefId
            });
            observer.complete();
          });
        }
        log.debug(`Sous-Chef ${sousChefId}: START (${currentGesture})`);
        return merge(new Observable((observer) => {
          observer.next({
            type: "SOUS_CHEF_GESTURE_START",
            sousChef: sousChefId,
            gesture: currentGesture
          });
          observer.complete();
        }), interval(100).pipe(timeout(15000), map(() => ({
          type: "SOUS_CHEF_GESTURE_TICK",
          sousChef: sousChefId,
          gesture: currentGesture
        }))));
      }));
    }));
  }
  function connectSousChefGestures(teamId, gameId, gameMachine, numSousChefs = 3) {
    log.info(`Connecting sous-chef gestures: team=${teamId}, game=${gameId}`);
    const gestureStream = createSousChefGestureStream(teamId, gameId, numSousChefs);
    const eventStream = createSousChefEventStream(gestureStream, numSousChefs);
    const subscription = eventStream.subscribe({
      next: (event) => {
        log.info(`[GESTURE EVENT] ${event.type} - Sous-Chef ${event.sousChef}${event.gesture ? ` (${event.gesture})` : ""}`);
        gameMachine.send(event);
      },
      error: (err) => {
        log.error("Sous-chef gesture stream error:", err);
      }
    });
    return () => {
      log.info("Disconnecting sous-chef gestures");
      subscription.unsubscribe();
    };
  }
  function initializeSousChefGestureSubject() {
    const subject = new Subject;
    window.sousChefGestureSubject = subject;
    log.info("Initialized sousChefGestureSubject");
    return subject;
  }
  function publishSousChefGesture(sousChef, gesture) {
    const subject = window.sousChefGestureSubject;
    if (subject) {
      subject.next({ sousChef, gesture });
    }
  }

  // src/modules/sousChefIntegration.ts
  var log2 = window.log?.getLogger("sous-chef-integration") || {
    debug: console.debug,
    info: console.info,
    warn: console.warn,
    error: console.error
  };
  function initializeSousChefIntegration(config) {
    const numSousChefs = config.numSousChefs || 3;
    log2.info("Initializing Sous-Chef Integration", {
      teamId: config.teamId,
      gameId: config.gameId,
      numSousChefs
    });
    initializeSousChefGestureSubject();
    if (!window.gameActor) {
      log2.error("window.gameActor not found. Cannot connect sous-chef gestures to XState machine.");
      return { cleanup: () => {}, publishGesture };
    }
    const unsubscribeGestures = connectSousChefGestures(config.teamId, config.gameId, window.gameActor, numSousChefs);
    setupMqttListener(config.teamId, config.gameId, numSousChefs);
    log2.info("Sous-Chef Integration initialized successfully");
    return {
      cleanup: () => {
        log2.info("Cleaning up Sous-Chef Integration");
        unsubscribeGestures();
      },
      publishGesture: publishSousChefGesture
    };
  }
  function setupMqttListener(teamId, gameId, numSousChefs) {
    const mqttClient = window.mqttClient;
    if (!mqttClient) {
      log2.warn("MQTT client not found. Sous-chef gestures must be published via publishSousChefGesture().");
      return () => {};
    }
    log2.info("Setting up MQTT listener for sous-chef gestures");
    const topics = [];
    for (let i = 1;i <= numSousChefs; i++) {
      topics.push(`cosmic-chef/team-${teamId}/game-${gameId}/sous-chef-${i}/gesture/current`);
    }
    topics.forEach((topic) => {
      mqttClient.subscribe(topic, (err) => {
        if (err) {
          log2.error(`Failed to subscribe to ${topic}:`, err);
        } else {
          log2.debug(`Subscribed to: ${topic}`);
        }
      });
    });
    log2.info(`Subscribed to ${topics.length} gesture topic(s)`);
    const handleMessage = (topic, message) => {
      const match = topic.match(/sous-chef-(\d+)\/gesture\/current/);
      if (match) {
        const sousChef = parseInt(match[1], 10);
        const gesture = message.toString().toLowerCase();
        log2.debug(`MQTT: Sous-Chef ${sousChef} → ${gesture}`);
        publishSousChefGesture(sousChef, gesture);
      }
    };
    mqttClient.on("message", handleMessage);
    return () => {
      topics.forEach((topic) => {
        mqttClient.unsubscribe(topic);
      });
      mqttClient.off("message", handleMessage);
      log2.info("Cleaned up MQTT listener");
    };
  }
  window.publishSousChefGesture = publishSousChefGesture;
  window.initializeSousChefIntegration = initializeSousChefIntegration;
  log2.info("Sous-Chef Integration module loaded");
})();
