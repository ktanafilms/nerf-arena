<script lang="ts">
  // Indicador de micro: barras de nivel y, un instante, lo que ha entendido.
  import { voice } from '../lib/voice/recognizer.svelte';

  let { showText = true }: { showText?: boolean } = $props();
  let now = $state(Date.now());
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 250);
    return () => clearInterval(t);
  });
  const recent = $derived(voice.heard && now - voice.heard.at < 2500 ? voice.heard : null);
  const live = $derived(voice.state === 'listening');
  const bad = $derived(voice.state === 'denied' || voice.state === 'unsupported' || voice.state === 'unavailable');
</script>

<div class="mic" class:live class:bad>
  <span class="bars">
    {#each [0, 1, 2, 3] as k}<i style="height:{25 + Math.max(0, Math.min(1, voice.level * 1.8 - k * 0.2)) * 75}%"></i>{/each}
  </span>
  {#if bad}
    <span class="st">Sin micro</span>
  {:else if voice.state === 'loading'}
    <span class="st">Preparando voz {Math.round(voice.progress * 100)}%</span>
  {:else if voice.state === 'tap'}
    <span class="st">Toca para activar el micro</span>
  {:else if !live}
    <span class="st">{voice.state === 'starting' ? 'Micro…' : 'Micro apagado'}</span>
  {/if}
  {#if showText && recent}
    <span class="heard" class:cmd={recent.cmd}>
      {#if recent.cmd}✓ {recent.cmd}{:else}{recent.text.slice(-26)}{/if}
    </span>
  {/if}
</div>

<style>
  .mic {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    font-size: 12px;
    font-weight: 600;
  }
  .bars {
    display: flex;
    align-items: flex-end;
    gap: 2px;
    height: 16px;
  }
  .bars i {
    width: 4px;
    background: currentColor;
    opacity: 0.35;
    transition: height 0.08s linear;
  }
  .live .bars i {
    opacity: 1;
  }
  .bad .bars i {
    height: 25% !important;
  }
  .st {
    opacity: 0.7;
  }
  .heard {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 48vw;
    opacity: 0.75;
  }
  .heard.cmd {
    opacity: 1;
    font-weight: 800;
    text-transform: uppercase;
  }
</style>
