<script lang="ts">
    import P5 from "./P5.svelte";
    import { TracerEntity, PALETTE } from "../objects/TracerEntity";
    import {
        VectorField,
        type NoiseMode,
        type CurlParams,
        type NormalParams,
        CURL_DEFAULTS,
        NORMAL_DEFAULTS,
    } from "../objects/VectorField";
    import type p5 from "p5";
    import fadeFrag from "../shaders/fade.frag?raw";

    const BORDER = 40;
    const INNER = 700;
    const CANVAS = INNER + BORDER * 2;
    const NUM_TRACERS = 8000;

    let respawn = $state(true);
    let paused = $state(true);
    let fadeAmount = $state(0.0);

    let fps = $state(0);
    let noiseMode: NoiseMode = $state("curl");
    let curlParams: CurlParams = $state({ ...CURL_DEFAULTS });
    let normalParams: NormalParams = $state({ ...NORMAL_DEFAULTS });
    let noiseParams = $derived(
        noiseMode === "curl" ? curlParams : normalParams,
    );

    let resetFn: (() => void) | null = null;
    let fetchPaletteFn: (() => void) | null = null;
    let resetAllFn: (() => void) | null = null;
    let togglePauseFn: (() => void) | null = null;
    let rebuildFieldFn: (() => void) | null = null;

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
            );
            for (let i = 0; i < NUM_TRACERS; i++) {
                tracers.push(
                    new TracerEntity(
                        p,
                        p.createVector(p.random(0, INNER), p.random(0, INNER)),
                        p.millis(),
                        field,
                    ),
                );
            }
            trailBuffer.begin();
            p.background(PALETTE.bg);
            trailBuffer.end();
        };

        const brightness = (c: number[]) =>
            c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114;

        const fetchPalette = async () => {
            try {
                const res = await fetch("http://colormind.io/api/", {
                    method: "POST",
                    body: JSON.stringify({ model: "default" }),
                });
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
            p.background(PALETTE.bg);
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
            );
            for (const tracer of tracers) {
                tracer.field = field;
            }
        };

        resetFn = () => reset();
        fetchPaletteFn = () => fetchPalette();
        resetAllFn = () => resetAll();
        togglePauseFn = () => togglePause();
        rebuildFieldFn = () => rebuildField();

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
            );

            for (let i = 0; i < NUM_TRACERS; i++) {
                tracers.push(
                    new TracerEntity(
                        p,
                        p.createVector(p.random(0, INNER), p.random(0, INNER)),
                        p.millis(),
                        field,
                    ),
                );
            }

            trailBuffer.begin();
            p.background(PALETTE.bg);
            trailBuffer.end();

            p.noLoop();
        };

        p.draw = () => {
            trailBuffer.begin();

            const bgNorm = PALETTE.bg.map((c) => c / 255);
            fadeShader.setUniform("bgColor", bgNorm);
            fadeShader.setUniform("fadeAmount", fadeAmount);
            p.filter(fadeShader);

            p.push();
            p.translate(-INNER / 2, -INNER / 2);
            p.noFill();
            for (let i = 0; i < tracers.length; i++) {
                tracers[i].update(p.millis(), respawn);
                tracers[i].draw();
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

        <label class="flex flex-col gap-1 text-sm text-neutral-400">
            <span>Fade: {fadeAmount} <span class="text-xs text-neutral-500">- trail fade out speed</span></span>
            <input type="range" min="0.0" max="0.01" step="0.0001" bind:value={fadeAmount} class="accent-white" />
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
            </select>
        </label>

        {#if noiseMode === "curl"}
            <div class="flex flex-col gap-2 border-t border-neutral-700 pt-2">
                <label class="flex flex-col gap-1 text-sm text-neutral-400">
                    <span>Scale: {curlParams.scale} <span class="text-xs opacity-50">default: {CURL_DEFAULTS.scale}</span> <span class="text-xs text-neutral-500">- zoom level of noise</span></span>
                    <input type="range" min="0.001" max="0.05" step="0.001" bind:value={curlParams.scale} onchange={() => rebuildFieldFn?.()} class="accent-white" />
                </label>

                <label class="flex flex-col gap-1 text-sm text-neutral-400">
                    <span>Speed: {curlParams.speed} <span class="text-xs opacity-50">default: {CURL_DEFAULTS.speed}</span> <span class="text-xs text-neutral-500">- particle velocity</span></span>
                    <input type="range" min="10" max="300" step="5" bind:value={curlParams.speed} onchange={() => rebuildFieldFn?.()} class="accent-white" />
                </label>

                <label class="flex flex-col gap-1 text-sm text-neutral-400">
                    <span>Octaves: {curlParams.octaves} <span class="text-xs opacity-50">default: {CURL_DEFAULTS.octaves}</span> <span class="text-xs text-neutral-500">- layers of detail</span></span>
                    <input type="range" min="1" max="10" step="1" bind:value={curlParams.octaves} onchange={() => rebuildFieldFn?.()} class="accent-white" />
                </label>

                <label class="flex flex-col gap-1 text-sm text-neutral-400">
                    <span>Falloff: {curlParams.falloff} <span class="text-xs opacity-50">default: {CURL_DEFAULTS.falloff}</span> <span class="text-xs text-neutral-500">- octave influence</span></span>
                    <input type="range" min="0.0" max="1.0" step="0.05" bind:value={curlParams.falloff} onchange={() => rebuildFieldFn?.()} class="accent-white" />
                </label>

                <label class="flex flex-col gap-1 text-sm text-neutral-400">
                    <span>Epsilon: {curlParams.epsilon} <span class="text-xs opacity-50">default: {CURL_DEFAULTS.epsilon}</span> <span class="text-xs text-neutral-500">- curl smoothness</span></span>
                    <input type="range" min="1" max="20" step="1" bind:value={curlParams.epsilon} onchange={() => rebuildFieldFn?.()} class="accent-white" />
                </label>

                <label class="flex flex-col gap-1 text-sm text-neutral-400">
                    <span>Angle: {Math.round((curlParams.angle * 180) / Math.PI)}° <span class="text-xs opacity-50">default: {CURL_DEFAULTS.angle}°</span> <span class="text-xs text-neutral-500">- spiral vs flow</span></span>
                    <input type="range" min="0" max={Math.PI * 2} step="0.05" bind:value={curlParams.angle} onchange={() => rebuildFieldFn?.()} class="accent-white" />
                </label>
            </div>
        {/if}

        {#if noiseMode === "normal"}
            <div class="flex flex-col gap-2 border-t border-neutral-700 pt-2">
                <label class="flex flex-col gap-1 text-sm text-neutral-400">
                    <span>Scale: {normalParams.scale} <span class="text-xs opacity-50">default: {NORMAL_DEFAULTS.scale}</span> <span class="text-xs text-neutral-500">- zoom level of noise</span></span>
                    <input type="range" min="0.001" max="0.05" step="0.001" bind:value={normalParams.scale} onchange={() => rebuildFieldFn?.()} class="accent-white" />
                </label>

                <label class="flex flex-col gap-1 text-sm text-neutral-400">
                    <span>Rotation: {normalParams.rotation} <span class="text-xs opacity-50">default: {NORMAL_DEFAULTS.rotation}</span> <span class="text-xs text-neutral-500">- angle range multiplier</span></span>
                    <input type="range" min="1" max="16" step="0.5" bind:value={normalParams.rotation} onchange={() => rebuildFieldFn?.()} class="accent-white" />
                </label>

                <label class="flex flex-col gap-1 text-sm text-neutral-400">
                    <span>Octaves: {normalParams.octaves} <span class="text-xs opacity-50">default: {NORMAL_DEFAULTS.octaves}</span> <span class="text-xs text-neutral-500">- layers of detail</span></span>
                    <input type="range" min="1" max="10" step="1" bind:value={normalParams.octaves} onchange={() => rebuildFieldFn?.()} class="accent-white" />
                </label>

                <label class="flex flex-col gap-1 text-sm text-neutral-400">
                    <span>Falloff: {normalParams.falloff} <span class="text-xs opacity-50">default: {NORMAL_DEFAULTS.falloff}</span> <span class="text-xs text-neutral-500">- octave influence</span></span>
                    <input type="range" min="0.0" max="1.0" step="0.05" bind:value={normalParams.falloff} onchange={() => rebuildFieldFn?.()} class="accent-white" />
                </label>
            </div>
        {/if}
    </div>
</div>
