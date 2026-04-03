precision mediump float;

// p5 filter shaders automatically get the canvas as tex0
varying vec2 vTexCoord;
uniform sampler2D tex0;

uniform vec3 bgColor;
uniform float fadeAmount;

void main() {
    vec4 color = texture2D(tex0, vTexCoord);

    // Fade towards bgColor - works for both light and dark backgrounds
    // If color > bg, subtract; if color < bg, add
    for (int i = 0; i < 3; i++) {
        float c = color[i];
        float bg = bgColor[i];
        if (c > bg) {
            color[i] = max(c - fadeAmount, bg);
        } else if (c < bg) {
            color[i] = min(c + fadeAmount, bg);
        }
    }

    gl_FragColor = vec4(color.rgb, 1.0);
}
