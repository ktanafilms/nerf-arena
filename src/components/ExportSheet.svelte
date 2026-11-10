<script lang="ts">
  // Todo lo que se puede sacar de una partida (o de toda la sesión) para montar el vídeo.
  import { fade, fly } from 'svelte/transition';
  import type { Room } from '../lib/types';
  import { app } from '../lib/app.svelte';
  import { timeline } from '../lib/fx.svelte';
  import { csv, edl, saveFiles, xmeml } from '../lib/markers';
  import { fmtClock } from '../lib/fx.svelte';
  import { prepareSession, type Gaps } from '../lib/overlay/render';
  import HudExport from './HudExport.svelte';

  /** rooms: partidas disponibles (ordenadas). current: la partida recién jugada, si la hay. */
  let { rooms, current = null, onclose }: { rooms: Room[]; current?: Room | null; onclose: () => void } = $props();
  let hud = $state(false);
  // Con varias partidas, por defecto se exporta toda la sesión
  // svelte-ignore state_referenced_locally
  let all = $state(rooms.length > 1 || !current);
  let gaps = $state<Gaps>('real');
  const sel = $derived(all || !current ? rooms : [current]);
  const many = $derived(sel.length > 1);
  const span = $derived(prepareSession(sel, '16:9', gaps).duration);

  async function copy() {
    try {
      await navigator.clipboard.writeText(sel.map((r) => timeline(r)).join('\n\n'));
      app.showToast('Línea de tiempo copiada');
    } catch {
      app.showToast('No se pudo copiar');
    }
  }
</script>

{#if hud}
  <HudExport rooms={sel} {gaps} onclose={() => (hud = false)} />
{:else}
  <div class="sheet" transition:fade={{ duration: 120 }}>
    <div class="card" in:fly={{ y: 60, duration: 220 }}>
      <div class="head">
        <h2 class="display">Para el vídeo</h2>
        <button class="link" onclick={onclose}>Cerrar</button>
      </div>

      {#if current && rooms.length > 1}
        <div class="seg2">
          <button class:on={!all} onclick={() => (all = false)}>Esta partida</button>
          <button class:on={all} onclick={() => (all = true)}>Toda la sesión · {rooms.length}</button>
        </div>
      {/if}
      {#if many}
        <div class="seg2">
          <button class:on={gaps === 'real'} onclick={() => (gaps = 'real')}>Hora real</button>
          <button class:on={gaps === 'seguidas'} onclick={() => (gaps = 'seguidas')}>Seguidas</button>
        </div>
        <p class="note">
          {sel.length} partidas en un solo archivo · {fmtClock(span)}.
          {gaps === 'real'
            ? 'Cada partida cae a su hora real y los descansos quedan transparentes: casa con una grabación larga sin cortes.'
            : 'Una detrás de otra, sin los descansos. Cada partida tiene su ¡YA! para sincronizar.'}
        </p>
      {/if}

      <button class="opt" onclick={() => (hud = true)}>
        <b>Vídeo del HUD{many ? ' de la sesión' : ''}</b>
        <small>.mov transparente con marcador y jugadas, horizontal o vertical</small>
      </button>
      <button class="opt" onclick={() => saveFiles([xmeml(sel, '16:9', gaps)])}>
        <b>Marcadores para Premiere</b>
        <small>XML: Archivo › Importar. Crea una secuencia con un marcador por jugada</small>
      </button>
      <button class="opt" onclick={() => saveFiles([edl(sel, gaps)])}>
        <b>Marcadores para DaVinci</b>
        <small>EDL: clic derecho en la línea de tiempo › Marcadores › Importar EDL</small>
      </button>
      <button class="opt" onclick={() => saveFiles([csv(sel, gaps)])}>
        <b>Lista de jugadas (CSV)</b>
        <small>Para hoja de cálculo o cualquier editor</small>
      </button>
      <button class="opt" onclick={copy}>
        <b>Copiar línea de tiempo</b>
        <small>Texto con minuto y jugada, también vale para capítulos de YouTube</small>
      </button>
      <p class="note">
        Los marcadores cuentan desde el inicio del vídeo del HUD{many ? ', con un ¡YA! por partida' : ': el ¡YA! está en el segundo 3'}.
      </p>
    </div>
  </div>
{/if}

<style>
  .sheet {
    position: fixed;
    inset: 0;
    z-index: 130;
    background: rgba(10, 10, 10, 0.88);
    display: flex;
    align-items: flex-end;
  }
  .card {
    width: 100%;
    background: var(--bg-2);
    border-radius: 12px 12px 0 0;
    padding: 20px 20px calc(var(--sab) + 20px);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
  }
  h2 {
    font-size: clamp(32px, 6vh, 44px);
  }
  .opt {
    appearance: none;
    border: none;
    text-align: left;
    background: var(--bg-3);
    color: var(--paper);
    border-radius: 6px;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 3px;
    box-shadow: inset 4px 0 0 var(--me);
  }
  .opt b {
    font-family: var(--display);
    font-weight: 900;
    font-size: 22px;
    text-transform: uppercase;
    line-height: 1;
  }
  .opt small {
    font-size: 12px;
    color: var(--mute);
  }
  .opt:active {
    transform: scale(0.98);
  }
  .note {
    margin: 4px 0 0;
    font-size: 12px;
    line-height: 1.4;
    color: var(--mute);
  }
  .seg2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px;
    background: var(--bg-3);
    border-radius: 6px;
    padding: 4px;
  }
  .seg2 button {
    appearance: none;
    border: none;
    background: none;
    color: var(--mute);
    font-family: var(--display);
    font-weight: 900;
    font-size: 18px;
    text-transform: uppercase;
    height: 40px;
    border-radius: 4px;
    white-space: nowrap;
  }
  .seg2 button.on {
    background: var(--me);
    color: var(--me-ink);
  }
</style>
