export interface WarChip {
  aEmoji: string;
  aName: string;
  bEmoji: string;
  bName: string;
  duration: string;
  attackerProb: number;
}

export interface DebugInfo {
  fps: number;
  bodies: number;
  ticks: number;
  hostilePairs: number;
  friendlyPairs: number;
  warsActive: number;
  sinceBig: number;
  avgRelation: number;
  leaderName: string;
}

export class Hud {
  private root: HTMLDivElement;
  private vignette: HTMLDivElement;
  private announce: HTMLDivElement;
  private announceMain: HTMLElement;
  private announceSub: HTMLElement;
  private warsRow: HTMLDivElement;
  private mysteryEl: HTMLDivElement;
  private mysteryText: HTMLElement;
  private mysteryCountdown: HTMLElement;
  private dayLabel: HTMLElement;
  private headlineEl: HTMLDivElement;
  private debugPanel: HTMLDivElement;
  private fpsLabel: HTMLElement;
  private bodiesLabel: HTMLElement;
  private tickLabel: HTMLElement;
  private pairsLabel: HTMLElement;
  private warsLabel: HTMLElement;
  private boreLabel: HTMLElement;
  private leaderLabel: HTMLElement;

  constructor(mount: HTMLElement) {
    this.vignette = document.createElement('div');
    this.vignette.className = 'vignette';

    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.innerHTML = `
      <div class="hud-top">
        <span class="brand">🌍 WORLD ORBIT</span>
        <span class="live"><i></i>LIVE</span>
      </div>
      <div class="wars"></div>
      <div class="mystery hidden">
        <span class="mystery-icon">❓</span>
        <span class="mystery-text" data-mystery-text></span>
        <span class="mystery-countdown" data-mystery-countdown></span>
      </div>
      <div class="announce hidden">
        <div class="announce-main" data-announce-main>⚔️ WAR DECLARED</div>
        <div class="announce-sub" data-announce-sub></div>
      </div>
      <div class="headline" data-headline></div>
      <div class="debug hidden">
        <div>FPS&nbsp;&nbsp;&nbsp;<span data-fps>60</span></div>
        <div>BODIES<span data-bodies>20</span></div>
        <div>TICK&nbsp;&nbsp;<span data-tick>0</span></div>
        <div>PAIRS<span data-pairs>0H/0F</span></div>
        <div>WARS&nbsp;&nbsp;<span data-wars>0</span></div>
        <div>BORE&nbsp;&nbsp;<span data-bore>0</span></div>
        <div>TOP&nbsp;&nbsp;&nbsp;<span data-leader>—</span></div>
      </div>
      <div class="hud-bottom">
        <span data-day>WORLD DAY 001</span>
        <span class="fictional">FICTIONAL SIMULATION</span>
      </div>`;

    mount.appendChild(this.vignette);
    mount.appendChild(this.root);

    this.dayLabel = this.root.querySelector('[data-day]')!;
    this.headlineEl = this.root.querySelector('[data-headline]')!;
    this.debugPanel = this.root.querySelector('.debug')!;
    this.fpsLabel = this.root.querySelector('[data-fps]')!;
    this.bodiesLabel = this.root.querySelector('[data-bodies]')!;
    this.tickLabel = this.root.querySelector('[data-tick]')!;
    this.pairsLabel = this.root.querySelector('[data-pairs]')!;
    this.warsLabel = this.root.querySelector('[data-wars]')!;
    this.boreLabel = this.root.querySelector('[data-bore]')!;
    this.leaderLabel = this.root.querySelector('[data-leader]')!;

    this.announce = this.root.querySelector('.announce')!;
    this.announceMain = this.root.querySelector('[data-announce-main]')!;
    this.announceSub = this.root.querySelector('[data-announce-sub]')!;
    this.warsRow = this.root.querySelector('.wars')!;

    this.mysteryEl = this.root.querySelector('.mystery')!;
    this.mysteryText = this.root.querySelector('[data-mystery-text]')!;
    this.mysteryCountdown = this.root.querySelector('[data-mystery-countdown]')!;
  }

  setDay(day: number): void {
    this.dayLabel.textContent = `WORLD DAY ${String(day).padStart(3, '0')}`;
  }

  showAnnounce(main: string, sub: string): void {
    this.announceMain.textContent = main;
    this.announceSub.textContent = sub;
    this.announce.classList.remove('hidden', 'show');
    void this.announce.offsetWidth;
    this.announce.classList.add('show');
  }

  setWars(chips: WarChip[]): void {
    if (chips.length === 0) {
      this.warsRow.innerHTML = '';
      return;
    }
    this.warsRow.innerHTML = chips
      .map(
        (c) => `
        <div class="warchip">
          <span class="wc-vs">${c.aEmoji} ${c.aName} ⚔️ ${c.bEmoji} ${c.bName}</span>
          <span class="wc-meta">${c.duration} · ${Math.round(c.attackerProb * 100)}%</span>
        </div>`,
      )
      .join('');
  }

  setHeadline(text: string, delta: number): void {
    this.headlineEl.textContent = text;
    this.headlineEl.classList.remove('pos', 'neg', 'show');
    void this.headlineEl.offsetWidth;
    this.headlineEl.classList.add(delta >= 0 ? 'pos' : 'neg', 'show');
  }

  setMystery(text: string | null, remainSec: number): void {
    if (text === null) {
      this.mysteryEl.classList.add('hidden');
      return;
    }
    this.mysteryEl.classList.remove('hidden');
    this.mysteryText.textContent = text;
    const mm = String(Math.floor(remainSec / 60)).padStart(2, '0');
    const ss = String(Math.floor(remainSec % 60)).padStart(2, '0');
    this.mysteryCountdown.textContent = `${mm}:${ss}`;
  }

  setDebug(info: DebugInfo): void {
    this.fpsLabel.textContent = info.fps.toFixed(0);
    this.bodiesLabel.textContent = String(info.bodies);
    this.tickLabel.textContent = String(info.ticks);
    this.pairsLabel.textContent = `${info.hostilePairs}H/${info.friendlyPairs}F`;
    this.warsLabel.textContent = String(info.warsActive);
    this.boreLabel.textContent = `${info.sinceBig.toFixed(0)}s`;
    this.leaderLabel.textContent = info.leaderName;
  }

  toggleDebug(): void {
    this.debugPanel.classList.toggle('hidden');
  }

  toggleHud(): void {
    this.root.classList.toggle('hidden');
  }
}
