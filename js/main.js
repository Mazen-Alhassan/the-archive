// The Archive — entry point: wires world, cabinets, player, fixtures, UI
import * as THREE from 'three';
import { C, on } from './config.js';
import { World } from './world.js';
import { Cabinets } from './cabinets.js';
import { Fixtures } from './fixtures.js';
import { Player } from './player.js';
import { UI } from './ui.js';

const world = new World(document.getElementById('scene'));
const cabinets = new Cabinets(world.scene);
const fixtures = new Fixtures(world.scene);
const player = new Player(world, cabinets);
const ui = new UI(cabinets);

cabinets.update(player.pos);
world.snapLights(player.pos.x, player.pos.z);

// ---- enter the archive ----
on('enter', () => {
  player.inputEnabled = true;
  document.getElementById('hud').classList.add('show');
});

// ---- search travel ----
on('travel', ({ i, j }) => {
  ui.leave();
  player.travelTo(i, j);
});

// ---- diegetic fixtures follow identification + drawer browsing ----
let nearFace = null;
on('identified', ({ user }) => {
  if (nearFace) fixtures.showPlaque(nearFace.facePoint, nearFace.normal, user.login, user.name);
});
on('left', () => { fixtures.hidePlaque(); fixtures.closeDrawer(); });
on('drawer', ({ repo }) => {
  if (nearFace) fixtures.openDrawer(nearFace.facePoint, nearFace.normal, repo.name);
});
on('drawer-close', () => fixtures.closeDrawer());

// ---- open panel by clicking while near (ignore look-drags) ----
document.getElementById('scene').addEventListener('click', () => {
  if (player.consumedDrag()) return;
  if (ui.nearUser && !ui.panelOpen && !player.travel) ui.openPanel();
});

// ---- proximity probe (throttled) ----
let probeT = 0;
function probe(dt) {
  probeT += dt;
  if (probeT < 0.15) return;
  probeT = 0;
  if (player.travel) return;
  const n = cabinets.nearest(player.pos);
  if (n.dist < 16 && cabinets.exists(n.i, n.j)) {
    nearFace = n;
    ui.approach(n.i, n.j);
  } else if (n.dist > 22 && ui.nearCell) {
    nearFace = null;
    ui.leave();
  }
}

// ---- tweaks bridge (from the React panel) ----
addEventListener('archive-tweaks', (e) => {
  const t = e.detail || {};
  if (t.fog !== undefined) world.setFog(t.fog);
  if (t.bloom !== undefined) world.setBloom(t.bloom);
  if (t.light !== undefined) { world.setLightColor(t.light); cabinets.setLightColor(t.light); }
  if (t.camDist !== undefined) C.camDist = t.camDist;
  if (t.speed !== undefined) C.moveSpeed = t.speed;
  if (t.grain !== undefined) document.getElementById('grain').style.display = t.grain ? 'block' : 'none';
});

// ---- loop ----
window.__archive = { world, cabinets, player, ui, C };
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  player.update(dt);
  cabinets.update(player.pos);
  world.snapLights(player.pos.x, player.pos.z);
  fixtures.update(dt);
  probe(dt);
  world.render();
}
animate();
