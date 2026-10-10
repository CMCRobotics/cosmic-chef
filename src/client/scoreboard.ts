/**
 * Scoring-screen text.
 *
 * One line per team: the score from its last state broadcast, or a dash until one arrives.
 * Pure, so it is unit-tested; scoring-screen.js only renders the result.
 */

export interface TeamScore {
  teamId: string;
  /** Null until the team's first state broadcast arrives. */
  score: number | null;
}

/** One line per team, in the order given. */
export function describeScoreboard(scores: TeamScore[]): string[] {
  return scores.map(({ teamId, score }) => `EQUIPE ${teamId.toUpperCase()} : ${score ?? "—"}`);
}
