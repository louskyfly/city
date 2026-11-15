import * as THREE from 'three';
import { BUILDING_BY_ID } from './data/buildings';
import type { PlacedBuilding } from './types';

export const GRID_SIZE = 64;
export const TILE = 2;

export interface RoadNode { x: number; z: number; }

export class World {
  scene: THREE.Scene;
  ground: THREE.Mesh;
  gridHelper: THREE.GridHelper;
  buildingsGroup = new THREE.Group();
  roadsGroup = new THREE.Group();
  decorGroup = new THREE.Group();
  vehiclesGroup = new THREE.Group();
  previewMesh: THREE.Object3D | null = null;
  private buildingMeshes = new Map<string, THREE.Object3D>();
  private roadMeshes = new Map<string, THREE.Mesh>();
  private occupancy = new Map<string, string>(); // "x,z" -> uid or 'road'
  roads: RoadNode[] = [];

  getOccupant(x: number, z: number) { return this.occupancy.get(this.key(x, z)); }
  isCellFree(x: number, z: number) { return !this.occupancy.has(this.key(x, z)); }
  vehicles: { mesh: THREE.Mesh; path: THREE.Vector3[]; t: number; speed: number }[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.scene.add(this.buildingsGroup, this.roadsGroup, this.decorGroup, this.vehiclesGroup);

    const groundGeo = new THREE.PlaneGeometry(GRID_SIZE * TILE, GRID_SIZE * TILE, GRID_SIZE, GRID_SIZE);
    // gentle hills
    const pos = groundGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      const h = Math.sin(x * 0.03) * Math.cos(y * 0.04) * 1.2 + Math.sin((x + y) * 0.02) * 0.6;
      pos.setZ(i, h);
    }
    groundGeo.computeVertexNormals();
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x6ab04c, roughness: 1 });
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

    this.addEnvironment();
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
    this.roadMeshes.set(this.key(x, z), mesh);
    this.refreshRoadMarkings();
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
      return { type: 'road' };
    }
    return { type: 'building', uid: occ };
  }

  placeBuilding(b: PlacedBuilding): boolean {
    const def = BUILDING_BY_ID[b.defId];
    if (!def) return false;
    if (!this.isAreaFree(b.x, b.z, def.width, def.depth)) return false;
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
    const w = def.width * TILE * 0.9, d = def.depth * TILE * 0.9, h = def.height * 1.6;
    if (def.id === 'road' || def.id === 'bridge' || def.id === 'sidewalk' || def.id === 'power_line' || def.id === 'pipe') {
      return this.createInfraMesh(def);
    }
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.7 }));
    body.position.y = h / 2;
    body.castShadow = true; body.receiveShadow = true;
    g.add(body);
    // roof
    const roofH = Math.max(0.25, h * 0.18);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.62, roofH, 4), new THREE.MeshStandardMaterial({ color: def.roofColor, roughness: 0.8 }));
    roof.position.y = h + roofH / 2; roof.rotation.y = Math.PI / 4; roof.castShadow = true;
    if (def.height > 2.5) {
      roof.scale.set(0.001,0.001,0.001);
      const flat = new THREE.Mesh(new THREE.BoxGeometry(w * 1.02, 0.12, d * 1.02), new THREE.MeshStandardMaterial({ color: def.roofColor }));
      flat.position.y = h + 0.06; g.add(flat);
    } else g.add(roof);
    // windows
    if (def.category !== 'leisure' || def.id === 'cinema') {
      const winMat = new THREE.MeshStandardMaterial({ color: 0xbfefff, emissive: 0x224455, emissiveIntensity: 0.2 });
      const floors = Math.max(1, Math.round(def.height));
      for (let f = 0; f < floors; f++) for (let i = -1; i <= 1; i += 2) {
        const win = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.22), winMat);
        win.position.set(i * w * 0.18, 0.5 + f * (h / floors) * 0.9, d / 2 + 0.01);
        g.add(win);
      }
    }
    // trees for parks/green
    if (def.id === 'park' || def.id === 'green_space') {
      body.scale.y = 0.15; body.position.y = 0.12; (body.material as THREE.MeshStandardMaterial).color.set(0x2ecc71);
      const count = def.id === 'park' ? 5 : 2;
      for (let i = 0; i < count; i++) {
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.5, 6), new THREE.MeshStandardMaterial({ color: 0x8d6e63 }));
        const crown = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), new THREE.MeshStandardMaterial({ color: 0x27ae60 }));
        const ox = (Math.random() - 0.5) * w * 0.7, oz = (Math.random() - 0.5) * d * 0.7;
        trunk.position.set(ox, 0.25, oz); crown.position.set(ox, 0.55, oz);
        trunk.castShadow = crown.castShadow = true;
        g.add(trunk, crown);
      }
    }
    const p = this.cellToWorld(b.x + (def.width - 1) / 2, b.z + (def.depth - 1) / 2);
    g.position.set(p.x, 0, p.z);
    return g;
  }

  private createInfraMesh(def: any): THREE.Group {
    const g = new THREE.Group();
    if (def.id === 'power_line') {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.4, 6), new THREE.MeshStandardMaterial({ color: 0x8d6e63 }));
      pole.position.y = 0.7; g.add(pole);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.05, 0.05), new THREE.MeshStandardMaterial({ color: 0x636e72 }));
      bar.position.y = 1.3; g.add(bar);
    } else if (def.id === 'pipe') {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, TILE * 0.9, 10), new THREE.MeshStandardMaterial({ color: 0x0984e3 }));
      pipe.rotation.z = Math.PI / 2; pipe.position.y = 0.08; g.add(pipe);
    } else {
      const h = def.id === 'bridge' ? 0.35 : 0.06;
      const slab = new THREE.Mesh(new THREE.BoxGeometry(TILE * 0.95, h, TILE * 0.95), new THREE.MeshStandardMaterial({ color: def.color }));
      slab.position.y = h / 2; g.add(slab);
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
      g.traverse(o => { const m = o as THREE.Mesh; if ((m as any).material) { const mat = (m.material as THREE.Material).clone() as any; mat.transparent = true; mat.opacity = 0.5; m.material = mat; } });
      this.previewMesh = g;
    }
    this.scene.add(this.previewMesh);
  }

  updatePreview(x: number, z: number, valid: boolean) {
    if (!this.previewMesh) return;
    const p = this.cellToWorld(x, z);
    this.previewMesh.position.set(p.x, 0.05, p.z);
    this.previewMesh.traverse(o => { const m = o as THREE.Mesh; const mat = (m as any).material; if (mat && mat.color) { mat.color.setHex(valid ? 0x7bed9f : 0xff6b6b); } });
  }

  private refreshRoadMarkings() {
    // simple: recolor intersections slightly
    for (const [k, mesh] of this.roadMeshes) {
      const [x, z] = k.split(',').map(Number);
      const n = (dx:number,dz:number)=> this.occupancy.get(this.key(x+dx,z+dz))==='road';
      const count = [n(1,0),n(-1,0),n(0,1),n(0,-1)].filter(Boolean).length;
      (mesh.material as THREE.MeshStandardMaterial).color.setHex(count >= 3 ? 0x4a4f55 : 0x555b61);
    }
  }

  private addEnvironment() {
    // trees and rocks around edges
    const matTree = new THREE.MeshStandardMaterial({ color: 0x1e8449 });
    const matTrunk = new THREE.MeshStandardMaterial({ color: 0x7e5109 });
    for (let i = 0; i < 120; i++) {
      const x = (Math.random() - 0.5) * GRID_SIZE * TILE;
      const z = (Math.random() - 0.5) * GRID_SIZE * TILE;
      if (Math.abs(x) < 18 && Math.abs(z) < 18) continue;
      const t = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 1.2, 6), matTrunk);
      trunk.position.y = 0.6;
      const crown = new THREE.Mesh(new THREE.ConeGeometry(0.8, 1.8, 7), matTree);
      crown.position.y = 1.8;
      t.add(trunk, crown);
      t.position.set(x, 0, z);
      const s = 0.7 + Math.random() * 0.8; t.scale.setScalar(s);
      this.decorGroup.add(t);
    }
    // water/lake
    const lake = new THREE.Mesh(new THREE.CircleGeometry(10, 32), new THREE.MeshStandardMaterial({ color: 0x3498db, transparent: true, opacity: 0.85, roughness: 0.2, metalness: 0.1 }));
    lake.rotation.x = -Math.PI / 2; lake.position.set(-35, 0.06, 28);
    this.decorGroup.add(lake);
  }

  syncVehicles() {
    const desired = Math.min(40, Math.floor(this.roads.length / 3));
    while (this.vehicles.length < desired && this.roads.length > 2) this.spawnVehicle();
    while (this.vehicles.length > desired) { const v = this.vehicles.pop()!; this.vehiclesGroup.remove(v.mesh); }
  }

  private spawnVehicle() {
    const a = this.roads[Math.floor(Math.random() * this.roads.length)];
    const b = this.roads[Math.floor(Math.random() * this.roads.length)];
    if (!a || !b || (a.x===b.x && a.z===b.z)) return;
    const colors = [0xe74c3c,0xf1c40f,0x3498db,0xecf0f1,0x2ecc71,0xe67e22];
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.35, 1.1), new THREE.MeshStandardMaterial({ color: colors[Math.floor(Math.random()*colors.length)] }));
    mesh.castShadow = true;
    this.vehiclesGroup.add(mesh);
    const pa = this.cellToWorld(a.x, a.z); const pb = this.cellToWorld(b.x, b.z);
    pa.y = 0.2; pb.y = 0.2;
    this.vehicles.push({ mesh, path: [pa, pb], t: 0, speed: 0.003 + Math.random()*0.004 });
  }

  updateVehicles(dt: number) {
    for (const v of this.vehicles) {
      v.t += v.speed * dt;
      if (v.t >= 1) {
        const last = v.path[v.path.length - 1];
        const nextRoad = this.roads[Math.floor(Math.random() * this.roads.length)];
        const next = this.cellToWorld(nextRoad.x, nextRoad.z); next.y = 0.2;
        v.path = [last.clone(), next]; v.t = 0;
      }
      const p = new THREE.Vector3().lerpVectors(v.path[0], v.path[1], v.t);
      v.mesh.position.copy(p);
      v.mesh.lookAt(v.path[1]);
    }
  }

  getBuildingMeshes() { return this.buildingMeshes; }
}