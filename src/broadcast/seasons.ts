export interface WorldSeason {
  id: number;
  name: string;
  subtitle: string;
  startDay: number;
  endDay: number;
  status: 'upcoming' | 'active' | 'completed';
  eventsOccurred: number;
  legendaryCount: number;
  mythicCount: number;
  dominantCountry: string | null;
  highlights: string[];
}

const SEASON_TEMPLATES: Omit<WorldSeason, 'id' | 'startDay' | 'endDay' | 'status' | 'eventsOccurred' | 'legendaryCount' | 'mythicCount' | 'dominantCountry' | 'highlights'>[] = [
  { name: 'The First Age', subtitle: 'Dawn of Nations' },
  { name: 'The Age of Alliances', subtitle: 'Bonds Forged in Steel' },
  { name: 'The Great Collapse', subtitle: 'When Empires Fall' },
  { name: 'The Reformation', subtitle: 'Rise from Ashes' },
  { name: 'The Age of Shadows', subtitle: 'Secrets and Betrayals' },
  { name: 'The Golden Era', subtitle: 'Prosperity and Pride' },
  { name: 'The Final War', subtitle: 'For Everything' },
  { name: 'The New World', subtitle: 'What Comes After' },
];

export class SeasonManager {
  private seasons: WorldSeason[] = [];
  private currentSeasonId = 1;
  private seasonLength = 500;

  constructor(seasonLengthDays = 500) {
    this.seasonLength = seasonLengthDays;
    this.initSeasons();
  }

  private initSeasons(): void {
    for (let i = 0; i < SEASON_TEMPLATES.length; i++) {
      const tmpl = SEASON_TEMPLATES[i];
      this.seasons.push({
        id: i + 1,
        name: tmpl.name,
        subtitle: tmpl.subtitle,
        startDay: i * this.seasonLength + 1,
        endDay: (i + 1) * this.seasonLength,
        status: i === 0 ? 'active' : 'upcoming',
        eventsOccurred: 0,
        legendaryCount: 0,
        mythicCount: 0,
        dominantCountry: null,
        highlights: [],
      });
    }
  }

  onEvent(day: number, tier: string, headline: string, country: string): void {
    const season = this.getSeasonAtDay(day);
    if (!season) return;
    season.eventsOccurred++;
    if (tier === 'legendary') season.legendaryCount++;
    if (tier === 'mythic') season.mythicCount++;
    if (headline) season.highlights.push(headline);
    if (season.highlights.length > 20) season.highlights.shift();
  }

  onDayChange(day: number): WorldSeason | null {
    const prev = this.getCurrentSeason();
    const next = this.getSeasonAtDay(day);
    if (!next || prev?.id === next.id) return null;

    if (prev) prev.status = 'completed';
    next.status = 'active';
    this.currentSeasonId = next.id;
    return next;
  }

  getCurrentSeason(): WorldSeason {
    return this.seasons.find((s) => s.status === 'active') ?? this.seasons[0];
  }

  getSeasonAtDay(day: number): WorldSeason {
    for (const season of this.seasons) {
      if (day >= season.startDay && day <= season.endDay) return season;
    }
    return this.seasons[this.seasons.length - 1];
  }

  getSeasonHistory(): WorldSeason[] {
    return this.seasons.filter((s) => s.status === 'completed');
  }

  getAllSeasons(): WorldSeason[] {
    return [...this.seasons];
  }

  getSeasonProgress(day: number): number {
    const season = this.getSeasonAtDay(day);
    const elapsed = day - season.startDay;
    return elapsed / (season.endDay - season.startDay);
  }

  getDaysRemaining(day: number): number {
    const season = this.getSeasonAtDay(day);
    return Math.max(0, season.endDay - day);
  }

  reset(): void {
    this.seasons = [];
    this.currentSeasonId = 1;
    this.initSeasons();
  }
}
