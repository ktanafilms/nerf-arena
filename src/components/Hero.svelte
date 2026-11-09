<script lang="ts">
  // Portada tipo escaparate: rótulo "NERF" de contorno al fondo, la pistola 3D sobre
  // un pedestal holográfico, suelo en perspectiva y "ARENA" macizo por delante.
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
  <div class="glow"></div>
  <div class="floor"></div>
  <div class="back">Nerf</div>
  <canvas bind:this={canvas} class:hidden={failed}></canvas>
  <div class="front">Arena</div>
</div>
{#if real}
  <p class="credit">
    Modelo «NERF Retaliator» · ThimovanNimwegen ·
    <a href="https://sketchfab.com/3d-models/nerf-retaliator-b119e1463d8f4031aaacd69b03ff5976" target="_blank" rel="noopener"
      >Sketchfab</a
    > · CC BY 4.0
  </p>
{/if}

<style>
  .hero {
    position: relative;
    flex: 1;
    min-height: 0;
    margin: 0 -18px;
    pointer-events: none;
    overflow: hidden;
  }
  /* Resplandor del color del jugador detrás de la pistola */
  .glow {
    position: absolute;
    left: 50%;
    top: 52%;
    width: 130%;
    aspect-ratio: 1;
    transform: translate(-50%, -50%);
    background: radial-gradient(closest-side, color-mix(in srgb, var(--me) 32%, transparent), transparent 70%);
    animation: fade 1s both;
  }
  /* Suelo en perspectiva que se desvanece */
  .floor {
    position: absolute;
    left: -50%;
    right: -50%;
    bottom: -10%;
    height: 48%;
    background:
      repeating-linear-gradient(90deg, color-mix(in srgb, var(--paper) 9%, transparent) 0 1px, transparent 1px 44px),
      repeating-linear-gradient(0deg, color-mix(in srgb, var(--paper) 9%, transparent) 0 1px, transparent 1px 44px);
    transform: perspective(300px) rotateX(62deg);
    transform-origin: 50% 100%;
    mask-image: linear-gradient(to top, #000 10%, transparent 85%);
    -webkit-mask-image: linear-gradient(to top, #000 10%, transparent 85%);
    animation: fade 1.2s 0.2s both;
  }
  .back,
  .front {
    position: absolute;
    left: 0;
    right: 0;
    text-align: center;
    font-family: var(--display);
    font-weight: 900;
    text-transform: uppercase;
    line-height: 0.78;
    letter-spacing: -0.01em;
    white-space: nowrap;
  }
  /* Rótulo de contorno, detrás de todo */
  .back {
    top: 3%;
    font-size: min(50vw, 20vh, 280px);
    color: transparent;
    -webkit-text-stroke: 1.5px color-mix(in srgb, var(--paper) 45%, transparent);
    animation: drop 0.7s 0.1s cubic-bezier(0.2, 0.9, 0.2, 1) both;
  }
  canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: auto;
    touch-action: none;
  }
  canvas.hidden {
    display: none;
  }
  /* Macizo, por delante del pedestal */
  .front {
    bottom: 3%;
    font-size: min(30vw, 12vh, 170px);
    color: var(--me);
    text-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
    animation: rise 0.6s 0.45s cubic-bezier(0.2, 0.9, 0.2, 1) both;
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }
  @keyframes drop {
    from {
      opacity: 0;
      transform: translateY(-24px);
    }
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(24px);
    }
  }
  .credit {
    margin: 4px 0 0;
    font-size: 9px;
    color: var(--mute);
    opacity: 0.7;
    text-align: center;
  }
  .credit a {
    color: inherit;
  }
</style>
