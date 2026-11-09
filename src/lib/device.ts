// Pantalla siempre encendida y detección de capacidades.

let lock: any = null;
let wanted = false;

async function acquire() {
  try {
    if ('wakeLock' in navigator && document.visibilityState === 'visible') {
      lock = await (navigator as any).wakeLock.request('screen');
      lock.addEventListener?.('release', () => {
        lock = null;
      });
    }
  } catch {
    lock = null;
  }
}

export const wakeLockSupported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;

export function keepAwake(on: boolean) {
  wanted = on;
  if (on && !lock) acquire();
  if (!on && lock) {
    lock.release?.();
    lock = null;
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (wanted && document.visibilityState === 'visible' && !lock) acquire();
  });
}

export const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);
export const isStandalone =
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true);
