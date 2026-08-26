import { Application, Container } from 'pixi.js';
import { CONFIG } from '../config';

export interface StageHandles {
  app: Application;
  background: Container;
  world: Container;
  wrap: HTMLDivElement;
}

export async function createStage(mount: HTMLElement): Promise<StageHandles> {
  const app = new Application();
  await app.init({
    width: CONFIG.width,
    height: CONFIG.height,
    backgroundColor: 0x04060e,
    antialias: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: false,
  });

  const wrap = document.createElement('div');
  wrap.id = 'stage-wrap';
  app.canvas.id = 'scene';
  wrap.appendChild(app.canvas);
  mount.appendChild(wrap);

  const background = new Container();
  const world = new Container();
  world.sortableChildren = true;
  app.stage.addChild(background, world);

  const fit = (): void => {
    const s = Math.min(window.innerWidth / CONFIG.width, window.innerHeight / CONFIG.height);
    app.canvas.style.width = `${Math.floor(CONFIG.width * s)}px`;
    app.canvas.style.height = `${Math.floor(CONFIG.height * s)}px`;
  };
  window.addEventListener('resize', fit);
  fit();

  return { app, background, world, wrap };
}
