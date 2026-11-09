<script lang="ts">
  // Portada: rótulo "NERF" de contorno al fondo, modelo 3D sobre pedestal holográfico
  // y "ARENA" macizo por delante del modelo.
  import { onDestroy, onMount } from 'svelte';
  import type { Hero3D } from '../lib/hero3d';

  let { color }: { color: string } = $props();
  let canvas: HTMLCanvasElement;
  let hero: Hero3D | null = null;
  let real = $state(false);
  let failed = $state(false);

  onMount(async () => {
    try {
      // three.js se carga aparte para no engordar la partida
      const { mountHero3D } = await import('../lib/hero3d');
      hero = mountHero3D(canvas, color, (r) => (real = r));
    } catch {
      failed = true;
    }
  });
  $effect(() => {
    hero?.setColor(color);
  });
  onDestroy(() => hero?.dispose());
</script>

<div class="hero">
  <div class="slab"></div>
  <div class="back">Nerf</div>
  <canvas bind:this={canvas} class:hidden={failed}></canvas>
  <div class="front">Arena</div>
</div>
{#if real}
  <p class="credit">
    Modelo 3D «NERF Retaliator» de ThimovanNimwegen ·
    <a href="https://sketchfab.com/3d-models/nerf-retaliator-b119e1463d8f4031aaacd69b03ff5976" target="_blank" rel="noopener"
      >Sketchfab</a
    >
    · CC BY 4.0
  </p>
{/if}

<style>
  .hero {
    position: relative;
    flex: 1;
    min-height: 0;
    margin: 0 -18px;
    pointer-events: none;
  }
  .slab {
    position: absolute;
    left: -30%;
    right: -30%;
    top: 34%;
    height: 30%;
    background: var(--me);
    transform: rotate(-9deg);
    z-index: 0;
    animation: slab-in 0.6s cubic-bezier(0.7, 0, 0.2, 1) both;
  }
  @keyframes slab-in {
    from {
      transform: rotate(-9deg) translateX(-110%);
    }
  }
  .back,
  .front {
    position: absolute;
    font-family: var(--display);
    font-weight: 900;
    text-transform: uppercase;
    line-height: 0.78;
    letter-spacing: -0.02em;
    white-space: nowrap;
  }
  /* Rótulo gigante solo con contorno, detrás de todo */
  .back {
    z-index: 1;
    left: 50%;
    top: 2%;
    transform: translateX(-50%);
    font-size: min(54vw, 22vh, 290px);
    color: transparent;
    -webkit-text-stroke: 2px color-mix(in srgb, var(--paper) 60%, transparent);
    animation: fade-in 0.5s 0.2s both;
  }
  canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    z-index: 2;
    pointer-events: auto;
    touch-action: pan-y;
  }
  canvas.hidden {
    display: none;
  }
  /* Macizo y por delante del modelo */
  .front {
    z-index: 3;
    right: 16px;
    bottom: 6%;
    font-size: min(30vw, 14vh, 190px);
    color: var(--paper);
    text-shadow: 0 6px 20px rgba(0, 0, 0, 0.4);
    animation: slide-in 0.45s 0.35s cubic-bezier(0.2, 0.9, 0.2, 1) both;
  }
  @keyframes fade-in {
    from {
      opacity: 0;
    }
  }
  @keyframes slide-in {
    from {
      opacity: 0;
      transform: translateX(60px);
    }
  }
  .credit {
    margin: 0;
    font-size: 9.5px;
    color: var(--mute);
    text-align: center;
  }
  .credit a {
    color: inherit;
  }
</style>
