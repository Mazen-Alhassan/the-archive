// The Archive — diegetic fixtures: etched identity plaque + sliding drawer
import * as THREE from 'three';

export class Fixtures {
  constructor(scene) {
    this.scene = scene;

    // ---- plaque: username etched on the cabinet face ----
    this.plaqueCv = document.createElement('canvas');
    this.plaqueCv.width = 1024; this.plaqueCv.height = 256;
    this.plaqueTex = new THREE.CanvasTexture(this.plaqueCv);
    this.plaqueTex.colorSpace = THREE.SRGBColorSpace;
    this.plaqueMat = new THREE.MeshBasicMaterial({
      map: this.plaqueTex, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, opacity: 0,
    });
    this.plaque = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.5), this.plaqueMat);
    this.plaque.visible = false;
    this.scene.add(this.plaque);
    this._plaqueTarget = 0;

    // ---- drawer assembly: bezel frame + sliding drawer w/ glowing file card ----
    this.drawerGroup = new THREE.Group();
    const bezel = new THREE.Mesh(
      new THREE.PlaneGeometry(2.3, 1.35),
      new THREE.MeshBasicMaterial({ map: this._bezelTexture(), transparent: true, depthWrite: false })
    );
    bezel.position.z = 0.02;
    this.drawerGroup.add(bezel);

    this.drawerCv = document.createElement('canvas');
    this.drawerCv.width = 512; this.drawerCv.height = 256;
    this.drawerTex = new THREE.CanvasTexture(this.drawerCv);
    this.drawerTex.colorSpace = THREE.SRGBColorSpace;

    const body = new THREE.Group();
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(1.7, 0.92, 2.0),
      new THREE.MeshStandardMaterial({ color: 0x181c1f, roughness: 0.5, metalness: 0.4 })
    );
    box.position.z = -1.0;
    const front = new THREE.Mesh(
      new THREE.PlaneGeometry(1.7, 0.92),
      new THREE.MeshBasicMaterial({ map: this.drawerTex })
    );
    front.position.z = 0.011;
    // glowing card standing inside the drawer
    const card = new THREE.Mesh(
      new THREE.PlaneGeometry(1.3, 0.7),
      new THREE.MeshBasicMaterial({ color: 0xdff4f6, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
    );
    card.position.set(0, 0.62, -0.55);
    card.rotation.x = -0.18;
    this.cardLight = new THREE.PointLight(0xcfeef2, 6, 8, 2);
    this.cardLight.position.set(0, 0.8, -0.5);
    body.add(box, front, card, this.cardLight);
    this.body = body;
    this.drawerGroup.add(body);
    this.drawerGroup.visible = false;
    this.scene.add(this.drawerGroup);
    this._slide = 0; this._slideTarget = 0;
  }

  _bezelTexture() {
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 300;
    const g = cv.getContext('2d');
    g.clearRect(0, 0, 512, 300);
    g.fillStyle = 'rgba(2,3,4,0.92)'; g.fillRect(0, 0, 512, 300);
    g.strokeStyle = 'rgba(190,230,236,0.5)'; g.lineWidth = 3;
    g.strokeRect(6, 6, 500, 288);
    return new THREE.CanvasTexture(cv);
  }

  // ---- plaque API ----
  showPlaque(facePoint, normal, login, name) {
    const g = this.plaqueCv.getContext('2d');
    g.clearRect(0, 0, 1024, 256);
    g.textAlign = 'center';
    g.fillStyle = 'rgba(205,232,236,0.85)';
    g.font = '600 86px "IBM Plex Mono", monospace';
    g.fillText((login || '').toUpperCase(), 512, 120);
    g.font = '400 38px "IBM Plex Mono", monospace';
    g.fillStyle = 'rgba(205,232,236,0.45)';
    g.fillText(name ? name.toUpperCase() : 'ARCHIVE RECORD', 512, 190);
    this.plaqueTex.needsUpdate = true;
    this.plaque.position.copy(facePoint).addScaledVector(normal, 0.12);
    this.plaque.position.y = 5.2;
    this.plaque.lookAt(this.plaque.position.clone().add(normal));
    this.plaque.visible = true;
    this._plaqueTarget = 1;
  }
  hidePlaque() { this._plaqueTarget = 0; }

  // ---- drawer API ----
  openDrawer(facePoint, normal, repoName) {
    const g = this.drawerCv.getContext('2d');
    g.fillStyle = '#1b2023'; g.fillRect(0, 0, 512, 256);
    g.fillStyle = 'rgba(255,255,255,0.07)'; g.fillRect(0, 0, 512, 7);
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(176, 150, 160, 12);
    g.textAlign = 'center';
    g.fillStyle = 'rgba(215,240,244,0.9)';
    let label = (repoName || '').toLowerCase();
    if (label.length > 22) label = label.slice(0, 21) + '…';
    g.font = '500 36px "IBM Plex Mono", monospace';
    g.fillText(label, 256, 92);
    this.drawerTex.needsUpdate = true;

    this.drawerGroup.position.copy(facePoint).addScaledVector(normal, 0.03);
    this.drawerGroup.position.y = 1.55;
    this.drawerGroup.lookAt(this.drawerGroup.position.clone().add(normal));
    this.drawerGroup.visible = true;
    this._slide = Math.min(this._slide, 0.15);
    this._slideTarget = 1;
  }
  closeDrawer() { this._slideTarget = 0; }

  update(dt) {
    // plaque fade
    const k = 1 - Math.exp(-dt * 5);
    this.plaqueMat.opacity += (this._plaqueTarget - this.plaqueMat.opacity) * k;
    if (this._plaqueTarget === 0 && this.plaqueMat.opacity < 0.02) this.plaque.visible = false;
    // drawer slide (weighty ease)
    this._slide += (this._slideTarget - this._slide) * (1 - Math.exp(-dt * 4.5));
    this.body.position.z = this._slide * 1.55;
    this.cardLight.intensity = 6 * this._slide;
    if (this._slideTarget === 0 && this._slide < 0.02) this.drawerGroup.visible = false;
  }
}
