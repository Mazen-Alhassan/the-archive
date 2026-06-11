// The Archive — scene, atmosphere, reflective floor, post-processing
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { C } from './config.js';

export class World {
  constructor(container) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x010304);
    this.scene.fog = new THREE.FogExp2(0x020507, C.fogDensity);

    this.camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 1500);
    this.camera.position.set(-60, 3, -60);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    // cap DPR at 1.5 — bloom cost scales with pixel count, and 1.5 is
    // visually indistinguishable from 1.75 here while ~25% cheaper to fill
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.22;
    container.appendChild(this.renderer.domElement);

    // ---- base light: very dim, cool; darkness is the default state ----
    this.hemi = new THREE.HemisphereLight(0x46606c, 0x070b0d, 1.45);
    this.scene.add(this.hemi);
    this.dir = new THREE.DirectionalLight(0x9fd8e0, 0.35);
    this.dir.position.set(40, 120, -30);
    this.scene.add(this.dir);

    // ---- overhead spotlights: pooled, snapped to nearest cabinet tops ----
    this.spots = [];
    for (let k = 0; k < 4; k++) {
      const s = new THREE.SpotLight(new THREE.Color(C.lightColor), 5200, 260, 0.5, 0.7, 1.6);
      s.position.set(0, 95, 0);
      s.target.position.set(0, 0, 0);
      this.scene.add(s, s.target);
      this.spots.push(s);
    }

    this._buildFloor();

    // ---- post: bloom for the light shafts / seams ----
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), C.bloom, 0.7, 0.8);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    addEventListener('resize', () => this._resize());
    // also guard per-frame: if the page loaded in a hidden/unsized iframe,
    // the canvas starts 0×0 and no window resize may ever fire
    this._container = container;
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(() => this._resize()).observe(container);
    }
  }

  _resize() {
    const w = this._container ? (this._container.clientWidth || innerWidth) : innerWidth;
    const h = this._container ? (this._container.clientHeight || innerHeight) : innerHeight;
    if (!w || !h) return;
    if (this.camera.aspect !== w / h || !isFinite(this.camera.aspect)) {
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
    const size = this.renderer.getSize(new THREE.Vector2());
    if (size.x !== w || size.y !== h) {
      this.renderer.setSize(w, h);
      this.composer.setSize(w, h);
      this.bloom.setSize(w, h);
    }
  }

  // Tile floor: near-black, semi-transparent so the mirrored world shows
  // through as a reflection; seams carry a faint cold glow.
  _buildFloor() {
    const px = 1024, tiles = 4; // texture covers 4x4 tiles, tile = pitch/4 world units
    const cv = document.createElement('canvas');
    cv.width = cv.height = px;
    const g = cv.getContext('2d');
    g.fillStyle = '#06080a';
    g.fillRect(0, 0, px, px);
    const step = px / tiles;
    // per-tile tonal variation
    for (let i = 0; i < tiles; i++) for (let j = 0; j < tiles; j++) {
      const v = 5 + Math.random() * 5;
      g.fillStyle = `rgb(${v},${v + 1},${v + 2})`;
      g.fillRect(i * step + 1, j * step + 1, step - 2, step - 2);
    }
    // seams: segments of varying brightness — some catch the light
    const seam = (x0, y0, x1, y1) => {
      const segs = 4;
      for (let s = 0; s < segs; s++) {
        const t0 = s / segs, t1 = (s + 1) / segs;
        const a = Math.random() < 0.22 ? 0.55 + Math.random() * 0.4 : 0.07 + Math.random() * 0.14;
        g.strokeStyle = `rgba(214,236,240,${a})`;
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(x0 + (x1 - x0) * t0, y0 + (y1 - y0) * t0);
        g.lineTo(x0 + (x1 - x0) * t1, y0 + (y1 - y0) * t1);
        g.stroke();
      }
    };
    for (let i = 0; i <= tiles; i++) {
      seam(i * step, 0, i * step, px);
      seam(0, i * step, px, i * step);
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const worldSpan = C.pitch; // 4 tiles of pitch/4
    const size = 6000;
    tex.repeat.set(size / worldSpan, size / worldSpan);
    tex.anisotropy = 8;

    this.floorMat = new THREE.MeshStandardMaterial({
      color: 0x101418,
      map: tex,
      emissive: new THREE.Color(0x8fc6ce),
      emissiveMap: tex,
      emissiveIntensity: 0.5,
      roughness: 0.32,
      metalness: 0.55,
      transparent: true,
      opacity: 0.62, // lets the mirrored world read as reflection
      depthWrite: false,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(size, size), this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    floor.renderOrder = 10;
    this.scene.add(floor);

    // opaque black catch-all far below, so the void under the mirror stays black
    const base = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshBasicMaterial({ color: 0x000000 })
    );
    base.rotation.x = -Math.PI / 2;
    base.position.y = -60;
    this.scene.add(base);
  }

  // Reposition the 4 pooled spotlights over the aisle intersections nearest
  // the player — cones graze the cabinet faces and pool on the floor
  snapLights(px, pz) {
    const p = C.pitch;
    const si = Math.floor(px / p - 0.5), sj = Math.floor(pz / p - 0.5);
    const offs = [[0, 0], [1, 0], [0, 1], [1, 1]];
    for (let k = 0; k < 4; k++) {
      const ix = (Math.max(-1, si + offs[k][0]) + 0.5) * p;
      const iz = (Math.max(-1, sj + offs[k][1]) + 0.5) * p;
      const s = this.spots[k];
      s.position.set(ix, 95, iz);
      s.target.position.set(ix, 0, iz);
    }
  }

  setLightColor(hex) {
    for (const s of this.spots) s.color.set(hex);
    this.floorMat.emissive.set(hex).multiplyScalar(0.85);
  }
  setFog(d) { this.scene.fog.density = d; }
  setBloom(v) { this.bloom.strength = v; }

  render() {
    const size = this.renderer.getSize(new THREE.Vector2());
    if (!size.x || !size.y || !isFinite(this.camera.aspect)) this._resize();
    this.composer.render();
  }
}
