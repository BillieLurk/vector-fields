import type p5 from "p5";
import { type VectorField } from "./VectorField";

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
  imageColor: [number, number, number] | null = null;
  alive: boolean;
  field: VectorField;
  lifespanOffset: number = 0;

  constructor(p: p5, pos: p5.Vector, millis: number, field: VectorField, lifespan: number = 30000) {
    this.p = p;
    this.pos = pos;
    this.vel = p.createVector(0, 0);
    this.w = 1;
    this.createdAt = millis;
    this.field = field;
    if (field.imagePixels) {
      this.spawnOnImage(millis);
    }
    this.colorIndex = this.pickColor();
    this.alive = true;
    this.lifespanOffset = p.random(-lifespan / 2, lifespan / 2);
  }

  private spawnOnImage(millis: number) {
    const pos = this.field.getRandomOpaquePos();
    if (pos) {
      this.pos.x = pos[0];
      this.pos.y = pos[1];
    }
    this.createdAt = millis;
    this.imageColor = this.field.getImageColor(this.pos.x, this.pos.y);
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

  respawn(millis: number, lifespan: number = 30000) {
    if (this.field.imagePixels) {
      this.spawnOnImage(millis);
    } else {
      this.pos.x = this.p.random(this.field.size.x);
      this.pos.y = this.p.random(this.field.size.y);
      this.createdAt = millis;
    }
    this.alpha = 0;
    this.lifespanOffset = this.p.random(-lifespan / 2, lifespan / 2);
    this.colorIndex = this.pickColor();
  }

  update(millis: number, respawn: boolean, lifespan: number, fadeInMs: number, maxAlpha: number) {
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
        this.respawn(millis, lifespan);
      } else {
        this.alive = false;
      }
    }

    const ageMs = millis - this.createdAt;
    const totalLife = lifespan + this.lifespanOffset;
    const timeLeft = this.createdAt + totalLife - millis;
    const fadeIn = Math.min(1, ageMs / fadeInMs);
    const fadeOut = Math.min(1, timeLeft / fadeInMs);
    this.alpha = maxAlpha * Math.min(fadeIn, fadeOut);
    if (timeLeft <= 0) {
      if (respawn) {
        this.respawn(millis, lifespan);
      } else {
        this.alive = false;
      }
    }
  }

  draw() {
    if (!this.alive || this.createdAt < 1) return;
    if (this.imageColor) {
      const [r, g, b] = this.imageColor;
      this.p.stroke(r, g, b, this.alpha);
    } else {
      const [r, g, b] = PALETTE.colors[this.colorIndex];
      this.p.stroke(r, g, b, this.alpha);
    }
    this.p.ellipse(this.pos.x, this.pos.y, this.w);
  }

  drawTo(g: p5.Graphics) {
    if (this.createdAt < 1) return;

    g.ellipse(this.pos.x, this.pos.y, this.w);
  }
}
