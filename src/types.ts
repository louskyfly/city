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
  happiness: number;
  powerProduced: number;
  powerUsed: number;
  waterProduced: number;
  waterUsed: number;
  tier: number;
  day: number;
  timeOfDay: number; // 0..24
}

export interface SaveData {
  version: number;
  timestamp: number;
  mapId: string;
  buildings: PlacedBuilding[];
  roads: { x: number; z: number }[];
  stats: CityStats;
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
