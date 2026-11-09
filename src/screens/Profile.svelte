<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { CALLSIGNS, COLORS } from '../lib/types';
  import { sfx } from '../lib/audio/sfx';

  const cur = app.prefs.profile;
  const opp = app.opp; // si ya estamos en una sala, no se puede repetir
  let name = $state(cur?.name ?? '');
  let color = $state(cur?.color && cur.color !== opp?.color ? cur.color : COLORS.find((c) => c.id !== opp?.color)!.id);
  let callsign = $state(
    cur?.callsign && cur.callsign !== opp?.callsign ? cur.callsign : CALLSIGNS.find((c) => c.id !== opp?.callsign)!.id,
  );

  function save() {
    app.profileDone({ name: name.trim().slice(0, 14), color, callsign });
  }
</script>

<div class="screen profile" style="--me:{COLORS.find((c) => c.id === color)?.hex}">
  <div class="head">
    <span class="label">PERFIL // OPERADOR</span>
    <button class="link" onclick={() => (app.screen = app.session ? 'room' : 'home')}>Volver</button>
  </div>

  <h1 class="big">{CALLSIGNS.find((c) => c.id === callsign)?.label}</h1>

  <section>
    <div class="label">Indicativo de voz</div>
    <div class="grid callsigns">
      {#each CALLSIGNS as c}
        {@const taken = opp?.callsign === c.id}
        <button
          class="chip cut"
          class:on={callsign === c.id}
          disabled={taken}
          onclick={() => {
            callsign = c.id;
            sfx.click();
          }}>{c.label}{#if taken}<small>RIVAL</small>{/if}</button
        >
      {/each}
    </div>
  </section>

  <section>
    <div class="label">Color</div>
    <div class="grid colors">
      {#each COLORS as c}
        {@const taken = opp?.color === c.id}
        <button
          class="swatch cut"
          class:on={color === c.id}
          disabled={taken}
          style="--c:{c.hex}"
          aria-label={c.name}
          onclick={() => {
            color = c.id;
            sfx.click();
          }}
        ></button>
      {/each}
    </div>
  </section>

  <section>
    <label class="label" for="name">Nombre (opcional)</label>
    <input id="name" class="cut" bind:value={name} maxlength="14" placeholder="Tu nombre" autocomplete="off" />
  </section>

  <div class="grow"></div>
  <button class="btn" onclick={save}>Continuar</button>
</div>

<style>
  .profile {
    gap: 18px;
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .big {
    font-size: 72px;
    color: var(--me);
    text-shadow: 0 0 24px color-mix(in srgb, var(--me) 60%, transparent);
  }
  section {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .grid {
    display: grid;
    gap: 8px;
  }
  .callsigns {
    grid-template-columns: repeat(4, 1fr);
  }
  .colors {
    grid-template-columns: repeat(6, 1fr);
  }
  .chip {
    --cut: 8px;
    appearance: none;
    border: 1px solid var(--line2);
    background: var(--panel);
    color: var(--text);
    font-family: var(--display);
    font-weight: 700;
    font-size: 20px;
    text-transform: uppercase;
    height: 52px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    line-height: 1;
  }
  .chip small {
    font-family: var(--mono);
    font-size: 9px;
    color: var(--dim);
  }
  .chip.on {
    background: var(--me);
    color: var(--bg);
    border-color: var(--me);
  }
  .chip:disabled,
  .swatch:disabled {
    opacity: 0.25;
  }
  .swatch {
    --cut: 8px;
    appearance: none;
    border: none;
    height: 52px;
    background: var(--c);
    opacity: 0.55;
    transition: transform 0.15s, opacity 0.15s;
  }
  .swatch.on {
    opacity: 1;
    transform: scale(1.08);
    box-shadow: 0 0 18px var(--c);
    outline: 3px solid var(--text);
    outline-offset: -3px;
  }
  input {
    --cut: 10px;
    appearance: none;
    border: 1px solid var(--line2);
    background: var(--panel);
    color: var(--text);
    font-family: var(--display);
    font-weight: 700;
    font-size: 24px;
    height: 56px;
    padding: 0 16px;
    outline: none;
    user-select: text;
    -webkit-user-select: text;
  }
  input:focus {
    border-color: var(--me);
  }
  .grow {
    flex: 1;
  }
</style>
