export type BuildingCategory = 'residential' | 'commercial' | 'industrial' | 'services' | 'leisure' | 'infrastructure';

export interface BuildingDef {
  id: string;
  name: string;
  category: BuildingCategory;
  cost: number;
  upkeep: number;
  width: number;
  depth: number;
  height: number;
  color: number;
  roofColor: number;
  capacity?: number;
  jobs?: number;
  powerUse?: number;
  powerProd?: number;
  waterUse?: number;
  waterProd?: number;
  happiness?: number;
  pollution?: number;
  noise?: number;
  serviceRadius?: number;
  maxLevel?: number;
  unlockTier: number;
  description: string;
}

export interface PlacedBuilding {
  uid: string;
  defId: string;
  x: number;
  z: number;
  rotation: number;
  level: number;
  powered: boolean;
  watered: boolean;
}

export interface CityStats {
  money: number;
  population: number;
  capacity: number;
  jobs: number;
  happiness: number;
  powerProduced: number;
  powerUsed: number;
  waterProduced: number;
  waterUsed: number;
  pollution: number;
  noise: number;
  schoolCoverage: number;
  healthCoverage: number;
  leisureCoverage: number;
  safetyCoverage: number;
  busCoverage: number;
  taxRate: number;
  income: number;
  expenses: number;
  tier: number;
  day: number;
  timeOfDay: number; // 0..24
}

export interface Policies {
  green: boolean;
  transport: boolean;
  recycling: boolean;
}

export interface StatsPoint {
  day: number;
  population: number;
  money: number;
  happiness: number;
}

export interface SaveData {
  version: number;
  timestamp: number;
  mapId: string;
  buildings: PlacedBuilding[];
  roads: { x: number; z: number }[];
  stats: CityStats;
  policies: Policies;
  statsHistory: StatsPoint[];
  unlockedMissions: string[];
  completedMissions: string[];
}

export interface Mission {
  id: string;
  title: string;
  description: string;
  reward: number;
  check: (stats: CityStats, buildings: PlacedBuilding[]) => boolean;
}
