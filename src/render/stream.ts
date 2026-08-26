import type { Application } from 'pixi.js';

export interface StreamState {
  recording: boolean;
  duration: number;
  filename: string;
}

type StateListener = (state: StreamState) => void;

export class StreamOutput {
  private app: Application;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private startTime = 0;
  private filename = '';
  private listeners: StateListener[] = [];

  constructor(app: Application) {
    this.app = app;
  }

  onStateChange(fn: StateListener): void {
    this.listeners.push(fn);
  }

  get state(): StreamState {
    return {
      recording: this.recorder?.state === 'recording',
      duration: this.recorder?.state === 'recording' ? (performance.now() - this.startTime) / 1000 : 0,
      filename: this.filename,
    };
  }

  startRecording(fps = 30, bitrate = 8_000_000): void {
    if (this.recorder?.state === 'recording') return;

    const canvas = this.app.canvas as HTMLCanvasElement;
    if (!canvas) return;

    this.stream = canvas.captureStream(fps);
    this.filename = `world-orbit-${Date.now()}.webm`;
    this.chunks = [];

    const mimeTypes = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
    ];
    let mimeType = '';
    for (const mt of mimeTypes) {
      if (MediaRecorder.isTypeSupported(mt)) {
        mimeType = mt;
        break;
      }
    }

    const opts: MediaRecorderOptions = { videoBitsPerSecond: bitrate };
    if (mimeType) opts.mimeType = mimeType;

    this.recorder = new MediaRecorder(this.stream, opts);
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.onstop = () => this.emitState();
    this.recorder.start(1000);
    this.startTime = performance.now();
    this.emitState();
  }

  stopRecording(): Blob | null {
    if (this.recorder?.state !== 'recording') return null;
    this.recorder.stop();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.emitState();
    return new Blob(this.chunks, { type: this.chunks[0]?.type ?? 'video/webm' });
  }

  downloadRecording(): void {
    const blob = this.stopRecording();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = this.filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  private emitState(): void {
    const s = this.state;
    for (const fn of this.listeners) fn(s);
  }
}
