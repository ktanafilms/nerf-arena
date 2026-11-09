// Escena 3D de la portada: la pistola aparece girando sobre un pedestal holográfico,
// luego rota despacio como en un escaparate. Se puede girar con el dedo (con inercia).
// Carga public/models/blaster.glb; si falla, usa una pistola de juguete hecha con primitivas.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export interface Hero3D {
  setColor(hex: string): void;
  dispose(): void;
}

export const MODEL_URL = './models/blaster.glb';

const AUTO_SPIN = 0.35; // rad/s en reposo
const easeOutBack = (x: number) => 1 + 2.2 * Math.pow(x - 1, 3) + 1.2 * Math.pow(x - 1, 2);
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);

export function mountHero3D(canvas: HTMLCanvasElement, color: string, onModel?: (real: boolean) => void): Hero3D {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 100);
  const target = new THREE.Vector3(0, -0.35, 0);

  // Luces: clave cálida, contraluz del color del jugador y relleno frío suave
  scene.add(new THREE.HemisphereLight(0xffffff, 0x1a1a1a, 1.0));
  const key = new THREE.DirectionalLight(0xfff4e8, 2.8);
  key.position.set(-3, 5, 5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(new THREE.Color(color), 5);
  rim.position.set(3, 2, -5);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(0xdfe8ff, 0.7);
  fill.position.set(4, -1, 4);
  scene.add(fill);
  const under = new THREE.PointLight(new THREE.Color(color), 6, 6, 1.6); // reflejo del pedestal
  under.position.set(0, -1.1, 0.6);
  scene.add(under);

  // ── Pedestal holográfico ──
  const holo = new THREE.Group();
  holo.position.y = -1.3;
  scene.add(holo);
  const holoMats: THREE.MeshBasicMaterial[] = [];
  const hm = (opacity: number, map?: THREE.Texture) => {
    const m = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color),
      transparent: true,
      opacity,
      map: map ?? null,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    holoMats.push(m);
    return m;
  };
  const tex = (w: number, h: number, paint: (x: CanvasRenderingContext2D) => void) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    paint(c.getContext('2d')!);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const radial = tex(256, 256, (x) => {
    const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, 'rgba(255,255,255,0.85)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.22)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 256, 256);
  });
  const vertical = tex(4, 128, (x) => {
    const g = x.createLinearGradient(0, 128, 0, 0);
    g.addColorStop(0, 'rgba(255,255,255,0.7)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 4, 128);
  });
  const flat = (geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D = holo) => {
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    parent.add(m);
    return m;
  };
  flat(new THREE.CircleGeometry(2.6, 64), hm(0.5, radial));
  const ring = flat(new THREE.RingGeometry(1.5, 1.56, 128), hm(0.95));
  const inner = flat(new THREE.RingGeometry(1.0, 1.02, 96), hm(0.35));
  const dashes = new THREE.Group();
  const DASH = 48;
  for (let i = 0; i < DASH; i++) {
    const a = (i / DASH) * Math.PI * 2;
    dashes.add(new THREE.Mesh(new THREE.RingGeometry(1.78, 1.84, 3, 1, a, ((Math.PI * 2) / DASH) * 0.5), hm(0.6)));
  }
  dashes.rotation.x = -Math.PI / 2;
  holo.add(dashes);
  const beamMat = hm(0.16, vertical);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 1.4, 96, 1, true), beamMat);
  beam.position.y = 0.7;
  holo.add(beam);

  // ── Modelo ──
  const pivot = new THREE.Group(); // gira (auto + dedo)
  const floater = new THREE.Group(); // flota
  pivot.add(floater);
  scene.add(pivot);
  let model: THREE.Object3D | null = null;
  let appearAt = -1; // segundo en que empezó a aparecer

  function place(obj: THREE.Object3D) {
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    obj.position.sub(center);
    const wrap = new THREE.Group();
    wrap.add(obj);
    const longest = Math.max(size.x, size.y, size.z) || 1;
    wrap.scale.setScalar(3.2 / longest);
    if (size.z > size.x) wrap.rotation.y = Math.PI / 2;
    model = wrap;
    floater.add(wrap);
    floater.scale.setScalar(0.001);
    appearAt = clock.elapsedTime;
  }

  new GLTFLoader().load(
    MODEL_URL,
    (gltf) => {
      place(gltf.scene);
      onModel?.(true);
    },
    undefined,
    () => {
      place(buildToy(color));
      onModel?.(false);
    },
  );

  // ── Interacción: arrastrar para girar, con inercia que vuelve al giro automático ──
  let yaw = -0.6,
    pitch = 0,
    vel = AUTO_SPIN,
    dragging = false,
    lastX = 0,
    lastY = 0,
    lastT = 0;
  const onDown = (e: PointerEvent) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    lastT = performance.now();
  };
  const onMove = (e: PointerEvent) => {
    if (!dragging) return;
    const now = performance.now();
    const dt = Math.max(1, now - lastT) / 1000;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    yaw += dx * 0.012;
    vel = Math.max(-8, Math.min(8, (dx * 0.012) / dt));
    pitch = Math.max(-0.35, Math.min(0.45, pitch + dy * 0.005));
    lastX = e.clientX;
    lastY = e.clientY;
    lastT = now;
  };
  const onUp = () => (dragging = false);
  canvas.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);

  function resize() {
    const w = canvas.clientWidth,
      h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Encajar: más lejos cuanto más estrecha sea la vista
    const dist = Math.max(8, 7.2 / Math.min(1, camera.aspect));
    camera.position.set(0, 1.5, dist);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  const clock = new THREE.Clock();
  resize();
  let raf = 0;
  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;

    // Pedestal: se despliega al abrir
    const p = reduced ? 1 : easeOut(Math.min(1, t / 0.7));
    holo.scale.setScalar(0.4 + 0.6 * p);
    holoMats.forEach((m) => (m.userData.k = p));
    dashes.rotation.z = t * 0.3;
    inner.rotation.z = -t * 0.5;
    beamMat.opacity = (0.12 + Math.sin(t * 2.4) * 0.04) * p;
    (ring.material as THREE.MeshBasicMaterial).opacity = 0.75 + Math.sin(t * 3) * 0.2;

    // Modelo: aparece girando y luego rota solo
    if (model && appearAt >= 0) {
      const a = reduced ? 1 : Math.min(1, (t - appearAt) / 1.1);
      floater.scale.setScalar(Math.max(0.001, easeOutBack(a)));
      if (!dragging) {
        vel += (AUTO_SPIN - vel) * Math.min(1, dt * 1.5);
        yaw += vel * dt;
        pitch += (0 - pitch) * Math.min(1, dt * 2);
      }
      const spinIn = reduced ? 0 : (1 - easeOut(a)) * Math.PI * 1.5;
      pivot.rotation.set(pitch, yaw + spinIn, 0);
      floater.position.y = Math.sin(t * 1.2) * 0.07 + (1 - easeOut(a)) * -0.5;
      floater.rotation.z = Math.sin(t * 0.8) * 0.03;
    }
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  frame();

  return {
    setColor(hex: string) {
      rim.color.set(hex);
      under.color.set(hex);
      holoMats.forEach((m) => m.color.set(hex));
    },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.geometry?.dispose();
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          mats.forEach((mat) => {
            Object.values(mat ?? {}).forEach((v) => (v as THREE.Texture)?.isTexture && (v as THREE.Texture).dispose());
            mat?.dispose();
          });
        }
      });
      renderer.dispose();
    },
  };
}

/** Pistola de juguete original hecha con primitivas (respaldo si no hay modelo). */
function buildToy(accent: string): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: 0xece7dd, roughness: 0.45, metalness: 0.05 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.7 });
  const acc = new THREE.MeshStandardMaterial({ color: new THREE.Color(accent), roughness: 0.4 });
  const tip = new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.5 });

  const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z = 0, rz = 0) => {
    const geo = new THREE.BoxGeometry(w, h, d, 1, 1, 1);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.z = rz;
    g.add(m);
    return m;
  };
  const cyl = (r: number, len: number, mat: THREE.Material, x: number, y: number) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 28), mat);
    m.rotation.z = Math.PI / 2;
    m.position.set(x, y, 0);
    g.add(m);
    return m;
  };

  box(2.2, 0.62, 0.42, body, 0, 0.1); // cuerpo
  box(1.9, 0.12, 0.3, acc, 0.05, 0.47); // riel superior
  box(0.5, 0.16, 0.46, acc, -0.6, 0.12); // franja lateral
  cyl(0.17, 1.5, body, 1.75, 0.18); // cañón
  cyl(0.2, 0.18, tip, 2.55, 0.18); // punta naranja
  cyl(0.24, 0.5, dark, 1.3, -0.08); // corredera
  box(0.36, 0.95, 0.36, dark, -0.55, -0.55, 0, 0.32); // empuñadura
  box(0.34, 0.9, 0.3, acc, 0.15, -0.6, 0, 0.12); // cargador
  box(0.5, 0.08, 0.2, dark, -0.15, -0.25); // guardamonte
  box(0.9, 0.42, 0.3, body, -1.45, 0.02, 0, -0.08); // culata
  box(0.12, 0.5, 0.32, dark, -1.88, 0.02, 0, -0.08); // cantonera
  box(0.3, 0.12, 0.12, acc, 0.6, 0.62); // mira
  return g;
}
