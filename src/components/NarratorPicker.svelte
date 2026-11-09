<script lang="ts">
  // Elegir la voz del narrador entre las españolas del móvil.
  import { onMount } from 'svelte';
  import { app } from '../lib/app.svelte';
  import { currentVoiceName, say, setNarratorVoice, spanishVoices, ttsSupported } from '../lib/audio/narrator';

  let voices = $state<{ name: string; lang: string }[]>([]);
  let chosen = $state<string | null>(app.prefs.narratorVoice ?? null);
  const refresh = () => {
    voices = spanishVoices().map((v) => ({ name: v.name, lang: v.lang }));
    if (!chosen) chosen = currentVoiceName();
  };
  onMount(() => {
    refresh();
    const t = setTimeout(refresh, 800); // en algunos móviles las voces llegan tarde
    return () => clearTimeout(t);
  });
  function pick(name: string) {
    chosen = name;
    app.prefs.narratorVoice = name;
    app.savePrefs();
    setNarratorVoice(name);
    say('¡Impacto! Te quedan dos vidas.', { interrupt: true });
  }
</script>

{#if ttsSupported && voices.length}
  <div class="np">
    <label for="np" class="eyebrow">Voz del narrador</label>
    <div class="row">
      <select id="np" value={chosen} onchange={(e) => pick((e.target as HTMLSelectElement).value)}>
        {#each voices as v}<option value={v.name}>{v.name} ({v.lang})</option>{/each}
      </select>
      <button class="play" onclick={() => say('¡Impacto! Te quedan dos vidas.', { interrupt: true })} aria-label="Escuchar">▶</button>
    </div>
    <p class="hint">En iPhone suenan mucho mejor las voces «mejoradas»: Ajustes › Accesibilidad › Contenido leído › Voces › Español.</p>
  </div>
{/if}

<style>
  .np {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .row {
    display: flex;
    gap: 6px;
  }
  select {
    flex: 1;
    min-width: 0;
    appearance: none;
    background: var(--bg-2);
    color: var(--paper);
    border: 2px solid var(--bg-3);
    border-radius: 6px;
    height: 44px;
    padding: 0 12px;
    font-family: var(--body);
    font-weight: 600;
    font-size: 14px;
  }
  .play {
    appearance: none;
    border: none;
    width: 44px;
    border-radius: 6px;
    background: var(--me);
    color: var(--me-ink);
    font-size: 16px;
  }
  .hint {
    margin: 0;
    font-size: 11px;
    color: var(--mute);
  }
</style>
