// Narrador con síntesis de voz en español.
// Regla de oro: nunca pronunciar "[indicativo] + [orden]" para no activar el otro móvil.

let voice: SpeechSynthesisVoice | null = null;
let speakingUntil = 0;
let active = 0;

export const ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

let preferred: string | null = (() => {
  try {
    return JSON.parse(localStorage.getItem('nerf.prefs') ?? '{}').narratorVoice ?? null;
  } catch {
    return null;
  }
})();

/** Voces en español disponibles en este móvil (las mejoradas primero). */
export function spanishVoices(): SpeechSynthesisVoice[] {
  if (!ttsSupported) return [];
  const es = speechSynthesis.getVoices().filter((v) => v.lang?.toLowerCase().startsWith('es'));
  const score = (v: SpeechSynthesisVoice) =>
    (/enhanced|premium|mejorada|neural|natural/i.test(v.name) ? 0 : 1) * 10 + (/es[-_]es/i.test(v.lang) ? 0 : 1);
  return es.sort((a, b) => score(a) - score(b) || a.name.localeCompare(b.name));
}

export function setNarratorVoice(name: string | null) {
  preferred = name;
  pickVoice();
}

export function currentVoiceName() {
  return voice?.name ?? null;
}

function pickVoice() {
  if (!ttsSupported) return;
  const voices = speechSynthesis.getVoices();
  const es = voices.filter((v) => v.lang?.toLowerCase().startsWith('es'));
  const pref = ['es-es', 'es_es'];
  const chosen = preferred ? es.find((v) => v.name === preferred) : null;
  voice =
    chosen ??
    es.find((v) => pref.includes(v.lang.toLowerCase()) && /enhanced|premium|mejorada/i.test(v.name)) ??
    es.find((v) => pref.includes(v.lang.toLowerCase()) && /mónica|monica|jorge|google|lucia|álvaro|alvaro/i.test(v.name)) ??
    es.find((v) => pref.includes(v.lang.toLowerCase())) ??
    es[0] ??
    null;
}

if (ttsSupported) {
  pickVoice();
  speechSynthesis.onvoiceschanged = pickVoice;
}

/** Desbloqueo en iOS: primera locución dentro de un toque. */
export function unlockSpeech() {
  if (!ttsSupported) return;
  const u = new SpeechSynthesisUtterance(' ');
  u.volume = 0;
  speechSynthesis.speak(u);
}

/** ¿Está hablando el narrador (o acaba de hacerlo)? El micro ignora lo que oiga. */
export function narratorBusy(): boolean {
  return active > 0 || Date.now() < speakingUntil;
}

export function say(text: string, opts: { interrupt?: boolean; rate?: number } = {}) {
  if (!ttsSupported || !text) return;
  if (opts.interrupt) speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'es-ES';
  if (voice) u.voice = voice;
  u.rate = opts.rate ?? 1.12;
  u.pitch = 1;
  u.volume = 1;
  // Estimación por si el navegador no dispara los eventos
  const est = 600 + text.length * 70;
  speakingUntil = Math.max(speakingUntil, Date.now()) + est;
  active++;
  let done = false;
  const end = () => {
    if (done) return;
    done = true;
    active = Math.max(0, active - 1);
    speakingUntil = Date.now() + 450; // cola de eco
  };
  u.onend = end;
  u.onerror = end;
  setTimeout(end, est + 4000);
  speechSynthesis.speak(u);
}

export function numberWord(n: number): string {
  return ['cero', 'una', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez'][n] ?? String(n);
}

export function durationWords(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m && r) return `${m} ${m === 1 ? 'minuto' : 'minutos'} y ${r} segundos`;
  if (m) return `${m} ${m === 1 ? 'minuto' : 'minutos'}`;
  return `${r} segundos`;
}
