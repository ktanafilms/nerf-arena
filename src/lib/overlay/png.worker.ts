// Hilo de fondo que comprime fotogramas PNG del vídeo del HUD.
import { encodeRGBA } from './png';

self.onmessage = async (e: MessageEvent<{ id: number; px: Uint8ClampedArray; w: number; h: number }>) => {
  const { id, px, w, h } = e.data;
  try {
    const png = await encodeRGBA(px, w, h);
    (self as any).postMessage({ id, png }, [png.buffer]);
  } catch (err: any) {
    (self as any).postMessage({ id, err: String(err?.message ?? err) });
  }
};
