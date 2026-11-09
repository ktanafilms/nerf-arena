<script lang="ts">
  // Ventana para generar y guardar el vídeo del HUD (fondo transparente).
  import { fade, fly } from 'svelte/transition';
  import type { Room } from '../lib/types';
  import type { Format } from '../lib/overlay/render';
  import { exportHud, SYNC_NOTE, type ExportResult } from '../lib/overlay/export';
  import { app } from '../lib/app.svelte';

  let { room, onclose }: { room: Room; onclose: () => void } = $props();
  let format = $state<Format>('16:9');
  let busy = $state(false);
  let progress = $state(0);
  let result = $state<ExportResult | null>(null);
  let error = $state<string | null>(null);
  let cancelled = false;

  async function go() {
    busy = true;
    error = null;
    result = null;
    progress = 0;
    cancelled = false;
    try {
      result = await exportHud(room, format, (f) => (progress = f), () => cancelled);
    } catch (e: any) {
      if (!cancelled) error = e?.message ?? String(e);
    } finally {
      busy = false;
    }
  }

  async function save() {
    if (!result) return;
    const { file } = result;
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: file.name });
        return;
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    app.showToast('Descargando el vídeo…');
  }

  const mb = (b: number) => (b / 1024 / 1024).toFixed(1).replace('.', ',');
</script>

<div class="sheet" transition:fade={{ duration: 120 }}>
  <div class="card" in:fly={{ y: 60, duration: 220 }}>
    <div class="head">
      <h2 class="display">Vídeo del HUD</h2>
      <button class="link" onclick={() => ((cancelled = true), onclose())}>Cerrar</button>
    </div>
    <p class="body">
      Un .mov con fondo transparente con el marcador, las jugadas y el resultado, para ponerlo encima de vuestras cámaras.
      {SYNC_NOTE}
    </p>

    <div class="formats">
      {#each ['16:9', '9:16'] as f}
        <button class="fmt" class:on={format === f} disabled={busy} onclick={() => ((format = f as Format), (result = null))}>
          <span class="shape" class:v={f === '9:16'}></span>
          <b>{f === '16:9' ? 'Horizontal' : 'Vertical'}</b>
          <small>{f === '16:9' ? '1920×1080' : '1080×1920'}</small>
        </button>
      {/each}
    </div>

    {#if busy}
      <div class="bar"><i style="width:{Math.round(progress * 100)}%"></i></div>
      <p class="body">Generando… {Math.round(progress * 100)}% · deja la pantalla encendida</p>
      <button class="btn ghost small" onclick={() => (cancelled = true)}>Cancelar</button>
    {:else if result}
      <p class="ok">
        Listo: {Math.round(result.seconds)} s · {mb(result.blob.size)} MB
      </p>
      <button class="btn" onclick={save}>Guardar vídeo</button>
      <p class="tip">En iPhone: «Guardar en Archivos» o AirDrop al ordenador. Fotos quita la transparencia.</p>
    {:else}
      {#if error}<p class="err">No se pudo generar: {error}</p>{/if}
      <button class="btn" onclick={go}>Generar vídeo</button>
    {/if}
  </div>
</div>

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
    gap: 12px;
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  h2 {
    font-size: 44px;
  }
  .formats {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .fmt {
    appearance: none;
    border: 2px solid var(--bg-3);
    background: transparent;
    color: var(--paper);
    border-radius: 8px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    font-family: var(--display);
  }
  .fmt.on {
    border-color: var(--me);
    background: color-mix(in srgb, var(--me) 14%, transparent);
  }
  .fmt b {
    font-size: 22px;
    font-weight: 900;
    text-transform: uppercase;
  }
  .fmt small {
    font-family: var(--body);
    font-size: 12px;
    color: var(--mute);
  }
  .shape {
    width: 64px;
    height: 36px;
    border: 3px solid currentColor;
    border-radius: 4px;
  }
  .shape.v {
    width: 26px;
    height: 46px;
  }
  .bar {
    height: 10px;
    background: var(--bg-3);
    transform: skewX(-20deg);
    overflow: hidden;
  }
  .bar i {
    display: block;
    height: 100%;
    background: var(--me);
    transition: width 0.2s;
  }
  .ok {
    margin: 0;
    font-weight: 700;
    color: var(--ok);
  }
  .err {
    margin: 0;
    color: var(--danger);
    font-size: 14px;
  }
  .tip {
    margin: 0;
    font-size: 12px;
    color: var(--mute);
  }
</style>
