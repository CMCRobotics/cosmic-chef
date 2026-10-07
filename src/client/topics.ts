/**
 * MQTT topic layout for a Cosmic Chef game (Homie v4 device/node/property).
 *
 *   cosmic-chef/team-{teamId}/game-{gameId}/sous-chef-{n}/gesture/current      payload: gesture name | "idle"
 *   cosmic-chef/team-{teamId}/game-{gameId}/head-chef/animation/submit-state   payload: "idle" | "submitting"
 *   cosmic-chef/team-{teamId}/game-{gameId}/round/recipe-desired               payload: recipe JSON (incoming)
 *   cosmic-chef/team-{teamId}/game-{gameId}/round/recipe-actual                payload: recipe JSON (outgoing)
 *
 * Every topic string in the client is built or parsed here.
 */

export type ParsedTopic =
  | { kind: "sous-chef-gesture"; sousChef: number }
  | { kind: "head-chef-submit" }
  | { kind: "recipe-desired" }
  | { kind: "recipe-actual" }
  | { kind: "game-state" };

export function gameTopic(teamId: string, gameId: string): string {
  return `cosmic-chef/team-${teamId}/game-${gameId}`;
}

export function sousChefGestureTopic(teamId: string, gameId: string, sousChef: number): string {
  return `${gameTopic(teamId, gameId)}/sous-chef-${sousChef}/gesture/current`;
}

export function headChefSubmitTopic(teamId: string, gameId: string): string {
  return `${gameTopic(teamId, gameId)}/head-chef/animation/submit-state`;
}

export function recipeDesiredTopic(teamId: string, gameId: string): string {
  return `${gameTopic(teamId, gameId)}/round/recipe-desired`;
}

export function recipeActualTopic(teamId: string, gameId: string): string {
  return `${gameTopic(teamId, gameId)}/round/recipe-actual`;
}

export function recipeTopic(teamId: string, gameId: string): string {
  return recipeDesiredTopic(teamId, gameId);
}

export function gameStateTopic(teamId: string, gameId: string): string {
  return `${gameTopic(teamId, gameId)}/state/broadcast`;
}

/** All topics a game client subscribes to. */
export function gameSubscriptions(teamId: string, gameId: string, numSousChefs: number): string[] {
  const topics = [headChefSubmitTopic(teamId, gameId), recipeDesiredTopic(teamId, gameId)];
  for (let n = 1; n <= numSousChefs; n++) {
    topics.push(sousChefGestureTopic(teamId, gameId, n));
  }
  return topics;
}

/** Identifies a topic of the given game, or returns null for anything else. */
export function parseTopic(topic: string, teamId: string, gameId: string): ParsedTopic | null {
  const prefix = `${gameTopic(teamId, gameId)}/`;
  if (!topic.startsWith(prefix)) return null;
  const rest = topic.slice(prefix.length);

  const gesture = rest.match(/^sous-chef-(\d+)\/gesture\/current$/);
  if (gesture) return { kind: "sous-chef-gesture", sousChef: parseInt(gesture[1], 10) };
  if (rest === "head-chef/animation/submit-state") return { kind: "head-chef-submit" };
  if (rest === "round/recipe-desired") return { kind: "recipe-desired" };
  if (rest === "round/recipe-actual") return { kind: "recipe-actual" };
  if (rest === "round/recipe") return { kind: "recipe-desired" }; // Fallback for legacy topic
  if (rest === "state/broadcast") return { kind: "game-state" };
  return null;
}
