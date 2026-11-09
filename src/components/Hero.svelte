<script lang="ts">
  // Portada: "NERF" detrás del modelo 3D y "ARENA" delante, sobre una franja diagonal.
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

  export const hasRealModel = () => real;
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
    <a href="https://sketchfab.com/3d-models/nerf-retaliator-b119e1463d8f4031aaacd69b03ff5976" target="_blank" rel="noopener">Sketchfab</a>
    · CC BY 4.0
  </p>
{/if}

<style>
  .hero {
    position: relative;
    height: min(54vh, 520px);
    margin: 0 -20px;
    overflow: visible;
    pointer-events: none;
  }
  .slab {
    position: absolute;
    left: -30%;
    right: -30%;
    top: 30%;
    height: 38%;
    background: var(--me);
    transform: rotate(-9deg);
    animation: slab-in 0.7s cubic-bezier(0.2, 0.8, 0.2, 1) both;
  }
  @keyframes slab-in {
    from {
      transform: rotate(-9deg) translateX(-100%);
    }
  }
  .back,
  .front {
    z-index: 2;
    right: 14px;
    top: 56%;
    font-size: min(36vw, 200px);
    color: var(--paper);
    text-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
    animation: rise 0.6s 0.3s cubic-bezier(0.2, 0.8, 0.2, 1) both;
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(40px);
    }
  }
  .credit {
    margin: 0;
    font-size: 10px;
    color: var(--mute);
    text-align: center;
  }
  .credit a {
    color: inherit;
  }
</style>
