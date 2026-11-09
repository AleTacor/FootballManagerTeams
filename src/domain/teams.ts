import type { AppData } from './types';

/**
 * Deletes a team. The last team is cleared instead (no players, no lineups; same id and
 * name), so there is always a team to show. If the active team goes, the first remaining
 * team becomes active.
 */
export function deleteTeam(data: AppData, teamId: string): AppData {
  const team = data.teams.find((t) => t.id === teamId);
  if (!team) return data;
  if (data.teams.length === 1) {
    if (!team.players.length && !team.assignments.length) return data;
    return { ...data, teams: [{ ...team, players: [], assignments: [] }] };
  }
  const teams = data.teams.filter((t) => t !== team);
  return { ...data, teams, activeTeamId: data.activeTeamId === teamId ? teams[0].id : data.activeTeamId };
}
