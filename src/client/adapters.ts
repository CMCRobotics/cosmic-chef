/**
 * Input adapters: translate external messages into preparation-machine events.
 *
 * Adapters are pure translators — they never touch MQTT, the DOM or the actor.
 * The mqtt-bridge component feeds them and forwards the resulting events.
 */

import {
  Observable,
  Subject,
  SchedulerLike,
  asyncScheduler,
  distinctUntilChanged,
  groupBy,
  interval,
  map,
  mergeMap,
  of,
  concat,
  switchMap,
  takeUntil,
  timer,
} from "rxjs";

export type GameEvent = { type: string; [key: string]: unknown };

export interface ChefGesture {
  chefId: string;
  gesture: string;
}

export function chefIdFor(sousChef: number): string {
  return `chef-${sousChef}`;
}

/** Head-chef submit-state payload → CANCEL_ORDER / CAPTURE_RECIPE / SUBMIT_RECIPE. */
export function headChefMessageToEvent(payload: string): GameEvent | null {
  switch (payload.trim().toLowerCase()) {
    case "idle":
      return { type: "CANCEL_ORDER" };
    case "captured":
      // Recipe is sent separately via the recipe topic with recipeMessageToEvent
      // This is just a trigger event; actual recipe comes from MQTT recipe topic
      return { type: "CAPTURE_RECIPE" };
    case "submitting":
      return { type: "SUBMIT_RECIPE" };
    default:
      return null;
  }
}

/** Recipe JSON payload → CAPTURE_RECIPE, or null when it isn't a usable recipe. */
export function recipeMessageToEvent(payload: string): GameEvent | null {
  try {
    const recipe = JSON.parse(payload);
    if (!recipe || !recipe.ingredientSequences) return null;
    return { type: "CAPTURE_RECIPE", recipe };
  } catch {
    return null;
  }
}

/** Score-reset payload → RESET_SCORE, or null for anything but "reset". */
export function scoreResetMessageToEvent(payload: string): GameEvent | null {
  return payload.trim().toLowerCase() === "reset" ? { type: "RESET_SCORE" } : null;
}

export interface GestureStreamOptions {
  /** Interval between GESTURE_TICKs while a gesture is held. */
  tickMs?: number;
  /** Safety cap: stop ticking a gesture held longer than this. */
  maxGestureMs?: number;
  scheduler?: SchedulerLike;
}

/**
 * Turns raw "chef X is now doing gesture Y" updates into machine events:
 * GESTURE_START once, then GESTURE_TICK every tickMs until the chef changes
 * gesture or goes "idle" (GESTURE_STOP). Each chef has an independent stream,
 * so simultaneous gestures from different chefs never interfere.
 */
export function createGestureEventStream(
  gesture$: Observable<ChefGesture>,
  { tickMs = 100, maxGestureMs = 15000, scheduler = asyncScheduler }: GestureStreamOptions = {}
): Observable<GameEvent> {
  return gesture$.pipe(
    groupBy((g) => g.chefId),
    mergeMap((chef$) =>
      chef$.pipe(
        distinctUntilChanged((a, b) => a.gesture === b.gesture),
        switchMap(({ chefId, gesture }): Observable<GameEvent> => {
          if (gesture === "idle") {
            return of({ type: "GESTURE_STOP", chefId });
          }
          return concat(
            of({ type: "GESTURE_START", chefId, gesture }),
            interval(tickMs, scheduler).pipe(
              takeUntil(timer(maxGestureMs, scheduler)),
              map(() => ({ type: "GESTURE_TICK", chefId, gesture }))
            )
          );
        })
      )
    )
  );
}

/** A push-based gesture input wired to createGestureEventStream. */
export function createGestureInput(options?: GestureStreamOptions) {
  const input = new Subject<ChefGesture>();
  return {
    push: (chefId: string, gesture: string) => input.next({ chefId, gesture: gesture.toLowerCase() }),
    events$: createGestureEventStream(input, options),
  };
}
