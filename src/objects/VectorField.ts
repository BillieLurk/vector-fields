import type p5 from "p5";
import { scale } from "svelte/transition";

// Shared noise settings
export const NOISE_CONFIG = {
  scale: 0.005,
  octaves: 7,
  lacunarity: 2.0,
  persistence: 0.1,
};

// Single source of truth for fractal noise
export function fractalNoise(p: p5, x: number, y: number): number {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let maxValue = 0;

  const { scale, octaves, lacunarity, persistence } = NOISE_CONFIG;

  for (let i = 0; i < octaves; i++) {
    value += amplitude * p.noise(x * scale * frequency, y * scale * frequency);
    maxValue += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }

  return value / maxValue;
}

export class VectorField {
  p: p5;
  size: p5.Vector;
  field: Array<Array<number>>;

  constructor(p: p5, size: p5.Vector) {
    this.p = p;
    this.size = size;
    this.field = [];

    for (let x = 0; x < size.x; x++) {
      let col = [];
      for (let y = 0; y < size.y; y++) {
        col.push(p.noise(x * NOISE_CONFIG.scale, y * NOISE_CONFIG.scale, 0));
      }
      this.field.push(col);
    }
  }

  getVector(x: number, y: number): p5.Vector {
    const ix = Math.floor(x);
    const iy = Math.floor(y);

    // Bounds check
    if (ix < 0 || ix >= this.size.x || iy < 0 || iy >= this.size.y) {
      return this.p.createVector(0, 0);
    }

    // Higher multiplier = small noise variations produce bigger angle changes
    const rotation = (this.field[ix][iy] - 0.5) * this.p.PI * 4;
    return this.p.createVector(this.p.cos(rotation), this.p.sin(rotation));
  }

  update(t: number) {
    for (let x = 0; x < this.size.x; x++) {
      let col = [];
      for (let y = 0; y < this.size.y; y++) {
        col[y] = this.p.noise(
          x * NOISE_CONFIG.scale,
          y * NOISE_CONFIG.scale,
          t,
        );
      }
      this.field[x] = col;
    }
  }

  draw() {
    const step = 10;
    for (let x = 0; x < this.size.x; x += step) {
      for (let y = 0; y < this.size.y; y += step) {
        let vec = this.getVector(x, y);
        this.p.line(x, y, x + vec.x * step, y + vec.y * step);
      }
    }
  }
}
