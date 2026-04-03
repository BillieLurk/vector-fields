<script lang="ts">
    import P5 from "./P5.svelte";
    import { TracerEntity, PALETTE } from "../objects/TracerEntity";
    import { VectorField } from "../objects/VectorField";
    import type p5 from "p5";
    import fadeFrag from "../shaders/fade.frag?raw";

    const BORDER = 40;
    const INNER = 700;
    const CANVAS = INNER + BORDER * 2;

    let respawn = $state(true);
    let frozen = $state(false);
    let speed = $state(1000);
    let fps = $state(0);

    let resetFn: (() => void) | null = null;
    let fetchPaletteFn: (() => void) | null = null;
    let respawnAllFn: (() => void) | null = null;

    const sketch = (p: p5) => {
        let field: VectorField;
        let tracers: TracerEntity[] = [];
        let fadeShader: p5.Shader;
        let trailBuffer: p5.Framebuffer;
        const fadeAmount = 0.0;
        let t = 0;

        const reset = () => {
            tracers = [];
            t = 0;
            field = new VectorField(p, p.createVector(INNER, INNER));
            for (let i = 0; i < 5000; i++) {
                tracers.push(
                    new TracerEntity(
                        p,
                        p.createVector(
                            p.random(0, INNER),
                            p.random(0, INNER),
                        ),
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

        const respawnAll = () => {
            const millis = p.millis();
            for (const tracer of tracers) {
                tracer.pos.x = p.random(0, INNER);
                tracer.pos.y = p.random(0, INNER);
                tracer.createdAt = millis;
                tracer.colorIndex = tracer.pickColor();
                tracer.alive = true;
            }
        };

        resetFn = () => reset();
        fetchPaletteFn = () => fetchPalette();
        respawnAllFn = () => respawnAll();

        p.keyPressed = () => {
            if (p.key === " ") {
                frozen = !frozen;
            }
            if (p.key === ".") {
                fetchPalette();
            }
            if (p.key === ",") {
                respawnAll();
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

            field = new VectorField(p, p.createVector(INNER, INNER));

            for (let i = 0; i < 5000; i++) {
                tracers.push(
                    new TracerEntity(
                        p,
                        p.createVector(
                            p.random(0, INNER),
                            p.random(0, INNER),
                        ),
                        p.millis(),
                        field,
                    ),
                );
            }

            trailBuffer.begin();
            p.background(PALETTE.bg);
            trailBuffer.end();
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

            if (!frozen) {
                t += 1 / speed;
            }
            field.update(t);

            if (p.frameCount % 10 === 0) {
                fps = Math.round(p.frameRate());
            }
        };
    };
</script>

<div class="flex gap-8 items-start">
    <P5 {sketch} />

    <div class="flex flex-col gap-3 pt-2 min-w-[180px]">
        <span class="text-sm text-neutral-400 font-mono">{fps} fps</span>
        <button
            class="px-3 py-1.5 rounded text-sm font-medium {frozen
                ? 'bg-amber-500 text-neutral-900'
                : 'bg-neutral-700 text-neutral-300'}"
            onclick={() => (frozen = !frozen)}
        >
            {frozen ? "Frozen" : "Flowing"}
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
            onclick={() => respawnAllFn?.()}
        >
            Respawn All
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
            Speed: {speed}
            <input
                type="range"
                min="100"
                max="5000"
                step="100"
                bind:value={speed}
                class="accent-white"
            />
        </label>
    </div>
</div>
