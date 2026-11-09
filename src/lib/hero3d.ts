// Escena 3D de la portada: la pistola flota y gira suavemente; se puede girar con el dedo.
// Carga public/models/blaster.glb si existe; si no, usa una pistola de juguete hecha con primitivas.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export interface Hero3D {
  setColor(hex: string): void;
  dispose(): void;
}

export const MODEL_URL = './models/blaster.glb';

export function mountHero3D(canvas: HTMLCanvasElement, color: string, onModel?: (real: boolean) => void): Hero3D {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
  camera.position.set(0, 1.4, 9);
  camera.lookAt(0, -0.25, 0);

  // Luces: clave blanca, contraluz del color del jugador y relleno suave
  scene.add(new THREE.HemisphereLight(0xffffff, 0x222222, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 2.6);
  key.position.set(-3, 4, 5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(new THREE.Color(color), 4);
  rim.position.set(4, 1.5, -4);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(0xffffff, 0.6);
  fill.position.set(3, -2, 4);
  scene.add(fill);

  // Pedestal holográfico del color del jugador
  const holo = new THREE.Group();
  holo.position.y = -1.25;
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
  const radial = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d')!;
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.25)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();
  const vertical = (() => {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 128;
    const x = c.getContext('2d')!;
    const g = x.createLinearGradient(0, 128, 0, 0);
    g.addColorStop(0, 'rgba(255,255,255,0.8)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 4, 128);
    return new THREE.CanvasTexture(c);
  })();
  const flat = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    holo.add(m);
    return m;
  };
  flat(new THREE.CircleGeometry(2.3, 64), hm(0.55, radial));
  flat(new THREE.RingGeometry(1.55, 1.62, 96), hm(0.95));
  const dashes = new THREE.Group();
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    const d = new THREE.Mesh(new THREE.RingGeometry(1.86, 1.94, 4, 1, a, (Math.PI * 2) / 36 * 0.55), hm(0.7));
    dashes.add(d);
  }
  dashes.rotation.x = -Math.PI / 2;
  holo.add(dashes);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.55, 1.6, 64, 1, true), hm(0.22, vertical));
  beam.position.y = 0.8;
  holo.add(beam);

  const pivot = new THREE.Group(); // gira con el dedo
  const floater = new THREE.Group(); // flota
  pivot.add(floater);
  scene.add(pivot);

  let model: THREE.Object3D | null = null;

  function place(obj: THREE.Object3D) {
    // Centrar y escalar para que mida ~3.4 unidades de largo
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    obj.position.sub(center);
    const wrap = new THREE.Group();
    wrap.add(obj);
    const longest = Math.max(size.x, size.y, size.z) || 1;
    wrap.scale.setScalar(3.4 / longest);
    // Si el eje largo es Z, girar para verlo de perfil
    if (size.z > size.x) wrap.rotation.y = Math.PI / 2;
    if (model) floater.remove(model);
    model = wrap;
    floater.add(wrap);
  }

  place(buildToy(color));
  new GLTFLoader().load(
    MODEL_URL,
    (gltf) => {
      gltf.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && m.material) {
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          mats.forEach((mat) => ((mat as THREE.MeshStandardMaterial).envMapIntensity = 1));
        }
      });
      place(gltf.scene);
      onModel?.(true);
    },
    undefined,
    () => onModel?.(false),
  );

  // Interacción: arrastrar para girar, con inercia
  let yaw = -0.35,
    pitch = 0.08,
    vel = 0,
    dragging = false,
    lastX = 0,
    lastY = 0,
    idle = 0;
  const onDown = (e: PointerEvent) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    vel = 0;
  };
  const onMove = (e: PointerEvent) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    vel = dx * 0.012;
    yaw += vel;
    pitch = Math.max(-0.5, Math.min(0.6, pitch + dy * 0.006));
    idle = 0;
  };
  const onUp = () => (dragging = false);
  canvas.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);

  function resize() {
    const w = canvas.clientWidth,
      h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // En vertical, alejar la cámara para que quepa el ancho
    camera.position.z = w / h < 0.8 ? 10.5 : 8.5;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  const clock = new THREE.Clock();
  let raf = 0;
  // Con «reducir movimiento» la pistola aparece ya colocada
  const intro = { t: matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 0 };
  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    intro.t = Math.min(1, intro.t + dt / 1.1);
    const e = 1 - Math.pow(1 - intro.t, 3); // ease-out
    if (!dragging) {
      vel *= 0.94;
      yaw += vel;
      idle += dt;
      // vuelve poco a poco a un balanceo suave
      if (idle > 1.5) yaw += (Math.sin(t * 0.5) * 0.45 - 0.35 - yaw) * 0.01;
      pitch += (0.08 - pitch) * 0.02;
    }
    pivot.rotation.set(pitch, yaw + (1 - e) * 2.6, 0);
    pivot.position.x = (1 - e) * 6;
    floater.position.y = Math.sin(t * 1.3) * 0.08;
    floater.rotation.z = Math.sin(t * 0.9) * 0.04 - 0.08;
    dashes.rotation.z = t * 0.35;
    holo.position.x = pivot.position.x;
    beam.material.opacity = 0.18 + Math.sin(t * 2.2) * 0.05;
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  frame();

  return {
    setColor(hex: string) {
      rim.color.set(hex);
      holoMats.forEach((m) => m.color.set(hex));
    },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.geometry?.dispose();
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          mats.forEach((mat) => mat?.dispose());
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
