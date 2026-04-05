<script lang="ts">
    import P5 from "./P5.svelte";
    import { TracerEntity, PALETTE } from "../objects/TracerEntity";
    import {
        VectorField,
        type NoiseMode,
        type CurlParams,
        type NormalParams,
        type WorleyParams,
        type ImageParams,
        CURL_DEFAULTS,
        NORMAL_DEFAULTS,
        WORLEY_DEFAULTS,
        IMAGE_DEFAULTS,
    } from "../objects/VectorField";
    import type p5 from "p5";
    import fadeFrag from "../shaders/fade.frag?raw";
    import { Muxer, ArrayBufferTarget } from "webm-muxer";

    const BORDER = 40;
    const INNER = 700;
    const CANVAS = INNER + BORDER * 2;
    const NUM_TRACERS = 10000;

    let respawn = $state(true);
    let paused = $state(true);
    let fadeAmount = $state(0.0);
    let lifespan = $state(30000);
    let fadeInMs = $state(3000);
    let maxAlpha = $state(20);

    let fps = $state(0);
    let noiseMode: NoiseMode = $state("curl");
    let curlParams: CurlParams = $state({ ...CURL_DEFAULTS });
    let normalParams: NormalParams = $state({ ...NORMAL_DEFAULTS });
    let worleyParams: WorleyParams = $state({ ...WORLEY_DEFAULTS });
    let imageParams: ImageParams = $state({ ...IMAGE_DEFAULTS });
    let noiseParams = $derived(
        noiseMode === "curl"
            ? curlParams
            : noiseMode === "worley"
              ? worleyParams
              : noiseMode === "image"
                ? imageParams
                : normalParams,
    );

    let resetFn: (() => void) | null = null;
    let fetchPaletteFn: (() => void) | null = null;
    let resetAllFn: (() => void) | null = null;
    let togglePauseFn: (() => void) | null = null;
    let rebuildFieldFn: (() => void) | null = null;
    let imagePixels: [number, number, number, number][][] | null = $state(null);
    let loadImageFn: ((file: File) => void) | null = null;
    let imageName: string | null = $state(null);
    let dragging = $state(false);
    let recording = $state(false);
    let muxer: Muxer<ArrayBufferTarget> | null = null;
    let videoEncoder: VideoEncoder | null = null;
    let recordFrame = 0;
    let toggleRecordFn: (() => void) | null = null;

    const sketch = (p: p5) => {
        let field: VectorField;
        let tracers: TracerEntity[] = [];
        let fadeShader: p5.Shader;
        let trailBuffer: p5.Framebuffer;
        // fadeAmount is now controlled by the outer state
        let t = 0;

        const reset = () => {
            tracers = [];
            t = 0;
            p.noiseSeed(p.random(100000));
            field = new VectorField(
                p,
                p.createVector(INNER, INNER),
                noiseMode,
                noiseParams,
                imagePixels,
            );
            for (let i = 0; i < NUM_TRACERS; i++) {
                tracers.push(
                    new TracerEntity(
                        p,
                        p.createVector(p.random(0, INNER), p.random(0, INNER)),
                        p.millis(),
                        field,
                        lifespan,
                    ),
                );
            }
            trailBuffer.begin();
            p.background(noiseMode === "image" ? [0, 0, 0] : PALETTE.bg);
            trailBuffer.end();
        };

        const brightness = (c: number[]) =>
            c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114;

        const fetchPalette = async () => {
            try {
                const res = await fetch("/api/palette");
                const data = await res.json();
                const colors = data.result as number[][];
                colors.sort((a, b) => brightness(a) - brightness(b));
                PALETTE.bg = colors[0];
                PALETTE.colors = colors.slice(1);
                reset();
            } catch (e) {
                console.error("Failed to fetch palette:", e);
            }
        };

        const resetAll = () => {
            const millis = p.millis();
            for (const tracer of tracers) {
                tracer.pos.x = p.random(0, INNER);
                tracer.pos.y = p.random(0, INNER);
                tracer.createdAt = millis;
                tracer.colorIndex = tracer.pickColor();
                tracer.alive = true;
            }
            trailBuffer.begin();
            p.background(noiseMode === "image" ? [0, 0, 0] : PALETTE.bg);
            trailBuffer.end();
        };

        const togglePause = () => {
            paused = !paused;
            if (paused) {
                p.noLoop();
                fps = 0;
            } else {
                p.loop();
            }
        };

        const rebuildField = () => {
            field = new VectorField(
                p,
                p.createVector(INNER, INNER),
                noiseMode,
                noiseParams,
                imagePixels,
            );
            for (const tracer of tracers) {
                tracer.field = field;
            }
        };

        const loadImage = (file: File) => {
            const url = URL.createObjectURL(file);
            p.loadImage(url, (img: p5.Image) => {
                img.resize(INNER, INNER);
                img.loadPixels();
                const px = img.pixels;
                const w = img.width;
                const h = img.height;
                const bf: [number, number, number, number][][] = Array.from(
                    { length: w },
                    () =>
                        Array.from(
                            { length: h },
                            () =>
                                [0, 0, 0, 0] as [
                                    number,
                                    number,
                                    number,
                                    number,
                                ],
                        ),
                );
                for (let i = 0; i < px.length; i += 4) {
                    const idx = i / 4;
                    const x = idx % w;
                    const y = Math.floor(idx / w);
                    bf[x][y] = [px[i], px[i + 1], px[i + 2], px[i + 3]];
                }
                imagePixels = bf;
                imageName = file.name;
                noiseMode = "image";
                URL.revokeObjectURL(url);
                rebuildField();
            });
        };

        const toggleRecord = async () => {
            if (recording && muxer && videoEncoder) {
                await videoEncoder.flush();
                videoEncoder.close();
                muxer.finalize();
                const buf = muxer.target.buffer;
                const blob = new Blob([buf], { type: "video/webm" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "recording.webm";
                a.click();
                URL.revokeObjectURL(url);
                muxer = null;
                videoEncoder = null;
                recording = false;
            } else {
                const canvas = document.querySelector("canvas") as HTMLCanvasElement;
                muxer = new Muxer({
                    target: new ArrayBufferTarget(),
                    video: {
                        codec: "V_VP9",
                        width: canvas.width,
                        height: canvas.height,
                    },
                });
                videoEncoder = new VideoEncoder({
                    output: (chunk, meta) => muxer!.addVideoChunk(chunk, meta ?? undefined),
                    error: (e) => console.error("VideoEncoder error:", e),
                });
                videoEncoder.configure({
                    codec: "vp09.00.10.08",
                    width: canvas.width,
                    height: canvas.height,
                    bitrate: 8_000_000,
                    framerate: 60,
                });
                recordFrame = 0;
                recording = true;
            }
        };

        resetFn = () => reset();
        fetchPaletteFn = () => fetchPalette();
        resetAllFn = () => resetAll();
        togglePauseFn = () => togglePause();
        rebuildFieldFn = () => rebuildField();
        loadImageFn = (file: File) => loadImage(file);
        toggleRecordFn = () => toggleRecord();

        p.keyPressed = () => {
            if (p.key === " ") {
                togglePause();
            }
            if (p.key === ".") {
                fetchPalette();
            }
            if (p.key === ",") {
                resetAll();
            }
        };

        p.setup = () => {
            p.createCanvas(CANVAS, CANVAS, p.WEBGL);
            p.setAttributes("antialias", true);
            p.smooth();

            trailBuffer = p.createFramebuffer({
                antialias: true,
                width: INNER,
                height: INNER,
            });

            fadeShader = p.createFilterShader(fadeFrag);

            field = new VectorField(
                p,
                p.createVector(INNER, INNER),
                noiseMode,
                noiseParams,
                imagePixels,
            );

            for (let i = 0; i < NUM_TRACERS; i++) {
                tracers.push(
                    new TracerEntity(
                        p,
                        p.createVector(p.random(0, INNER), p.random(0, INNER)),
                        p.millis(),
                        field,
                        lifespan,
                    ),
                );
            }

            trailBuffer.begin();
            p.background(noiseMode === "image" ? [0, 0, 0] : PALETTE.bg);
            trailBuffer.end();

            p.noLoop();
        };

        p.draw = () => {
            trailBuffer.begin();

            const bg = noiseMode === "image" ? [0, 0, 0] : PALETTE.bg;
            const bgNorm = bg.map((c) => c / 255);
            fadeShader.setUniform("bgColor", bgNorm);
            fadeShader.setUniform("fadeAmount", fadeAmount);
            p.filter(fadeShader);

            p.push();
            p.translate(-INNER / 2, -INNER / 2);
            p.noFill();
            for (let i = 0; i < tracers.length; i++) {
                tracers[i].update(
                    p.millis(),
                    respawn,
                    lifespan,
                    fadeInMs,
                    maxAlpha,
                );
                tracers[i].draw(p.millis());
            }
            p.pop();

            trailBuffer.end();

            p.background(255);

            p.image(
                trailBuffer,
                -p.width / 2 + BORDER,
                -p.height / 2 + BORDER,
                INNER,
                INNER,
            );

            if (p.frameCount % 10 === 0) {
                fps = Math.round(p.frameRate());
            }

            if (recording && videoEncoder) {
                const canvas = document.querySelector("canvas") as HTMLCanvasElement;
                const frame = new VideoFrame(canvas, {
                    timestamp: recordFrame * (1_000_000 / 60),
                });
                videoEncoder.encode(frame);
                frame.close();
                recordFrame++;
            }
        };
    };
</script>

<div class="flex gap-8 items-start w-full">
    <P5 {sketch} />

    <div class="flex flex-col gap-3 pt-2 min-w-[180px] w-full">
        <span class="text-sm text-neutral-400 font-mono">{fps} fps</span>
        <button
            class="px-3 py-1.5 rounded text-sm font-medium {paused
                ? 'bg-amber-500 text-neutral-900'
                : 'bg-neutral-700 text-neutral-300'}"
            onclick={() => togglePauseFn?.()}
        >
            {paused ? "Paused" : "Playing"}
            <span class="text-xs opacity-50 ml-1">[space]</span>
        </button>

        <button
            class="px-3 py-1.5 rounded text-sm font-medium {recording
                ? 'bg-red-500 text-white'
                : 'bg-neutral-700 text-neutral-300'}"
            onclick={() => toggleRecordFn?.()}
        >
            {recording ? "Stop Recording" : "Record"}
        </button>

        <button
            class="px-3 py-1.5 rounded text-sm font-medium {respawn
                ? 'bg-white text-neutral-900'
                : 'bg-neutral-700 text-neutral-300'}"
            onclick={() => (respawn = !respawn)}
        >
            Respawn: {respawn ? "On" : "Off"}
        </button>

        <button
            class="px-3 py-1.5 rounded bg-neutral-700 text-neutral-300 text-sm font-medium hover:bg-neutral-600"
            onclick={() => resetAllFn?.()}
        >
            Reset
            <span class="text-xs opacity-50 ml-1">[,]</span>
        </button>

        <button
            class="px-3 py-1.5 rounded bg-neutral-700 text-neutral-300 text-sm font-medium hover:bg-neutral-600"
            onclick={() => fetchPaletteFn?.()}
        >
            New Palette
            <span class="text-xs opacity-50 ml-1">[.]</span>
        </button>

        <button
            class="px-3 py-1.5 rounded bg-neutral-700 text-neutral-300 text-sm font-medium hover:bg-neutral-600"
            onclick={() => resetFn?.()}
        >
            Refresh
        </button>

        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
            class="border-2 border-dashed rounded p-3 text-center text-sm cursor-pointer transition-colors {dragging
                ? 'border-white text-white bg-neutral-700'
                : 'border-neutral-600 text-neutral-500 hover:border-neutral-400'}"
            ondragover={(e) => {
                e.preventDefault();
                dragging = true;
            }}
            ondragleave={() => {
                dragging = false;
            }}
            ondrop={(e) => {
                e.preventDefault();
                dragging = false;
                const file = e.dataTransfer?.files[0];
                if (file && file.type.startsWith("image/")) loadImageFn?.(file);
            }}
            onclick={() => {
                const input = document.createElement("input");
                input.type = "file";
                input.accept = "image/*";
                input.onchange = () => {
                    const file = input.files?.[0];
                    if (file) loadImageFn?.(file);
                };
                input.click();
            }}
        >
            {#if imageName}
                {imageName}
                <button
                    class="ml-2 text-xs text-neutral-400 hover:text-white"
                    onclick={(e: MouseEvent) => {
                        e.stopPropagation();
                        imagePixels = null;
                        imageName = null;
                        if (noiseMode === "image") {
                            noiseMode = "curl";
                            rebuildFieldFn?.();
                        }
                    }}>[clear]</button
                >
            {:else}
                Drop image or click to load
            {/if}
        </div>

        <label class="flex flex-col gap-1 text-sm text-neutral-400">
            <span
                >Fade: {fadeAmount}
                <span class="text-xs text-neutral-500"
                    >- trail fade out speed</span
                ></span
            >
            <input
                type="range"
                min="0.0"
                max="0.01"
                step="0.0001"
                bind:value={fadeAmount}
                class="accent-white"
            />
        </label>

        <label class="flex flex-col gap-1 text-sm text-neutral-400">
            <span
                >Lifespan: {(lifespan / 1000).toFixed(0)}s
                <span class="text-xs text-neutral-500"
                    >- tracer lifetime before respawn</span
                ></span
            >
            <input
                type="range"
                min="1000"
                max="120000"
                step="1000"
                bind:value={lifespan}
                class="accent-white"
            />
        </label>

        <label class="flex flex-col gap-1 text-sm text-neutral-400">
            <span
                >Fade In: {(fadeInMs / 1000).toFixed(1)}s
                <span class="text-xs text-neutral-500"
                    >- time to reach full opacity</span
                ></span
            >
            <input
                type="range"
                min="100"
                max="10000"
                step="100"
                bind:value={fadeInMs}
                class="accent-white"
            />
        </label>

        <label class="flex flex-col gap-1 text-sm text-neutral-400">
            <span
                >Max Alpha: {maxAlpha}
                <span class="text-xs text-neutral-500"
                    >- tracer max opacity</span
                ></span
            >
            <input
                type="range"
                min="1"
                max="255"
                step="1"
                bind:value={maxAlpha}
                class="accent-white"
            />
        </label>

        <label class="flex flex-col gap-1 text-sm text-neutral-400">
            Noise
            <select
                class="bg-neutral-700 text-neutral-300 rounded px-2 py-1 text-sm"
                bind:value={noiseMode}
                onchange={() => rebuildFieldFn?.()}
            >
                <option value="curl">Curl</option>
                <option value="normal">Normal</option>
                <option value="worley">Worley / Voronoi</option>
                <option value="image" disabled={!imagePixels}>Image</option>
            </select>
        </label>

        {#if noiseMode === "curl"}
            <div class="flex flex-col gap-2 border-t border-neutral-700 pt-2">
                <label class="flex flex-col gap-1 text-sm text-neutral-400">
                    <span
                        >Scale: {curlParams.scale}
                        <span class="text-xs opacity-50"
                            >default: {CURL_DEFAULTS.scale}</span
                        >
                        <span class="text-xs text-neutral-500"
                            >- zoom level of noise</span
                        ></span
                    >
                    <input
                        type="range"
                        min="0.001"
                        max="0.05"
                        step="0.001"
                        bind:value={curlParams.scale}
                        onchange={() => rebuildFieldFn?.()}
                        class="accent-white"
                    />
                </label>

                <label class="flex flex-col gap-1 text-sm text-neutral-400">
                    <span
                        >Speed: {curlParams.speed}
                        <span class="text-xs opacity-50"
                            >default: {CURL_DEFAULTS.speed}</span
                        >
                        <span class="text-xs text-neutral-500"
                            >- particle velocity</span
                        ></span
                    >
                    <input
                        type="range"
                        min="10"
                        max="300"
                        step="5"
                        bind:value={curlParams.speed}
                        onchange={() => rebuildFieldFn?.()}
                        class="accent-white"
                    />
                </label>

                <label class="flex flex-col gap-1 text-sm text-neutral-400">
                    <span
                        >Octaves: {curlParams.octaves}
                        <span class="text-xs opacity-50"
                            >default: {CURL_DEFAULTS.octaves}</span
                        >
                        <span class="text-xs text-neutral-500"
                            >- layers of detail</span
                        ></span
                    >
                    <input
                        type="range"
                        min="1"
                        max="10"
                        step="1"
                        bind:value={curlParams.octaves}
                        onchange={() => rebuildFieldFn?.()}
                        class="accent-white"
                    />
                </label>

                <label class="flex flex-col gap-1 text-sm text-neutral-400">
                    <span
                        >Falloff: {curlParams.falloff}
                        <span class="text-xs opacity-50"
                            >default: {CURL_DEFAULTS.falloff}</span
                        >
                        <span class="text-xs text-neutral-500"
                            >- octave influence</span
                        ></span
                    >
                    <input
                        type="range"
                        min="0.0"
                        max="1.0"
                        step="0.05"
                        bind:value={curlParams.falloff}
                        onchange={() => rebuildFieldFn?.()}
                        class="accent-white"
                    />
                </label>

                <label class="flex flex-col gap-1 text-sm text-neutral-400">
                    <span
                        >Epsilon: {curlParams.epsilon}
                        <span class="text-xs opacity-50"
                            >default: {CURL_DEFAULTS.epsilon}</span
                        >
                        <span class="text-xs text-neutral-500"
                            >- curl smoothness</span
                        ></span
                    >
                    <input
                        type="range"
                        min="1"
                        max="20"
                        step="1"
                        bind:value={curlParams.epsilon}
                        onchange={() => rebuildFieldFn?.()}
                        class="accent-white"
                    />
                </label>

                <label class="flex flex-col gap-1 text-sm text-neutral-400">
                    <span
                        >Angle: {Math.round(
                            (curlParams.angle * 180) / Math.PI,
                        )}°
                        <span class="text-xs opacity-50"
                            >default: {CURL_DEFAULTS.angle}°</span
                        >
                        <span class="text-xs text-neutral-500"
                            >- spiral vs flow</span
                        ></span
                    >
                    <input
                        type="range"
                        min="0"
                        max={Math.PI * 2}
                        step="0.05"
                        bind:value={curlParams.angle}
                        onchange={() => rebuildFieldFn?.()}
                        class="accent-white"
                    />
                </label>
            </div>
        {/if}

        {#if noiseMode === "normal"}
            <div class="flex flex-col gap-2 border-t border-neutral-700 pt-2">
                <label class="flex flex-col gap-1 text-sm text-neutral-400">
                    <span
                        >Scale: {normalParams.scale}
                        <span class="text-xs opacity-50"
                            >default: {NORMAL_DEFAULTS.scale}</span
                        >
                        <span class="text-xs text-neutral-500"
                            >- zoom level of noise</span
                        ></span
                    >
                    <input
                        type="range"
                        min="0.001"
                        max="0.05"
                        step="0.001"
                        bind:value={normalParams.scale}
                        onchange={() => rebuildFieldFn?.()}
                        class="accent-white"
                    />
                </label>

                <label class="flex flex-col gap-1 text-sm text-neutral-400">
                    <span
                        >Rotation: {normalParams.rotation}
                        <span class="text-xs opacity-50"
                            >default: {NORMAL_DEFAULTS.rotation}</span
                        >
                        <span class="text-xs text-neutral-500"
                            >- angle range multiplier</span
                        ></span
                    >
                    <input
                        type="range"
                        min="1"
                        max="16"
                        step="0.5"
                        bind:value={normalParams.rotation}
                        onchange={() => rebuildFieldFn?.()}
                        class="accent-white"
                    />
                </label>

                <label class="flex flex-col gap-1 text-sm text-neutral-400">
                    <span
                        >Octaves: {normalParams.octaves}
                        <span class="text-xs opacity-50"
                            >default: {NORMAL_DEFAULTS.octaves}</span
                        >
                        <span class="text-xs text-neutral-500"
                            >- layers of detail</span
                        ></span
                    >
                    <input
                        type="range"
                        min="1"
                        max="10"
                        step="1"
                        bind:value={normalParams.octaves}
                        onchange={() => rebuildFieldFn?.()}
                        class="accent-white"
                    />
                </label>

                <label class="flex flex-col gap-1 text-sm text-neutral-400">
                    <span
                        >Falloff: {normalParams.falloff}
                        <span class="text-xs opacity-50"
                            >default: {NORMAL_DEFAULTS.falloff}</span
                        >
                        <span class="text-xs text-neutral-500"
                            >- octave influence</span
                        ></span
                    >
                    <input
                        type="range"
                        min="0.0"
                        max="1.0"
                        step="0.05"
                        bind:value={normalParams.falloff}
                        onchange={() => rebuildFieldFn?.()}
                        class="accent-white"
                    />
                </label>
            </div>
        {/if}

        {#if noiseMode === "worley"}
            <div class="flex flex-col gap-2 border-t border-neutral-700 pt-2">
                <label class="flex flex-col gap-1 text-sm text-neutral-400">
                    <span
                        >Points: {worleyParams.numPoints}
                        <span class="text-xs opacity-50"
                            >default: {WORLEY_DEFAULTS.numPoints}</span
                        >
                        <span class="text-xs text-neutral-500"
                            >- number of seed cells</span
                        ></span
                    >
                    <input
                        type="range"
                        min="3"
                        max="100"
                        step="1"
                        bind:value={worleyParams.numPoints}
                        onchange={() => rebuildFieldFn?.()}
                        class="accent-white"
                    />
                </label>

                <label class="flex flex-col gap-1 text-sm text-neutral-400">
                    <span
                        >Speed: {worleyParams.speed}
                        <span class="text-xs opacity-50"
                            >default: {WORLEY_DEFAULTS.speed}</span
                        >
                        <span class="text-xs text-neutral-500"
                            >- particle velocity</span
                        ></span
                    >
                    <input
                        type="range"
                        min="5"
                        max="200"
                        step="5"
                        bind:value={worleyParams.speed}
                        onchange={() => rebuildFieldFn?.()}
                        class="accent-white"
                    />
                </label>

                <label class="flex flex-col gap-1 text-sm text-neutral-400">
                    <span
                        >Epsilon: {worleyParams.epsilon}
                        <span class="text-xs opacity-50"
                            >default: {WORLEY_DEFAULTS.epsilon}</span
                        >
                        <span class="text-xs text-neutral-500"
                            >- curl smoothness</span
                        ></span
                    >
                    <input
                        type="range"
                        min="1"
                        max="20"
                        step="1"
                        bind:value={worleyParams.epsilon}
                        onchange={() => rebuildFieldFn?.()}
                        class="accent-white"
                    />
                </label>

                <label class="flex flex-col gap-1 text-sm text-neutral-400">
                    <span
                        >Angle: {Math.round(
                            (worleyParams.angle * 180) / Math.PI,
                        )}°
                        <span class="text-xs opacity-50"
                            >default: {WORLEY_DEFAULTS.angle}°</span
                        >
                        <span class="text-xs text-neutral-500"
                            >- spiral vs flow</span
                        ></span
                    >
                    <input
                        type="range"
                        min="0"
                        max={Math.PI * 2}
                        step="0.05"
                        bind:value={worleyParams.angle}
                        onchange={() => rebuildFieldFn?.()}
                        class="accent-white"
                    />
                </label>

                <label class="flex flex-col gap-1 text-sm text-neutral-400">
                    Distance
                    <select
                        class="bg-neutral-700 text-neutral-300 rounded px-2 py-1 text-sm"
                        bind:value={worleyParams.distance}
                        onchange={() => rebuildFieldFn?.()}
                    >
                        <option value="euclidean"
                            >Euclidean - round cells</option
                        >
                        <option value="manhattan"
                            >Manhattan - diamond cells</option
                        >
                        <option value="chebyshev"
                            >Chebyshev - square cells</option
                        >
                    </select>
                </label>

                <label class="flex flex-col gap-1 text-sm text-neutral-400">
                    Value
                    <select
                        class="bg-neutral-700 text-neutral-300 rounded px-2 py-1 text-sm"
                        bind:value={worleyParams.value}
                        onchange={() => rebuildFieldFn?.()}
                    >
                        <option value="f1">F1 - nearest point distance</option>
                        <option value="f2">F2 - second nearest distance</option>
                        <option value="f2-f1"
                            >F2-F1 - cell edge highlight</option
                        >
                    </select>
                </label>
            </div>
        {/if}

        {#if noiseMode === "image"}
            <div class="flex flex-col gap-2 border-t border-neutral-700 pt-2">
                <label class="flex flex-col gap-1 text-sm text-neutral-400">
                    <span
                        >Angle Multiplier: {imageParams.angleMultiplier}
                        <span class="text-xs opacity-50"
                            >default: {IMAGE_DEFAULTS.angleMultiplier}</span
                        >
                        <span class="text-xs text-neutral-500"
                            >- brightness to angle range</span
                        ></span
                    >
                    <input
                        type="range"
                        min="0.5"
                        max="16"
                        step="0.5"
                        bind:value={imageParams.angleMultiplier}
                        onchange={() => rebuildFieldFn?.()}
                        class="accent-white"
                    />
                </label>

                <label class="flex flex-col gap-1 text-sm text-neutral-400">
                    <span
                        >Speed: {imageParams.speed}
                        <span class="text-xs opacity-50"
                            >default: {IMAGE_DEFAULTS.speed}</span
                        >
                        <span class="text-xs text-neutral-500"
                            >- particle velocity</span
                        ></span
                    >
                    <input
                        type="range"
                        min="0.1"
                        max="5"
                        step="0.1"
                        bind:value={imageParams.speed}
                        onchange={() => rebuildFieldFn?.()}
                        class="accent-white"
                    />
                </label>

                <label class="flex flex-col gap-1 text-sm text-neutral-400">
                    <span
                        >Noise Scale: {imageParams.noiseScale}
                        <span class="text-xs opacity-50"
                            >default: {IMAGE_DEFAULTS.noiseScale}</span
                        >
                        <span class="text-xs text-neutral-500"
                            >- zoom level of noise</span
                        ></span
                    >
                    <input
                        type="range"
                        min="0.001"
                        max="0.05"
                        step="0.001"
                        bind:value={imageParams.noiseScale}
                        onchange={() => rebuildFieldFn?.()}
                        class="accent-white"
                    />
                </label>

                <label class="flex flex-col gap-1 text-sm text-neutral-400">
                    <span
                        >Octaves: {imageParams.octaves}
                        <span class="text-xs opacity-50"
                            >default: {IMAGE_DEFAULTS.octaves}</span
                        >
                        <span class="text-xs text-neutral-500"
                            >- layers of detail</span
                        ></span
                    >
                    <input
                        type="range"
                        min="1"
                        max="10"
                        step="1"
                        bind:value={imageParams.octaves}
                        onchange={() => rebuildFieldFn?.()}
                        class="accent-white"
                    />
                </label>

                <label class="flex flex-col gap-1 text-sm text-neutral-400">
                    <span
                        >Falloff: {imageParams.falloff}
                        <span class="text-xs opacity-50"
                            >default: {IMAGE_DEFAULTS.falloff}</span
                        >
                        <span class="text-xs text-neutral-500"
                            >- octave influence</span
                        ></span
                    >
                    <input
                        type="range"
                        min="0.0"
                        max="1.0"
                        step="0.05"
                        bind:value={imageParams.falloff}
                        onchange={() => rebuildFieldFn?.()}
                        class="accent-white"
                    />
                </label>

                <label class="flex flex-col gap-1 text-sm text-neutral-400">
                    <span
                        >Noise Mix: {imageParams.noiseMix}
                        <span class="text-xs opacity-50"
                            >default: {IMAGE_DEFAULTS.noiseMix}</span
                        >
                        <span class="text-xs text-neutral-500"
                            >- noise vs image blend</span
                        ></span
                    >
                    <input
                        type="range"
                        min="0.0"
                        max="1.0"
                        step="0.05"
                        bind:value={imageParams.noiseMix}
                        onchange={() => rebuildFieldFn?.()}
                        class="accent-white"
                    />
                </label>
            </div>
        {/if}
    </div>
</div>
