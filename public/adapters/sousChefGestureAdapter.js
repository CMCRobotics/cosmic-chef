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
export {
  connectSousChefGestures,
  createSousChefEventStream,
  createSousChefGestureStream,
  initializeSousChefGestureSubject,
  publishSousChefGesture
};
