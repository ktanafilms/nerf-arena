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

  // Solo en desarrollo: ?demo=lobby|mode|game|result para revisar pantallas
  if (import.meta.env.DEV) {
    const demo = params.get('demo');
    if (params.has('still')) {
      const st = document.createElement('style');
      st.textContent = '.goflash,.hurtflash,.boomflash,.confirmflash,.hitmarker,.banner,.wipe{display:none!important}';
      document.head.appendChild(st);
    }
    if (demo === 'hud') {
      // Simula una partida y expone la exportación del HUD para probarla
      (window as any).__hud = async (mode: string, fmt: '16:9' | '9:16') => {
        const E = await import('./lib/engine/room');
        const { exportHud } = await import('./lib/overlay/export');
        let t = Date.now() - 3600_000;
        const r = E.createRoom('TEST', { name: 'Pablo', color: 'naranja', icon: 'rayo', aliases: [] });
        E.joinGuest(r, { name: 'Marta', color: 'azul', icon: 'calavera', aliases: [] });
        const I = (pid: string, it: any) => E.applyIntent(r, pid, it, t);
        const adv = (ms: number) => {
          for (let x = 0; x < ms; x += 100) {
            t += 100;
            E.tick(r, t);
          }
        };
        I('A', { t: 'selectMode', mode });
        if (mode === 'cazador') I('A', { t: 'config', mode, config: { hideSec: 20, maxSec: 120 } });
        if (mode === 'buscar') I('A', { t: 'config', mode, config: { plantSec: 45, bombSec: 90, rounds: 2 } });
        if (mode === 'blanco') I('A', { t: 'config', mode, config: { rounds: 5 } });
        I('A', { t: 'ready', ready: true });
        I('B', { t: 'ready', ready: true });
        adv(4000);
        const g = () => r.game!;
        for (let i = 0; i < 400 && g().phase !== 'ended'; i++) {
          adv(4000);
          if (g().phase !== 'playing') continue;
          if (i === 3) {
            I('A', { t: 'pause' });
            adv(5000);
            I('B', { t: 'resume' });
            adv(3100);
          }
          if (mode === 'duelo' || mode === 'armas') I(i % 3 ? 'B' : 'A', { t: 'hit' });
          if (mode === 'bomba') I(g().m.holder === 'A' ? 'B' : 'A', { t: 'hit' });
          if (mode === 'cazador' && g().m.sub === 'hunt' && i % 9 === 0) I(g().m.prey, { t: 'hit' });
          if (mode === 'buscar' && g().m.sub === 'bomb' && g().round === 1) I(g().m.attacker, { t: 'defuse' });
          if (mode === 'blanco' && g().m.sub === 'live') I(i % 2 ? 'A' : 'B', { t: 'claim', at: t - 200 });
        }
        (window as any).__hudStage = 'simulado ' + g().phase + ' ' + g().events.length;
        const res = await exportHud(r, fmt, (f) => ((window as any).__hudStage = 'exportando ' + Math.round(f * 100)));
        (window as any).__hudStage = 'mov listo';
        const buf = new Uint8Array(await res.blob.arrayBuffer());
        let bin = '';
        for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        (window as any).__hudB64 = btoa(bin);
        return { len: (window as any).__hudB64.length, size: res.blob.size, frames: res.frames, unique: res.unique, seconds: res.seconds, events: g().events.length };
      };
    } else if (demo === 'vozfile') {
      // prueba del reconocimiento con una grabación, sin micro
      (async () => {
        const { loadModel } = await import('./lib/voice/vosk-engine');
        const { parseCommands, ALL_COMMANDS } = await import('./lib/voice/matcher');
        const model = await loadModel(() => {});
        const buf = await (await fetch('./__test/voz.wav')).arrayBuffer();
        const ac = new OfflineAudioContext(1, 48000, 48000);
        const audio = await ac.decodeAudioData(buf);
        const rec = new model.KaldiRecognizer(audio.sampleRate);
        rec.on('result', (m: any) => console.log('FINAL', m.result.text, '→', parseCommands(m.result.text, ['Pablo'], ALL_COMMANDS, [['Marta']]).join(',')));
        rec.on('partialresult', (m: any) => m.result.partial && console.log('PARCIAL', m.result.partial));
        const d = audio.getChannelData(0);
        for (let i = 0; i < d.length; i += 4096) {
          rec.acceptWaveformFloat(d.slice(i, i + 4096), audio.sampleRate);
          await new Promise((r) => setTimeout(r, 20));
        }
        rec.retrieveFinalResult();
        console.log('FIN DE PRUEBA');
      })().catch((e) => console.log('FALLO', e?.message ?? e));
    } else if (demo === 'voz') {
      // prueba del motor propio con un micro simulado
      localStorage.setItem('nerf.voiceEngine', 'vosk');
      setTimeout(async () => {
        const { voice } = await import('./lib/voice/recognizer.svelte');
        voice.useEngine('vosk');
        app.screen = 'voicetest';
        setInterval(() => console.log('VOZ', voice.state, 'nivel', voice.level.toFixed(2), JSON.stringify(voice.heard), voice.log.slice(-2).join(' | ')), 3000);
      }, 300);
    } else if (demo && demo !== '1') {
      app.solo();
      const s = app.session as any;
      if (demo !== 'lobby') s.send({ t: 'selectMode', mode: (params.get('mode') as any) ?? 'duelo' });
      if (demo === 'game' || demo === 'result') {
        s.send({ t: 'ready', ready: true });
        if (!params.has('nohit'))
          setTimeout(() => {
            s.bot({ t: 'hit' });
            s.send({ t: 'hit' });
          }, 4200);
        if (demo === 'result') setTimeout(() => [0, 1].forEach(() => s.send({ t: 'hit' })), 4400);
      }
    }
  }

  if (!app.prefs.seenGuide) app.screen = 'guide';
  else if (pendingJoin) app.screen = 'join';

  // El barrido de color solo entre pantallas, no al abrir la app
  let first = $state(true);
  $effect(() => {
    void app.screen;
    const t = setTimeout(() => (first = false), 50);
    return () => clearTimeout(t);
  });

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
  {#if !first}<div class="wipe"></div>{/if}
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
