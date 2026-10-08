/**
 * Team selection for the browser views (index.html, head-chef.html).
 *
 * A window plays for one team, given by the `?team=` URL parameter. The choice is
 * remembered in localStorage so that a reload or MQTT reconnect keeps the team, but a
 * `?team=` in the URL always replaces the remembered one.
 */

export const TEAM_IDS = ["blue", "red", "white"] as const;
export type TeamId = (typeof TEAM_IDS)[number];

export const DEFAULT_TEAM_ID: TeamId = "blue";
export const TEAM_STORAGE_KEY = "cosmic-chef.team";

/** Minimal slice of the Web Storage API used to remember the team. */
export interface TeamStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Accepts `blue`, `team-blue` or any casing. Returns null for unknown teams. */
export function normalizeTeamId(value: string | null | undefined): TeamId | null {
  if (!value) return null;
  const id = value.trim().toLowerCase().replace(/^team-/, "");
  return (TEAM_IDS as readonly string[]).includes(id) ? (id as TeamId) : null;
}

/**
 * Resolves the team for this window.
 *   1. A valid `?team=` in the URL wins and replaces the remembered team.
 *   2. Otherwise the remembered team is used (an invalid URL value is ignored).
 *   3. Otherwise DEFAULT_TEAM_ID.
 * Storage may be unavailable (private mode, blocked site data), so its errors are swallowed.
 */
export function resolveTeamId(search: string, storage: TeamStorage | null): TeamId {
  const fromUrl = normalizeTeamId(new URLSearchParams(search).get("team"));
  if (fromUrl) {
    try {
      storage?.setItem(TEAM_STORAGE_KEY, fromUrl);
    } catch {
      // Storage unavailable: the team still applies for this page load.
    }
    return fromUrl;
  }

  let remembered: string | null = null;
  try {
    remembered = storage?.getItem(TEAM_STORAGE_KEY) ?? null;
  } catch {
    // Storage unavailable: fall through to the default.
  }
  return normalizeTeamId(remembered) ?? DEFAULT_TEAM_ID;
}
