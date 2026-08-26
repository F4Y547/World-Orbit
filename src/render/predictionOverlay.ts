import { Container, Graphics, Text, TextStyle } from 'pixi.js';

export interface PredictionOverlayState {
  visible: boolean;
  title: string;
  subtitle: string;
  options: Array<{ label: string; icon: string; percentage: number }>;
  countdown: number;
  locked: boolean;
  triggeredByEvent: boolean;
}

export class PredictionOverlay {
  private container: Container;
  private bg: Graphics;
  private titleText: Text;
  private subtitleText: Text;
  private countdownText: Text;
  private optionTexts: Text[] = [];
  private optionBgs: Graphics[] = [];
  private lockText: Text;
  private state: PredictionOverlayState;
  private animPhase = 0;

  constructor(parent: Container) {
    this.container = new Container();
    this.container.visible = false;
    this.container.zIndex = 9000;
    parent.addChild(this.container);

    this.bg = new Graphics();
    this.container.addChild(this.bg);

    const style = new TextStyle({
      fontFamily: 'Arial, sans-serif',
      fontSize: 28,
      fontWeight: 'bold',
      fill: '#ffffff',
      align: 'center',
    });

    this.titleText = new Text({ text: '', style: { ...style, fontSize: 32, fill: '#7aa2f7' } });
    this.titleText.anchor.set(0.5, 0);
    this.container.addChild(this.titleText);

    this.subtitleText = new Text({ text: '', style: { ...style, fontSize: 22, fill: '#c0caf5' } });
    this.subtitleText.anchor.set(0.5, 0);
    this.container.addChild(this.subtitleText);

    this.countdownText = new Text({ text: '', style: { ...style, fontSize: 48, fill: '#e0af68', fontWeight: 'bold' } });
    this.countdownText.anchor.set(0.5, 0);
    this.container.addChild(this.countdownText);

    this.lockText = new Text({ text: '', style: { ...style, fontSize: 24, fill: '#f7768e', fontWeight: 'bold' } });
    this.lockText.anchor.set(0.5, 0);
    this.container.addChild(this.lockText);

    this.state = {
      visible: false,
      title: '',
      subtitle: '',
      options: [],
      countdown: 0,
      locked: false,
      triggeredByEvent: false,
    };
  }

  show(
    title: string,
    subtitle: string,
    options: Array<{ label: string; icon: string; percentage: number }>,
    countdown: number,
    triggeredByEvent: boolean = false,
  ): void {
    this.state = {
      visible: true,
      title,
      subtitle,
      options: options.map((o) => ({ ...o })),
      countdown,
      locked: false,
      triggeredByEvent,
    };
    this.container.visible = true;
    this.animPhase = 0;
    this.updateLayout();
  }

  hide(): void {
    this.state.visible = false;
    this.container.visible = false;
  }

  lock(): void {
    this.state.locked = true;
    this.lockText.text = '🔒 PREDICTIONS LOCKED';
    this.lockText.visible = true;
  }

  updatePercentages(options: Array<{ label: string; icon: string; percentage: number }>): void {
    this.state.options = options.map((o) => ({ ...o }));
    this.updateOptionTexts();
  }

  updateCountdown(seconds: number): void {
    this.state.countdown = seconds;
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    this.countdownText.text = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  update(dt: number): void {
    if (!this.state.visible) return;

    this.animPhase += dt;

    if (!this.state.locked) {
      const pulse = Math.sin(this.animPhase * 3) * 0.03 + 1;
      this.countdownText.scale.set(pulse);
    }
  }

  private updateLayout(): void {
    const W = 400;
    const optionH = 44;
    const padY = 16;
    const totalH = 80 + this.state.options.length * (optionH + 8) + 60 + padY * 2;

    this.bg.clear();
    this.bg.roundRect(0, 0, W, totalH, 12);
    this.bg.fill({ color: 0x0a0a12, alpha: 0.92 });
    this.bg.stroke({ width: 2, color: 0x7aa2f7, alpha: 0.6 });

    this.titleText.text = `🔮 ${this.state.title}`;
    this.titleText.position.set(W / 2, padY + 8);

    this.subtitleText.text = this.state.subtitle;
    this.subtitleText.position.set(W / 2, padY + 44);

    this.countdownText.position.set(W / 2, padY + 80);
    this.updateCountdown(this.state.countdown);

    const optionStartY = padY + 140;
    for (const t of this.optionTexts) this.container.removeChild(t);
    for (const b of this.optionBgs) this.container.removeChild(b);
    this.optionTexts = [];
    this.optionBgs = [];

    for (let i = 0; i < this.state.options.length; i++) {
      const opt = this.state.options[i];
      const y = optionStartY + i * (optionH + 8);

      const optBg = new Graphics();
      optBg.roundRect(20, y, W - 40, optionH, 8);
      optBg.fill({ color: 0x1a1a2e });
      optBg.stroke({ width: 1, color: 0x2a2a3a });
      this.container.addChild(optBg);
      this.optionBgs.push(optBg);

      const fillW = (W - 44) * (opt.percentage / 100);
      if (fillW > 0) {
        const fill = new Graphics();
        fill.roundRect(22, y + 2, fillW, optionH - 4, 6);
        fill.fill({ color: 0x7aa2f7, alpha: 0.25 });
        this.container.addChild(fill);
        this.optionBgs.push(fill);
      }

      const optText = new Text({
        text: `${opt.icon} ${opt.label}    ${opt.percentage}%`,
        style: {
          fontFamily: 'Arial, sans-serif',
          fontSize: 20,
          fill: '#c0caf5',
        },
      });
      optText.position.set(32, y + 10);
      this.container.addChild(optText);
      this.optionTexts.push(optText);
    }

    this.lockText.visible = false;
    this.lockText.position.set(W / 2, optionStartY + this.state.options.length * (optionH + 8) + 8);
    this.container.addChild(this.lockText);

    this.container.position.set(
      (1080 - W) / 2,
      (1920 - totalH) / 2,
    );
  }

  private updateOptionTexts(): void {
    for (let i = 0; i < this.optionTexts.length && i < this.state.options.length; i++) {
      const opt = this.state.options[i];
      this.optionTexts[i].text = `${opt.icon} ${opt.label}    ${opt.percentage}%`;
    }
  }

  getState(): PredictionOverlayState {
    return this.state;
  }
}
