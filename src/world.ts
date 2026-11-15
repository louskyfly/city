import * as THREE from 'three';
import { BUILDING_BY_ID } from './data/buildings';
import type { PlacedBuilding } from './types';

export const GRID_SIZE = 64;
export const TILE = 2;

export interface RoadNode { x: number; z: number; }
type VehicleType = 'car' | 'truck' | 'bus' | 'service';

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
  private buildingMeshes = new Map<string, THREE.Object3D>();
  private roadMeshes = new Map<string, THREE.Mesh>();
  private occupancy = new Map<string, string>(); // "x,z" -> uid or 'road'
  private trafficLights: THREE.Group[] = [];
  roads: RoadNode[] = [];
  vehicles: { mesh: THREE.Group; path: THREE.Vector3[]; t: number; speed: number; type: VehicleType }[] = [];
  rain: THREE.Points | null = null;
  weather: 'clear' | 'rain' = 'clear';
  mapId = 'plaine';

  constructor(scene: THREE.Scene, mapId = 'plaine') {
    this.scene = scene;
    this.mapId = mapId;
    this.scene.add(this.buildingsGroup, this.roadsGroup, this.decorGroup, this.vehiclesGroup, this.effectsGroup);
    this.buildTerrain();
    this.addEnvironment();
    this.createRain();
  }

  getOccupant(x: number, z: number) { return this.occupancy.get(this.key(x, z)); }
  isCellFree(x: number, z: number) { return !this.occupancy.has(this.key(x, z)); }

  private buildTerrain() {
    const groundGeo = new THREE.PlaneGeometry(GRID_SIZE * TILE, GRID_SIZE * TILE, GRID_SIZE, GRID_SIZE);
    const pos = groundGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      let h = 0;
      if (this.mapId === 'collines') {
        h = Math.sin(x * 0.05) * Math.cos(y * 0.05) * 2.8 + Math.sin((x + y) * 0.03) * 1.2;
      } else if (this.mapId === 'riviere') {
        const river = Math.exp(-Math.pow((x * 0.06 + Math.sin(y * 0.04) * 0.8), 2)) * -1.2;
        h = Math.sin(x * 0.02) * Math.cos(y * 0.03) * 0.8 + river;
      } else if (this.mapId === 'foret') {
        h = Math.sin(x * 0.03) * Math.cos(y * 0.04) * 1.4 + Math.cos((x - y) * 0.02) * 0.7;
      } else {
        h = Math.sin(x * 0.03) * Math.cos(y * 0.04) * 1.0 + Math.sin((x + y) * 0.02) * 0.4;
      }
      pos.setZ(i, h);
    }
    groundGeo.computeVertexNormals();
    const colors: Record<string, number> = { plaine: 0x6ab04c, collines: 0x7cb342, riviere: 0x76b852, foret: 0x558b2f };
    const groundMat = new THREE.MeshStandardMaterial({ color: colors[this.mapId] ?? 0x6ab04c, roughness: 1 });
    this.ground = new THREE.Mesh(groundGeo, groundMat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.ground.name = 'ground';
    this.scene.add(this.ground);

    this.gridHelper = new THREE.GridHelper(GRID_SIZE * TILE, GRID_SIZE, 0xffffff, 0xffffff);
    (this.gridHelper.material as THREE.Material).opacity = 0.12;
    (this.gridHelper.material as THREE.Material).transparent = true;
    this.gridHelper.position.y = 0.02;
    this.scene.add(this.gridHelper);
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
    this.occupancy.set(this.key(x, z), 'road');
    this.roads.push({ x, z });
    const geo = new THREE.BoxGeometry(TILE * 0.98, 0.08, TILE * 0.98);
    const mat = new THREE.MeshStandardMaterial({ color: 0x555b61, roughness: 0.9 });
    const mesh = new THREE.Mesh(geo, mat);
    const p = this.cellToWorld(x, z);
    mesh.position.set(p.x, 0.04, p.z);
    mesh.receiveShadow = true;
    this.roadsGroup.add(mesh);
    // markings
    const mark = new THREE.Mesh(new THREE.PlaneGeometry(0.08, TILE * 0.6), new THREE.MeshStandardMaterial({ color: 0xe0e0e0 }));
    mark.rotation.x = -Math.PI / 2; mark.position.y = 0.045; mesh.add(mark);
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

  private createBuildingMesh(def: any, b: PlacedBuilding): THREE.Group {
    const g = new THREE.Group();
    g.userData.uid = b.uid;
    const w = def.width * TILE * 0.9, d = def.depth * TILE * 0.9, h = def.height * 1.6 * (1 + (b.level - 1) * 0.08);
    if (def.id === 'road' || def.id === 'bridge' || def.id === 'sidewalk' || def.id === 'power_line' || def.id === 'pipe') {
      return this.createInfraMesh(def);
    }
    const bodyMat = new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.7 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bodyMat);
    body.position.y = h / 2;
    body.castShadow = true; body.receiveShadow = true;
    g.add(body);

    // roof/detail
    const roofH = Math.max(0.25, h * 0.16);
    if (def.height > 2.5) {
      const flat = new THREE.Mesh(new THREE.BoxGeometry(w * 1.03, 0.14, d * 1.03), new THREE.MeshStandardMaterial({ color: def.roofColor }));
      flat.position.y = h + 0.07; flat.castShadow = true; g.add(flat);
      // rooftop unit
      const ac = new THREE.Mesh(new THREE.BoxGeometry(w * 0.3, 0.18, d * 0.2), new THREE.MeshStandardMaterial({ color: 0x95a5a6 }));
      ac.position.set(w * 0.15, h + 0.22, 0); g.add(ac);
    } else {
      const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.62, roofH, 4), new THREE.MeshStandardMaterial({ color: def.roofColor, roughness: 0.8 }));
      roof.position.y = h + roofH / 2; roof.rotation.y = Math.PI / 4; roof.castShadow = true; g.add(roof);
    }

    // windows on all sides for buildings
    if (def.category !== 'leisure' || ['cinema', 'sports_center', 'stadium'].includes(def.id)) {
      const winMat = new THREE.MeshStandardMaterial({ color: 0xcfefff, emissive: 0xfff2b0, emissiveIntensity: 0.0, transparent: true, opacity: 0.9 });
      const floors = Math.max(1, Math.round(def.height + (b.level - 1) * 0.3));
      const cols = Math.max(1, Math.floor(w / 0.45));
      const rows = Math.max(1, Math.floor(d / 0.45));
      const addSide = (px: number, pz: number, ry: number, count: number, span: number) => {
        for (let f = 0; f < floors; f++) for (let i = 0; i < count; i++) {
          const win = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.2), winMat.clone());
          const offset = (i - (count - 1) / 2) * (span / Math.max(1, count));
          win.position.set(px + (ry === 0 ? offset : 0), 0.45 + f * (h / floors) * 0.85, pz + (ry !== 0 ? offset : 0));
          win.rotation.y = ry;
          win.userData.window = true;
          g.add(win);
        }
      };
      addSide(0, d / 2 + 0.011, 0, cols, w * 0.8);
      addSide(0, -d / 2 - 0.011, Math.PI, cols, w * 0.8);
      addSide(w / 2 + 0.011, 0, Math.PI / 2, rows, d * 0.8);
      addSide(-w / 2 - 0.011, 0, -Math.PI / 2, rows, d * 0.8);
    }

    // category accents
    if (def.category === 'industrial') {
      const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, h * 0.6, 8), new THREE.MeshStandardMaterial({ color: 0x7f8c8d }));
      chimney.position.set(w * 0.28, h * 0.8, -d * 0.2); chimney.castShadow = true; g.add(chimney);
    }
    if (def.id === 'hospital') {
      const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.05), new THREE.MeshStandardMaterial({ color: 0xe74c3c }));
      const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.05), new THREE.MeshStandardMaterial({ color: 0xe74c3c }));
      crossV.position.set(0, h * 0.7, d / 2 + 0.02); crossH.position.set(0, h * 0.7, d / 2 + 0.02);
      g.add(crossV, crossH);
    }
    if (def.id === 'park' || def.id === 'green_space' || def.category === 'leisure') {
      body.scale.y = 0.12; body.position.y = 0.1; (body.material as THREE.MeshStandardMaterial).color.set(def.id === 'stadium' ? def.color : 0x43a047);
      const count = def.id === 'park' ? 6 : def.id === 'green_space' ? 3 : 4;
      for (let i = 0; i < count; i++) this.addTree(g, (Math.random() - 0.5) * w * 0.75, (Math.random() - 0.5) * d * 0.75);
      if (def.id === 'park' || def.id === 'sports_center') {
        const path = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.7, 0.2), new THREE.MeshStandardMaterial({ color: 0xd7ccc8 }));
        path.rotation.x = -Math.PI / 2; path.position.y = 0.13; g.add(path);
      }
    }

    // base/sidewalk ring
    const base = new THREE.Mesh(new THREE.BoxGeometry(w * 1.08, 0.06, d * 1.08), new THREE.MeshStandardMaterial({ color: 0xb0bec5 }));
    base.position.y = 0.03; base.receiveShadow = true; g.add(base);

    const p = this.cellToWorld(b.x + (def.width - 1) / 2, b.z + (def.depth - 1) / 2);
    g.position.set(p.x, 0, p.z);
    return g;
  }

  private addTree(parent: THREE.Group, x: number, z: number) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.5, 6), new THREE.MeshStandardMaterial({ color: 0x8d6e63 }));
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.28 + Math.random() * 0.1, 8, 8), new THREE.MeshStandardMaterial({ color: 0x2e7d32 }));
    trunk.position.set(x, 0.25, z); crown.position.set(x, 0.58, z);
    trunk.castShadow = crown.castShadow = true;
    parent.add(trunk, crown);
  }

  private createInfraMesh(def: any): THREE.Group {
    const g = new THREE.Group();
    if (def.id === 'power_line') {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.6, 6), new THREE.MeshStandardMaterial({ color: 0x8d6e63 }));
      pole.position.y = 0.8; g.add(pole);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.05), new THREE.MeshStandardMaterial({ color: 0x636e72 }));
      bar.position.y = 1.45; g.add(bar);
      const wire = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.01, 4, 12, Math.PI), new THREE.MeshStandardMaterial({ color: 0x444 }));
      wire.position.y = 1.35; wire.rotation.x = Math.PI; g.add(wire);
    } else if (def.id === 'pipe') {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, TILE * 0.9, 10), new THREE.MeshStandardMaterial({ color: 0x0984e3, metalness: 0.2 }));
      pipe.rotation.z = Math.PI / 2; pipe.position.y = 0.09; g.add(pipe);
    } else {
      const h = def.id === 'bridge' ? 0.38 : 0.06;
      const slab = new THREE.Mesh(new THREE.BoxGeometry(TILE * 0.95, h, TILE * 0.95), new THREE.MeshStandardMaterial({ color: def.color }));
      slab.position.y = h / 2; slab.receiveShadow = true; g.add(slab);
      if (def.id === 'sidewalk') {
        const line = new THREE.Mesh(new THREE.PlaneGeometry(TILE * 0.8, 0.05), new THREE.MeshStandardMaterial({ color: 0xb0bec5 }));
        line.rotation.x = -Math.PI / 2; line.position.y = h + 0.001; g.add(line);
      }
      if (def.id === 'bridge') {
        const railMat = new THREE.MeshStandardMaterial({ color: 0x90a4ae });
        const r1 = new THREE.Mesh(new THREE.BoxGeometry(TILE * 0.95, 0.15, 0.05), railMat); r1.position.set(0, h + 0.1, TILE * 0.42);
        const r2 = r1.clone(); r2.position.z = -TILE * 0.42; g.add(r1, r2);
      }
    }
    return g;
  }

  setPreview(defId: string | null) {
    if (this.previewMesh) { this.scene.remove(this.previewMesh); this.previewMesh = null; }
    if (!defId) return;
    const def = BUILDING_BY_ID[defId];
    if (!def) return;
    const dummy: PlacedBuilding = { uid: 'preview', defId, x: 0, z: 0, rotation: 0, level: 1, powered: true, watered: true };
    if (defId === 'road') {
      const m = new THREE.Mesh(new THREE.BoxGeometry(TILE * 0.98, 0.1, TILE * 0.98), new THREE.MeshStandardMaterial({ color: 0x888, transparent: true, opacity: 0.5 }));
      this.previewMesh = m;
    } else {
      const g = this.createBuildingMesh(def, dummy);
      g.traverse((o: THREE.Object3D) => { const m = o as THREE.Mesh; if ((m as any).material) { const mat = (m.material as THREE.Material).clone() as any; mat.transparent = true; mat.opacity = 0.5; m.material = mat; } });
      this.previewMesh = g;
    }
    this.scene.add(this.previewMesh);
  }

  updatePreview(x: number, z: number, valid: boolean) {
    if (!this.previewMesh) return;
    const p = this.cellToWorld(x, z);
    this.previewMesh.position.set(p.x, 0.05, p.z);
    this.previewMesh.traverse((o: THREE.Object3D) => { const m = o as THREE.Mesh; const mat = (m as any).material; if (mat && mat.color) { mat.color.setHex(valid ? 0x7bed9f : 0xff6b6b); } });
  }

  private refreshRoadMarkings() {
    for (const [k, mesh] of this.roadMeshes) {
      const [x, z] = k.split(',').map(Number);
      const n = (dx:number,dz:number)=> this.occupancy.get(this.key(x+dx,z+dz))==='road';
      const count = [n(1,0),n(-1,0),n(0,1),n(0,-1)].filter(Boolean).length;
      (mesh.material as THREE.MeshStandardMaterial).color.setHex(count >= 3 ? 0x4a4f55 : 0x555b61);
      const mark = mesh.children.find(c => (c as THREE.Mesh).geometry instanceof THREE.PlaneGeometry) as THREE.Mesh | undefined;
      if (mark) mark.rotation.z = (n(1,0)||n(-1,0)) && !(n(0,1)||n(0,-1)) ? Math.PI / 2 : 0;
    }
  }

  private updateTrafficLights() {
    for (const t of this.trafficLights) this.roadsGroup.remove(t);
    this.trafficLights = [];
    for (const r of this.roads) {
      const n = (dx:number,dz:number)=> this.occupancy.get(this.key(r.x+dx,r.z+dz))==='road';
      const count = [n(1,0),n(-1,0),n(0,1),n(0,-1)].filter(Boolean).length;
      if (count >= 3) {
        const g = new THREE.Group();
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 6), new THREE.MeshStandardMaterial({ color: 0x333 }));
        pole.position.y = 0.45; g.add(pole);
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.28, 0.1), new THREE.MeshStandardMaterial({ color: 0x222 }));
        box.position.y = 0.95; g.add(box);
        const light = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), new THREE.MeshStandardMaterial({ color: 0x2ecc71, emissive: 0x2ecc71, emissiveIntensity: 0.8 }));
        light.position.set(0, 0.9, 0.06); light.userData.signal = true; g.add(light);
        const p = this.cellToWorld(r.x, r.z);
        g.position.set(p.x + 0.7, 0, p.z + 0.7);
        this.roadsGroup.add(g);
        this.trafficLights.push(g);
      }
    }
  }

  private addEnvironment() {
    const baseTrees = this.mapId === 'foret' ? 280 : this.mapId === 'plaine' ? 140 : 100;
    for (let i = 0; i < baseTrees; i++) {
      const x = (Math.random() - 0.5) * GRID_SIZE * TILE;
      const z = (Math.random() - 0.5) * GRID_SIZE * TILE;
      if (Math.abs(x) < 14 && Math.abs(z) < 14) continue;
      const t = new THREE.Group();
      this.addTree(t, 0, 0);
      t.position.set(x, 0, z);
      const s = 0.7 + Math.random() * 0.9; t.scale.setScalar(s);
      this.decorGroup.add(t);
    }
    // rocks on hills
    if (this.mapId === 'collines') {
      for (let i = 0; i < 40; i++) {
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5 + Math.random() * 0.8, 0), new THREE.MeshStandardMaterial({ color: 0x90a4ae, roughness: 1 }));
        rock.position.set((Math.random() - 0.5) * GRID_SIZE * TILE, 0.2, (Math.random() - 0.5) * GRID_SIZE * TILE);
        rock.castShadow = true; this.decorGroup.add(rock);
      }
    }
    // water
    if (this.mapId === 'riviere') {
      const river = new THREE.Mesh(new THREE.PlaneGeometry(GRID_SIZE * TILE * 1.2, 10, 1, 1), new THREE.MeshStandardMaterial({ color: 0x3498db, transparent: true, opacity: 0.85, roughness: 0.15, metalness: 0.1 }));
      river.rotation.x = -Math.PI / 2; river.rotation.z = 0.35; river.position.set(0, 0.03, 0);
      this.decorGroup.add(river);
    } else {
      const lake = new THREE.Mesh(new THREE.CircleGeometry(this.mapId === 'foret' ? 7 : 10, 32), new THREE.MeshStandardMaterial({ color: 0x3498db, transparent: true, opacity: 0.85, roughness: 0.2, metalness: 0.1 }));
      lake.rotation.x = -Math.PI / 2; lake.position.set(-35, 0.06, 28);
      this.decorGroup.add(lake);
    }
  }

  private createRain() {
    const count = 1200;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 180;
      positions[i * 3 + 1] = Math.random() * 80;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 180;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color: 0xaad4ff, size: 0.12, transparent: true, opacity: 0.6 });
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
        let y = pos.getY(i) - dt * 25;
        if (y < 0) y = 60 + Math.random() * 20;
        pos.setY(i, y);
      }
      pos.needsUpdate = true;
    }
    // animate traffic lights
    const green = Math.floor(Date.now() / 2000) % 2 === 0;
    for (const g of this.trafficLights) {
      const light = g.children.find(c => c.userData.signal) as THREE.Mesh | undefined;
      if (light) {
        const col = green ? 0x2ecc71 : 0xe74c3c;
        (light.material as THREE.MeshStandardMaterial).color.setHex(col);
        (light.material as THREE.MeshStandardMaterial).emissive.setHex(col);
      }
    }
  }

  setNightMode(night: boolean) {
    this.buildingsGroup.traverse((o: THREE.Object3D) => {
      if ((o as any).userData?.window) {
        const mat = (o as THREE.Mesh).material as THREE.MeshStandardMaterial;
        mat.emissiveIntensity = night ? 1.2 : 0.0;
      }
    });
  }

  syncVehicles() {
    const desired = Math.min(60, Math.floor(this.roads.length / 2.5));
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
    const b = nbs.length ? nbs[Math.floor(Math.random() * nbs.length)] : this.roads[Math.floor(Math.random() * this.roads.length)];
    if (!b || (a.x===b.x && a.z===b.z)) return;
    const r = Math.random();
    const type: VehicleType = r < 0.1 ? 'bus' : r < 0.25 ? 'truck' : r < 0.35 ? 'service' : 'car';
    const mesh = this.createVehicleMesh(type);
    this.vehiclesGroup.add(mesh);
    const pa = this.cellToWorld(a.x, a.z); const pb = this.cellToWorld(b.x, b.z);
    pa.y = 0.18; pb.y = 0.18;
    const speed = type === 'bus' ? 0.0025 : type === 'truck' ? 0.003 : 0.004 + Math.random() * 0.003;
    this.vehicles.push({ mesh, path: [pa, pb, this.pickNext(pb, pa)], t: 0, speed, type });
  }

  private createVehicleMesh(type: VehicleType): THREE.Group {
    const g = new THREE.Group();
    const colors = [0xe74c3c,0xf1c40f,0x3498db,0xecf0f1,0x2ecc71,0xe67e22,0x9b59b6];
    const color = type === 'bus' ? 0x0984e3 : type === 'truck' ? 0x95a5a6 : type === 'service' ? 0xffffff : colors[Math.floor(Math.random()*colors.length)];
    const size = type === 'bus' ? [0.7, 0.45, 1.5] : type === 'truck' ? [0.75, 0.5, 1.3] : [0.6, 0.32, 1.0];
    const body = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), new THREE.MeshStandardMaterial({ color, metalness: 0.2, roughness: 0.6 }));
    body.position.y = size[1] / 2 + 0.08; body.castShadow = true; g.add(body);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(size[0]*0.85, size[1]*0.7, size[2]*0.35), new THREE.MeshStandardMaterial({ color: 0xb3e5fc, transparent: true, opacity: 0.8 }));
    cab.position.set(0, size[1]*0.95, -size[2]*0.15); g.add(cab);
    const wheelGeo = new THREE.CylinderGeometry(0.1,0.1,0.08,8);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x222 });
    [[-1,1],[1,1],[-1,-1],[1,-1]].forEach(([sx,sz]) => {
      const w = new THREE.Mesh(wheelGeo, wheelMat); w.rotation.z = Math.PI/2; w.position.set(sx*size[0]*0.45, 0.1, sz*size[2]*0.3); g.add(w);
    });
    return g;
  }

  private pickNext(currentWorld: THREE.Vector3, prevWorld: THREE.Vector3): THREE.Vector3 {
    const c = this.worldToCell(currentWorld);
    const p = this.worldToCell(prevWorld);
    const nbs = this.neighbors(c.x, c.z).filter(n => !(n.x === p.x && n.z === p.z));
    const pick = (nbs.length ? nbs : this.neighbors(c.x, c.z))[Math.floor(Math.random() * Math.max(1, (nbs.length ? nbs : this.neighbors(c.x,c.z)).length))];
    if (!pick) return prevWorld.clone();
    const pt = this.cellToWorld(pick.x, pick.z); pt.y = 0.18; return pt;
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
      const dir = v.path[1].clone().sub(v.path[0]); dir.y = 0;
      if (dir.lengthSq() > 0.0001) v.mesh.lookAt(v.path[1].x, p.y, v.path[1].z);
    }
  }

  getBuildingMeshes() { return this.buildingMeshes; }
}