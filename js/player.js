// The Archive — the small figure, weighty third-person movement, travel flights
import * as THREE from 'three';
import { C, emit } from './config.js';

export class Player {
  constructor(world, cabinets) {
    this.world = world;
    this.cabinets = cabinets;

    this.pos = new THREE.Vector3(-42, 0, -42);
    this.vel = new THREE.Vector3();
    this.yaw = Math.PI / 4; // face the corner of the grid
    this.pitch = 0.06;
    this.keys = {};
    this.locked = false;
    this.inputEnabled = false;
    this.travel = null;

    // --- the figure: a dim silhouette carrying a single clean light ---
    const g = new THREE.Group();
    // body: barely-lit silhouette — must NOT bloom (stays under threshold)
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x3c4a55, emissive: 0x223036, emissiveIntensity: 0.6, roughness: 0.6,
    });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.62, 4, 10), bodyMat);
    body.position.y = 0.72;
    // head: the lantern — the only emissive hotspot on the figure
    const headMat = new THREE.MeshStandardMaterial({
      color: 0xdff4f8, emissive: 0xcfeef4, emissiveIntensity: 2.0, roughness: 0.3,
    });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), headMat);
    head.position.y = 1.32;
    // soft round halo sprite — a stable, circular glow that doesn't depend on
    // bloom resolution (this is what makes the head read as a clean lamp)
    const haloCv = document.createElement('canvas');
    haloCv.width = haloCv.height = 128;
    const hg = haloCv.getContext('2d');
    const hgr = hg.createRadialGradient(64, 64, 2, 64, 64, 64);
    hgr.addColorStop(0, 'rgba(225,245,250,0.85)');
    hgr.addColorStop(0.3, 'rgba(190,230,240,0.25)');
    hgr.addColorStop(1, 'rgba(190,230,240,0)');
    hg.fillStyle = hgr; hg.fillRect(0, 0, 128, 128);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(haloCv), transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.8,
    }));
    halo.scale.set(1.25, 1.25, 1);
    halo.position.y = 1.32;
    this.lamp = new THREE.PointLight(0xbfe2ee, 4.5, 20, 1.6);
    this.lamp.position.set(0, 1.5, 0);
    g.add(body, head, halo, this.lamp);
    this.mesh = g;
    world.scene.add(g);

    // mirrored figure for the floor reflection
    this.mirror = g.clone();
    this.mirror.scale.y = -1;
    const mLight = this.mirror.children.find((c) => c.isPointLight);
    if (mLight) this.mirror.remove(mLight);
    world.scene.add(this.mirror);

    this._bind();
  }

  _bind() {
    const canvas = this.world.renderer.domElement;

    // any real input activity refreshes this timestamp — a genuinely held
    // movement key auto-repeats keydown, so a "held" key with NO events for
    // seconds is a phantom (missed keyup) and gets cleared by the watchdog
    this._lastEvt = performance.now();
    this.keyInfo = {};   // per-key: time of last event + whether auto-repeat began
    const touch = () => { this._lastEvt = performance.now(); };

    addEventListener('keydown', (e) => {
      touch();
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      const k = this.keyInfo[e.code] || (this.keyInfo[e.code] = { last: 0, repeated: false });
      if (!this.keys[e.code]) k.repeated = false;   // fresh physical press
      else if (e.repeat) k.repeated = true;         // OS auto-repeat confirmed
      k.last = this._lastEvt;
      this.keys[e.code] = true;
    });
    addEventListener('keyup', (e) => {
      touch();
      this.keys[e.code] = false;
    });
    addEventListener('pointerdown', touch, true);
    addEventListener('pointerup', touch, true);
    // ending a drag anywhere (even off-canvas) so the look-drag can't stick on
    addEventListener('pointerup', () => { this.dragging = false; });

    // --- clear any held keys when the tab loses focus/visibility ---
    // (a keyup fired while unfocused is missed, leaving a key stuck "down"
    //  and the figure drifting forever — this is that fix)
    const release = () => { this.keys = {}; this.vel.set(0, 0, 0); this.dragging = false; };
    addEventListener('blur', release);
    addEventListener('focus', release);
    document.addEventListener('visibilitychange', () => { if (document.hidden) release(); });
    // fullscreen transitions reshuffle focus and can swallow keyups — start clean
    document.addEventListener('fullscreenchange', release);
    document.addEventListener('webkitfullscreenchange', release);

    // --- drag anywhere on the canvas to look around (no pointer lock needed) ---
    this.dragging = false;
    this.dragMoved = 0;
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', (e) => {
      if (this.travel) return;
      this.dragging = true;
      this.dragMoved = 0;
      this._lastX = e.clientX;
      this._lastY = e.clientY;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    });
    const stop = (e) => {
      this.dragging = false;
      try { canvas.releasePointerCapture(e.pointerId); } catch (err) {}
    };
    canvas.addEventListener('pointerup', stop);
    canvas.addEventListener('pointercancel', stop);
    canvas.addEventListener('pointermove', (e) => {
      if (!this.dragging || this.travel) return;
      const dx = e.clientX - this._lastX, dy = e.clientY - this._lastY;
      this._lastX = e.clientX; this._lastY = e.clientY;
      this.dragMoved += Math.abs(dx) + Math.abs(dy);
      this._look(dx, dy);
    });

    // --- pointer lock is still supported if something requests it ---
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) this.keys = {};
    });
    addEventListener('mousemove', (e) => {
      if (!this.locked || this.travel) return;
      this._look(e.movementX, e.movementY);
    });
  }

  _look(dx, dy) {
    this.yaw -= dx * 0.0042;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dy * 0.0032, -0.6, 1.15);
  }

  // true if the last pointer gesture was a look-drag (so click-to-open is ignored)
  consumedDrag() { return this.dragMoved > 6; }

  lock() { this.world.renderer.domElement.requestPointerLock(); }

  forward() { return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }

  // Fly to a cabinet face: rise, glide, descend in front of it
  travelTo(i, j) {
    const p = C.pitch;
    const center = new THREE.Vector3(i * p, 0, j * p);
    // approach from whichever aisle side the player is closer to
    const d = this.pos.clone().sub(center); d.y = 0;
    const n = Math.abs(d.x) > Math.abs(d.z)
      ? new THREE.Vector3(Math.sign(d.x || -1), 0, 0)
      : new THREE.Vector3(0, 0, Math.sign(d.z || -1));
    // land just inside the aisle, nearer the target face than the opposing one
    const dest = center.clone().addScaledVector(n, (n.x ? C.cabW : C.cabD) / 2 + 5);
    const dist = dest.distanceTo(this.pos);
    const dur = THREE.MathUtils.clamp(dist / 55, 2.2, 9);
    this.travel = {
      t: 0, dur,
      from: this.pos.clone(), to: dest,
      apex: THREE.MathUtils.clamp(dist * 0.22, 4, 34),
      yawFrom: this.yaw,
      yawTo: Math.atan2(-n.x, -n.z),
    };
    emit('travel-start');
  }

  update(dt) {
    if (this.travel) this._updateTravel(dt);
    else this._updateWalk(dt);

    // figure + mirror
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;
    this.mirror.position.set(this.pos.x, -this.pos.y, this.pos.z);
    this.mirror.rotation.y = this.yaw;

    // --- third-person camera, damped ---
    const cam = this.world.camera;
    const dist = this.travel ? C.camDist + 8 : C.camDist;
    const target = this.pos.clone().add(new THREE.Vector3(0, 1.7, 0));
    const off = new THREE.Vector3(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch) + 0.22,
      -Math.cos(this.yaw) * Math.cos(this.pitch)
    ).multiplyScalar(dist);
    const desired = target.clone().add(off);
    desired.y = Math.max(desired.y, 0.6);
    this._clampCamera(target, desired);
    // during travel the camera tracks tightly and looks straight at the figure,
    // so it never slides out of frame at flight speed
    const k = 1 - Math.exp(-dt * (this.travel ? 5.5 : 7));
    cam.position.lerp(desired, k);
    const look = this.travel ? target : target.clone().addScaledVector(this.forward(), 3);
    if (!this._lookAt) this._lookAt = look.clone();
    this._lookAt.lerp(look, 1 - Math.exp(-dt * (this.travel ? 10 : 7)));
    cam.lookAt(this._lookAt);
  }

  // pull the camera in along its boom if it would sit inside a cabinet
  _clampCamera(target, desired) {
    const inside = (x, y, z) => {
      if (y > C.cabH + 0.6) return false;
      const p = C.pitch;
      const i = Math.round(x / p), j = Math.round(z / p);
      if (i < 0 || j < 0) return false;
      return Math.abs(x - i * p) < C.cabW / 2 + 0.6 && Math.abs(z - j * p) < C.cabD / 2 + 0.6;
    };
    if (!inside(desired.x, desired.y, desired.z)) return;
    const dir = desired.clone().sub(target);
    for (let t = 0.95; t >= 0.18; t -= 0.045) {
      const x = target.x + dir.x * t, y = target.y + dir.y * t, z = target.z + dir.z * t;
      if (!inside(x, y, z)) { desired.set(x, Math.max(y, 0.5), z); return; }
    }
    desired.copy(target).addScaledVector(dir, 0.16);
  }

  _updateWalk(dt) {
    // --- release phantom (stuck) keys ---------------------------------------
    // A physically-held key fires OS auto-repeat keydowns continuously. Two
    // tiers: once auto-repeat has begun, >300ms of silence means the key was
    // released (we just missed the keyup — fullscreen toasts and focus shuffles
    // eat them); if auto-repeat never began, drop the key after the OS
    // initial-delay grace of 650ms. Stuck keys die in well under a second.
    const now = performance.now();
    for (const code in this.keys) {
      if (!this.keys[code]) continue;
      const k = this.keyInfo[code] || { last: 0, repeated: false };
      const quiet = now - k.last;
      if ((k.repeated && quiet > 300) || (!k.repeated && quiet > 650)) {
        this.keys[code] = false;
      }
    }

    const sprint = this.keys.ShiftLeft || this.keys.ShiftRight;
    const maxV = C.moveSpeed * (sprint ? 2.1 : 1);
    const accel = maxV * 3.8;
    const dir = new THREE.Vector3();
    if (this.inputEnabled) {
      const f = this.forward();
      const r = new THREE.Vector3(f.z, 0, -f.x);
      if (this.keys.KeyW || this.keys.ArrowUp) dir.add(f);
      if (this.keys.KeyS || this.keys.ArrowDown) dir.sub(f);
      if (this.keys.KeyA || this.keys.ArrowLeft) dir.add(r);
      if (this.keys.KeyD || this.keys.ArrowRight) dir.sub(r);
    }
    if (dir.lengthSq() > 0) {
      dir.normalize();
      this.vel.addScaledVector(dir, accel * dt);
      if (this.vel.length() > maxV) this.vel.setLength(maxV);
    }
    // heavy damping = deliberate, weighty motion
    this.vel.multiplyScalar(Math.exp(-dt * (dir.lengthSq() > 0 ? 1.2 : 4.5)));
    // deadzone: snap imperceptible residual velocity to zero so nothing creeps
    if (this.vel.lengthSq() < 1e-4) this.vel.set(0, 0, 0);
    this.pos.addScaledVector(this.vel, dt);
    this.pos.y = 0;
    this.cabinets.collide(this.pos);
  }

  _updateTravel(dt) {
    const tr = this.travel;
    tr.t += dt / tr.dur;
    const t = Math.min(tr.t, 1);
    const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; // easeInOutCubic
    this.pos.lerpVectors(tr.from, tr.to, e);
    this.pos.y = Math.sin(Math.min(e, 1) * Math.PI) * tr.apex;
    // turn toward the destination face over the flight
    let dy = tr.yawTo - tr.yawFrom;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.yaw = tr.yawFrom + dy * e;
    this.pitch = 0.06 + Math.sin(e * Math.PI) * 0.25;
    if (t >= 1) {
      this.pos.copy(tr.to); this.pos.y = 0;
      this.vel.set(0, 0, 0);
      this.travel = null;
      emit('travel-end');
    }
  }
}
