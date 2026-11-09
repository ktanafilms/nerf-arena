<script lang="ts">
  import { app } from './lib/app.svelte';
  import { normalizeCode } from './lib/net/session.svelte';
  import { colorDef } from './lib/types';
  import Home from './screens/Home.svelte';
  import Guide from './screens/Guide.svelte';
  import ProfileScreen from './screens/Profile.svelte';
  import Join from './screens/Join.svelte';
  import RoomScreen from './screens/Room.svelte';
  import VoiceTest from './screens/VoiceTest.svelte';

  // Enlace del QR: ?sala=ABCD → unirse directamente
  const params = new URLSearchParams(location.search);
  const sala = normalizeCode(params.get('sala') ?? '');
  let pendingJoin = $state(sala.length === 4 ? sala : '');

  if (!app.prefs.seenGuide) app.screen = 'guide';
  else if (pendingJoin) app.screen = 'join';

  // Colores del jugador como variables CSS globales
  $effect(() => {
    const me = app.me ?? app.prefs.profile;
    const opp = app.opp;
    const m = colorDef(me?.color ?? 'naranja');
    const o = colorDef(opp?.color ?? 'azul');
    const st = document.documentElement.style;
    st.setProperty('--me', m.hex);
    st.setProperty('--me-ink', m.ink);
    st.setProperty('--opp', o.hex);
    st.setProperty('--opp-ink', o.ink);
  });
</script>


{#key app.screen}
  <div class="enter" style="position:absolute;inset:0">
    {#if app.screen === 'home'}
      <Home />
    {:else if app.screen === 'guide'}
      <Guide
        done={() => {
          app.prefs.seenGuide = true;
          app.savePrefs();
          app.screen = pendingJoin ? 'join' : 'home';
        }}
      />
    {:else if app.screen === 'profile'}
      <ProfileScreen />
    {:else if app.screen === 'join'}
      <Join initial={pendingJoin} />
    {:else if app.screen === 'room'}
      <RoomScreen />
    {:else if app.screen === 'voicetest'}
      <VoiceTest />
    {/if}
  </div>
{/key}

<div class="grain"></div>

{#if app.toast}
  <div class="toast">{app.toast}</div>
{/if}
