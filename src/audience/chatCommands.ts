import type { CitizenProfile } from './citizen';
import type { PredictionStore } from './prediction';
import type { Leaderboard } from './leaderboard';

export interface ParsedCommand {
  command: string;
  args: string[];
  raw: string;
  citizenId: string;
}

export interface CommandResponse {
  text: string;
  isSystem: boolean;
  affectsSimulation: boolean;
}

export type CommandHandler = (
  parsed: ParsedCommand,
  ctx: CommandContext,
) => CommandResponse | null;

export interface CommandContext {
  citizen: CitizenProfile | undefined;
  predictionStore: PredictionStore;
  leaderboard: Leaderboard;
  worldTime: number;
  worldDay: number;
}

const COMMAND_REGISTRY = new Map<string, { handler: CommandHandler; description: string; cost: number }>();

export function registerCommand(name: string, handler: CommandHandler, description: string, cost: number = 5): void {
  COMMAND_REGISTRY.set(name, { handler, description, cost });
}

export function parseCommand(raw: string, citizenId: string): ParsedCommand | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('!')) return null;

  const parts = trimmed.slice(1).split(/\s+/);
  if (parts.length === 0) return null;

  return {
    command: parts[0].toLowerCase(),
    args: parts.slice(1),
    raw: trimmed,
    citizenId,
  };
}

export function executeCommand(parsed: ParsedCommand, ctx: CommandContext): CommandResponse {
  const entry = COMMAND_REGISTRY.get(parsed.command);
  if (!entry) {
    return { text: `Unknown command: !${parsed.command}. Type !help for commands.`, isSystem: true, affectsSimulation: false };
  }

  const result = entry.handler(parsed, ctx);
  return result ?? { text: `Command !${parsed.command} produced no output.`, isSystem: true, affectsSimulation: false };
}

export function getCommandList(): Array<{ name: string; description: string; cost: number }> {
  return Array.from(COMMAND_REGISTRY.entries()).map(([name, entry]) => ({
    name,
    description: entry.description,
    cost: entry.cost,
  }));
}

registerCommand('help', (_parsed, _ctx) => {
  const cmds = getCommandList();
  const lines = cmds.map((c) => `!${c.name} — ${c.description}`);
  return { text: lines.join('\n'), isSystem: true, affectsSimulation: false };
}, 'Show available commands', 0);

registerCommand('predict', (parsed, ctx) => {
  if (!ctx.citizen) return { text: 'You need a citizen profile first.', isSystem: true, affectsSimulation: false };
  if (parsed.args.length === 0) return { text: 'Usage: !predict <war|peace|deal|other>', isSystem: true, affectsSimulation: false };

  const option = parsed.args[0].toLowerCase();
  const valid = ['war', 'peace', 'deal', 'other'];
  if (!valid.includes(option)) return { text: `Invalid option. Use: ${valid.join(', ')}`, isSystem: true, affectsSimulation: false };

  return { text: `Prediction registered: ${option.toUpperCase()}`, isSystem: false, affectsSimulation: false };
}, 'Make a prediction (war/peace/deal/other)', 10);

registerCommand('country', (parsed, ctx) => {
  if (parsed.args.length === 0) return { text: 'Usage: !country <id>', isSystem: true, affectsSimulation: false };

  const countryId = parsed.args[0].toLowerCase();
  return { text: `Viewing country: ${countryId}`, isSystem: false, affectsSimulation: false };
}, 'View a country\'s status', 0);

registerCommand('war', (_parsed, _ctx) => {
  return { text: 'Active wars will be displayed.', isSystem: false, affectsSimulation: false };
}, 'Show active wars', 0);

registerCommand('leaderboard', (_parsed, ctx) => {
  const top = ctx.leaderboard.getTop(5);
  if (top.length === 0) return { text: 'No citizens yet.', isSystem: true, affectsSimulation: false };

  const lines = top.map((e, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
    return `${medal} ${e.displayName} — ${e.xp} XP (Lv.${e.level})`;
  });

  return { text: lines.join('\n'), isSystem: false, affectsSimulation: false };
}, 'Show top 5 citizens', 0);

registerCommand('world', (_parsed, _ctx) => {
  return { text: 'World overview will be displayed.', isSystem: false, affectsSimulation: false };
}, 'Show world overview', 0);

registerCommand('stats', (_parsed, ctx) => {
  const stats = ctx.leaderboard.getGlobalStats();
  return {
    text: [
      `Citizens: ${stats.totalCitizens}`,
      `Predictions: ${stats.totalPredictions}`,
      `Accuracy: ${(stats.averageAccuracy * 100).toFixed(1)}%`,
      `Events witnessed: ${stats.totalEventsWitnessed}`,
      `Active today: ${stats.activeToday}`,
    ].join(' | '),
    isSystem: false,
    affectsSimulation: false,
  };
}, 'Show global stats', 0);

registerCommand('profile', (parsed, ctx) => {
  const target = parsed.args[0];
  let profile = ctx.citizen;
  if (target) {
    profile = ctx.leaderboard.getCitizen(target);
  }
  if (!profile) return { text: 'Citizen not found.', isSystem: true, affectsSimulation: false };

  return {
    text: [
      `${profile.displayName} — Level ${profile.level}`,
      `XP: ${profile.xp}/${profile.xpToNextLevel}`,
      `Predictions: ${profile.predictionsMade} (${(profile.predictionAccuracy * 100).toFixed(0)}% accurate)`,
      `Streak: ${profile.currentStreak} (best: ${profile.bestStreak})`,
      `Events witnessed: ${profile.eventsWitnessed}`,
      `Badges: ${profile.badges.join(' ') || 'none'}`,
    ].join('\n'),
    isSystem: false,
    affectsSimulation: false,
  };
}, 'View citizen profile', 0);

registerCommand('vote', (parsed, ctx) => {
  if (parsed.args.length === 0) return { text: 'Usage: !vote <option>', isSystem: true, affectsSimulation: false };
  if (!ctx.citizen) return { text: 'You need a citizen profile first.', isSystem: true, affectsSimulation: false };
  return { text: `Vote recorded: ${parsed.args[0].toUpperCase()}`, isSystem: false, affectsSimulation: true };
}, 'Vote on current event', 15);
