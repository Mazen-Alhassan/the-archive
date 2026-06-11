// The Archive — instanced cabinet field, drawer textures, shafts, mirror world
import * as THREE from 'three';
import { C, hash2, CURATED } from './config.js';

const LS_CLAIMS = 'archive-claims-v1';

export class Cabinets {
  constructor(scene) {
    this.scene = scene;
    this.baseCell = { i: 1e9, j: 1e9 };
    // fresh shuffle of ambient residents every visit — the cabinets around
    // spawn host different people each load (searched/claimed cells stay put)
    this.salt = (Math.random() * 1e9) | 0;
    try { this.claims = JSON.parse(localStorage.getItem(LS_CLAIMS) || '{}'); } catch (e) { this.claims = {}; }

    const n = C.viewCells * 2 + 1;
    this.maxInst = n * n;
    this._build();
    this.plaque = null;
    this.drawer = null;
  }

  exists(i, j) { return i >= 0 && j >= 0; }
  centerOf(i, j) { return new THREE.Vector3(i * C.pitch, C.cabH / 2, j * C.pitch); }

  loginFor(i, j) {
    const claimed = this.claims[i + ',' + j];
    if (claimed) return claimed;
    return CURATED[(hash2(i, j) + this.salt) % CURATED.length];
  }
  claim(i, j, login) {
    this.claims[i + ',' + j] = login;
    try { localStorage.setItem(LS_CLAIMS, JSON.stringify(this.claims)); } catch (e) {}
  }

  // ---------- construction ----------
  _build() {
    const sideTex = this._drawerTexture();
    const sideMat = new THREE.MeshStandardMaterial({
      map: sideTex, roughness: 0.62, metalness: 0.3,
      emissive: new THREE.Color(0x9fc2c9), emissiveMap: sideTex, emissiveIntensity: 0.6,
    });
    const topMat = new THREE.MeshStandardMaterial({ color: 0x14181b, roughness: 0.34, metalness: 0.6 });
    const botMat = new THREE.MeshStandardMaterial({ color: 0x050607, roughness: 0.9 });
    const mats = [sideMat, sideMat, topMat, botMat, sideMat, sideMat];

    const geo = new THREE.BoxGeometry(C.cabW, C.cabH, C.cabD);
    this.mesh = new THREE.InstancedMesh(geo, mats, this.maxInst);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(this.mesh);

    // mirrored copy beneath the floor = reflection
    const mMats = mats.map((m) => { const c = m.clone(); c.side = THREE.BackSide; return c; });
    this.mirror = new THREE.InstancedMesh(geo, mMats, this.maxInst);
    this.mirror.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(this.mirror);

    // light pools on cabinet tops
    const poolTex = this._radialTexture();
    this.poolMat = new THREE.MeshBasicMaterial({
      map: poolTex, color: new THREE.Color(C.lightColor), transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.5,
    });
    const poolGeo = new THREE.PlaneGeometry(C.cabW * 1.25, C.cabD * 1.25);
    this.pools = new THREE.InstancedMesh(poolGeo, this.poolMat, this.maxInst);
    this.pools.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(this.pools);

    // volumetric-feel shafts above every other cabinet
    this.shaftMat = new THREE.MeshBasicMaterial({
      map: this._shaftTexture(), color: new THREE.Color(C.lightColor), transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, opacity: 0.085,
    });
    const shaftGeo = new THREE.CylinderGeometry(3.2, 11, 85, 12, 1, true);
    this.shafts = new THREE.InstancedMesh(shaftGeo, this.shaftMat, this.maxInst);
    this.shafts.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(this.shafts);

    // these meshes sit at the world origin but their instances span the whole
    // grid; three.js frustum-culls them by the origin-centered bounding sphere,
    // so they vanish when the player is far from origin (end of a long travel).
    // The field is small and always rebuilt around the player — skip culling.
    this.mesh.frustumCulled = false;
    this.mirror.frustumCulled = false;
    this.pools.frustumCulled = false;
    this.shafts.frustumCulled = false;

    this._dummy = new THREE.Object3D();
  }

  // procedural texture: wall of small drawers w/ clustered highlights (ref 3)
  _drawerTexture() {
    const px = 1024, cols = 28, rows = 15;
    const cv = document.createElement('canvas');
    cv.width = cv.height = px;
    const g = cv.getContext('2d');
    g.fillStyle = '#0a0c0d'; g.fillRect(0, 0, px, px);
    const cw = px / cols, ch = px / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cluster = Math.sin(c * 0.55) * Math.cos(r * 0.7) + Math.sin((c + r) * 0.23);
        let v = 26 + Math.random() * 12 + Math.max(0, cluster) * 14;
        if (Math.random() < 0.03) v += 34; // rare bright drawer
        const x = c * cw, y = r * ch;
        g.fillStyle = `rgb(${v | 0},${(v + 2) | 0},${(v + 3) | 0})`;
        g.fillRect(x + 1.5, y + 1.5, cw - 3, ch - 3);
        // top bevel highlight
        g.fillStyle = `rgba(255,255,255,${0.05 + (v - 16) / 220})`;
        g.fillRect(x + 1.5, y + 1.5, cw - 3, 1.6);
        // handle
        g.fillStyle = `rgba(0,0,0,0.55)`;
        g.fillRect(x + cw * 0.36, y + ch * 0.58, cw * 0.28, 2.2);
        g.fillStyle = `rgba(255,255,255,${0.04 + Math.random() * 0.05})`;
        g.fillRect(x + cw * 0.36, y + ch * 0.58 - 1.4, cw * 0.28, 1.2);
      }
    }
    // vertical unit seams
    g.fillStyle = 'rgba(0,0,0,0.6)';
    for (let c = 0; c <= cols; c += 7) g.fillRect(c * cw - 1, 0, 2.5, px);
    // darkened base (fake AO)
    const grad = g.createLinearGradient(0, px * 0.72, 0, px);
    grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(1, 'rgba(0,0,0,0.66)');
    g.fillStyle = grad; g.fillRect(0, 0, px, px);
    const tex = new THREE.CanvasTexture(cv);
    tex.anisotropy = 8;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  _radialTexture() {
    const cv = document.createElement('canvas'); cv.width = cv.height = 256;
    const g = cv.getContext('2d');
    const gr = g.createRadialGradient(128, 128, 8, 128, 128, 128);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)');
    gr.addColorStop(0.35, 'rgba(255,255,255,0.28)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(cv);
  }

  _shaftTexture() {
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 256;
    const g = cv.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, 'rgba(255,255,255,0.55)');
    gr.addColorStop(0.6, 'rgba(255,255,255,0.12)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 256);
    return new THREE.CanvasTexture(cv);
  }

  // ---------- per-frame ----------
  update(playerPos) {
    const p = C.pitch;
    const bi = Math.round(playerPos.x / p), bj = Math.round(playerPos.z / p);
    if (bi === this.baseCell.i && bj === this.baseCell.j) return;
    this.baseCell = { i: bi, j: bj };

    const R = C.viewCells, d = this._dummy;
    let n = 0, np = 0, ns = 0;
    for (let di = -R; di <= R; di++) {
      for (let dj = -R; dj <= R; dj++) {
        const i = bi + di, j = bj + dj;
        if (!this.exists(i, j)) continue;
        const x = i * p, z = j * p;
        const lean = (hash2(i, j) % 100) / 100;

        d.position.set(x, C.cabH / 2, z);
        d.scale.set(1, 1, 1); d.rotation.set(0, 0, 0);
        d.updateMatrix();
        this.mesh.setMatrixAt(n, d.matrix);
        const tone = 0.82 + lean * 0.3;
        this.mesh.setColorAt(n, new THREE.Color(tone, tone, tone));

        d.position.y = -C.cabH / 2; d.scale.y = -1;
        d.updateMatrix();
        this.mirror.setMatrixAt(n, d.matrix);
        this.mirror.setColorAt(n, new THREE.Color(tone * 0.55, tone * 0.55, tone * 0.55));
        n++;

        // pool of light on most tops, brightness varies
        if (lean > 0.25) {
          d.position.set(x, C.cabH + 0.12, z);
          d.scale.set(0.7 + lean * 0.6, 0.7 + lean * 0.6, 1);
          d.rotation.set(-Math.PI / 2, 0, 0);
          d.updateMatrix();
          this.pools.setMatrixAt(np, d.matrix);
          this.pools.setColorAt(np, new THREE.Color().setScalar(0.35 + lean * 0.65));
          np++;
        }
        // shaft above brighter cabinets
        if (lean > 0.55) {
          d.position.set(x, C.cabH + 42, z);
          d.scale.set(0.8 + lean * 0.5, 1, 0.8 + lean * 0.5);
          d.rotation.set(0, 0, 0);
          d.updateMatrix();
          this.shafts.setMatrixAt(ns, d.matrix);
          ns++;
        }
      }
    }
    this.mesh.count = n; this.mirror.count = n;
    this.pools.count = np; this.shafts.count = ns;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mirror.instanceMatrix.needsUpdate = true;
    this.pools.instanceMatrix.needsUpdate = true;
    this.shafts.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    if (this.mirror.instanceColor) this.mirror.instanceColor.needsUpdate = true;
    if (this.pools.instanceColor) this.pools.instanceColor.needsUpdate = true;
  }

  // push the player out of cabinet footprints
  collide(pos) {
    const p = C.pitch, m = 1.1;
    const i = Math.round(pos.x / p), j = Math.round(pos.z / p);
    if (!this.exists(i, j)) return;
    const dx = pos.x - i * p, dz = pos.z - j * p;
    const hx = C.cabW / 2 + m, hz = C.cabD / 2 + m;
    if (Math.abs(dx) < hx && Math.abs(dz) < hz) {
      const px = hx - Math.abs(dx), pz = hz - Math.abs(dz);
      if (px < pz) pos.x = i * p + Math.sign(dx || 1) * hx;
      else pos.z = j * p + Math.sign(dz || 1) * hz;
    }
  }

  // nearest cabinet + which face the player is on
  nearest(pos) {
    const p = C.pitch;
    const i = Math.max(0, Math.round(pos.x / p)), j = Math.max(0, Math.round(pos.z / p));
    const cx = i * p, cz = j * p;
    const dx = pos.x - cx, dz = pos.z - cz;
    const normal = Math.abs(dx) > Math.abs(dz)
      ? new THREE.Vector3(Math.sign(dx), 0, 0)
      : new THREE.Vector3(0, 0, Math.sign(dz));
    const half = (normal.x ? C.cabW : C.cabD) / 2;
    const facePoint = new THREE.Vector3(
      cx + normal.x * half + (normal.x ? 0 : THREE.MathUtils.clamp(dx, -half + 4, half - 4)),
      1.6,
      cz + normal.z * half + (normal.z ? 0 : THREE.MathUtils.clamp(dz, -half + 4, half - 4))
    );
    const dist = Math.hypot(
      pos.x - (cx + normal.x * half * Math.abs(normal.x)),
      pos.z - (cz + normal.z * half * Math.abs(normal.z))
    );
    return { i, j, normal, facePoint, dist: Math.hypot(pos.x - cx, pos.z - cz) - half };
  }

  setLightColor(hex) {
    this.poolMat.color.set(hex);
    this.shaftMat.color.set(hex);
  }
}
