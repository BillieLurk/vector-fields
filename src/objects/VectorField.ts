import type p5 from "p5";

export type NoiseMode = "curl" | "normal";

export interface NoiseParams {
  scale: number;
  octaves: number;
  falloff: number;
}

export interface CurlParams extends NoiseParams {
  speed: number;
  epsilon: number;
  angle: number;
}

export interface NormalParams extends NoiseParams {
  rotation: number;
}

export const CURL_DEFAULTS: CurlParams = {
  scale: 0.01,
  speed: 80,
  epsilon: 1,
  angle: 0,
  octaves: 4,
  falloff: 0.5,
};

export const NORMAL_DEFAULTS: NormalParams = {
  scale: 0.005,
  rotation: 4,
  octaves: 4,
  falloff: 0.5,
};

function noice(p: p5, x: number, y: number, t: number, params: NoiseParams) {
  return p.noise(
    x * params.scale,
    y * params.scale,
    t,
  );
}

export class VectorField {
  p: p5;
  size: p5.Vector;
  field: Array<Array<number>>;
  mode: NoiseMode;
  params: CurlParams | NormalParams;

  constructor(p: p5, size: p5.Vector, mode: NoiseMode = "curl", params?: CurlParams | NormalParams) {
    this.p = p;
    this.size = size;
    this.mode = mode;
    this.params = params ?? (mode === "curl" ? { ...CURL_DEFAULTS } : { ...NORMAL_DEFAULTS });
    this.field = [];

    p.noiseDetail(this.params.octaves, this.params.falloff);

    for (let x = 0; x < size.x; x++) {
      let col = [];
      for (let y = 0; y < size.y; y++) {
        col.push(noice(p, x, y, 0, this.params));
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

    if (this.mode === "normal") return this.normalNoise(ix, iy);
    return this.curlNoise(ix, iy);
  }

  private normalNoise(ix: number, iy: number): p5.Vector {
    const params = this.params as NormalParams;
    const rotation = (this.field[ix][iy] - 0.5) * this.p.PI * params.rotation;
    return this.p.createVector(this.p.cos(rotation), this.p.sin(rotation));
  }

  private curlNoise(ix: number, iy: number): p5.Vector {
    const params = this.params as CurlParams;
    const e = Math.max(1, Math.round(params.epsilon));
    const n = this.field;
    const dx =
      (ix + e < this.size.x ? n[ix + e][iy] : n[ix][iy]) -
      (ix - e >= 0 ? n[ix - e][iy] : n[ix][iy]);
    const dy =
      (iy + e < this.size.y ? n[ix][iy + e] : n[ix][iy]) -
      (iy - e >= 0 ? n[ix][iy - e] : n[ix][iy]);

    // Pure curl: (-dy, dx). Rotate by angle to blend with divergence.
    const cx = -dy * params.speed;
    const cy = dx * params.speed;
    const cos = Math.cos(params.angle);
    const sin = Math.sin(params.angle);
    return this.p.createVector(
      cx * cos - cy * sin,
      cx * sin + cy * cos,
    );
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
