import type { EventKind } from '../sim/types';
import type { RecordedStory } from './recorder';

export interface ContentPack {
  title: string;
  shortTitle: string;
  hook: string;
  description: string;
  thumbnailText: string;
  hashtags: string[];
  summary: string;
  countries: string[];
  storyScore: number;
  duration: number;
  eventCount: number;
  peakTension: number;
  tier: string;
}

const WAR_HOOKS = [
  'Nobody expected this war to start.',
  'The tension finally boiled over.',
  'Diplomacy failed. War followed.',
  'A single spark ignited the powder keg.',
  'The world held its breath.',
];

const VICTORY_HOOKS = [
  'The underdog just stunned the world.',
  'Against all odds, they prevailed.',
  'The impossible happened today.',
  'History was rewritten in a single battle.',
];

const BETRAYAL_HOOKS = [
  'Their strongest ally just turned against them.',
  'Trust shattered overnight.',
  'The alliance that held the world together just broke.',
  'Nobody saw this betrayal coming.',
];

const MYSTERY_HOOKS = [
  'Something strange just appeared on the map.',
  'An unknown signal disrupted everything.',
  'The world is asking one question: what was that?',
  'No one can explain what just happened.',
];

const CRISIS_HOOKS = [
  'The world\'s strongest country is falling apart.',
  'A superpower is in freefall.',
  'The balance of power just shifted forever.',
  'The old order is crumbling.',
  ];

const ALLIANCE_HOOKS = [
  'Two rivals just joined forces.',
  'The world\'s power map just changed.',
  'This alliance changes everything.',
];

const PEACE_HOOKS = [
  'After months of fighting, peace finally came.',
  'The guns fell silent.',
  'Diplomacy saved the world today.',
];

const ECONOMIC_HOOKS = [
  'Markets are in chaos.',
  'The global economy just took a hit.',
  'A financial earthquake rocked the world.',
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getCountryNames(actors: string[], countryMap: Map<string, string>): string[] {
  return actors.map((id) => countryMap.get(id) ?? id);
}

function getCountryFlags(actors: string[]): string[] {
  const flagMap: Record<string, string> = {
    'usa': '🇺🇸', 'china': '🇨🇳', 'russia': '🇷🇺', 'india': '🇮🇳',
    'japan': '🇯🇵', 'germany': '🇩🇪', 'france': '🇫🇷', 'uk': '🇬🇧',
    'brazil': '🇧🇷', 'canada': '🇨🇦', 'australia': '🇦🇺', 'south-korea': '🇰🇷',
    'mexico': '🇲🇽', 'indonesia': '🇮🇩', 'turkey': '🇹🇷', 'saudi-arabia': '🇸🇦',
    'egypt': '🇪🇬', 'nigeria': '🇳🇬', 'argentina': '🇦🇷', 'italy': '🇮🇹',
    'iran': '🇮🇷',
  };
  return actors.map((id) => flagMap[id] ?? '🌍');
}

function detectStoryType(story: RecordedStory): {
  type: string;
  hook: string;
  emoji: string;
} {
  const kinds = new Set(story.entries.map((e) => e.kind));

  if (kinds.has('war-declared') || kinds.has('battle')) {
    if (kinds.has('victory')) {
      return { type: 'war-victory', hook: pickRandom(VICTORY_HOOKS), emoji: '🏆' };
    }
    if (kinds.has('peace')) {
      return { type: 'war-peace', hook: pickRandom(PEACE_HOOKS), emoji: '🕊' };
    }
    return { type: 'war', hook: pickRandom(WAR_HOOKS), emoji: '⚔️' };
  }

  if (kinds.has('betrayal')) return { type: 'betrayal', hook: pickRandom(BETRAYAL_HOOKS), emoji: '🗡' };
  if (kinds.has('mystery') || kinds.has('mystery-resolve')) return { type: 'mystery', hook: pickRandom(MYSTERY_HOOKS), emoji: '❓' };
  if (kinds.has('superpower-crisis') || kinds.has('rebellion')) return { type: 'crisis', hook: pickRandom(CRISIS_HOOKS), emoji: '💥' };
  if (kinds.has('alliance-form') || kinds.has('massive-alliance')) return { type: 'alliance', hook: pickRandom(ALLIANCE_HOOKS), emoji: '🌐' };
  if (kinds.has('economic-crisis') || kinds.has('boom')) return { type: 'economic', hook: pickRandom(ECONOMIC_HOOKS), emoji: '📉' };

  return { type: 'event', hook: 'Something significant just happened in the world.', emoji: '🌍' };
}

export function generateContentPack(
  story: RecordedStory,
  countryNames: Map<string, string>,
): ContentPack {
  const { type, hook, emoji } = detectStoryType(story);
  const flags = getCountryFlags(story.actors);
  const names = getCountryNames(story.actors, countryNames);

  const duration = story.endTime - story.startTime;
  const durationSec = Math.round(duration);
  const mm = Math.floor(durationSec / 60);
  const ss = durationSec % 60;
  const durationStr = mm > 0 ? `${mm}min ${ss}s` : `${ss}s`;

  const actorDisplay = flags.join(' ') + ' ' + names.join(' vs ');

  const title = `${flags.join(' ')} ${names.join(' vs ')} — ${story.entries[story.entries.length - 1]?.headline ?? 'The Crisis That Changed Everything'}`;
  const shortTitle = `${emoji} ${names.slice(0, 2).join(' vs ')} ${type === 'war' ? 'Just Went to War' : type === 'crisis' ? 'Is Collapsing' : 'Changed Everything'}`;
  const description = [
    `${hook}`,
    ``,
    `Peak tension: ${story.peakTension.toFixed(0)}%`,
    `Events: ${story.entries.length}`,
    `Duration: ${durationStr}`,
    `Story score: ${story.storyScore.toFixed(0)}`,
    ``,
    `Watch the full replay of this world-shaping event.`,
  ].join('\n');

  const thumbnailText = `${story.peakTension.toFixed(0)}% TENSION`;

  const hashtags = [
    '#WorldOrbit',
    '#Simulation',
    '#Geopolitics',
    '#LiveSimulation',
    '#WorldNews',
  ];

  if (type === 'war') hashtags.push('#War', '#Conflict');
  if (type === 'alliance') hashtags.push('#Alliance', '#Diplomacy');
  if (type === 'mystery') hashtags.push('#Mystery', '#Unknown');
  if (type === 'crisis') hashtags.push('#Crisis', '#Breaking');

  const summary = story.entries.map((e, i) => `${String(i + 1).padStart(2, '0')}. ${e.headline}`).join('\n');

  return {
    title,
    shortTitle,
    hook,
    description,
    thumbnailText,
    hashtags,
    summary,
    countries: story.actors,
    storyScore: story.storyScore,
    duration: durationSec,
    eventCount: story.entries.length,
    peakTension: story.peakTension,
    tier: story.storyScore >= 90 ? 'legendary' : story.storyScore >= 80 ? 'excellent' : story.storyScore >= 70 ? 'good' : 'normal',
  };
}

export function generateHook(story: RecordedStory): string {
  return detectStoryType(story).hook;
}

export function generateTitle(story: RecordedStory, countryNames: Map<string, string>): string {
  const names = getCountryNames(story.actors, countryNames);
  const flags = getCountryFlags(story.actors);
  const lastEntry = story.entries[story.entries.length - 1];
  return `${flags.join(' ')} ${names.join(' vs ')} — ${lastEntry?.headline ?? 'The Event That Changed Everything'}`;
}

export function generateShortTitle(story: RecordedStory): string {
  const { emoji, type } = detectStoryType(story);
  const names = story.actors.slice(0, 2).join(' vs ');
  return `${emoji} ${names} ${type === 'war' ? 'Just Went to War' : type === 'crisis' ? 'Is Collapsing' : 'Changed Everything'}`;
}

export function generateThumbnailText(story: RecordedStory): string {
  return `${story.peakTension.toFixed(0)}% TENSION`;
}

export function generateHashtags(story: RecordedStory): string[] {
  const { type } = detectStoryType(story);
  const tags = ['#WorldOrbit', '#Simulation', '#Geopolitics', '#LiveSimulation'];
  if (type === 'war') tags.push('#War');
  if (type === 'alliance') tags.push('#Alliance');
  if (type === 'mystery') tags.push('#Mystery');
  if (type === 'crisis') tags.push('#Crisis');
  return tags;
}
