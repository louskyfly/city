import * as THREE from 'three';
import { BUILDING_BY_ID } from './data/buildings';
import { SaveManager } from './save/SaveManager';
import { checkMissions, computeDerived, createDefaultPolicies, createInitialStats } from './simulation';
import { World, TILE, GRID_SIZE } from './world';
import { UI } from './ui';
import type { PlacedBuilding, Policies, SaveData, StatsPoint } from './types';

const ISO_DIR = new THREE.Vector3(1, 1, 1).normalize();

export class Game {
  ui: UI;
  renderer!: THREE.WebGLRenderer;
  scene!: THREE.Scene;
  camera!: THREE.OrthographicCamera;
  world!: World;
  clock = { last: performance.now() };
  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();
  stats = createInitialStats();
  policies: Policies = createDefaultPolicies();
  statsHistory: StatsPoint[] = [];
  historyAcc = 0;
  buildings: PlacedBuilding[] = [];
  completedMissions: string[] = [];
  speed = 1;
  running = false;
  simAcc = 0;
  autoSaveAcc = 0;
  selectedUid: string | null = null;
  movingUid: string | null = null;
  mapId = 'plaine';
  camTarget = new THREE.Vector3(0, 0, 0);
  zoomFactor = 1;
  viewSize = 20;
  dragging = false;
  dragMoved = false;
  isPanning = false;
  downPointer = { x: 0, y: 0 };
  lastPointer = { x: 0, y: 0 };
  pointers = new Map<number, { x: number; y: number }>();
  lastPinch = 0;
  continuousTimer: number | null = null;
  simTimer: number | null = null;
  lastPlaceCell: { x: number; z: number } | null = null;
  sun!: THREE.DirectionalLight;
  ambient!: THREE.AmbientLight;
  private lastNight: boolean | null = null;
  private resizeHandler = () => this.onResize();
  private keyHandler = (e: KeyboardEvent) => this.onKey(e);

  constructor(root: HTMLElement) {
    this.ui = new UI(root);
    this.ui.onAction = (a, p) => this.handleAction(a, p);
    this.ui.renderMenu(SaveManager.hasAuto());
  }

  // ---------------------------------------------------------------- lifecycle

  startNew(mapId = 'plaine', showcase = false) {
    this.stats = createInitialStats();
    this.policies = createDefaultPolicies();
    this.statsHistory = [];
    this.historyAcc = 0;
    this.buildings = [];
    this.completedMissions = [];
    this.mapId = mapId;
    this.selectedUid = null;
    this.movingUid = null;
    this.mountGame();
    if (showcase) this.buildShowcase();
  }

  mountGame() {
    this.cleanup3D();
    this.ui.renderGame(this.stats, this.completedMissions);
    const host = this.ui.getSceneHost();

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x9fd4ea);
    this.scene.fog = new THREE.Fog(0x9fd4ea, 190, 340);

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.style.touchAction = 'none';
    host.appendChild(this.renderer.domElement);

    this.ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(this.ambient);
    this.sun = new THREE.DirectionalLight(0xfff6e8, 1.35);
    this.sun.position.set(60, 100, 40);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const shadowCam = this.sun.shadow.camera;
    shadowCam.left = -85; shadowCam.right = 85; shadowCam.top = 85; shadowCam.bottom = -85;
    shadowCam.near = 1; shadowCam.far = 300;
    shadowCam.updateProjectionMatrix();
    this.scene.add(this.sun);
    // subtle fill for facades facing away from the sun
    const fill = new THREE.DirectionalLight(0xdcecff, 0.35);
    fill.position.set(-50, 40, -30);
    this.scene.add(fill);

    this.world = new World(this.scene, this.mapId);

    for (const b of this.buildings) {
      if (b.defId === 'road') this.world.placeRoad(b.x, b.z);
      else this.world.placeBuilding(b);
    }
    this.world.syncVehicles();

    this.bindEvents();
    this.onResize();
    this.camTarget.set(0, 0, 0);
    this.running = true;
    this.clock.last = performance.now();
    this.ui.updateHUD(this.stats, this.completedMissions, this.world.weather);
    this.ui.showInfo('<h4>Bienvenue dans votre ville</h4><p>Pour démarrer : construisez une <b>centrale électrique</b> et un <b>château d’eau</b>, puis des maisons et des routes.</p>');
    // Simulation runs on its own timer so it keeps advancing even if the
    // render loop is throttled (e.g. iPad tab switches).
    if (this.simTimer !== null) window.clearInterval(this.simTimer);
    this.simTimer = window.setInterval(() => {
      if (this.running) this.simulate(0.25);
    }, 250);
    requestAnimationFrame(() => this.loop());
  }

  private simulate(dt: number) {
    if (this.speed <= 0) return;
    this.simAcc += dt * this.speed;
    this.autoSaveAcc += dt;
    if (this.simAcc >= 1) {
      this.simAcc = 0;
      this.tick();
    }
    if (this.autoSaveAcc >= 25) { this.autoSaveAcc = 0; this.saveAuto(); }
  }

  private buildShowcase() {
    this.stats.money = 60000;
    this.stats.tier = 5;
    const layout: [string, number, number][] = [
      ['power_plant', -7, -4], ['water_tower', -3, -4], ['school', 0, -4], ['town_hall', 4, -4], ['hospital', 8, -4],
      ['house', -8, 0], ['house', -7, 0], ['house', -6, 0], ['small_apartment', -5, 0],
      ['large_apartment', -2, 0], ['shop', 1, 0], ['restaurant', 3, 0], ['supermarket', 5, 0],
      ['park', -8, 3], ['factory', -5, 3], ['luxury_residence', -2, 3], ['mall', 2, 3],
      ['central_park', -8, 6], ['skyscraper', 2, 6], ['stadium', 7, 3], ['business_tower', 7, 6],
      ['power_plant', -7, 9], ['water_tower', 11, 0], ['water_tower', 11, 9],
      ['bus_stop', -4, -5], ['bus_stop', 0, -5], ['bus_stop', 5, -5], ['bus_stop', -9, 2],
    ];
    for (let x = -10; x <= 12; x++) if (!this.world.getOccupant(x, -6)) this.tryPlace('road', x, -6, true);
    for (let z = -5; z <= 10; z++) if (!this.world.getOccupant(-10, z)) this.tryPlace('road', -10, z, true);
    for (let x = -9; x <= 11; x++) if (!this.world.getOccupant(x, 2)) this.tryPlace('road', x, 2, true);
    for (const [id, x, z] of layout) {
      const def = BUILDING_BY_ID[id];
      if (!def || !this.world.isAreaFree(x, z, def.width, def.depth)) continue;
      this.tryPlace(id, x, z, true);
    }
    this.stats.population = 320;
    this.stats.tier = 2;
    this.ui.updateHUD(this.stats, this.completedMissions, this.world.weather);
    this.ui.toast('Ville d’exemple : explorez et construisez à votre tour !');
  }

  cleanup3D() {
    this.running = false;
    this.stopContinuous();
    if (this.simTimer !== null) { window.clearInterval(this.simTimer); this.simTimer = null; }
    window.removeEventListener('resize', this.resizeHandler);
    window.removeEventListener('keydown', this.keyHandler);
    if (this.renderer) {
      const el = this.renderer.domElement;
      this.renderer.dispose();
      el.remove();
    }
    this.pointers.clear();
  }

  bindEvents() {
    const el = this.renderer.domElement;
    window.addEventListener('resize', this.resizeHandler);
    window.addEventListener('keydown', this.keyHandler);
    el.addEventListener('pointerdown', (e: PointerEvent) => this.onPointerDown(e));
    el.addEventListener('pointermove', (e: PointerEvent) => this.onPointerMove(e));
    el.addEventListener('pointerup', (e: PointerEvent) => this.onPointerUp(e));
    el.addEventListener('pointercancel', (e: PointerEvent) => this.onPointerUp(e));
    el.addEventListener('pointerleave', (e: PointerEvent) => this.onPointerUp(e));
    el.addEventListener('wheel', (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1.09 : 0.92;
      this.zoomFactor = THREE.MathUtils.clamp(this.zoomFactor * factor, 0.25, 3.2);
      this.onResize();
    }, { passive: false });
    el.addEventListener('contextmenu', (e: MouseEvent) => e.preventDefault());
  }

  onResize() {
    if (!this.renderer) return;
    const host = this.ui.getSceneHost();
    const w = host.clientWidth || window.innerWidth;
    const h = host.clientHeight || window.innerHeight;
    const aspect = w / Math.max(1, h);
    // Adapt the base framing to the screen shape, then apply user zoom.
    const base = Math.max(16, 14 / Math.max(0.35, aspect));
    this.viewSize = THREE.MathUtils.clamp(base * this.zoomFactor, 7, 70);
    this.camera.left = -this.viewSize * aspect;
    this.camera.right = this.viewSize * aspect;
    this.camera.top = this.viewSize;
    this.camera.bottom = -this.viewSize;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  setZoom(size: number) {
    // Legacy helper used by the wheel: converts an absolute size to a factor.
    const host = this.ui.getSceneHost();
    const aspect = (host.clientWidth || window.innerWidth) / Math.max(1, host.clientHeight || window.innerHeight);
    const base = Math.max(16, 14 / Math.max(0.35, aspect));
    this.zoomFactor = THREE.MathUtils.clamp(size / base, 0.25, 3.2);
    this.onResize();
  }

  onKey(e: KeyboardEvent) {
    if (!this.world) return;
    if (e.key === 'Escape') {
      this.ui.tool = 'select';
      this.ui.selectedDefId = null;
      this.movingUid = null;
      this.world.setPreview(null);
      this.ui.syncToolButtons();
      this.ui.showInfo('<h4>Ville</h4><p>Sélectionnez un bâtiment sur la carte.</p>');
    } else if (e.key === ' ') {
      e.preventDefault();
      this.speed = this.speed === 0 ? 1 : 0;
      this.ui.setSpeedButtons(this.speed);
    } else if (e.key === 'r' || e.key === 'R') {
      this.handleAction('recenter');
    }
  }

  // ------------------------------------------------------------------- input

  setPointerFromEvent(e: PointerEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
  }

  onPointerDown(e: PointerEvent) {
    this.renderer.domElement.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.lastPointer = { x: e.clientX, y: e.clientY };
    this.downPointer = { x: e.clientX, y: e.clientY };
    this.dragMoved = false;
    this.isPanning = false;
    if (this.pointers.size >= 2) {
      const pts = [...this.pointers.values()];
      this.lastPinch = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      this.stopContinuous();
    } else {
      this.dragging = true;
      this.setPointerFromEvent(e);
      this.updateHover(e);
    }
  }

  onPointerMove(e: PointerEvent) {
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (this.pointers.size >= 2) {
      const pts = [...this.pointers.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (this.lastPinch > 0) {
        const delta = dist - this.lastPinch;
        const factor = delta > 0 ? 0.96 : 1.04;
        this.zoomFactor = THREE.MathUtils.clamp(this.zoomFactor * factor, 0.25, 3.2);
        this.onResize();
        const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
        this.panCamera(mid.x - this.lastPointer.x, mid.y - this.lastPointer.y);
        this.lastPointer = mid;
      }
      this.lastPinch = dist;
      this.dragMoved = true;
      return;
    }

    if (!this.dragging) {
      this.updateHover(e);
      return;
    }

    const dx = e.clientX - this.lastPointer.x;
    const dy = e.clientY - this.lastPointer.y;
    const roadBuild = this.ui.tool === 'build' && this.ui.selectedDefId === 'road';
    if (Math.hypot(e.clientX - this.downPointer.x, e.clientY - this.downPointer.y) > 5) {
      this.dragMoved = true;
      // dragging a road or the demolition tool paints continuously
      if (!this.isPanning && (roadBuild || this.ui.tool === 'bulldoze')) {
        this.startContinuous();
      } else if (!this.isPanning) {
        this.isPanning = true;
        this.stopContinuous();
      }
    }
    this.lastPointer = { x: e.clientX, y: e.clientY };

    if (!(this.dragMoved && (roadBuild || this.ui.tool === 'bulldoze'))) {
      this.panCamera(dx, dy);
    }
    this.updateHover(e);
  }

  onPointerUp(e: PointerEvent) {
    const wasSingle = this.pointers.size <= 1;
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.lastPinch = 0;
    if (this.pointers.size === 0) this.dragging = false;
    this.stopContinuous();
    if (wasSingle && e.type === 'pointerup' && !this.dragMoved) {
      this.setPointerFromEvent(e);
      this.handleClick();
    }
    this.isPanning = false;
  }

  panCamera(dx: number, dy: number) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const worldPerPixel = (this.viewSize * 2) / Math.max(1, rect.height);
    const right = new THREE.Vector3(1, 0, -1).normalize();
    const forward = new THREE.Vector3(1, 0, 1).normalize();
    this.camTarget.addScaledVector(right, -dx * worldPerPixel);
    this.camTarget.addScaledVector(forward, dy * worldPerPixel);
    const limit = (TILE * GRID_SIZE) / 2 - 3;
    this.camTarget.x = THREE.MathUtils.clamp(this.camTarget.x, -limit, limit);
    this.camTarget.z = THREE.MathUtils.clamp(this.camTarget.z, -limit, limit);
  }

  startContinuous() {
    this.stopContinuous();
    this.continuousTimer = window.setInterval(() => {
      if (!this.world) return;
      const cell = this.pickCell();
      if (!cell) return;
      if (this.lastPlaceCell && cell.x === this.lastPlaceCell.x && cell.z === this.lastPlaceCell.z) return;
      this.lastPlaceCell = cell;
      if (this.ui.tool === 'build' && this.ui.selectedDefId) this.tryPlace(this.ui.selectedDefId, cell.x, cell.z, true);
      else if (this.ui.tool === 'bulldoze') this.tryBulldoze(cell.x, cell.z, true);
    }, 70);
  }

  stopContinuous() {
    if (this.continuousTimer !== null) { window.clearInterval(this.continuousTimer); this.continuousTimer = null; }
    this.lastPlaceCell = null;
  }

  // --------------------------------------------------------------- picking

  pickCell(): { x: number; z: number } | null {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObject(this.world.ground)[0];
    if (!hit) return null;
    return this.world.worldToCell(hit.point);
  }

  updateHover(e: PointerEvent) {
    if (!this.world) return;
    this.setPointerFromEvent(e);
    const c = this.pickCell();
    if (!c) { this.world.setPreview(null); return; }

    if (this.ui.tool === 'build' && this.ui.selectedDefId) {
      if (!this.world.previewMesh) this.world.setPreview(this.ui.selectedDefId);
      const def = BUILDING_BY_ID[this.ui.selectedDefId];
      const valid = this.ui.selectedDefId === 'road'
        ? this.world.isCellFree(c.x, c.z)
        : this.world.isAreaFree(c.x, c.z, def.width, def.depth);
      this.world.updatePreview(c.x, c.z, valid);
    } else if (this.ui.tool === 'move' && this.movingUid) {
      const b = this.buildings.find(x => x.uid === this.movingUid);
      const def = b ? BUILDING_BY_ID[b.defId] : null;
      if (b && def) {
        if (this.world.previewDefId !== b.defId) this.world.setPreview(b.defId);
        const valid = this.world.isAreaFree(c.x, c.z, def.width, def.depth, b.uid);
        this.world.updatePreview(c.x, c.z, valid);
      }
    } else if (this.world.previewMesh) {
      this.world.setPreview(null);
    }
  }

  handleClick() {
    if (!this.world) return;
    const c = this.pickCell();
    if (!c) return;
    if (this.ui.tool === 'build' && this.ui.selectedDefId) { this.tryPlace(this.ui.selectedDefId, c.x, c.z); return; }
    if (this.ui.tool === 'bulldoze') { this.tryBulldoze(c.x, c.z); return; }
    if (this.ui.tool === 'move') { this.handleMoveClick(c.x, c.z); return; }

    const occ = this.world.getOccupant(c.x, c.z);
    if (occ && occ !== 'road') {
      const b = this.buildings.find(x => x.uid === occ);
      if (b) this.selectBuilding(b);
    } else if (occ === 'road') {
      this.selectedUid = null;
      this.world.hideServiceRadius();
      this.ui.showInfo('<h4>Route</h4><p>Relie les quartiers et fait circuler les véhicules.</p>');
    } else {
      this.selectedUid = null;
      this.world.hideServiceRadius();
      this.ui.showInfo(`<h4>Terrain libre</h4><p>Case (${c.x}, ${c.z}) — constructible.</p>`);
    }
  }

  // ------------------------------------------------------------- placement

  tryPlace(defId: string, x: number, z: number, quiet = false): boolean {
    const def = BUILDING_BY_ID[defId];
    if (!def) return false;
    if (def.unlockTier > this.stats.tier) { if (!quiet) this.ui.toast('Bâtiment non débloqué.'); return false; }
    if (this.stats.money < def.cost) { if (!quiet) this.ui.toast('Budget insuffisant.'); return false; }

    if (defId === 'road') {
      if (!this.world.placeRoad(x, z)) { if (!quiet) this.ui.toast('Emplacement indisponible.'); return false; }
      this.buildings.push({ uid: crypto.randomUUID(), defId, x, z, rotation: 0, level: 1, powered: true, watered: true });
    } else {
      const b: PlacedBuilding = { uid: crypto.randomUUID(), defId, x, z, rotation: 0, level: 1, powered: true, watered: true };
      if (!this.world.placeBuilding(b)) { if (!quiet) this.ui.toast('Zone occupée ou hors limites.'); return false; }
      this.buildings.push(b);
    }

    this.stats.money -= def.cost;
    this.world.syncVehicles();
    this.world.hideServiceRadius();
    this.ui.updateHUD(this.stats, this.completedMissions, this.world.weather);
    if (!quiet) this.ui.toast(`${def.name} construit.`);
    return true;
  }

  tryBulldoze(x: number, z: number, quiet = false) {
    const res = this.world.removeAt(x, z);
    this.world.hideServiceRadius();
    if (res.type === 'none') { if (!quiet) this.ui.toast('Rien à supprimer.'); return; }
    if (res.type === 'road') {
      const idx = this.buildings.findIndex(b => b.defId === 'road' && b.x === x && b.z === z);
      if (idx >= 0) this.buildings.splice(idx, 1);
      if (!quiet) this.ui.toast('Route supprimée.');
    } else if (res.uid) {
      const idx = this.buildings.findIndex(b => b.uid === res.uid);
      if (idx >= 0) {
        const b = this.buildings[idx];
        this.world.removeBuilding(b.uid, b);
        this.buildings.splice(idx, 1);
        if (!quiet) this.ui.toast('Bâtiment supprimé.');
        if (this.selectedUid === res.uid) {
          this.selectedUid = null;
          this.ui.showInfo('<h4>Ville</h4><p>Sélectionnez un bâtiment sur la carte.</p>');
        }
      }
    }
    this.world.syncVehicles();
    this.ui.updateHUD(this.stats, this.completedMissions, this.world.weather);
  }

  handleMoveClick(x: number, z: number) {
    const occ = this.world.getOccupant(x, z);
    if (!this.movingUid) {
      if (occ && occ !== 'road') {
        const b = this.buildings.find(v => v.uid === occ);
        if (b) {
          this.movingUid = b.uid;
          this.world.setPreview(b.defId);
          this.ui.toast('Choisissez le nouvel emplacement.');
        }
      } else {
        this.ui.toast('Sélectionnez un bâtiment à déplacer.');
      }
      return;
    }
    const b = this.buildings.find(v => v.uid === this.movingUid);
    if (!b) { this.movingUid = null; this.world.setPreview(null); return; }
    const def = BUILDING_BY_ID[b.defId];
    if (!def) return;
    if (!this.world.isAreaFree(x, z, def.width, def.depth, b.uid)) { this.ui.toast('Emplacement invalide.'); return; }

    this.world.removeBuilding(b.uid, b);
    b.x = x; b.z = z;
    this.world.placeBuilding(b);
    this.movingUid = null;
    this.world.setPreview(null);
    this.ui.toast(`${def.name} déplacé.`);
    this.selectBuilding(b);
  }

  // ------------------------------------------------------------- selection

  selectBuilding(b: PlacedBuilding) {
    this.selectedUid = b.uid;
    const def = BUILDING_BY_ID[b.defId];
    if (!def) return;
    const maxLevel = def.maxLevel ?? 5;
    const upCost = Math.floor(def.cost * 0.55 * Math.pow(b.level, 1.35));
    const capacity = (def.capacity || 0) * b.level;
    const jobs = (def.jobs || 0) * b.level;
    const canUpgrade = b.level < maxLevel;
    const radius = def.serviceRadius;
    if (radius) {
      const p = this.world.cellToWorld(b.x + (def.width - 1) / 2, b.z + (def.depth - 1) / 2);
      this.world.showServiceRadius(p.x, p.z, radius, def.category === 'leisure' ? 0x53c8f0 : 0x7bed9f);
    } else {
      this.world.hideServiceRadius();
    }
    this.ui.showInfo(`<h4>${def.name} <span class="badge">Niv. ${b.level}/${maxLevel}</span></h4>
      <p>${def.description}${radius ? ` · Rayon de service : ${radius} cases` : ''}</p>
      <div class="stat-grid">
        <div><span>Entretien</span><b>${def.upkeep * b.level} €</b></div>
        <div><span>Capacité</span><b>${capacity || '—'}</b></div>
        <div><span>Emplois</span><b>${jobs || '—'}</b></div>
        <div><span>Électricité</span><b>${(def.powerProd || 0) * b.level - (def.powerUse || 0) * b.level}</b></div>
        <div><span>Eau</span><b>${(def.waterProd || 0) * b.level - (def.waterUse || 0) * b.level}</b></div>
        <div><span>Bonheur</span><b>${def.happiness || 0}</b></div>
      </div>
      <div class="row">
        <button class="btn" id="upgrade-btn" ${canUpgrade ? '' : 'disabled'}>${canUpgrade ? `Améliorer · ${upCost} €` : 'Niveau max atteint'}</button>
        <button class="btn" id="move-btn">Déplacer</button>
        <button class="btn" id="recenter-btn">Recentrer</button>
      </div>`);
    this.ui.root.querySelector('#upgrade-btn')?.addEventListener('click', () => this.upgradeBuilding(b.uid));
    this.ui.root.querySelector('#move-btn')?.addEventListener('click', () => {
      this.ui.tool = 'move';
      this.movingUid = b.uid;
      this.world.hideServiceRadius();
      this.world.setPreview(b.defId);
      this.ui.syncToolButtons();
      this.ui.toast('Choisissez un nouvel emplacement.');
    });
    this.ui.root.querySelector('#recenter-btn')?.addEventListener('click', () => {
      const p = this.world.cellToWorld(b.x + (def.width - 1) / 2, b.z + (def.depth - 1) / 2);
      this.centerOn(p.x, p.z);
    });
  }

  upgradeBuilding(uid: string) {
    const b = this.buildings.find(x => x.uid === uid);
    if (!b) return;
    const def = BUILDING_BY_ID[b.defId];
    if (!def) return;
    const maxLevel = def.maxLevel ?? 5;
    if (b.level >= maxLevel) { this.ui.toast('Niveau maximum atteint.'); return; }
    const cost = Math.floor(def.cost * 0.55 * Math.pow(b.level, 1.35));
    if (this.stats.money < cost) { this.ui.toast('Budget insuffisant.'); return; }
    b.level += 1;
    this.stats.money -= cost;
    this.world.refreshBuildingMesh(b);
    this.ui.toast(`${def.name} amélioré au niveau ${b.level}.`);
    this.ui.updateHUD(this.stats, this.completedMissions, this.world.weather);
    this.selectBuilding(b);
  }

  centerOn(x: number, z: number) {
    this.camTarget.set(x, 0, z);
    const limit = (TILE * GRID_SIZE) / 2 - 3;
    this.camTarget.x = THREE.MathUtils.clamp(this.camTarget.x, -limit, limit);
    this.camTarget.z = THREE.MathUtils.clamp(this.camTarget.z, -limit, limit);
  }

  // ------------------------------------------------------------------ menu

  handleAction(action: string, payload?: any) {
    switch (action) {
      case 'new-screen': this.ui.renderNewMap(); break;
      case 'new': this.startNew(payload?.mapId || 'plaine'); break;
      case 'demo': this.startNew('plaine', true); break;
      case 'continue': { const d = SaveManager.load('auto'); if (d) this.loadData(d); else this.ui.toast('Aucune sauvegarde.'); break; }
      case 'load-screen': this.ui.renderLoad(SaveManager.listSlots()); break;
      case 'settings': this.ui.renderSettings(); break;
      case 'menu': this.saveAuto(); this.cleanup3D(); this.ui.renderMenu(SaveManager.hasAuto()); break;
      case 'load-slot': { const d = SaveManager.load(payload.slot); if (d) this.loadData(d); else this.ui.toast('Sauvegarde invalide.'); break; }
      case 'delete-slot': SaveManager.deleteSlot(payload.slot); this.ui.renderLoad(SaveManager.listSlots()); break;
      case 'select-def':
        if (this.stats.tier < (BUILDING_BY_ID[payload.defId]?.unlockTier ?? 0)) { this.ui.toast('Pas encore débloqué.'); break; }
        this.ui.tool = 'build';
        this.movingUid = null;
        this.world?.setPreview(payload.defId);
        break;
      case 'tool':
        this.stopContinuous();
        this.movingUid = null;
        if (payload.tool === 'build') this.world?.setPreview(this.ui.selectedDefId);
        else this.world?.setPreview(null);
        break;
      case 'speed': this.speed = payload.speed; this.ui.setSpeedButtons(this.speed); break;
      case 'save': this.saveSlot('slot1'); this.ui.toast('Ville sauvegardée (slot1).'); break;
      case 'save-slot': this.saveSlot(`slot${payload.slot}`); this.ui.toast(`Ville sauvegardée (slot ${payload.slot}).`); break;
      case 'set-tax':
        this.stats.taxRate = Math.max(0, Math.min(25, Number(payload.value) || 0));
        this.ui.updateManagement(this.stats, this.statsHistory);
        this.ui.updateHUD(this.stats, this.completedMissions, this.world.weather);
        break;
      case 'toggle-policy': {
        const key = payload.policy as keyof Policies;
        if (key in this.policies) {
          this.policies[key] = !this.policies[key];
          this.ui.toast(`${key === 'green' ? 'Ville verte' : key === 'transport' ? 'Transport public' : 'Recyclage'} ${this.policies[key] ? 'activé' : 'désactivé'}.`);
        }
        this.ui.updateManagement(this.stats, this.statsHistory);
        break;
      }
      case 'open-management': this.ui.renderManagement(this.stats, this.policies, this.statsHistory); break;
      case 'open-missions': this.ui.renderMissions(this.completedMissions); break;
      case 'recenter': this.camTarget.set(0, 0, 0); this.zoomFactor = 1; this.onResize(); this.ui.toast('Vue recentrée.'); break;
      case 'toggle-weather': {
        const w = this.world?.weather === 'rain' ? 'clear' : 'rain';
        this.world?.setWeather(w);
        this.ui.toast(w === 'rain' ? 'Météo : pluie' : 'Météo : ciel dégagé');
        this.ui.updateHUD(this.stats, this.completedMissions, w);
        break;
      }
      default: break;
    }
  }

  loadData(data: SaveData) {
    this.stats = { ...createInitialStats(), ...(data.stats || {}) };
    this.policies = { ...createDefaultPolicies(), ...(data.policies || {}) };
    this.statsHistory = data.statsHistory || [];
    this.historyAcc = 0;
    this.buildings = data.buildings || [];
    this.completedMissions = data.completedMissions || [];
    this.mapId = data.mapId || 'plaine';
    this.selectedUid = null;
    this.movingUid = null;
    this.mountGame();
  }

  saveData(slot: string) {
    const roads = this.buildings.filter(b => b.defId === 'road').map(b => ({ x: b.x, z: b.z }));
    const data: SaveData = {
      version: 3,
      timestamp: Date.now(),
      mapId: this.mapId,
      buildings: this.buildings,
      roads,
      stats: this.stats,
      policies: this.policies,
      statsHistory: this.statsHistory,
      unlockedMissions: [],
      completedMissions: this.completedMissions,
    };
    return SaveManager.save(slot, data);
  }
  saveAuto() { this.saveData('auto'); }
  saveSlot(slot: string) { this.saveData(slot); }

  // ------------------------------------------------------------------ engine

  loop() {
    if (!this.running) return;
    requestAnimationFrame(() => this.loop());
    const now = performance.now();
    const dt = Math.min((now - this.clock.last) / 1000, 0.1);
    this.clock.last = now;
    if (this.speed > 0) this.world.updateVehicles(dt * 60 * this.speed);
    this.world.updateEffects(dt * Math.max(1, this.speed));
    this.updateCamera();
    this.updateDayNight();
    this.renderer.render(this.scene, this.camera);
  }

  tick() {
    const derived = computeDerived(this.buildings, this.stats, this.policies);
    this.stats = derived.stats;
    this.historyAcc += 1;
    if (this.historyAcc >= 3) {
      this.historyAcc = 0;
      this.statsHistory.push({
        day: this.stats.day,
        population: this.stats.population,
        money: Math.round(this.stats.money),
        happiness: this.stats.happiness,
      });
      if (this.statsHistory.length > 180) this.statsHistory.shift();
    }
    const res = checkMissions(this.stats, this.buildings, this.completedMissions);
    if (res.newlyCompleted.length) {
      this.completedMissions.push(...res.newlyCompleted);
      this.stats.money += res.reward;
      this.ui.toast(`Mission accomplie · +${res.reward} €`);
      this.ui.renderMissions(this.completedMissions);
    }
    this.world.syncVehicles();
    this.ui.updateHUD(this.stats, this.completedMissions, this.world.weather);
    this.ui.updateManagement(this.stats, this.statsHistory);
    if (this.selectedUid) {
      const b = this.buildings.find(x => x.uid === this.selectedUid);
      if (b) this.selectBuilding(b);
    }
  }

  updateCamera() {
    // Keep a true orthographic isometric projection: the camera looks at
    // camTarget from a fixed (1,1,1) direction, so rotating is impossible.
    const dist = 160;
    this.camera.position.set(
      this.camTarget.x + ISO_DIR.x * dist,
      Math.max(20, ISO_DIR.y * dist),
      this.camTarget.z + ISO_DIR.z * dist
    );
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.camTarget);
  }

  updateDayNight() {
    const t = this.stats.timeOfDay;
    const dayFactor = Math.max(0, Math.sin(((t - 6) / 24) * Math.PI * 2));
    const night = dayFactor < 0.22;
    const sky = new THREE.Color().setHSL(0.56, 0.5, 0.2 + dayFactor * 0.48);
    if (this.world?.weather === 'rain') sky.multiplyScalar(0.72);
    this.scene.background = sky;
    (this.scene.fog as THREE.Fog).color.copy(sky);
    this.sun.intensity = 0.18 + dayFactor * 1.05;
    this.ambient.intensity = 0.2 + dayFactor * 0.55;
    const angle = ((t - 6) / 24) * Math.PI * 2;
    this.sun.position.set(Math.cos(angle) * 90, Math.max(35, Math.sin(angle) * 110), 45);
    if (night !== this.lastNight) {
      this.lastNight = night;
      this.world?.setNightMode(night);
    }
  }
}
