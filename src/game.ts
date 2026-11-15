import * as THREE from 'three';
import { BUILDING_BY_ID } from './data/buildings';
import { SaveManager } from './save/SaveManager';
import { checkMissions, computeDerived, createInitialStats } from './simulation';
import { World, TILE } from './world';
import { UI } from './ui';
import type { PlacedBuilding, SaveData } from './types';

export class Game {
  ui: UI;
  renderer!: THREE.WebGLRenderer;
  scene!: THREE.Scene;
  camera!: THREE.PerspectiveCamera;
  world!: World;
  clock = new THREE.Clock();
  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();
  stats = createInitialStats();
  buildings: PlacedBuilding[] = [];
  completedMissions: string[] = [];
  speed = 1;
  running = false;
  simAcc = 0;
  autoSaveAcc = 0;
  selectedUid: string | null = null;
  movingUid: string | null = null;
  hoverCell: { x: number; z: number } | null = null;
  mapId = 'plaine';
  camTarget = new THREE.Vector3(0, 0, 0);
  camYaw = Math.PI / 4;
  camPitch = 0.9;
  camDist = 60;
  dragging = false;
  lastPointer = { x: 0, y: 0 };
  pointers = new Map<number, { x: number; y: number }>();
  lastPinch = 0;
  sun!: THREE.DirectionalLight;
  ambient!: THREE.AmbientLight;

  constructor(root: HTMLElement) {
    this.ui = new UI(root);
    this.ui.onAction = (a, p) => this.handleAction(a, p);
    this.ui.renderMenu(SaveManager.hasAuto());
  }

  startNew(mapId = 'plaine') {
    this.stats = createInitialStats();
    this.buildings = [];
    this.completedMissions = [];
    this.mapId = mapId;
    this.mountGame();
  }

  mountGame() {
    this.ui.renderGame(this.stats, this.completedMissions);
    const host = this.ui.getSceneHost();
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);
    this.scene.fog = new THREE.Fog(0x87ceeb, 80, 220);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(this.renderer.domElement);

    this.ambient = new THREE.AmbientLight(0xffffff, 0.65);
    this.scene.add(this.ambient);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.0);
    this.sun.position.set(40, 60, 20);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -80; this.sun.shadow.camera.right = 80; this.sun.shadow.camera.top = 80; this.sun.shadow.camera.bottom = -80;
    this.scene.add(this.sun);

    this.world = new World(this.scene, this.mapId);
    // restore
    for (const b of this.buildings) {
      if (b.defId === 'road') this.world.placeRoad(b.x, b.z);
      else this.world.placeBuilding(b);
    }
    this.world.syncVehicles();
    this.bindEvents();
    this.onResize();
    this.running = true;
    this.clock.start();
    requestAnimationFrame(() => this.loop());
    this.ui.updateHUD(this.stats, this.completedMissions, this.world.weather);
    this.ui.toast(`Bienvenue dans votre ville (${this.mapId}) !`);
  }

  bindEvents() {
    const el = this.renderer.domElement;
    window.addEventListener('resize', () => this.onResize());
    el.addEventListener('pointerdown', (e: PointerEvent) => this.onPointerDown(e));
    el.addEventListener('pointermove', (e: PointerEvent) => this.onPointerMove(e));
    el.addEventListener('pointerup', (e: PointerEvent) => this.onPointerUp(e));
    el.addEventListener('pointercancel', (e: PointerEvent) => this.onPointerUp(e));
    el.addEventListener('wheel', (e: WheelEvent) => { e.preventDefault(); this.camDist = THREE.MathUtils.clamp(this.camDist * (1 + Math.sign(e.deltaY) * 0.08), 20, 140); }, { passive: false });
    el.addEventListener('contextmenu', (e: MouseEvent) => e.preventDefault());
  }

  onResize() {
    if (!this.renderer) return;
    const host = this.ui.getSceneHost();
    const w = host.clientWidth || window.innerWidth;
    const h = host.clientHeight || window.innerHeight;
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  setPointerFromEvent(e: PointerEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  onPointerDown(e: PointerEvent) {
    this.renderer.domElement.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.lastPointer = { x: e.clientX, y: e.clientY };
    if (this.pointers.size === 2) {
      const pts = [...this.pointers.values()];
      this.lastPinch = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    } else {
      this.dragging = true;
    }
  }

  onPointerMove(e: PointerEvent) {
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) {
      const pts = [...this.pointers.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (this.lastPinch) {
        const delta = dist - this.lastPinch;
        this.camDist = THREE.MathUtils.clamp(this.camDist - delta * 0.08, 20, 140);
        const midX = (pts[0].x + pts[1].x) / 2;
        const dx = midX - this.lastPointer.x;
        this.camYaw -= dx * 0.005;
      }
      this.lastPinch = dist;
      this.lastPointer = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      return;
    }
    if (!this.dragging) return;
    const dx = e.clientX - this.lastPointer.x;
    const dy = e.clientY - this.lastPointer.y;
    this.lastPointer = { x: e.clientX, y: e.clientY };
    if (e.buttons === 2) {
      this.camYaw -= dx * 0.005;
      this.camPitch = THREE.MathUtils.clamp(this.camPitch + dy * 0.005, 0.35, 1.25);
    } else if (this.ui.tool === 'select' && (e.pointerType === 'touch' || e.buttons === 1)) {
      // if moved a lot, treat as pan
      this.panCamera(dx, dy);
    } else if (e.buttons === 1) {
      this.panCamera(dx, dy);
    }
    this.updateHover(e);
  }

  panCamera(dx: number, dy: number) {
    const s = this.camDist * 0.0022;
    const forward = new THREE.Vector3(Math.sin(this.camYaw), 0, Math.cos(this.camYaw));
    const right = new THREE.Vector3(forward.z, 0, -forward.x);
    this.camTarget.addScaledVector(right, -dx * s);
    this.camTarget.addScaledVector(forward, -dy * s);
    const limit = (TILE * 64) / 2 - 4;
    this.camTarget.x = THREE.MathUtils.clamp(this.camTarget.x, -limit, limit);
    this.camTarget.z = THREE.MathUtils.clamp(this.camTarget.z, -limit, limit);
  }

  onPointerUp(e: PointerEvent) {
    const wasTap = this.pointers.size <= 1;
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.lastPinch = 0;
    if (this.pointers.size === 0) this.dragging = false;
    if (wasTap && e.type === 'pointerup') {
      // click/tap action
      this.setPointerFromEvent(e);
      this.handleClick();
    }
  }

  updateHover(e: PointerEvent) {
    if (!this.world) return;
    this.setPointerFromEvent(e);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObject(this.world.ground)[0];
    if (!hit) { this.hoverCell = null; return; }
    const c = this.world.worldToCell(hit.point);
    this.hoverCell = c;
    if (this.ui.tool === 'build' && this.ui.selectedDefId) {
      const def = BUILDING_BY_ID[this.ui.selectedDefId];
      if (def) {
        const valid = this.ui.selectedDefId === 'road' ? this.world.isCellFree(c.x, c.z) && this.world.inBounds(c.x, c.z)
          : this.world.isAreaFree(c.x, c.z, def.width, def.depth);
        this.world.updatePreview(c.x, c.z, valid);
      }
    } else if (this.ui.tool === 'move' && this.movingUid) {
      const b = this.buildings.find(x => x.uid === this.movingUid);
      const def = b ? BUILDING_BY_ID[b.defId] : null;
      if (b && def) {
        if (!this.world.previewMesh) this.world.setPreview(b.defId);
        const valid = this.world.isAreaFree(c.x, c.z, def.width, def.depth, b.uid);
        this.world.updatePreview(c.x, c.z, valid);
      }
    }
  }

  handleClick() {
    if (!this.world) return;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObject(this.world.ground)[0];
    if (!hit) return;
    const c = this.world.worldToCell(hit.point);
    if (this.ui.tool === 'build' && this.ui.selectedDefId) {
      this.tryPlace(this.ui.selectedDefId, c.x, c.z);
      return;
    }
    if (this.ui.tool === 'bulldoze') {
      this.tryBulldoze(c.x, c.z);
      return;
    }
    if (this.ui.tool === 'move') {
      this.handleMoveClick(c.x, c.z);
      return;
    }
    // select
    const occ = this.world.getOccupant(c.x, c.z);
    if (occ && occ !== 'road') {
      const b = this.buildings.find(x => x.uid === occ);
      if (b) this.selectBuilding(b);
    } else if (occ === 'road') {
      this.ui.showInfo(`<h4>Route</h4><p>Infrastructure de circulation.</p><p class="small">Relie les quartiers, soutient le trafic et les services.</p>`);
      this.selectedUid = null;
    } else {
      this.selectedUid = null;
      this.ui.showInfo(`<h4>Terrain</h4><p>Case libre (${c.x}, ${c.z}). Zone constructible.</p>`);
    }
  }

  handleMoveClick(x: number, z: number) {
    const occ = this.world.getOccupant(x, z);
    if (!this.movingUid) {
      if (occ && occ !== 'road') {
        const b = this.buildings.find(v => v.uid === occ);
        if (b && b.defId !== 'road') {
          this.movingUid = b.uid;
          this.world.setPreview(b.defId);
          this.ui.toast('Choisissez un nouvel emplacement.');
        } else {
          this.ui.toast('Sélectionnez un bâtiment à déplacer (pas une route).');
        }
      } else {
        this.ui.toast('Touchez un bâtiment à déplacer.');
      }
      return;
    }
    const b = this.buildings.find(v => v.uid === this.movingUid);
    if (!b) { this.movingUid = null; this.world.setPreview(null); return; }
    const def = BUILDING_BY_ID[b.defId];
    if (!def) return;
    if (!this.world.isAreaFree(x, z, def.width, def.depth, b.uid)) { this.ui.toast('Emplacement invalide.'); return; }
    // relocate
    this.world.removeBuilding(b.uid, b);
    b.x = x; b.z = z;
    this.world.placeBuilding(b);
    this.movingUid = null;
    this.world.setPreview(null);
    this.ui.toast(`${def.name} déplacé.`);
    this.selectBuilding(b);
  }

  tryPlace(defId: string, x: number, z: number) {
    const def = BUILDING_BY_ID[defId];
    if (!def) return;
    if (def.unlockTier > this.stats.tier) { this.ui.toast('Bâtiment non débloqué.'); return; }
    if (this.stats.money < def.cost) { this.ui.toast('Budget insuffisant.'); return; }
    if (defId === 'road' || defId === 'bridge' || defId === 'sidewalk' || defId === 'power_line' || defId === 'pipe') {
      // simple infra placement as road-like or building-like; roads use road system
      if (defId === 'road') {
        if (!this.world.placeRoad(x, z)) { this.ui.toast('Emplacement indisponible.'); return; }
        this.buildings.push({ uid: crypto.randomUUID(), defId, x, z, rotation: 0, level: 1, powered: true, watered: true });
      } else {
        const b: PlacedBuilding = { uid: crypto.randomUUID(), defId, x, z, rotation: 0, level: 1, powered: true, watered: true };
        if (!this.world.placeBuilding(b)) { this.ui.toast('Emplacement indisponible.'); return; }
        this.buildings.push(b);
      }
    } else {
      const b: PlacedBuilding = { uid: crypto.randomUUID(), defId, x, z, rotation: 0, level: 1, powered: true, watered: true };
      if (!this.world.placeBuilding(b)) { this.ui.toast('Zone occupée ou hors limites.'); return; }
      this.buildings.push(b);
    }
    this.stats.money -= def.cost;
    this.world.syncVehicles();
    this.ui.toast(`${def.name} construit.`);
    this.ui.updateHUD(this.stats, this.completedMissions);
  }

  tryBulldoze(x: number, z: number) {
    const res = this.world.removeAt(x, z);
    if (res.type === 'none') { this.ui.toast('Rien à supprimer.'); return; }
    if (res.type === 'road') {
      const idx = this.buildings.findIndex(b => b.defId === 'road' && b.x === x && b.z === z);
      if (idx >= 0) this.buildings.splice(idx, 1);
      this.ui.toast('Route supprimée.');
    } else if (res.uid) {
      const idx = this.buildings.findIndex(b => b.uid === res.uid);
      if (idx >= 0) {
        const b = this.buildings[idx];
        this.world.removeBuilding(b.uid, b);
        this.buildings.splice(idx, 1);
        this.ui.toast('Bâtiment supprimé.');
        if (this.selectedUid === res.uid) { this.selectedUid = null; this.ui.showInfo('<h4>Ville</h4><p>Sélectionnez un bâtiment.</p>'); }
      }
    }
    this.world.syncVehicles();
  }

  selectBuilding(b: PlacedBuilding) {
    this.selectedUid = b.uid;
    const def = BUILDING_BY_ID[b.defId];
    if (!def) return;
    const upCost = Math.floor(def.cost * 0.6 * b.level);
    this.ui.showInfo(`<h4>${def.name}</h4>
      <p>${def.description}</p>
      <p>Niveau: ${b.level} · Entretien: ${def.upkeep * b.level} € · Capacité: ${(def.capacity||0)*b.level || '-'} · Emplois: ${(def.jobs||0)*b.level || '-'}</p>
      <p>Élec: ${(def.powerProd||0)*b.level - (def.powerUse||0)*b.level} · Eau: ${(def.waterProd||0)*b.level - (def.waterUse||0)*b.level}</p>
      <div class="row">
        <button class="btn" id="upgrade-btn">Améliorer (${upCost} €)</button>
        <button class="btn" id="move-btn">Déplacer</button>
        <button class="btn" id="recenter-btn">Recentrer</button>
      </div>`);
    this.ui.root.querySelector('#upgrade-btn')?.addEventListener('click', () => this.upgradeBuilding(b.uid));
    this.ui.root.querySelector('#move-btn')?.addEventListener('click', () => {
      this.ui.tool = 'move'; this.movingUid = b.uid; this.world.setPreview(b.defId); this.ui.syncToolButtons(); this.ui.toast('Choisissez un nouvel emplacement.');
    });
    this.ui.root.querySelector('#recenter-btn')?.addEventListener('click', () => {
      const p = this.world.cellToWorld(b.x, b.z); this.camTarget.set(p.x, 0, p.z);
    });
  }

  upgradeBuilding(uid: string) {
    const b = this.buildings.find(x => x.uid === uid);
    if (!b) return;
    const def = BUILDING_BY_ID[b.defId]; if (!def) return;
    const cost = Math.floor(def.cost * 0.6 * b.level);
    if (this.stats.money < cost) { this.ui.toast('Budget insuffisant pour améliorer.'); return; }
    b.level += 1;
    this.stats.money -= cost;
    this.ui.toast(`${def.name} amélioré au niveau ${b.level}.`);
    this.selectBuilding(b);
  }

  handleAction(action: string, payload?: any) {
    if (action === 'new-screen') this.ui.renderNewMap();
    else if (action === 'new') this.startNew(payload?.mapId || 'plaine');
    else if (action === 'continue') { const d = SaveManager.load('auto'); if (d) this.loadData(d); }
    else if (action === 'load-screen') this.ui.renderLoad(SaveManager.listSlots());
    else if (action === 'settings') this.ui.renderSettings();
    else if (action === 'menu') { if (this.renderer) { this.saveAuto(); this.cleanup3D(); } this.ui.renderMenu(SaveManager.hasAuto()); }
    else if (action === 'load-slot') { const d = SaveManager.load(payload.slot); if (d) this.loadData(d); else this.ui.toast('Sauvegarde invalide.'); }
    else if (action === 'delete-slot') { SaveManager.deleteSlot(payload.slot); this.ui.renderLoad(SaveManager.listSlots()); }
    else if (action === 'select-def') { this.world?.setPreview(payload.defId); this.ui.tool = 'build'; this.movingUid = null; }
    else if (action === 'tool') {
      if (payload.tool !== 'build' && payload.tool !== 'move') { this.world?.setPreview(null); this.movingUid = null; }
      if (payload.tool === 'build') this.world?.setPreview(this.ui.selectedDefId);
      if (payload.tool === 'move' && !this.movingUid) this.world?.setPreview(null);
    }
    else if (action === 'speed') this.speed = payload.speed;
    else if (action === 'save') { this.saveSlot('slot1'); this.ui.toast('Ville sauvegardée (slot1).'); }
    else if (action === 'recenter') { this.camTarget.set(0,0,0); this.camDist = 60; this.camYaw = Math.PI/4; this.ui.toast('Caméra recentrée.'); }
    else if (action === 'toggle-weather') {
      const w = this.world?.weather === 'rain' ? 'clear' : 'rain';
      this.world?.setWeather(w);
      this.ui.toast(w === 'rain' ? 'Météo : pluie' : 'Météo : ciel dégagé');
      this.ui.updateHUD(this.stats, this.completedMissions, w);
    }
    else if (action === 'category') { /* noop */ }
  }

  loadData(data: SaveData) {
    this.stats = data.stats || createInitialStats();
    this.buildings = data.buildings || [];
    this.completedMissions = data.completedMissions || [];
    this.mapId = data.mapId || 'plaine';
    // separate roads (stored as buildings with defId road in this implementation)
    this.mountGame();
  }

  saveData(slot: string) {
    const roads = this.buildings.filter(b => b.defId === 'road').map(b => ({ x: b.x, z: b.z }));
    const data: SaveData = { version: 1, timestamp: Date.now(), mapId: this.mapId, buildings: this.buildings, roads, stats: this.stats, unlockedMissions: [], completedMissions: this.completedMissions };
    return SaveManager.save(slot, data);
  }
  saveAuto() { this.saveData('auto'); }
  saveSlot(slot: string) { this.saveData(slot); }

  cleanup3D() {
    this.running = false;
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.domElement.remove();
    }
  }

  loop() {
    if (!this.running) return;
    requestAnimationFrame(() => this.loop());
    const dt = Math.min(this.clock.getDelta(), 0.1);
    if (this.speed > 0) {
      this.simAcc += dt * this.speed;
      this.autoSaveAcc += dt;
      if (this.simAcc >= 1) { this.simAcc -= 1; this.tick(); }
      if (this.autoSaveAcc >= 20) { this.autoSaveAcc = 0; this.saveAuto(); }
      this.world.updateVehicles(dt * 60 * this.speed);
    }
    this.world.updateEffects(dt * Math.max(1, this.speed));
    this.updateCamera();
    this.updateDayNight();
    this.renderer.render(this.scene, this.camera);
  }

  tick() {
    const derived = computeDerived(this.buildings, this.stats);
    this.stats = derived.stats;
    const res = checkMissions(this.stats, this.buildings, this.completedMissions);
    if (res.newlyCompleted.length) {
      this.completedMissions.push(...res.newlyCompleted);
      this.stats.money += res.reward;
      this.ui.toast(`Mission accomplie ! +${res.reward} €`);
    }
    if (this.stats.money < -2000) this.ui.toast('Attention : finances critiques !');
    this.world.syncVehicles();
    this.ui.updateHUD(this.stats, this.completedMissions, this.world.weather);
    if (this.selectedUid) {
      const b = this.buildings.find(x => x.uid === this.selectedUid);
      if (b) this.selectBuilding(b);
    }
  }

  updateCamera() {
    const y = Math.cos(this.camPitch) * this.camDist;
    const h = Math.sin(this.camPitch) * this.camDist;
    this.camera.position.set(this.camTarget.x + Math.sin(this.camYaw) * h, Math.max(8, y), this.camTarget.z + Math.cos(this.camYaw) * h);
    this.camera.lookAt(this.camTarget);
  }

  updateDayNight() {
    const t = this.stats.timeOfDay;
    const dayFactor = Math.max(0, Math.sin(((t - 6) / 24) * Math.PI * 2));
    const night = dayFactor < 0.25;
    const sky = new THREE.Color().setHSL(0.58, 0.55, 0.18 + dayFactor * 0.5);
    if (this.world?.weather === 'rain') sky.multiplyScalar(0.75);
    this.scene.background = sky;
    (this.scene.fog as THREE.Fog).color.copy(sky);
    this.sun.intensity = 0.12 + dayFactor * 1.15;
    this.ambient.intensity = 0.18 + dayFactor * 0.55;
    const angle = ((t - 6) / 24) * Math.PI * 2;
    this.sun.position.set(Math.cos(angle) * 60, Math.max(10, Math.sin(angle) * 70), 30);
    this.world?.setNightMode(night);
  }
}