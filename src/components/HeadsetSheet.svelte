<script lang="ts">
  // Activar y probar el mando con los botones de los cascos.
  import { fade, fly } from 'svelte/transition';
  import { app } from '../lib/app.svelte';
  import { remote, remoteSupported, PRESS_TEXT } from '../lib/remote.svelte';
  import { sfx } from '../lib/audio/sfx';

  let { onclose }: { onclose: () => void } = $props();

  let now = $state(Date.now());
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 200);
    return () => clearInterval(t);
  });
  const recent = $derived(remote.last && now - remote.last.at < 2500 ? remote.last : null);
  const meaning = { single: 'Tocado', double: 'Estado (marcador)', triple: 'Anular' } as const;

  // Mientras está abierta la ventana, los toques solo se muestran (no cuentan)
  $effect(() => {
    const prev = remote.onPress;
    remote.onPress = () => sfx.confirm();
    return () => (remote.onPress = prev);
  });

  function toggle() {
    app.unlock();
    if (app.prefs.headset) {
      app.prefs.headset = false;
      remote.stop();
    } else {
      app.prefs.headset = true;
      remote.start();
    }
    app.savePrefs();
  }
</script>

<div class="sheet" transition:fade={{ duration: 120 }}>
  <div class="card" in:fly={{ y: 60, duration: 220 }}>
    <div class="head">
      <h2 class="display">Botones de los cascos</h2>
      <button class="link" onclick={onclose}>Cerrar</button>
    </div>

    {#if !remoteSupported}
      <p class="body">Este navegador no deja a las webs usar los botones de los cascos.</p>
    {:else}
      <button class="row-set" onclick={toggle}>
        <span>
          <b>Usar los cascos como mando</b>
          <small>Con el botón de reproducir/pausar (el del centro, o tocar el auricular)</small>
        </span>
        <span class="toggle" class:on={app.prefs.headset}></span>
      </button>

      <div class="map">
        <div><b class="num">1</b><span>toque</span><i>Tocado <small>(en Tiro al blanco, «mía»)</small></i></div>
        <div><b class="num">2</b><span>toques</span><i>Estado: el narrador dice el marcador</i></div>
        <div><b class="num">3</b><span>toques</span><i>Anular tu última acción</i></div>
      </div>

      {#if app.prefs.headset}
        <div class="test" class:hit={recent}>
          {#if recent}
            <b>{PRESS_TEXT[recent.press]}</b> → {meaning[recent.press]}
          {:else if remote.armed}
            Pruébalo ahora: pulsa el botón de tus cascos
          {:else}
            Toca la pantalla para engancharlos
          {/if}
        </div>
      {/if}

      <p class="note">
        Los botones de volumen (+ y −) no se pueden usar: el móvil no se los pasa a ninguna web. En muchos cascos Bluetooth,
        mantener pulsado + o − salta de pista, y eso sí llega (cuenta como 2 o 3 toques).
      </p>
      <p class="note">
        Para que funcione, la app pone un sonido inaudible en bucle (por eso verás «Nerf Arena» en la pantalla de bloqueo).
        No pongas música a la vez: los cascos le mandarían los toques a la música.
      </p>
    {/if}
  </div>
</div>

<style>
  .sheet {
    position: fixed;
    inset: 0;
    z-index: 120;
    background: rgba(10, 10, 10, 0.9);
    display: flex;
    align-items: flex-end;
  }
  .card {
    width: 100%;
    background: var(--bg-2);
    border-radius: 12px 12px 0 0;
    padding: 18px calc(var(--sar) + 18px) calc(var(--sab) + 18px) calc(var(--sal) + 18px);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
  }
  h2 {
    font-size: clamp(30px, 5vh, 40px);
  }
  .map {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .map div {
    display: grid;
    grid-template-columns: 30px 56px 1fr;
    align-items: baseline;
    gap: 6px;
  }
  .map b {
    font-size: 30px;
    color: var(--me);
    line-height: 1;
  }
  .map span {
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    color: var(--mute);
  }
  .map i {
    font-style: normal;
    font-weight: 600;
    font-size: 15px;
  }
  .map small {
    color: var(--mute);
    font-weight: 500;
  }
  .test {
    background: var(--bg-3);
    border-radius: 6px;
    padding: 12px;
    text-align: center;
    font-weight: 700;
    font-size: 15px;
  }
  .test.hit {
    background: var(--ok);
    color: #06140d;
  }
  .note {
    margin: 0;
    font-size: 12.5px;
    line-height: 1.45;
    color: var(--mute);
  }
</style>
