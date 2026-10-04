/**
 * Head-Chef Action Adapter
 *
 * Converts MQTT Homie property updates (head-chef submit/cancel actions) into RxJS streams,
 * then pumps processed events into the XState game machine.
 *
 * Pattern: MQTT (head-chef/animation/submit-state) → RxJS → XState events
 */

const RxJS = (window as any).RxJS || {};
const {
  Observable,
  Subject,
  map,
  distinctUntilChanged,
} = RxJS;

const log = window.log?.getLogger("head-chef-adapter") || {
  debug: console.debug,
  info: console.info,
  warn: console.warn,
  error: console.error,
};

export interface HeadChefAction {
  action: "cancel" | "submit";
  timestamp: number;
}

export interface HeadChefActionEvent {
  type: "CANCEL_ORDER" | "SUBMIT_RECIPE";
}

/**
 * Creates an RxJS stream from head-chef submit-state MQTT updates.
 */
export function createHeadChefActionStream(
  teamId: string,
  gameId: string
): Observable<HeadChefAction> {
  return new Observable((observer) => {
    // In production, use homie-lit to subscribe to MQTT:
    // import { createMqttHomieObserver } from 'homie-lit';
    // const mqttObserver = createMqttHomieObserver(brokerUrl);
    // mqttObserver.subscribe(`cosmic-chef/team-${teamId}/game-${gameId}/head-chef/animation/submit-state`);

    // For now, use window.headChefActionSubject (populated by MQTT messages)
    const subject = (window as any).headChefActionSubject as Subject<
      HeadChefAction
    > | undefined;

    if (subject) {
      const subscription = subject.subscribe(observer);
      return () => subscription.unsubscribe();
    } else {
      observer.error(
        new Error(
          "headChefActionSubject not initialized. Ensure MQTT connection is established."
        )
      );
    }
  }).pipe(
    // Skip duplicate consecutive actions
    distinctUntilChanged(
      (a, b) => a.action === b.action
    )
  );
}

/**
 * Converts head-chef action stream into XState event stream.
 */
export function createHeadChefEventStream(
  actionStream: Observable<HeadChefAction>
): Observable<HeadChefActionEvent> {
  return actionStream.pipe(
    map((action) => {
      if (action.action === "cancel") {
        log.debug("Head-Chef: CANCEL");
        return { type: "CANCEL_ORDER" as const };
      } else if (action.action === "submit") {
        log.debug("Head-Chef: SUBMIT");
        return { type: "SUBMIT_RECIPE" as const };
      }
      throw new Error(`Unknown head-chef action: ${action.action}`);
    })
  );
}

/**
 * Pumps XState events into the game machine.
 */
export function connectHeadChefActions(
  teamId: string,
  gameId: string,
  gameMachine: any
): () => void {
  log.info(`Connecting head-chef actions: team=${teamId}, game=${gameId}`);

  const actionStream = createHeadChefActionStream(teamId, gameId);
  const eventStream = createHeadChefEventStream(actionStream);

  const subscription = eventStream.subscribe({
    next: (event) => {
      log.info(`[HEAD-CHEF EVENT] ${event.type}`);
      gameMachine.send(event);
    },
    error: (err) => {
      log.error("Head-chef action stream error:", err);
    },
  });

  // Return unsubscribe function
  return () => {
    log.info("Disconnecting head-chef actions");
    subscription.unsubscribe();
  };
}

/**
 * Initializes the MQTT action subject for browser-based MQTT connections.
 * Call this when the MQTT client connects.
 */
export function initializeHeadChefActionSubject(): Subject<HeadChefAction> {
  const subject = new Subject<HeadChefAction>();
  (window as any).headChefActionSubject = subject;
  log.info("Initialized headChefActionSubject");
  return subject;
}

/**
 * Helper to publish an action update to the stream.
 * Used by the test interface or MQTT client.
 */
export function publishHeadChefAction(action: "cancel" | "submit"): void {
  const subject = (window as any).headChefActionSubject as Subject<
    HeadChefAction
  >;
  if (subject) {
    subject.next({ action, timestamp: Date.now() });
  }
}
