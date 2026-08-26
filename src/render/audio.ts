export type SoundKind = 'war' | 'victory' | 'mystery' | 'battle' | 'tick' | 'ambient'
  | 'crisis' | 'alliance' | 'betrayal' | 'hook' | 'escalation' | 'resolution';

export class AudioSystem {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private ambientGain: GainNode | null = null;
  private ambientLfo: OscillatorNode | null = null;
  private ambientOsc1: OscillatorNode | null = null;
  private ambientOsc2: OscillatorNode | null = null;
  private ambientLfoGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private muted = false;
  private ambientPlaying = false;
  private globalTension = 0;

  init(): void {
    if (this.ctx) return;
    this.ctx = new AudioContext();

    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -20;
    this.compressor.knee.value = 10;
    this.compressor.ratio.value = 4;
    this.compressor.connect(this.ctx.destination);

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.3;
    this.masterGain.connect(this.compressor);

    this.ambientGain = this.ctx.createGain();
    this.ambientGain.gain.value = 0.15;
    this.ambientGain.connect(this.masterGain);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.5;
    this.sfxGain.connect(this.masterGain);
  }

  resume(): void {
    this.ctx?.resume();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.masterGain) this.masterGain.gain.value = this.muted ? 0 : 0.3;
    return this.muted;
  }

  setGlobalTension(tension: number): void {
    this.globalTension = tension;
    if (!this.ctx || !this.ambientGain) return;
    const baseVol = 0.1 + tension * 0.001;
    this.ambientGain.gain.setTargetAtTime(baseVol, this.ctx.currentTime, 0.5);
    if (this.ambientLfo) {
      const lfoRate = 0.05 + tension * 0.002;
      this.ambientLfo.frequency.setTargetAtTime(lfoRate, this.ctx.currentTime, 0.5);
    }
    if (this.ambientOsc1) {
      const baseFreq = 55 + tension * 0.3;
      this.ambientOsc1.frequency.setTargetAtTime(baseFreq, this.ctx.currentTime, 0.5);
    }
    if (this.ambientOsc2) {
      const baseFreq = 82.5 + tension * 0.4;
      this.ambientOsc2.frequency.setTargetAtTime(baseFreq, this.ctx.currentTime, 0.5);
    }
  }

  startAmbient(): void {
    if (!this.ctx || !this.ambientGain || this.ambientPlaying) return;
    this.ambientPlaying = true;

    const osc1 = this.ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.value = 55;
    this.ambientOsc1 = osc1;
    const osc1Gain = this.ctx.createGain();
    osc1Gain.gain.value = 0.08;
    osc1.connect(osc1Gain);
    osc1Gain.connect(this.ambientGain);
    osc1.start();

    const osc2 = this.ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = 82.5;
    this.ambientOsc2 = osc2;
    const osc2Gain = this.ctx.createGain();
    osc2Gain.gain.value = 0.04;
    osc2.connect(osc2Gain);
    osc2Gain.connect(this.ambientGain);
    osc2.start();

    const lfo = this.ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.05;
    this.ambientLfo = lfo;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 8;
    this.ambientLfoGain = lfoGain;
    lfo.connect(lfoGain);
    lfoGain.connect(osc1.frequency);
    lfo.start();
  }

  play(kind: SoundKind, intensity = 0.5): void {
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const vol = intensity * 0.6;

    switch (kind) {
      case 'war':
        this.playTone(220, 'sawtooth', vol * 0.5, 0.6, now);
        this.playTone(165, 'square', vol * 0.25, 0.8, now + 0.1);
        this.playTone(110, 'sawtooth', vol * 0.35, 1.0, now + 0.2);
        break;
      case 'victory':
        this.playTone(523, 'sine', vol * 0.4, 0.3, now);
        this.playTone(659, 'sine', vol * 0.4, 0.3, now + 0.15);
        this.playTone(784, 'sine', vol * 0.5, 0.5, now + 0.3);
        break;
      case 'mystery':
        this.playTone(440, 'sine', vol * 0.25, 0.4, now);
        this.playTone(466, 'sine', vol * 0.25, 0.4, now + 0.2);
        this.playTone(415, 'sine', vol * 0.25, 0.6, now + 0.4);
        break;
      case 'battle':
        this.playTone(180, 'square', vol * 0.2, 0.15, now);
        this.playTone(200, 'square', vol * 0.15, 0.15, now + 0.05);
        break;
      case 'crisis':
        this.playTone(130, 'sawtooth', vol * 0.3, 0.8, now);
        this.playTone(155, 'square', vol * 0.2, 1.0, now + 0.15);
        this.playTone(98, 'sawtooth', vol * 0.25, 1.2, now + 0.3);
        break;
      case 'alliance':
        this.playTone(440, 'sine', vol * 0.3, 0.4, now);
        this.playTone(554, 'sine', vol * 0.3, 0.4, now + 0.2);
        this.playTone(659, 'sine', vol * 0.4, 0.6, now + 0.4);
        break;
      case 'betrayal':
        this.playTone(311, 'sawtooth', vol * 0.35, 0.3, now);
        this.playTone(277, 'sawtooth', vol * 0.3, 0.4, now + 0.1);
        this.playTone(233, 'square', vol * 0.25, 0.5, now + 0.2);
        break;
      case 'hook':
        this.playTone(370, 'sine', vol * 0.15, 0.6, now);
        this.playTone(387, 'sine', vol * 0.12, 0.5, now + 0.3);
        this.playTone(349, 'sine', vol * 0.1, 0.7, now + 0.5);
        break;
      case 'escalation':
        this.playTone(220, 'sawtooth', vol * 0.2, 0.4, now);
        this.playTone(277, 'square', vol * 0.15, 0.5, now + 0.1);
        this.playTone(330, 'sawtooth', vol * 0.2, 0.6, now + 0.2);
        break;
      case 'resolution':
        this.playTone(523, 'sine', vol * 0.3, 0.5, now);
        this.playTone(440, 'sine', vol * 0.25, 0.6, now + 0.2);
        this.playTone(349, 'sine', vol * 0.2, 0.8, now + 0.4);
        break;
      case 'tick':
        this.playTone(800, 'sine', 0.05, 0.06, now);
        break;
      case 'ambient':
        this.startAmbient();
        break;
    }
  }

  private playTone(
    freq: number,
    type: OscillatorType,
    vol: number,
    duration: number,
    startAt: number,
  ): void {
    if (!this.ctx || !this.sfxGain) return;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, startAt);
    gain.gain.linearRampToValueAtTime(vol, startAt + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, startAt + duration);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(startAt);
    osc.stop(startAt + duration + 0.05);
  }
}
