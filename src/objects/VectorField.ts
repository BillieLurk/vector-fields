import type p5 from "p5";

export type NoiseMode = "curl" | "normal" | "worley" | "image";

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

export type WorleyDistance = "euclidean" | "manhattan" | "chebyshev";
export type WorleyValue = "f1" | "f2" | "f2-f1";

export interface WorleyParams {
  numPoints: number;
  speed: number;
  epsilon: number;
  angle: number;
  distance: WorleyDistance;
  value: WorleyValue;
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

export interface ImageParams {
  angleMultiplier: number;
  speed: number;
  noiseScale: number;
  octaves: number;
  falloff: number;
  noiseMix: number;
}

export const IMAGE_DEFAULTS: ImageParams = {
  angleMultiplier: 4,
  speed: 1,
  noiseScale: 0.01,
  octaves: 4,
  falloff: 0.5,
  noiseMix: 0.4,
};

export const WORLEY_DEFAULTS: WorleyParams = {
  numPoints: 20,
  speed: 50,
  epsilon: 2,
  angle: 0,
  distance: "euclidean",
  value: "f1",
};

function noice(p: p5, x: number, y: number, t: number, params: NoiseParams) {
  return p.noise(x * params.scale, y * params.scale, t);
}

export class VectorField {
  p: p5;
  size: p5.Vector;
  field: Array<Array<number>>;
  mode: NoiseMode;
  params: CurlParams | NormalParams | WorleyParams | ImageParams;
  /** [r, g, b, a] per pixel, 0-255 */
  imagePixels: [number, number, number, number][][] | null = null;
  /** Precomputed list of [x, y] coords where alpha > 0 */
  opaquePixels: [number, number][] = [];

  constructor(
    p: p5,
    size: p5.Vector,
    mode: NoiseMode = "curl",
    params?: CurlParams | NormalParams | WorleyParams | ImageParams,
    imagePixels?: [number, number, number, number][][] | null,
  ) {
    this.p = p;
    this.size = size;
    this.mode = mode;
    this.imagePixels = imagePixels ?? null;
    // Build opaque pixel list for spawning
    if (this.imagePixels) {
      for (let x = 0; x < size.x; x++) {
        for (let y = 0; y < size.y; y++) {
          if (this.imagePixels[x][y][3] > 0) {
            this.opaquePixels.push([x, y]);
          }
        }
      }
    }
    this.params =
      params ??
      (mode === "curl"
        ? { ...CURL_DEFAULTS }
        : mode === "worley"
          ? { ...WORLEY_DEFAULTS }
          : mode === "image"
            ? { ...IMAGE_DEFAULTS }
            : { ...NORMAL_DEFAULTS });
    this.field = [];

    if (mode === "image") {
      this.buildImageField();
    } else if (mode === "worley") {
      this.buildWorleyField();
    } else {
      const np = this.params as NoiseParams;
      p.noiseDetail(np.octaves, np.falloff);
      for (let x = 0; x < size.x; x++) {
        let col = [];
        for (let y = 0; y < size.y; y++) {
          col.push(noice(p, x, y, 0, np));
        }
        this.field.push(col);
      }
    }
  }

  private buildImageField() {
    const sx = this.size.x;
    const sy = this.size.y;
    const ip = this.params as ImageParams;
    this.p.noiseDetail(ip.octaves, ip.falloff);
    for (let x = 0; x < sx; x++) {
      const col: number[] = [];
      for (let y = 0; y < sy; y++) {
        const n = this.p.noise(x * ip.noiseScale, y * ip.noiseScale);
        if (this.imagePixels) {
          const [r, g, b, a] = this.imagePixels[x][y];
          const brightness = (r + g + b) / 3 / 255;
          const alpha = a / 255;
          const imageVal = brightness * (1 - ip.noiseMix) + n * ip.noiseMix;
          col.push(imageVal * alpha + n * (1 - alpha));
        } else {
          col.push(n);
        }
      }
      this.field.push(col);
    }

  }

  /** Get a random opaque pixel position */
  getRandomOpaquePos(): [number, number] | null {
    if (this.opaquePixels.length === 0) return null;
    return this.opaquePixels[Math.floor(this.p.random(this.opaquePixels.length))];
  }

  /** Get pixel color at position, returns [r, g, b] or null */
  getImageColor(x: number, y: number): [number, number, number] | null {
    if (!this.imagePixels) return null;
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if (ix < 0 || ix >= this.size.x || iy < 0 || iy >= this.size.y) return null;
    const [r, g, b, a] = this.imagePixels[ix][iy];
    if (a === 0) return null;
    return [r, g, b];
  }



  private buildWorleyField() {
    const wp = this.params as WorleyParams;
    const sx = this.size.x;
    const sy = this.size.y;

    // Generate random seed points
    const points: [number, number][] = [];
    for (let i = 0; i < wp.numPoints; i++) {
      points.push([this.p.random(0, sx), this.p.random(0, sy)]);
    }

    const dist = (px: number, py: number, qx: number, qy: number): number => {
      const dx = px - qx;
      const dy = py - qy;
      switch (wp.distance) {
        case "manhattan":
          return Math.abs(dx) + Math.abs(dy);
        case "chebyshev":
          return Math.max(Math.abs(dx), Math.abs(dy));
        default:
          return Math.sqrt(dx * dx + dy * dy);
      }
    };

    const worleyValue = (x: number, y: number): number => {
      let d1 = Infinity;
      let d2 = Infinity;
      for (const [px, py] of points) {
        const d = dist(x, y, px, py);
        if (d < d1) {
          d2 = d1;
          d1 = d;
        } else if (d < d2) {
          d2 = d;
        }
      }
      switch (wp.value) {
        case "f2":
          return d2;
        case "f2-f1":
          return d2 - d1;
        default:
          return d1;
      }
    };

    // Build distance field and track max for normalization
    const raw: number[][] = [];
    let max = 0;
    for (let x = 0; x < sx; x++) {
      const col: number[] = [];
      for (let y = 0; y < sy; y++) {
        const v = worleyValue(x, y);
        if (v > max) max = v;
        col.push(v);
      }
      raw.push(col);
    }

    // Normalize to 0-1
    for (let x = 0; x < sx; x++) {
      const col: number[] = [];
      for (let y = 0; y < sy; y++) {
        col.push(max > 0 ? raw[x][y] / max : 0);
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

    if (this.mode === "image") return this.imageNoise(ix, iy);
    if (this.mode === "normal") return this.normalNoise(ix, iy);
    if (this.mode === "worley") return this.worleyNoise(ix, iy);
    return this.curlNoise(ix, iy);
  }

  private imageNoise(ix: number, iy: number): p5.Vector {
    const params = this.params as ImageParams;
    const v = this.field[ix][iy];
    const angle = (v - 0.5) * this.p.PI * params.angleMultiplier;
    return this.p.createVector(
      this.p.cos(angle) * params.speed,
      this.p.sin(angle) * params.speed,
    );
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
    return this.p.createVector(cx * cos - cy * sin, cx * sin + cy * cos);
  }

  private worleyNoise(ix: number, iy: number): p5.Vector {
    const params = this.params as WorleyParams;
    const e = Math.max(1, Math.round(params.epsilon));
    const n = this.field;
    const dx =
      (ix + e < this.size.x ? n[ix + e][iy] : n[ix][iy]) -
      (ix - e >= 0 ? n[ix - e][iy] : n[ix][iy]);
    const dy =
      (iy + e < this.size.y ? n[ix][iy + e] : n[ix][iy]) -
      (iy - e >= 0 ? n[ix][iy - e] : n[ix][iy]);

    const cx = -dy * params.speed;
    const cy = dx * params.speed;
    const cos = Math.cos(params.angle);
    const sin = Math.sin(params.angle);
    return this.p.createVector(cx * cos - cy * sin, cx * sin + cy * cos);
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
