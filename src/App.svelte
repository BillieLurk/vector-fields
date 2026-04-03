<script lang="ts">
    import P5 from "./lib/P5.svelte";
    import { TracerEntity, PALETTE } from "./objects/TracerEntity";
    import { VectorField } from "./objects/VectorField";
    import type p5 from "p5";
    import fadeFrag from "./shaders/fade.frag?raw";

    const sketch = (p: p5) => {
        let field: VectorField;
        let tracers: TracerEntity[] = [];
        let fadeShader: p5.Shader;
        let trailBuffer: p5.Framebuffer;
        let respawn = true;
        const fadeAmount = 0.0;

        // Reset tracers and clear canvas
        const reset = () => {
            tracers = [];
            for (let i = 0; i < 5000; i++) {
                tracers.push(
                    new TracerEntity(
                        p,
                        p.createVector(
                            p.random(0, p.width),
                            p.random(0, p.height),
                        ),
                        p.millis(),
                    ),
                );
            }
            // Clear the buffer
            trailBuffer.begin();
            p.background(PALETTE.bg);
            trailBuffer.end();
        };

        // Calculate brightness of a color
        const brightness = (c: number[]) =>
            c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114;

        // Fetch random palette from Colormind API
        const fetchPalette = async () => {
            try {
                const res = await fetch("http://colormind.io/api/", {
                    method: "POST",
                    body: JSON.stringify({ model: "default" }),
                });
                const data = await res.json();
                // data.result is array of 5 [r,g,b] colors
                const colors = data.result as number[][];
                // Sort by brightness, darkest first
                colors.sort((a, b) => brightness(a) - brightness(b));
                // Darkest color is bg, rest are tracer colors
                PALETTE.bg = colors[0];
                PALETTE.colors = colors.slice(1);
                reset();
            } catch (e) {
                console.error("Failed to fetch palette:", e);
            }
        };

        p.keyPressed = () => {
            if (p.key === " ") {
                respawn = !respawn;
            }
            if (p.key === "." || p.key === ".") {
                fetchPalette();
            }
        };

        p.setup = () => {
            p.createCanvas(700, 700, p.WEBGL);
            p.setAttributes("antialias", true);
            p.smooth();

            // Create framebuffer to accumulate trails (with antialiasing)
            trailBuffer = p.createFramebuffer({ antialias: true });

            fadeShader = p.createFilterShader(fadeFrag);
            for (let i = 0; i < 5000; i++) {
                tracers.push(
                    new TracerEntity(
                        p,
                        p.createVector(
                            p.random(0, p.width),
                            p.random(0, p.height),
                        ),
                        p.millis(),
                    ),
                );
            }
            field = new VectorField(p, p.createVector(p.width, p.height));

            // Initialize buffer with background
            trailBuffer.begin();
            p.background(PALETTE.bg);
            trailBuffer.end();
        };

        p.draw = () => {
            // Draw into the framebuffer
            trailBuffer.begin();

            // Apply fade to existing content
            const bgNorm = PALETTE.bg.map((c) => c / 255);
            fadeShader.setUniform("bgColor", bgNorm);
            fadeShader.setUniform("fadeAmount", fadeAmount);
            p.filter(fadeShader);

            // Draw new tracer positions
            p.push();
            p.translate(-p.width / 2, -p.height / 2);
            p.noFill();
            for (let i = 0; i < tracers.length; i++) {
                tracers[i].update(field, p.millis(), respawn);
                tracers[i].draw();
            }
            p.pop();

            trailBuffer.end();

            // Display the framebuffer
            p.background(PALETTE.bg);
            p.image(trailBuffer, -p.width / 2, -p.height / 2);
        };
    };
</script>

<main
    class="min-h-screen bg-neutral-900 flex flex-col items-center justify-center gap-6"
>
    <div class="bg-white p-[40px]">
        <P5 {sketch} />
    </div>
</main>
