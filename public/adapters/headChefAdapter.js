/**
 * Head-Chef Action Adapter (Browser version)
 *
 * Converts MQTT head-chef submit/cancel actions into RxJS streams,
 * then pumps processed events into the XState game machine.
 */

console.log('[headChefAdapter] Loading...');

try {

const getLogger = () => {
  if (window.log && typeof window.log.getLogger === 'function') {
    return window.log.getLogger("head-chef-adapter");
  }
  return {
    debug: console.debug,
    info: console.info,
    warn: console.warn,
    error: console.error,
  };
};

// Lazy load RxJS when needed
const getRxJS = () => {
  const RxJS = window.RxJS;
  if (!RxJS) {
    throw new Error('RxJS not available - make sure vendor/bundle.js is loaded');
  }
  return RxJS;
};

/**
 * Creates an RxJS stream from head-chef submit-state MQTT updates.
 */
function createHeadChefActionStream(teamId, gameId) {
  const RxJS = getRxJS();
  const { Observable, distinctUntilChanged } = RxJS;

  return new Observable((observer) => {
    const subject = window.headChefActionSubject;

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
    distinctUntilChanged((a, b) => a.action === b.action)
  );
}

/**
 * Converts head-chef action stream into XState event stream.
 */
function createHeadChefEventStream(actionStream) {
  const RxJS = getRxJS();
  const { map } = RxJS;

  return actionStream.pipe(
    map((action) => {
      const logger = getLogger();
      if (action.action === "cancel") {
        logger.debug("Head-Chef: CANCEL");
        return { type: "CANCEL_ORDER" };
      } else if (action.action === "submit") {
        logger.debug("Head-Chef: SUBMIT");
        return { type: "SUBMIT_RECIPE" };
      }
      throw new Error(`Unknown head-chef action: ${action.action}`);
    })
  );
}

/**
 * Pumps XState events into the game machine.
 */
function connectHeadChefActions(teamId, gameId, gameMachine) {
  const logger = getLogger();
  logger.info(`Connecting head-chef actions: team=${teamId}, game=${gameId}`);

  const actionStream = createHeadChefActionStream(teamId, gameId);
  const eventStream = createHeadChefEventStream(actionStream);

  const subscription = eventStream.subscribe({
    next: (event) => {
      logger.info(`[HEAD-CHEF EVENT] ${event.type}`);
      gameMachine.send(event);
    },
    error: (err) => {
      logger.error("Head-chef action stream error:", err);
    },
  });

  return () => {
    logger.info("Disconnecting head-chef actions");
    subscription.unsubscribe();
  };
}

/**
 * Initializes the MQTT action subject for browser-based MQTT connections.
 */
function initializeHeadChefActionSubject() {
  const RxJS = getRxJS();
  const { Subject } = RxJS;
  const subject = new Subject();
  window.headChefActionSubject = subject;
  getLogger().info("Initialized headChefActionSubject");
  return subject;
}

/**
 * Helper to publish an action update to the stream.
 */
function publishHeadChefAction(action) {
  const subject = window.headChefActionSubject;
  if (subject) {
    subject.next({ action, timestamp: Date.now() });
  } else {
    getLogger().warn('headChefActionSubject not initialized when publishing action:', action);
  }
}

// Export for browser use - both as module and direct globals
window.headChefAdapterModule = {
  createHeadChefActionStream,
  createHeadChefEventStream,
  connectHeadChefActions,
  initializeHeadChefActionSubject,
  publishHeadChefAction,
};

// Also export functions directly to window for fallback access
window.publishHeadChefAction = publishHeadChefAction;
window.initializeHeadChefActionSubject = initializeHeadChefActionSubject;

console.log('[headChefAdapter] Loaded successfully - exports ready');
console.log('[headChefAdapter] window.publishHeadChefAction:', typeof window.publishHeadChefAction);
console.log('[headChefAdapter] window.initializeHeadChefActionSubject:', typeof window.initializeHeadChefActionSubject);

} catch (err) {
  console.error('[headChefAdapter] ERROR during load:', err);
  console.error('[headChefAdapter] Error stack:', err.stack);
  // Still try to export even if there's an error
  if (!window.publishHeadChefAction) {
    window.publishHeadChefAction = function(action) {
      if (window.headChefActionSubject) {
        window.headChefActionSubject.next({ action, timestamp: Date.now() });
      }
    };
  }
  if (!window.initializeHeadChefActionSubject) {
    window.initializeHeadChefActionSubject = function() {
      const RxJS = window.RxJS;
      if (RxJS && RxJS.Subject) {
        const subject = new RxJS.Subject();
        window.headChefActionSubject = subject;
        return subject;
      }
    };
  }
}
