export interface ChronicleEvent {
  id: string;
  day: number;
  year: number;
  month: number;
  headline: string;
  countries: string[];
  tier: string;
  score: number;
  type: string;
  timestamp: number;
}

export interface ChronicleMonth {
  year: number;
  month: number;
  label: string;
  events: ChronicleEvent[];
}

export interface ChronicleYear {
  year: number;
  months: ChronicleMonth[];
  totalEvents: number;
}

export class WorldChronicle {
  private events: ChronicleEvent[] = [];

  addEvent(event: ChronicleEvent): void {
    this.events.push(event);
    this.events.sort((a, b) => a.day - b.day);
  }

  getYear(year: number): ChronicleYear {
    const yearEvents = this.events.filter((e) => e.year === year);
    const months: ChronicleMonth[] = [];

    for (let m = 1; m <= 12; m++) {
      const monthEvents = yearEvents.filter((e) => e.month === m);
      months.push({
        year,
        month: m,
        label: this.monthLabel(m),
        events: monthEvents,
      });
    }

    return { year, months, totalEvents: yearEvents.length };
  }

  getMonth(year: number, month: number): ChronicleEvent[] {
    return this.events.filter((e) => e.year === year && e.month === month);
  }

  getDayRange(startDay: number, endDay: number): ChronicleEvent[] {
    return this.events.filter((e) => e.day >= startDay && e.day <= endDay);
  }

  getTierEvents(tier: string): ChronicleEvent[] {
    return this.events.filter((e) => e.tier === tier);
  }

  getCountryEvents(country: string): ChronicleEvent[] {
    return this.events.filter((e) => e.countries.includes(country));
  }

  getTopEvents(count: number): ChronicleEvent[] {
    return [...this.events].sort((a, b) => b.score - a.score).slice(0, count);
  }

  getRecentEvents(count: number): ChronicleEvent[] {
    return this.events.slice(-count);
  }

  search(query: string): ChronicleEvent[] {
    const q = query.toLowerCase();
    return this.events.filter(
      (e) =>
        e.headline.toLowerCase().includes(q) ||
        e.countries.some((c) => c.toLowerCase().includes(q)),
    );
  }

  getStats(): { total: number; legendary: number; mythic: number; byTier: Record<string, number> } {
    const byTier: Record<string, number> = {};
    let legendary = 0;
    let mythic = 0;
    for (const e of this.events) {
      byTier[e.tier] = (byTier[e.tier] ?? 0) + 1;
      if (e.tier === 'legendary') legendary++;
      if (e.tier === 'mythic') mythic++;
    }
    return { total: this.events.length, legendary, mythic, byTier };
  }

  formatMonth(year: number, month: number): string {
    const events = this.getMonth(year, month);
    const lines = [`${this.monthLabel(month)} ${year}`, '─'.repeat(20)];
    for (const e of events) {
      const flag = this.countryEmoji(e.countries[0] ?? '');
      lines.push(`${flag} ${e.headline}`);
    }
    return lines.join('\n');
  }

  private monthLabel(m: number): string {
    return ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'][m - 1] ?? '';
  }

  private countryEmoji(code: string): string {
    if (!code) return '🌍';
    return code.toUpperCase().replace(/./g, (c) => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65));
  }

  getEventCount(): number {
    return this.events.length;
  }

  reset(): void {
    this.events = [];
  }
}
