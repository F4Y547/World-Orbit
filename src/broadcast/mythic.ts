import type { WorldState } from '../sim/types';

export type MythicTier = 'legendary' | 'mythic';

export interface MythicEvent {
  id: string;
  tier: MythicTier;
  name: string;
  description: string;
  headline: string;
  actors: string[];
  triggerDay: number;
  durationDays: number;
  resolved: boolean;
  result: string | null;
  score: number;
}

const LEGENDARY_TEMPLATES = [
  { name: 'The Great Betrayal', headline: 'Trusted ally turns against partner', actors: 2 },
  { name: 'Economic Collapse', headline: 'Major economy enters freefall', actors: 1 },
  { name: 'Revolution', headline: 'People rise against leadership', actors: 1 },
  { name: 'Superpower Standoff', headline: 'Two giants face off', actors: 2 },
  { name: 'Scientific Breakthrough', headline: 'World-changing discovery announced', actors: 1 },
  { name: 'Military Coup', headline: 'Armed forces seize power', actors: 1 },
  { name: 'Peace Summit', headline: 'Historic peace agreement signed', actors: 3 },
  { name: 'Resource War', headline: 'Critical resource triggers conflict', actors: 2 },
];

const MYTHIC_TEMPLATES = [
  { name: 'The Unknown Signal', headline: 'Mysterious transmission detected worldwide', description: 'Nobody knows what caused it. The audience predicts what happens.' },
  { name: 'The Great Silence', headline: 'All communications go dark for 48 hours', description: 'The world holds its breath as information flow stops completely.' },
  { name: 'The Alliance of Enemies', headline: 'Historic rivals form unexpected pact', description: 'Two nations that hated each other for decades join forces.' },
  { name: 'The World Cup', headline: 'Global competition for the first time', description: 'Nations compete in a unprecedented worldwide event.' },
  { name: 'The Collapse', headline: 'Multiple cascading failures across the globe', description: 'When one thing fails, everything fails.' },
];

export class MythicEventSystem {
  private activeEvents: MythicEvent[] = [];
  private completedEvents: MythicEvent[] = [];
  private lastMythicDay = -999;
  private lastLegendaryDay = -999;
  private mythicCooldownDays = 100;
  private legendaryCooldownDays = 30;

  checkForEvent(world: WorldState): MythicEvent | null {
    const day = world.day;

    const legendaryRoll = world.rngStory();
    if (
      day - this.lastLegendaryDay > this.legendaryCooldownDays &&
      legendaryRoll < 0.02
    ) {
      return this.spawnLegendary(world);
    }

    const mythicRoll = world.rngStory();
    if (
      day - this.lastMythicDay > this.mythicCooldownDays &&
      mythicRoll < 0.003
    ) {
      return this.spawnMythic(world);
    }

    return null;
  }

  private spawnLegendary(world: WorldState): MythicEvent {
    const template = LEGENDARY_TEMPLATES[Math.floor(world.rngStory() * LEGENDARY_TEMPLATES.length)];
    const countries = this.pickCountries(world, template.actors);

    const event: MythicEvent = {
      id: `legendary-${world.day}-${Date.now()}`,
      tier: 'legendary',
      name: template.name,
      description: `${template.headline} — ${countries.join(' vs ')}`,
      headline: template.headline,
      actors: countries,
      triggerDay: world.day,
      durationDays: 3,
      resolved: false,
      result: null,
      score: 90 + Math.floor(world.rngStory() * 10),
    };

    this.activeEvents.push(event);
    this.lastLegendaryDay = world.day;
    return event;
  }

  private spawnMythic(world: WorldState): MythicEvent {
    const template = MYTHIC_TEMPLATES[Math.floor(world.rngStory() * MYTHIC_TEMPLATES.length)];
    const countries = this.pickCountries(world, 3);

    const event: MythicEvent = {
      id: `mythic-${world.day}-${Date.now()}`,
      tier: 'mythic',
      name: template.name,
      description: template.description,
      headline: template.headline,
      actors: countries,
      triggerDay: world.day,
      durationDays: 7,
      resolved: false,
      result: null,
      score: 98,
    };

    this.activeEvents.push(event);
    this.lastMythicDay = world.day;
    return event;
  }

  private pickCountries(world: WorldState, count: number): string[] {
    const codes = world.countries.map((c) => c.def.code);
    const picked: string[] = [];
    for (let i = 0; i < Math.min(count, codes.length); i++) {
      const idx = Math.floor(world.rngStory() * codes.length);
      const code = codes[idx];
      if (!picked.includes(code)) picked.push(code);
    }
    return picked;
  }

  resolveEvent(id: string, result: string): void {
    const event = this.activeEvents.find((e) => e.id === id);
    if (event) {
      event.resolved = true;
      event.result = result;
      this.completedEvents.push(event);
      this.activeEvents = this.activeEvents.filter((e) => e.id !== id);
    }
  }

  getActive(): MythicEvent[] {
    return [...this.activeEvents];
  }

  getCompleted(): MythicEvent[] {
    return [...this.completedEvents];
  }

  getRecentCompleted(count: number): MythicEvent[] {
    return this.completedEvents.slice(-count);
  }

  hasActiveMythic(): boolean {
    return this.activeEvents.some((e) => e.tier === 'mythic');
  }

  hasActiveLegendary(): boolean {
    return this.activeEvents.some((e) => e.tier === 'legendary');
  }

  reset(): void {
    this.activeEvents = [];
    this.completedEvents = [];
    this.lastMythicDay = -999;
    this.lastLegendaryDay = -999;
  }
}
