<script lang="ts">
  import p5 from 'p5';
  import { onMount, onDestroy } from 'svelte';

  let { sketch }: { sketch: (p: p5) => void } = $props();
  let container: HTMLDivElement;
  let instance: p5;

  onMount(() => {
    instance = new p5(sketch, container);
  });

  onDestroy(() => {
    instance?.remove();
  });
</script>

<div bind:this={container}></div>
