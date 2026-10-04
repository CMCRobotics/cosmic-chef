/**
 * Sous-Chef Gesture Adapter
 *
 * Converts MQTT Homie property updates (sous-chef gestures) into RxJS streams
 * with smoothing operators, then pumps processed events into the XState game machine.
 *
 * Pattern: MQTT → RxJS (with smoothing) → XState events
 */

import {
  Observable,
  map,
  filter,
  debounceTime,
  distinctUntilChanged,
  throttleTime,
  Subject,
  merge,
  interval,
  switchMap,
  takeUntil,
  EMPTY,
} from "rxjs";

const log = window.log?.getLogger("sous-chef-adapter") || {
  debug: console.debug,
  info: console.info,
  warn: console.warn,
  error: console.error,
};

export interface SousChefGesture {
  sousChef: number;
  gesture: string;
}

export interface SousChefGestureEvent {
  type: "SOUS_CHEF_GESTURE_START" | "SOUS_CHEF_GESTURE_STOP" | "SOUS_CHEF_GESTURE_TICK";
  sousChef: number;
  gesture?: string;
}

/**
 * Creates an RxJS stream of MQTT property updates from sous-chef gesture topics.
 * This is a mock implementation that works with the test interface.
 * In production, this would use homie-lit to subscribe to the MQTT broker.
 */
export function createSousChefGestureStream(
  teamId: string,
  gameId: string,
  numSousChefs: number = 3
): Observable<SousChefGesture> {
  return new Observable((observer) => {
    // In production, use homie-lit:
    // import { createMqttHomieObserver } from 'homie-lit';
    // const mqttObserver = createMqttHomieObserver(brokerUrl);
    // mqttObserver.subscribe(`cosmic-chef/team-${teamId}/game-${gameId}/sous-chef-+/gesture/current`);
    // mqttObserver.getPropertyUpdates().pipe(...).subscribe(observer);

    // For now, we'll create a bridge from window.sousChefGestureSubject
    // (populated by MQTT messages in the browser)
    const subject = (window as any).sousChefGestureSubject as Subject<
      SousChefGesture
    > | undefined;

    if (subject) {
      const subscription = subject.subscribe(observer);
      return () => subscription.unsubscribe();
    } else {
      observer.error(
        new Error(
          "sousChefGestureSubject not initialized. Ensure MQTT connection is established."
        )
      );
    }
  }).pipe(
    // Debounce rapid toggles (gesture chatter from test interface or noisy sensors)
    // 50ms threshold allows fast intentional gestures but filters noise
    debounceTime(50),

    // Skip duplicate consecutive values (same sous-chef, same gesture)
    distinctUntilChanged(
      (a, b) =>
        a.sousChef === b.sousChef && a.gesture === b.gesture
    ),

    // Optional: throttle to reduce update frequency for performance
    // throttleTime(16) // ~60Hz (16ms between updates)
  );
}

/**
 * Converts smoothed gesture stream into XState event stream.
 * Tracks gesture state per sous-chef to emit START/STOP/TICK events.
 * TICK events are emitted every 100ms while a gesture is active.
 */
export function createSousChefEventStream(
  gestureStream: Observable<SousChefGesture>,
  numSousChefs: number = 3
): Observable<SousChefGestureEvent> {
  // Stop signals per sous-chef to kill intervals immediately
  const stopSignals = new Map<number, Subject<void>>();

  return gestureStream.pipe(
    switchMap((gesture) => {
      const sousChefId = gesture.sousChef;
      const currentGesture = gesture.gesture;

      // Complete and recreate stop signal for this sous-chef
      const oldStop = stopSignals.get(sousChefId);
      if (oldStop) {
        oldStop.complete();
      }
      const newStop = new Subject<void>();
      stopSignals.set(sousChefId, newStop);

      if (currentGesture === "idle") {
        log.debug(`Sous-Chef ${sousChefId}: STOP`);
        return new Observable((observer) => {
          observer.next({
            type: "SOUS_CHEF_GESTURE_STOP" as const,
            sousChef: sousChefId,
          });
          observer.complete();
        });
      }

      log.debug(`Sous-Chef ${sousChefId}: START (${currentGesture})`);

      // Emit START immediately
      return merge(
        new Observable<SousChefGestureEvent>((observer) => {
          observer.next({
            type: "SOUS_CHEF_GESTURE_START" as const,
            sousChef: sousChefId,
            gesture: currentGesture,
          });
          observer.complete();
        }),
        // TICK every 100ms, unsubscribe when newStop fires
        interval(100).pipe(
          takeUntil(newStop),
          map(() => ({
            type: "SOUS_CHEF_GESTURE_TICK" as const,
            sousChef: sousChefId,
            gesture: currentGesture,
          }))
        )
      );
    })
  );
}

/**
 * Pumps XState events into the game machine.
 * Called from the game initialization to connect MQTT → XState.
 */
export function connectSousChefGestures(
  teamId: string,
  gameId: string,
  gameMachine: any,
  numSousChefs: number = 3
): () => void {
  log.info(`Connecting sous-chef gestures: team=${teamId}, game=${gameId}`);

  const gestureStream = createSousChefGestureStream(
    teamId,
    gameId,
    numSousChefs
  );
  const eventStream = createSousChefEventStream(gestureStream, numSousChefs);

  const subscription = eventStream.subscribe({
    next: (event) => {
      log.info(`[GESTURE EVENT] ${event.type} - Sous-Chef ${event.sousChef}${event.gesture ? ` (${event.gesture})` : ''}`);
      gameMachine.send(event);
    },
    error: (err) => {
      log.error("Sous-chef gesture stream error:", err);
    },
  });

  // Return unsubscribe function
  return () => {
    log.info("Disconnecting sous-chef gestures");
    subscription.unsubscribe();
  };
}

/**
 * Initializes the MQTT gesture subject for browser-based MQTT connections.
 * Call this when the MQTT client connects.
 */
export function initializeSousChefGestureSubject(): Subject<SousChefGesture> {
  const subject = new Subject<SousChefGesture>();
  (window as any).sousChefGestureSubject = subject;
  log.info("Initialized sousChefGestureSubject");
  return subject;
}

/**
 * Helper to publish a gesture update to the stream.
 * Used by the test interface or MQTT client.
 */
export function publishSousChefGesture(
  sousChef: number,
  gesture: string
): void {
  const subject = (window as any).sousChefGestureSubject as Subject<
    SousChefGesture
  >;
  if (subject) {
    subject.next({ sousChef, gesture });
  }
}
