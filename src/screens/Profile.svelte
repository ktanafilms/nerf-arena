<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { COLORS, colorDef } from '../lib/types';
  import { ICONS } from '../lib/icons';
  import { cleanName, nameIssue } from '../lib/names';
  import { sfx } from '../lib/audio/sfx';
  import Avatar from '../components/Avatar.svelte';

  const second = app.editingSecond;
  const cur = second ? app.prefs.profile2 : app.prefs.profile;
  // el otro jugador: no se puede repetir color ni nombre
  const opp = second ? (app.room?.players.find((p) => p.id === 'A') ?? app.prefs.profile) : app.opp;
  let name = $state(cur?.name ?? '');
  let icon = $state(cur?.icon ?? ICONS[0].id);
  let color = $state(cur?.color && cur.color !== opp?.color ? cur.color : COLORS.find((c) => c.id !== opp?.color)!.id);

  const c = $derived(colorDef(color));
  const issue = $derived(nameIssue(name, opp?.name));

  function save() {
    if (issue?.level === 'error') return;
    const aliases = cur && cur.name === name ? cur.aliases : []; // si cambias de nombre, se recalibra
    if (!second && cur && cur.name !== name) app.prefs.voiceTested = false;
    app.profileDone({ name, color, icon, aliases });
  }
</script>

<div class="screen profile" style="--me:{c.hex};--me-ink:{c.ink}">
  <div class="head">
    <span class="eyebrow">{second ? 'Jugador 2 · mismo móvil' : 'Tu perfil'}</span>
    <button
      class="link"
      onclick={() => {
        app.editingSecond = false;
        app.screen = app.session ? 'room' : 'home';
      }}>Volver</button
    >
  </div>

  <div class="preview">
    <Avatar {icon} {color} size={64} />
    <div class="pname display">{name || (second ? 'Jugador 2' : 'Tu nombre')}</div>
  </div>

  <section>
    <label class="eyebrow" for="name">Nombre · es tu palabra para la voz</label>
    <input
      id="name"
      value={name}
      oninput={(e) => {
        name = cleanName((e.target as HTMLInputElement).value);
        (e.target as HTMLInputElement).value = name;
      }}
      maxlength="12"
      placeholder="Pablo"
      autocomplete="off"
      autocapitalize="words"
      spellcheck="false"
    />
    {#if issue && name}
      <p class="issue" class:err={issue.level === 'error'}>{issue.msg}</p>
    {:else}
      <p class="hint">Dirás «{name || 'Pablo'}, tocado». Mejor un nombre de 2 o 3 sílabas.</p>
    {/if}
  </section>

  <section>
    <span class="eyebrow">Icono</span>
    <div class="icons">
      {#each ICONS as ic}
        <button
          class="ic"
          class:on={icon === ic.id}
          aria-label={ic.name}
          onclick={() => {
            icon = ic.id;
            sfx.click();
          }}
        >
          <svg viewBox="0 0 24 24"><path d={ic.d} fill-rule="evenodd" /></svg>
        </button>
      {/each}
    </div>
  </section>

  <section>
    <span class="eyebrow">Color</span>
    <div class="colors">
      {#each COLORS as col}
        {@const taken = opp?.color === col.id}
        <button
          class="sw"
          class:on={color === col.id}
          disabled={taken}
          style="--c:{col.hex}"
          aria-label={col.name}
          onclick={() => {
            color = col.id;
            sfx.click();
          }}
        ></button>
      {/each}
    </div>
  </section>

  <div class="grow"></div>
  <button class="btn" disabled={!name || issue?.level === 'error'} onclick={save}>Guardar</button>
</div>

<style>
  .profile {
    gap: clamp(10px, 2.2vh, 20px);
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .preview {
    display: flex;
    align-items: center;
    gap: 16px;
    min-width: 0;
  }
  .pname {
    font-size: clamp(44px, 8vh, 64px);
    color: var(--me);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  input {
    appearance: none;
    border: none;
    border-bottom: 3px solid var(--bg-3);
    background: transparent;
    color: var(--paper);
    font-family: var(--display);
    font-weight: 900;
    font-size: clamp(34px, 6vh, 44px);
    text-transform: uppercase;
    padding: 2px 0 6px;
    outline: none;
    border-radius: 0;
    user-select: text;
    -webkit-user-select: text;
    transition: border-color 0.15s;
  }
  input::placeholder {
    color: var(--bg-3);
  }
  input:focus {
    border-color: var(--me);
  }
  .hint,
  .issue {
    margin: 0;
    font-size: 13px;
    color: var(--mute);
  }
  .issue {
    color: var(--warn);
  }
  .issue.err {
    color: var(--danger);
  }
  .icons {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 8px;
  }
  .ic {
    appearance: none;
    border: none;
    height: clamp(42px, 6.4vh, 54px);
    background: var(--bg-2);
    border-radius: 4px;
    display: grid;
    place-items: center;
    transition:
      background 0.15s,
      transform 0.1s;
  }
  .ic svg {
    width: 58%;
    fill: var(--mute);
  }
  .ic.on {
    background: var(--me);
    transform: scale(1.06);
  }
  .ic.on svg {
    fill: var(--me-ink);
  }
  .colors {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 8px;
  }
  .sw {
    appearance: none;
    border: none;
    height: clamp(38px, 5.6vh, 48px);
    background: var(--c);
    border-radius: 4px;
    transition: transform 0.12s;
    position: relative;
  }
  .sw.on {
    transform: scale(1.08);
    box-shadow:
      0 0 0 3px var(--bg),
      0 0 0 5px var(--paper);
  }
  .sw:disabled {
    opacity: 0.15;
  }
  .grow {
    flex: 1;
  }
</style>
