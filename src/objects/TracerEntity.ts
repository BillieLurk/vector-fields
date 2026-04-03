import type p5 from "p5";
import { type VectorField, fractalNoise } from "./VectorField";

// Color palette - bg is background color
export const PALETTE = {
  bg: [60, 21, 59], // Midnight Violet

  colors: [
    [139, 30, 63], // Dark Amaranth
    [137, 189, 158], // Muted Teal
    [240, 201, 135], // Apricot Cream
    [219, 76, 64], // Cinnabar
  ],
};

export class TracerEntity {
  p: p5;
  w: number;
  alpha: number;
  createdAt: number;
  pos: p5.Vector;
  vel: p5.Vector;
  colorIndex: number;
  alive: boolean;
  field: VectorField;

  constructor(p: p5, pos: p5.Vector, millis: number, field: VectorField) {
    this.p = p;
    this.pos = pos;
    this.vel = p.createVector(0, 0);
    this.w = 1;
    this.createdAt = millis;
    this.field = field;
    this.colorIndex = this.pickColor();
    this.alive = true;
  }

  // Pick a color based on fractal noise at spawn position
  pickColor(): number {
    const noiseVector = this.field.getVector(this.pos.x, this.pos.y);
    // Remap noise for better color distribution
    const remapped = this.p.constrain(
      this.p.map(noiseVector.heading(), -Math.PI, Math.PI, 0, 1),
      0,
      1,
    );
    return Math.floor(remapped * PALETTE.colors.length) % PALETTE.colors.length;
  }

  update(millis: number, respawn: boolean) {
    if (!this.alive) return;

    this.vel = this.field.getVector(this.pos.x, this.pos.y);
    this.pos.add(this.vel);

    const outOfBounds =
      this.pos.x < 0 ||
      this.pos.x >= this.field.size.x ||
      this.pos.y < 0 ||
      this.pos.y >= this.field.size.y;

    if (outOfBounds) {
      if (respawn) {
        this.pos.x = this.p.random(this.field.size.x);
        this.pos.y = this.p.random(this.field.size.y);
        this.createdAt = millis;
        this.colorIndex = this.pickColor();
      } else {
        this.alive = false;
      }
    }

    // Calculate alpha after respawn check so new tracers start at 0
    let lifeTime = millis - this.createdAt;
    const maxAlpha = 20;
    this.alpha = Math.min(maxAlpha, maxAlpha * (lifeTime / 3000));
  }

  draw() {
    if (!this.alive || this.createdAt < 1) return;
    const [r, g, b] = PALETTE.colors[this.colorIndex];
    this.p.stroke(r, g, b, this.alpha);
    this.p.ellipse(this.pos.x, this.pos.y, this.w);
  }

  drawTo(g: p5.Graphics) {
    if (this.createdAt < 1) return;

    g.ellipse(this.pos.x, this.pos.y, this.w);
  }
}
