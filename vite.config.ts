import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

/**
 * Escribe en dist/sw.js la lista de archivos que el service worker guarda al instalarse,
 * para que la app abra sin conexión desde la primera visita. Quedan fuera el modelo y el
 * motor de voz propio (46 MB: solo se descargan si se usan) y las fuentes .woff de reserva.
 */
function swPrecache(): Plugin {
  const skip = (f: string) => f === 'sw.js' || f.startsWith('.') || f.endsWith('.tar.gz') || f.endsWith('.woff') || /assets\/vosk-/.test(f);
  const walk = (dir: string, base = ''): string[] =>
    readdirSync(join(dir, base)).flatMap((name) => {
      const rel = base ? `${base}/${name}` : name;
      return statSync(join(dir, rel)).isDirectory() ? walk(dir, rel) : [rel];
    });
  return {
    name: 'sw-precache',
    apply: 'build',
    closeBundle() {
      const dist = 'dist';
      const all = walk(dist).filter((f) => f !== 'sw.js' && !f.startsWith('.')).sort();
      const files = all.filter((f) => !skip(f));
      const hash = createHash('sha1');
      for (const f of files) hash.update(f).update(readFileSync(join(dist, f)));
      const list = ['./', ...files.filter((f) => f !== 'index.html')];
      const sw = readFileSync(join(dist, 'sw.js'), 'utf8')
        .replace('__SW_VERSION__', hash.digest('hex').slice(0, 10))
        .replace('/*__SW_ASSETS__*/ []', JSON.stringify(list))
        .replace('/*__SW_FILES__*/ []', JSON.stringify(all));
      writeFileSync(join(dist, 'sw.js'), sw);
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [svelte(), swPrecache()],
  build: { target: 'es2020', outDir: 'dist' },
});
