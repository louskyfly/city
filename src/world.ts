import * as THREE from 'three';
import { BUILDING_BY_ID } from './data/buildings';
import type { PlacedBuilding } from './types';

export const GRID_SIZE = 64;
export const TILE = 2;

export interface RoadNode { x: number; z: number; }
type VehicleType = 'car' | 'truck' | 'bus' | 'service';
type FloraKind = 'tree' | 'pine' | 'bush' | 'rock' | 'flower';
interface FloraEntry { x: number; z: number; kind: FloraKind; scale: number; rot: number; cellKey?: string; }

/**
 * World owns the 3D scene graph: terrain, decorations, buildings, roads,
 * vehicles and weather effects.
 *
 * Terrain is deliberately flat inside the buildable grid. A tiny height
 * variation is applied only to the decorative ring outside that grid, so all
 * gameplay objects sit on a single ground plane and there are no floating or
 * sunken roads/buildings.
 */
export class World {
  scene: THREE.Scene;
  ground!: THREE.Mesh;
  gridHelper!: THREE.GridHelper;
  buildingsGroup = new THREE.Group();
  roadsGroup = new THREE.Group();
  decorGroup = new THREE.Group();
  vehiclesGroup = new THREE.Group();
  effectsGroup = new THREE.Group();
  previewMesh: THREE.Object3D | null = null;
  previewDefId: string | null = null;
  private buildingMeshes = new Map<string, THREE.Object3D>();
  private roadMeshes = new Map<string, THREE.Mesh>();
  private clearedCells = new Set<string>();
  private flora: FloraEntry[] = [];
  private floraGroup = new THREE.Group();
  private windowTexture: THREE.Texture | null = null;
  private occupancy = new Map<string, string>();
  private trafficLights: THREE.Group[] = [];
  roads: RoadNode[] = [];
  vehicles: { mesh: THREE.Group; path: THREE.Vector3[]; t: number; speed: number; type: VehicleType }[] = [];
  rain: THREE.Points | null = null;
  weather: 'clear' | 'rain' = 'clear';
  mapId = 'plaine';

  constructor(scene: THREE.Scene, mapId = 'plaine') {
    this.scene = scene;
    this.mapId = mapId;
    this.scene.add(this.buildingsGroup, this.roadsGroup, this.decorGroup, this.vehiclesGroup, this.effectsGroup, this.floraGroup);
    this.buildTerrain();
    this.addEnvironment();
    this.addInteriorFlora();
    this.rebuildFlora();
    this.createRain();
  }

  /** Small deterministic flora inside the map, cleared when the player builds on it. */
  private addInteriorFlora() {
    const half = GRID_SIZE / 2;
    for (let x = -half; x < half; x++) {
      for (let z = -half; z < half; z++) {
        // Keep a clearing in the middle of the map for the first city.
        if (Math.abs(x) < 4 && Math.abs(z) < 4) continue;
        let h = (x * 374761393 + z * 668265263) ^ 0x5bf03635;
        h = (h ^ (h >>> 13)) * 1274126177;
        const rand = ((h ^ (h >>> 16)) >>> 0) / 4294967295;
        // Low-frequency clusters instead of a uniform sprinkle.
        const cluster = Math.sin(x * 0.31) + Math.cos(z * 0.27) + Math.sin((x - z) * 0.19);
        if (cluster < 0.5 || rand > 0.72) continue;
        const r2 = ((h * 48271) >>> 0) / 4294967295;
        const kind: FloraKind = r2 > 0.76 ? 'tree' : r2 > 0.56 ? 'pine' : r2 > 0.36 ? 'bush' : r2 > 0.22 ? 'rock' : 'flower';
        const p = this.cellToWorld(x, z);
        this.flora.push({
          x: p.x + (Math.random() - 0.5) * 1.3,
          z: p.z + (Math.random() - 0.5) * 1.3,
          kind,
          scale: kind === 'tree' || kind === 'pine' ? 0.55 + Math.random() * 0.5 : 0.55 + Math.random() * 0.45,
          rot: Math.random() * Math.PI * 2,
          cellKey: this.key(x, z),
        });
      }
    }
  }

  private rebuildFlora() {
    while (this.floraGroup.children.length) {
      const child = this.floraGroup.children.pop()!;
      child.traverse((o: THREE.Object3D) => {
        const mesh = o as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mat = (mesh as any).material;
        if (mat && !mat.__shared) mat.dispose?.();
      });
    }
    const visible = this.flora.filter(f => !f.cellKey || (!this.clearedCells.has(f.cellKey) && !this.occupancy.has(f.cellKey)));
    const trunks = visible.filter(f => f.kind === 'tree' || f.kind === 'pine');
    const trees = visible.filter(f => f.kind === 'tree');
    const pines = visible.filter(f => f.kind === 'pine');
    const bushes = visible.filter(f => f.kind === 'bush');
    const rocks = visible.filter(f => f.kind === 'rock');
    const flowers = visible.filter(f => f.kind === 'flower');
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const v = new THREE.Vector3();
    const s = new THREE.Vector3();

    const addInstanced = (
      entries: FloraEntry[],
      geo: THREE.BufferGeometry,
      mat: THREE.Material,
      place: (e: FloraEntry, m: THREE.Matrix4) => void,
      color?: (e: FloraEntry) => number
    ) => {
      if (!entries.length) return;
      const inst = new THREE.InstancedMesh(geo, mat, entries.length);
      inst.castShadow = true;
      inst.receiveShadow = false;
      entries.forEach((e, i) => {
        place(e, m);
        inst.setMatrixAt(i, m);
        if (color) inst.setColorAt(i, new THREE.Color(color(e)));
      });
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
      this.floraGroup.add(inst);
    };

    // trunks
    addInstanced(trunks, new THREE.CylinderGeometry(0.07, 0.1, 0.8, 5), new THREE.MeshStandardMaterial({ color: 0x7d5a3c, roughness: 1 }),
      (e, out) => { q.setFromAxisAngle(new THREE.Vector3(0,1,0), e.rot); v.set(e.x, 0.4 * e.scale, e.z); s.set(e.scale, e.scale, e.scale); out.compose(v, q, s); });

    // leafy crowns
    addInstanced(trees, new THREE.IcosahedronGeometry(0.72, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true }),
      (e, out) => { q.setFromAxisAngle(new THREE.Vector3(0,1,0), e.rot); v.set(e.x, 1.02 * e.scale, e.z); s.set(e.scale, e.scale * 0.9, e.scale); out.compose(v, q, s); },
      e => [0x2f7d32, 0x388e3c, 0x43a047, 0x4caf50][Math.floor(e.scale * 10) % 4]);

    // pine crowns
    addInstanced(pines, new THREE.ConeGeometry(0.64, 1.5, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true }),
      (e, out) => { q.setFromAxisAngle(new THREE.Vector3(0,1,0), e.rot); v.set(e.x, 1.08 * e.scale, e.z); s.set(e.scale, e.scale, e.scale); out.compose(v, q, s); },
      () => 0x2e6b31);

    addInstanced(bushes, new THREE.SphereGeometry(0.36, 7, 5), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }),
      (e, out) => { q.setFromAxisAngle(new THREE.Vector3(0,1,0), e.rot); v.set(e.x, 0.24 * e.scale, e.z); s.set(e.scale, e.scale * 0.72, e.scale); out.compose(v, q, s); },
      () => 0x2f7d32);

    addInstanced(rocks, new THREE.DodecahedronGeometry(0.28, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }),
      (e, out) => { q.setFromAxisAngle(new THREE.Vector3(0,1,0), e.rot); v.set(e.x, 0.12 * e.scale, e.z); s.set(e.scale, e.scale * 0.7, e.scale); out.compose(v, q, s); },
      () => 0x9aa5aa);

    addInstanced(flowers, new THREE.CylinderGeometry(0.012, 0.016, 0.24, 4), new THREE.MeshStandardMaterial({ color: 0x4c8c2b, roughness: 1 }),
      (e, out) => { v.set(e.x, 0.12 * e.scale, e.z); q.identity(); s.set(1, e.scale, 1); out.compose(v, q, s); });

    addInstanced(flowers, new THREE.SphereGeometry(0.075, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffffff }),
      (e, out) => { v.set(e.x, 0.25 * e.scale, e.z); q.identity(); s.set(e.scale, e.scale, e.scale); out.compose(v, q, s); },
      () => [0xffd54f, 0xff8a80, 0xffffff, 0xb388ff, 0x80d8ff][Math.floor(Math.random() * 5)]);
  }

  private clearDecorInArea(x: number, z: number, w: number, d: number) {
    let changed = false;
    for (let ix = 0; ix < w; ix++) for (let iz = 0; iz < d; iz++) {
      const k = this.key(x + ix, z + iz);
      if (this.flora.some(f => f.cellKey === k)) {
        this.clearedCells.add(k);
        changed = true;
      }
    }
    if (changed) this.rebuildFlora();
  }

  getOccupant(x: number, z: number) { return this.occupancy.get(this.key(x, z)); }
  isCellFree(x: number, z: number) { return !this.occupancy.has(this.key(x, z)); }

  private buildTerrain() {
    // Large surrounding plane so the world never appears to end abruptly.
    const outerSize = GRID_SIZE * TILE * 2.4;
    const groundGeo = new THREE.PlaneGeometry(outerSize, outerSize);
    const colors: Record<string, number> = {
      plaine: 0x5c9741, collines: 0x66983f, riviere: 0x5c9a46, foret: 0x447a30,
    };
    const tex = this.makeGrassTexture();
    this.ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ color: colors[this.mapId] ?? 0x5c9741, map: tex, roughness: 1 }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.ground.name = 'ground';
    this.scene.add(this.ground);

    // Buildable area plate: lighter, very flat inner pad so the city zone is
    // instantly readable. Each grid tile gets a subtle hue variation.
    const padSize = GRID_SIZE * TILE;
    const padTex = this.makeTileTexture();
    const pad = new THREE.Mesh(
      new THREE.PlaneGeometry(padSize, padSize),
      new THREE.MeshStandardMaterial({ color: this.mapId === 'foret' ? 0xa2c98a : 0xb2dd95, map: padTex, roughness: 1 })
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = 0.005;
    pad.receiveShadow = true;
    this.scene.add(pad);

    // Thin darker green rim separates the buildable pad from the wild terrain.
    const rim = new THREE.Mesh(
      new THREE.PlaneGeometry(padSize + 4, padSize + 4),
      new THREE.MeshStandardMaterial({ color: 0x4d8236, roughness: 1 })
    );
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = 0.002;
    this.scene.add(rim);

    // Subtle border marking the buildable perimeter.
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-padSize / 2, 0.02, -padSize / 2),
      new THREE.Vector3(padSize / 2, 0.02, -padSize / 2),
      new THREE.Vector3(padSize / 2, 0.02, padSize / 2),
      new THREE.Vector3(-padSize / 2, 0.02, padSize / 2),
      new THREE.Vector3(-padSize / 2, 0.02, -padSize / 2),
    ]);
    const border = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xf4fbe8, transparent: true, opacity: 0.4 }));
    this.scene.add(border);

    this.gridHelper = new THREE.GridHelper(padSize, GRID_SIZE, 0xffffff, 0xffffff);
    (this.gridHelper.material as THREE.Material).opacity = 0.2;
    (this.gridHelper.material as THREE.Material).transparent = true;
    this.gridHelper.position.y = 0.012;
    this.scene.add(this.gridHelper);
  }

  private makeTileTexture(): THREE.Texture {
    const c = document.createElement('canvas');
    const tiles = GRID_SIZE;
    const px = 8;
    c.width = c.height = tiles * px;
    const ctx = c.getContext('2d')!;
    const base = this.mapId === 'foret' ? [125, 168, 96] : [141, 190, 108];
    for (let ty = 0; ty < tiles; ty++) {
      for (let tx = 0; tx < tiles; tx++) {
        const v = (Math.random() - 0.5) * 14;
        const r = Math.max(0, Math.min(255, base[0] + v));
        const g = Math.max(0, Math.min(255, base[1] + v));
        const b = Math.max(0, Math.min(255, base[2] + v * 0.8));
        ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
        ctx.fillRect(tx * px, ty * px, px, px);
        // subtle grass speckle inside each tile
        for (let i = 0; i < 6; i++) {
          const darker = Math.random() > 0.5;
          ctx.fillStyle = darker ? 'rgba(60,110,45,0.18)' : 'rgba(220,255,190,0.14)';
          ctx.fillRect(tx * px + Math.random() * px, ty * px + Math.random() * px, 1.2, 1.2);
        }
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.anisotropy = 4;
    return t;
  }

  private makeGrassTexture(): THREE.Texture {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#dfeacb';
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 9000; i++) {
      const g = 190 + Math.floor(Math.random() * 60);
      ctx.fillStyle = `rgba(${g - 60}, ${g - 15}, ${g - 95}, ${0.1 + Math.random() * 0.2})`;
      const s = 1 + Math.random() * 2.6;
      ctx.fillRect(Math.random() * 256, Math.random() * 256, s, s);
    }
    // faint mowing stripes
    for (let i = 0; i < 256; i += 32) {
      ctx.fillStyle = 'rgba(255,255,255,0.035)';
      ctx.fillRect(i, 0, 16, 256);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(22, 22);
    t.anisotropy = 4;
    return t;
  }

  key(x: number, z: number) { return `${x},${z}`; }
  inBounds(x: number, z: number) { const h = GRID_SIZE / 2; return x >= -h && x < h && z >= -h && z < h; }

  cellToWorld(x: number, z: number) { return new THREE.Vector3(x * TILE + TILE / 2, 0, z * TILE + TILE / 2); }
  worldToCell(v: THREE.Vector3) { return { x: Math.floor(v.x / TILE), z: Math.floor(v.z / TILE) }; }

  isAreaFree(x: number, z: number, w: number, d: number, ignoreUid?: string) {
    for (let ix = 0; ix < w; ix++) for (let iz = 0; iz < d; iz++) {
      const cx = x + ix, cz = z + iz;
      if (!this.inBounds(cx, cz)) return false;
      const occ = this.occupancy.get(this.key(cx, cz));
      if (occ && occ !== ignoreUid) return false;
    }
    return true;
  }

  occupy(x: number, z: number, w: number, d: number, uid: string) {
    for (let ix = 0; ix < w; ix++) for (let iz = 0; iz < d; iz++) this.occupancy.set(this.key(x + ix, z + iz), uid);
  }
  vacate(x: number, z: number, w: number, d: number) {
    for (let ix = 0; ix < w; ix++) for (let iz = 0; iz < d; iz++) this.occupancy.delete(this.key(x + ix, z + iz));
  }

  placeRoad(x: number, z: number): boolean {
    if (!this.inBounds(x, z) || this.occupancy.get(this.key(x, z))) return false;
    this.clearDecorInArea(x, z, 1, 1);
    this.occupancy.set(this.key(x, z), 'road');
    this.roads.push({ x, z });
    const geo = new THREE.BoxGeometry(TILE * 0.98, 0.08, TILE * 0.98);
    const mat = new THREE.MeshStandardMaterial({ color: 0x5d636b, roughness: 0.9 });
    const mesh = new THREE.Mesh(geo, mat);
    const p = this.cellToWorld(x, z);
    mesh.position.set(p.x, 0.04, p.z);
    mesh.receiveShadow = true;
    this.roadsGroup.add(mesh);
    // road center marking
    const mark = new THREE.Mesh(new THREE.PlaneGeometry(0.09, TILE * 0.5), new THREE.MeshBasicMaterial({ color: 0xe8edf2 }));
    mark.rotation.x = -Math.PI / 2;
    mark.position.y = 0.045;
    mark.userData.roadMark = true;
    mesh.add(mark);
    // sidewalks on both sides
    const walkMat = new THREE.MeshStandardMaterial({ color: 0xc9d2d9, roughness: 1 });
    for (const side of [-1, 1]) {
      const walk = new THREE.Mesh(new THREE.BoxGeometry(TILE * 0.16, 0.06, TILE), walkMat);
      walk.position.set(side * TILE * 0.41, 0.03, 0);
      walk.receiveShadow = true;
      mesh.add(walk);
    }
    this.roadMeshes.set(this.key(x, z), mesh);
    this.refreshRoadMarkings();
    this.updateTrafficLights();
    return true;
  }

  removeAt(x: number, z: number): { type: 'road' | 'building' | 'none'; uid?: string } {
    const occ = this.occupancy.get(this.key(x, z));
    if (!occ) return { type: 'none' };
    if (occ === 'road') {
      this.occupancy.delete(this.key(x, z));
      this.roads = this.roads.filter(r => !(r.x === x && r.z === z));
      const m = this.roadMeshes.get(this.key(x, z));
      if (m) { this.roadsGroup.remove(m); m.geometry.dispose(); this.roadMeshes.delete(this.key(x, z)); }
      this.refreshRoadMarkings();
      this.updateTrafficLights();
      return { type: 'road' };
    }
    return { type: 'building', uid: occ };
  }

  placeBuilding(b: PlacedBuilding): boolean {
    const def = BUILDING_BY_ID[b.defId];
    if (!def) return false;
    if (!this.isAreaFree(b.x, b.z, def.width, def.depth, b.uid)) return false;
    this.clearDecorInArea(b.x, b.z, def.width, def.depth);
    this.occupy(b.x, b.z, def.width, def.depth, b.uid);
    const mesh = this.createBuildingMesh(def, b);
    this.buildingMeshes.set(b.uid, mesh);
    this.buildingsGroup.add(mesh);
    return true;
  }

  removeBuilding(uid: string, b: PlacedBuilding) {
    const def = BUILDING_BY_ID[b.defId];
    if (def) this.vacate(b.x, b.z, def.width, def.depth);
    const m = this.buildingMeshes.get(uid);
    if (m) { this.buildingsGroup.remove(m); this.buildingMeshes.delete(uid); }
  }

  /** Renders a visual existante mise à jour (niveau) sans re-créer l'empreinte. */
  refreshBuildingMesh(b: PlacedBuilding) {
    const old = this.buildingMeshes.get(b.uid);
    if (old) { this.buildingsGroup.remove(old); this.buildingMeshes.delete(b.uid); }
    const def = BUILDING_BY_ID[b.defId];
    if (!def) return;
    const mesh = this.createBuildingMesh(def, b);
    this.buildingMeshes.set(b.uid, mesh);
    this.buildingsGroup.add(mesh);
  }

  private createBuildingMesh(def: any, b: PlacedBuilding): THREE.Group {
    const special = this.createSpecialMesh(def, b);
    if (special) return special;
    const g = new THREE.Group();
    g.userData.uid = b.uid;
    const w = def.width * TILE * 0.82;
    const d = def.depth * TILE * 0.82;
    const h = def.height * 1.5 * (1 + (b.level - 1) * 0.06);
    if (def.category === 'infrastructure') return this.createInfraMesh(def);

    const isLeisure = def.category === 'leisure';
    const bodyMat = new THREE.MeshStandardMaterial({ color: isLeisure ? 0x7bc96f : def.color, roughness: 0.75 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bodyMat);
    body.position.y = h / 2 + 0.06;
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);

    if (!isLeisure) {
      const roofH = Math.max(0.3, Math.min(1.1, h * 0.16));
      if (def.height >= 2.5) {
        const flat = new THREE.Mesh(new THREE.BoxGeometry(w * 1.04, 0.14, d * 1.04), new THREE.MeshStandardMaterial({ color: def.roofColor }));
        flat.position.y = h + 0.06; flat.castShadow = true; g.add(flat);
        const ac = new THREE.Mesh(new THREE.BoxGeometry(w * 0.28, 0.2, d * 0.22), new THREE.MeshStandardMaterial({ color: 0x95a5a6 }));
        ac.position.set(w * 0.18, h + 0.18, 0); g.add(ac);
        const parapetMat = new THREE.MeshStandardMaterial({ color: def.roofColor });
        const p1 = new THREE.Mesh(new THREE.BoxGeometry(w * 1.04, 0.24, 0.07), parapetMat);
        p1.position.set(0, h + 0.12, d * 0.52); g.add(p1);
        const p2 = p1.clone(); p2.position.z = -d * 0.52; g.add(p2);
      } else {
        const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.6, roofH, 4), new THREE.MeshStandardMaterial({ color: def.roofColor, roughness: 0.8 }));
        roof.position.y = h + roofH / 2 + 0.04;
        roof.rotation.y = Math.PI / 4;
        roof.castShadow = true;
        g.add(roof);
      }
    }

    if (!isLeisure) {
      const style = this.facadeStyle(def);
      const facadeBottom = 0.5;
      const facadeH = Math.max(0.5, h * 0.9 - facadeBottom);
      const facadeY = facadeBottom + facadeH / 2;
      const addFacade = (px: number, pz: number, ry: number, faceW: number) => {
        const tex = this.getWindowTexture().clone();
        tex.needsUpdate = true;
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(Math.max(1, Math.round(faceW / style.x)), Math.max(1, Math.round(facadeH / style.y)));
        const mat = new THREE.MeshStandardMaterial({
          map: tex, alphaTest: 0.4, roughness: 0.3, metalness: 0.08,
          emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0,
          color: style.tint,
        });
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(faceW, facadeH), mat);
        plane.position.set(px, facadeY, pz);
        plane.rotation.y = ry;
        plane.userData.window = true;
        g.add(plane);
      };
      addFacade(0, d / 2 + 0.015, 0, w * 0.96);
      addFacade(0, -d / 2 - 0.015, Math.PI, w * 0.96);
      addFacade(w / 2 + 0.015, 0, Math.PI / 2, d * 0.96);
      addFacade(-w / 2 - 0.015, 0, -Math.PI / 2, d * 0.96);
    }

    const door = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.52), new THREE.MeshStandardMaterial({ color: 0x4a4038, roughness: 0.8 }));
    door.position.set(0, 0.31, d / 2 + 0.014);
    g.add(door);

    if (def.category === 'commercial') {
      const awning = new THREE.Mesh(new THREE.BoxGeometry(w * 0.55, 0.06, 0.34), new THREE.MeshStandardMaterial({ color: def.roofColor }));
      awning.position.set(0, 0.66, d / 2 + 0.17);
      awning.rotation.x = -0.18;
      g.add(awning);
    }

    if (def.category === 'industrial') {
      const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, h * 0.55, 10), new THREE.MeshStandardMaterial({ color: 0x7f8c8d, roughness: 0.85 }));
      chimney.position.set(w * 0.3, h * 0.78, -d * 0.2);
      chimney.castShadow = true;
      g.add(chimney);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.06, 10), new THREE.MeshStandardMaterial({ color: 0x555 }));
      cap.position.set(w * 0.3, h * 1.06, -d * 0.2); g.add(cap);
    }
    if (def.id === 'hospital') {
      const cxMat = new THREE.MeshBasicMaterial({ color: 0xe74c3c });
      const crossV = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.5), cxMat);
      const crossH = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.13), cxMat);
      crossV.position.set(0, h * 0.74, d / 2 + 0.02);
      crossH.position.set(0, h * 0.74, d / 2 + 0.02);
      g.add(crossV, crossH);
    }
    if (def.id === 'school') {
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.3), new THREE.MeshBasicMaterial({ color: 0x2980b9, side: THREE.DoubleSide }));
      flag.position.set(w * 0.3, h + 0.6, d * 0.3);
      g.add(flag);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1, 5), new THREE.MeshStandardMaterial({ color: 0xaaa }));
      pole.position.set(w * 0.3, h + 0.5, d * 0.3); g.add(pole);
    }
    if (def.id === 'town_hall') {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(w * 0.18, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.4, roughness: 0.4 }));
      dome.position.y = h + 0.14; g.add(dome);
    }

    const plinth = new THREE.Mesh(new THREE.BoxGeometry(w * 1.04, 0.08, d * 1.04), new THREE.MeshStandardMaterial({ color: 0xaeb8c0 }));
    plinth.position.y = 0.04;
    plinth.receiveShadow = true;
    g.add(plinth);

    const p = this.cellToWorld(b.x + (def.width - 1) / 2, b.z + (def.depth - 1) / 2);
    g.position.set(p.x, 0, p.z);
    return g;
  }

  private facadeStyle(def: any): { x: number; y: number; tint: number } {
    if (def.category === 'industrial') return { x: 1.35, y: 1.3, tint: 0xbfc9cf };
    if (def.category === 'commercial') return { x: 1.15, y: 1.0, tint: 0x8fd3ff };
    if (def.id === 'house' || def.id === 'villa') return { x: 0.95, y: 1.05, tint: 0xfff3cf };
    if (def.category === 'residential') return { x: 0.62, y: 0.78, tint: 0xdfefff };
    return { x: 0.75, y: 0.9, tint: 0xeaf6ff };
  }

  private createSpecialMesh(def: any, b: PlacedBuilding): THREE.Group | null {
    const w = def.width * TILE * 0.82;
    const d = def.depth * TILE * 0.82;
    const g = new THREE.Group();
    const p = this.cellToWorld(b.x + (def.width - 1) / 2, b.z + (def.depth - 1) / 2);

    if (def.id === 'water_tower') {
      const legMat = new THREE.MeshStandardMaterial({ color: 0xc9d2d9, roughness: 0.7 });
      for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 1.6, 6), legMat);
        leg.position.set(lx * w * 0.28, 0.8, lz * d * 0.28);
        leg.castShadow = true;
        g.add(leg);
      }
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.42, w * 0.42, 1.05, 14), new THREE.MeshStandardMaterial({ color: 0x8fe3e0, roughness: 0.5, metalness: 0.2 }));
      tank.position.y = 2.1; tank.castShadow = true; g.add(tank);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.44, w * 0.44, 0.12, 14), new THREE.MeshStandardMaterial({ color: 0x1e8b96 }));
      band.position.y = 1.78; g.add(band);
      const lid = new THREE.Mesh(new THREE.ConeGeometry(w * 0.45, 0.5, 14), new THREE.MeshStandardMaterial({ color: 0x0f6f7a }));
      lid.position.y = 2.86; lid.castShadow = true; g.add(lid);
      const ladder = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.4, 0.06), legMat);
      ladder.position.set(w * 0.36, 0.9, 0); g.add(ladder);
      g.position.set(p.x, 0, p.z);
      return g;
    }

    if (def.id === 'power_plant') {
      const hall = new THREE.Mesh(new THREE.BoxGeometry(w * 0.95, 1.1, d * 0.95), new THREE.MeshStandardMaterial({ color: 0xc7ced4, roughness: 0.8 }));
      hall.position.y = 0.62; hall.castShadow = true; hall.receiveShadow = true; g.add(hall);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 1.0, 0.12, d * 1.0), new THREE.MeshStandardMaterial({ color: 0x7f8c8d }));
      roof.position.y = 1.2; g.add(roof);
      const towerMat = new THREE.MeshStandardMaterial({ color: 0xe8eef2, roughness: 0.9 });
      for (const tx of [-0.3, 0.3]) {
        const tower = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.16, w * 0.24, 1.7, 12), towerMat);
        tower.position.set(tx * w, 0.9, -d * 0.25); tower.castShadow = true; g.add(tower);
        const rim = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.2, w * 0.2, 0.08, 12), new THREE.MeshStandardMaterial({ color: 0x95a5a6 }));
        rim.position.set(tx * w, 1.76, -d * 0.25); g.add(rim);
      }
      const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 1.6, 10), new THREE.MeshStandardMaterial({ color: 0x95a5a6 }));
      chimney.position.set(w * 0.34, 1.0, d * 0.24); chimney.castShadow = true; g.add(chimney);
      const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.16, 10), new THREE.MeshStandardMaterial({ color: 0xe74c3c }));
      stripe.position.set(w * 0.34, 1.65, d * 0.24); g.add(stripe);
      const plinth = new THREE.Mesh(new THREE.BoxGeometry(w * 1.04, 0.08, d * 1.04), new THREE.MeshStandardMaterial({ color: 0xaeb8c0 }));
      plinth.position.y = 0.04; plinth.receiveShadow = true; g.add(plinth);
      g.position.set(p.x, 0, p.z);
      return g;
    }

    if (def.id === 'stadium') {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.55, w * 0.62, 0.4, 24), new THREE.MeshStandardMaterial({ color: 0xdde3e8, roughness: 0.8 }));
      base.position.y = 0.2; base.receiveShadow = true; base.castShadow = true; g.add(base);
      const stands = new THREE.Mesh(new THREE.TorusGeometry(w * 0.44, 0.28, 8, 24), new THREE.MeshStandardMaterial({ color: 0x90a4ae }));
      stands.rotation.x = Math.PI / 2; stands.position.y = 0.36; g.add(stands);
      const pitch = new THREE.Mesh(new THREE.CircleGeometry(w * 0.36, 24), new THREE.MeshStandardMaterial({ color: 0x2e9e4f, roughness: 1 }));
      pitch.rotation.x = -Math.PI / 2; pitch.position.y = 0.42; g.add(pitch);
      const line = new THREE.Mesh(new THREE.RingGeometry(w * 0.12, w * 0.13, 20), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      line.rotation.x = -Math.PI / 2; line.position.y = 0.425; g.add(line);
      g.position.set(p.x, 0, p.z);
      return g;
    }

    if (def.id === 'park' || def.id === 'green_space') {
      const grass = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, d), new THREE.MeshStandardMaterial({ color: 0x67b84a, roughness: 1 }));
      grass.position.y = 0.04; grass.receiveShadow = true; g.add(grass);
      const pathMat = new THREE.MeshStandardMaterial({ color: 0xd9cfae, roughness: 1 });
      const pathA = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.16, d * 0.92), pathMat);
      pathA.rotation.x = -Math.PI / 2; pathA.position.y = 0.085; g.add(pathA);
      const pathB = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.92, d * 0.16), pathMat);
      pathB.rotation.x = -Math.PI / 2; pathB.position.y = 0.085; g.add(pathB);
      const count = def.id === 'park' ? 9 : 4;
      for (let i = 0; i < count; i++) {
        const tx = (Math.random() - 0.5) * w * 0.8;
        const tz = (Math.random() - 0.5) * d * 0.8;
        const tree = new THREE.Group();
        this.addTree(tree, tx, tz);
        tree.scale.setScalar(0.7 + Math.random() * 0.3);
        g.add(tree);
      }
      const bench = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.07, 0.12), new THREE.MeshStandardMaterial({ color: 0x8d6e63 }));
      bench.position.set(w * 0.24, 0.14, d * 0.1); g.add(bench);
      g.position.set(p.x, 0, p.z);
      return g;
    }

    if (def.id === 'gas_station') {
      const base = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d), new THREE.MeshStandardMaterial({ color: 0x9aa5aa }));
      base.position.y = 0.03; base.receiveShadow = true; g.add(base);
      for (const [px, pz] of [[-0.32, -0.2], [0.32, -0.2], [-0.32, 0.25], [0.32, 0.25]]) {
        const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.8, 6), new THREE.MeshStandardMaterial({ color: 0xd0d5d8 }));
        pillar.position.set(px * w, 0.4, pz * d); g.add(pillar);
      }
      const canopy = new THREE.Mesh(new THREE.BoxGeometry(w * 0.95, 0.1, d * 0.7), new THREE.MeshStandardMaterial({ color: 0xf1c40f }));
      canopy.position.set(0, 0.86, 0); canopy.castShadow = true; g.add(canopy);
      const shop = new THREE.Mesh(new THREE.BoxGeometry(w * 0.3, 0.55, d * 0.35), new THREE.MeshStandardMaterial({ color: 0xecf0f1 }));
      shop.position.set(-w * 0.3, 0.3, -d * 0.3); shop.castShadow = true; g.add(shop);
      const pump = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.32, 0.12), new THREE.MeshStandardMaterial({ color: 0xe74c3c }));
      pump.position.set(w * 0.1, 0.22, 0); g.add(pump);
      g.position.set(p.x, 0, p.z);
      return g;
    }

    return null;
  }

  private getWindowTexture(): THREE.Texture {
    if (this.windowTexture) return this.windowTexture;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, 64, 64);
    // One window tile; repeats create the facade grid.
    ctx.fillStyle = '#28414f';
    ctx.fillRect(6, 8, 52, 48);
    const grad = ctx.createLinearGradient(9, 11, 55, 53);
    grad.addColorStop(0, '#dff5ff');
    grad.addColorStop(0.5, '#9cd4ec');
    grad.addColorStop(1, '#639fbd');
    ctx.fillStyle = grad;
    ctx.fillRect(10, 12, 44, 40);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(10, 12, 12, 40);
    ctx.fillStyle = '#4a6878';
    ctx.fillRect(31, 12, 2, 40);
    ctx.fillRect(10, 31, 44, 2);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter;
    t.anisotropy = 4;
    t.colorSpace = THREE.SRGBColorSpace;
    this.windowTexture = t;
    return t;
  }

  private addTree(parent: THREE.Group, x: number, z: number) {    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.5, 6), new THREE.MeshStandardMaterial({ color: 0x8d6e63 }));
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.26 + Math.random() * 0.12, 7, 6), new THREE.MeshStandardMaterial({ color: [0x2e7d32, 0x388e3c, 0x43a047][Math.floor(Math.random()*3)] }));
    trunk.position.set(x, 0.25, z);
    crown.position.set(x, 0.58, z);
    trunk.castShadow = true; crown.castShadow = true;
    parent.add(trunk, crown);
  }

  private createInfraMesh(def: any): THREE.Group {
    const g = new THREE.Group();
    if (def.id === 'road' || def.id === 'bridge') {
      const h = def.id === 'bridge' ? 0.32 : 0.05;
      const slab = new THREE.Mesh(new THREE.BoxGeometry(TILE * 0.95, h, TILE * 0.95), new THREE.MeshStandardMaterial({ color: def.color }));
      slab.position.y = h / 2; slab.receiveShadow = true; g.add(slab);
    } else if (def.id === 'sidewalk') {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(TILE * 0.95, 0.05, TILE * 0.95), new THREE.MeshStandardMaterial({ color: def.color }));
      slab.position.y = 0.025; g.add(slab);
      const tile = new THREE.Mesh(new THREE.PlaneGeometry(TILE * 0.7, 0.04), new THREE.MeshBasicMaterial({ color: 0x8d9aa3 }));
      tile.rotation.x = -Math.PI / 2; tile.position.y = 0.051; g.add(tile);
    } else if (def.id === 'power_line') {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 1.5, 6), new THREE.MeshStandardMaterial({ color: 0x8d6e63 }));
      pole.position.y = 0.75; g.add(pole);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.06, 0.06), new THREE.MeshStandardMaterial({ color: 0x636e72 }));
      bar.position.y = 1.35; g.add(bar);
      const wire = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.01, 3, 12, Math.PI), new THREE.MeshBasicMaterial({ color: 0x333 }));
      wire.position.y = 1.23; wire.rotation.x = Math.PI; g.add(wire);
    } else if (def.id === 'pipe') {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, TILE * 0.92, 10), new THREE.MeshStandardMaterial({ color: 0x0984e3, metalness: 0.35, roughness: 0.4 }));
      pipe.rotation.z = Math.PI / 2; pipe.position.y = 0.08; g.add(pipe);
      const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.1, 10), new THREE.MeshStandardMaterial({ color: 0x055c9d }));
      collar.rotation.z = Math.PI / 2; g.add(collar);
    }
    return g;
  }

  setPreview(defId: string | null) {
    if (this.previewMesh) { this.scene.remove(this.previewMesh); this.previewMesh = null; }
    this.previewDefId = defId;
    if (!defId) return;
    const def = BUILDING_BY_ID[defId];
    if (!def) return;
    const dummy: PlacedBuilding = { uid: 'preview', defId, x: 0, z: 0, rotation: 0, level: 1, powered: true, watered: true };
    if (defId === 'road') {
      const m = new THREE.Mesh(new THREE.BoxGeometry(TILE * 0.98, 0.1, TILE * 0.98), new THREE.MeshStandardMaterial({ color: 0x88c9a1, transparent: true, opacity: 0.55 }));
      this.previewMesh = m;
    } else {
      const g = this.createBuildingMesh(def, dummy);
      g.traverse((o: THREE.Object3D) => {
        const m = o as THREE.Mesh;
        const mat = (m as any).material as THREE.Material | undefined;
        if (mat) {
          const cloned = mat.clone() as any;
          cloned.transparent = true;
          cloned.opacity = 0.55;
          cloned.depthWrite = false;
          m.material = cloned;
        }
      });
      this.previewMesh = g;
    }
    this.scene.add(this.previewMesh);
  }

  updatePreview(x: number, z: number, valid: boolean) {
    if (!this.previewMesh) return;
    const def = this.previewDefId ? BUILDING_BY_ID[this.previewDefId] : null;
    const cx = def ? x + (def.width - 1) / 2 : x;
    const cz = def ? z + (def.depth - 1) / 2 : z;
    const p = this.cellToWorld(cx, cz);
    this.previewMesh.position.set(p.x, 0.05, p.z);
    const tint = valid ? 0x63d98b : 0xff6b6b;
    this.previewMesh.traverse((o: THREE.Object3D) => {
      const m = o as THREE.Mesh;
      const mat = (m as any).material as any;
      if (mat) {
        if (mat.color) mat.color.setHex(tint);
        if (mat.emissive) mat.emissive.setHex(valid ? 0x0a3a1c : 0x3a0a0a);
      }
    });
  }

  private refreshRoadMarkings() {
    for (const [k, mesh] of this.roadMeshes) {
      const [x, z] = k.split(',').map(Number);
      const n = (dx: number, dz: number) => this.occupancy.get(this.key(x + dx, z + dz)) === 'road';
      const hasNS = n(1, 0) || n(-1, 0);
      const hasEW = n(0, 1) || n(0, -1);
      const mark = mesh.children.find(c => c.userData.roadMark) as THREE.Mesh | undefined;
      if (mark) mark.rotation.z = hasNS && !hasEW ? Math.PI / 2 : 0;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      const count = [n(1,0),n(-1,0),n(0,1),n(0,-1)].filter(Boolean).length;
      mat.color.setHex(count >= 3 ? 0x4b5158 : 0x5d636b);
    }
  }

  private updateTrafficLights() {
    for (const t of this.trafficLights) this.roadsGroup.remove(t);
    this.trafficLights = [];
    for (const r of this.roads) {
      const n = (dx: number, dz: number) => this.occupancy.get(this.key(r.x + dx, r.z + dz)) === 'road';
      const count = [n(1,0),n(-1,0),n(0,1),n(0,-1)].filter(Boolean).length;
      if (count < 3) continue;
      const g = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.0, 6), new THREE.MeshStandardMaterial({ color: 0x34495e }));
      pole.position.y = 0.5; g.add(pole);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.3, 0.12), new THREE.MeshStandardMaterial({ color: 0x1e272e }));
      head.position.y = 1.05; g.add(head);
      const light = new THREE.Mesh(new THREE.CircleGeometry(0.045, 10), new THREE.MeshBasicMaterial({ color: 0x2ecc71 }));
      light.position.set(0, 1.04, 0.065); light.userData.signal = true; g.add(light);
      const p = this.cellToWorld(r.x, r.z);
      g.position.set(p.x + TILE * 0.34, 0, p.z + TILE * 0.34);
      this.roadsGroup.add(g);
      this.trafficLights.push(g);
    }
  }

  private addEnvironment() {
    const half = GRID_SIZE * TILE / 2; // 64
    const treeCount = this.mapId === 'foret' ? 340 : this.mapId === 'collines' ? 160 : 240;
    for (let i = 0; i < treeCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = half + 5 + Math.pow(Math.random(), 0.8) * 40;
      this.flora.push({
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
        kind: Math.random() > 0.55 ? 'tree' : 'pine',
        scale: 1.3 + Math.random() * 1.3,
        rot: Math.random() * Math.PI * 2,
      });
    }

    if (this.mapId === 'collines') {
      for (let i = 0; i < 55; i++) {
        const angle = Math.random() * Math.PI * 2;
        const radius = half + 6 + Math.random() * 36;
        this.flora.push({
          x: Math.cos(angle) * radius,
          z: Math.sin(angle) * radius,
          kind: 'rock',
          scale: 2 + Math.random() * 3,
          rot: Math.random() * Math.PI * 2,
        });
      }
    }

    // Lakes/rivers sit outside the buildable area, so no road ever floats on water.
    const lake = new THREE.Mesh(
      new THREE.CircleGeometry(this.mapId === 'foret' ? 14 : 18, 40),
      new THREE.MeshStandardMaterial({ color: 0x3a9fd6, transparent: true, opacity: 0.95, roughness: 0.08, metalness: 0.3 })
    );
    lake.rotation.x = -Math.PI / 2;
    lake.position.set(-half - 24, 0.02, half + 14);
    this.decorGroup.add(lake);
    const shore = new THREE.Mesh(
      new THREE.CircleGeometry(this.mapId === 'foret' ? 15.6 : 19.8, 40),
      new THREE.MeshStandardMaterial({ color: 0xd8cba4, roughness: 1 })
    );
    shore.rotation.x = -Math.PI / 2;
    shore.position.set(-half - 24, 0.012, half + 14);
    this.decorGroup.add(shore);

    if (this.mapId === 'riviere') {
      const river = new THREE.Mesh(
        new THREE.PlaneGeometry(230, 26, 1, 1),
        new THREE.MeshStandardMaterial({ color: 0x3aa0d8, transparent: true, opacity: 0.95, roughness: 0.08, metalness: 0.3 })
      );
      river.rotation.x = -Math.PI / 2;
      river.rotation.z = 0.42;
      river.position.set(half + 18, 0.018, -half - 12);
      this.decorGroup.add(river);
    }
  }

  private createRain() {
    const count = 900;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 160;
      positions[i * 3 + 1] = Math.random() * 70;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 160;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color: 0xaad4ff, size: 0.14, transparent: true, opacity: 0.65 });
    this.rain = new THREE.Points(geo, mat);
    this.rain.visible = false;
    this.effectsGroup.add(this.rain);
  }

  setWeather(weather: 'clear' | 'rain') {
    this.weather = weather;
    if (this.rain) this.rain.visible = weather === 'rain';
  }

  updateEffects(dt: number) {
    if (this.rain && this.rain.visible) {
      const pos = this.rain.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        let y = pos.getY(i) - dt * 26;
        if (y < 0) y = 55 + Math.random() * 20;
        pos.setY(i, y);
      }
      pos.needsUpdate = true;
    }
    const green = Math.floor(Date.now() / 2200) % 2 === 0;
    for (const g of this.trafficLights) {
      const light = g.children.find(c => c.userData.signal) as THREE.Mesh | undefined;
      if (light) (light.material as THREE.MeshBasicMaterial).color.setHex(green ? 0x2ecc71 : 0xe74c3c);
    }
  }

  setNightMode(night: boolean) {
    const intensity = night ? 1.35 : 0;
    this.buildingsGroup.traverse((o: THREE.Object3D) => {
      if (o.userData?.window) (o as THREE.Mesh).visible = true;
      const mat = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (mat && (mat as any).emissive && o.userData?.window) {
        (mat as THREE.MeshStandardMaterial).emissiveIntensity = intensity;
      }
    });
  }

  syncVehicles() {
    const desired = Math.min(26, Math.floor(this.roads.length / 5));
    while (this.vehicles.length < desired && this.roads.length > 2) this.spawnVehicle();
    while (this.vehicles.length > desired) { const v = this.vehicles.pop()!; this.vehiclesGroup.remove(v.mesh); }
  }

  private neighbors(x: number, z: number): RoadNode[] {
    const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
    const out: RoadNode[] = [];
    for (const [dx,dz] of dirs) {
      const nx = x + dx, nz = z + dz;
      if (this.occupancy.get(this.key(nx,nz)) === 'road') out.push({ x: nx, z: nz });
    }
    return out;
  }

  private spawnVehicle() {
    const a = this.roads[Math.floor(Math.random() * this.roads.length)];
    if (!a) return;
    const nbs = this.neighbors(a.x, a.z);
    if (!nbs.length) return;
    const b = nbs[Math.floor(Math.random() * nbs.length)];
    const r = Math.random();
    const type: VehicleType = r < 0.09 ? 'bus' : r < 0.24 ? 'truck' : r < 0.34 ? 'service' : 'car';
    const mesh = this.createVehicleMesh(type);
    this.vehiclesGroup.add(mesh);
    const pa = this.cellToWorld(a.x, a.z); pa.y = 0.06;
    const pb = this.cellToWorld(b.x, b.z); pb.y = 0.06;
    const speed = type === 'bus' ? 0.0022 : type === 'truck' ? 0.0028 : 0.004 + Math.random() * 0.002;
    this.vehicles.push({ mesh, path: [pa, pb, this.pickNext(pb, pa)], t: 0, speed, type });
  }

  private createVehicleMesh(type: VehicleType): THREE.Group {
    const g = new THREE.Group();
    const palette = [0xe74c3c, 0xf1c40f, 0x3498db, 0xecf0f1, 0x2ecc71, 0xe67e22, 0x9b59b6, 0x16a085];
    const color = type === 'bus' ? 0x0984e3 : type === 'truck' ? 0x95a5a6 : type === 'service' ? 0xf5f6fa : palette[Math.floor(Math.random() * palette.length)];
    const [sx, sy, sz] = type === 'bus' ? [0.72, 0.46, 1.6] : type === 'truck' ? [0.78, 0.48, 1.35] : [0.62, 0.32, 1.02];

    const bodyMat = new THREE.MeshStandardMaterial({ color, metalness: 0.25, roughness: 0.55 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), bodyMat);
    body.position.y = sy / 2 + 0.06; body.castShadow = true; g.add(body);

    const roof = new THREE.Mesh(new THREE.BoxGeometry(sx * 0.9, 0.06, sz * 0.82), new THREE.MeshStandardMaterial({ color: 0x2c3e50 }));
    roof.position.y = sy + 0.07; g.add(roof);

    const cabMat = new THREE.MeshStandardMaterial({ color: 0x9fd8f5, transparent: true, opacity: 0.65, roughness: 0.2 });
    const cab = new THREE.Mesh(new THREE.BoxGeometry(sx * 0.8, sy * 0.55, sz * 0.25), cabMat);
    cab.position.set(0, sy * 0.78, sz * 0.3); g.add(cab);

    const wheelGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.075, 8);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x14181c });
    for (const [cx, cz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(cx * sx * 0.46, 0.09, cz * sz * 0.3);
      g.add(w);
    }
    return g;
  }

  private pickNext(currentWorld: THREE.Vector3, prevWorld: THREE.Vector3): THREE.Vector3 {
    const c = this.worldToCell(currentWorld);
    const p = this.worldToCell(prevWorld);
    let nbs = this.neighbors(c.x, c.z).filter(n => !(n.x === p.x && n.z === p.z));
    if (!nbs.length) nbs = this.neighbors(c.x, c.z);
    if (!nbs.length) return prevWorld.clone();
    const pick = nbs[Math.floor(Math.random() * nbs.length)];
    const pt = this.cellToWorld(pick.x, pick.z);
    pt.y = 0.06;
    return pt;
  }

  updateVehicles(dt: number) {
    for (const v of this.vehicles) {
      const seg = v.path[1].clone().sub(v.path[0]);
      const len = Math.max(0.001, seg.length());
      v.t += (v.speed * dt) / len;
      if (v.t >= 1) {
        const prev = v.path[0];
        const cur = v.path[1];
        const next = this.pickNext(cur, prev);
        v.path = [cur.clone(), next.clone(), this.pickNext(next, cur)];
        v.t = 0;
      }
      const p = new THREE.Vector3().lerpVectors(v.path[0], v.path[1], Math.min(1, v.t));
      v.mesh.position.copy(p);
      const dir = v.path[1].clone().sub(v.path[0]);
      if (dir.lengthSq() > 0.0001) v.mesh.rotation.y = Math.atan2(dir.x, dir.z);
    }
  }

  getBuildingMeshes() { return this.buildingMeshes; }
}
