import { BUILDING_BY_ID, MISSIONS, TIERS } from './data/buildings';
import type { CityStats, PlacedBuilding } from './types';

export function createInitialStats(): CityStats {
  return {
    money: 5000,
    population: 0,
    capacity: 0,
    jobs: 0,
    happiness: 60,
    powerProduced: 0,
    powerUsed: 0,
    waterProduced: 0,
    waterUsed: 0,
    tier: 0,
    day: 1,
    timeOfDay: 8,
  };
}

export function computeDerived(buildings: PlacedBuilding[], stats: CityStats): { stats: CityStats; occupancy: number; jobs: number } {
  let capacity = 0, jobs = 0, powerProd = 0, powerUse = 0, waterProd = 0, waterUse = 0, happiness = 0, happinessCount = 0, pollution = 0, upkeep = 0;
  let hasSchool = false, hasHospital = false, parks = 0;
  for (const b of buildings) {
    const def = BUILDING_BY_ID[b.defId];
    if (!def) continue;
    capacity += (def.capacity || 0);
    jobs += (def.jobs || 0);
    powerProd += def.powerProd || 0;
    powerUse += def.powerUse || 0;
    waterProd += def.waterProd || 0;
    waterUse += def.waterUse || 0;
    happiness += def.happiness || 0;
    if (def.happiness) happinessCount++;
    pollution += def.pollution || 0;
    upkeep += def.upkeep || 0;
    if (def.id === 'school') hasSchool = true;
    if (def.id === 'hospital') hasHospital = true;
    if (def.category === 'leisure') parks++;
  }
  const powerOk = powerProd >= powerUse;
  const waterOk = waterProd >= waterUse;
  // Small towns have informal/small-business activity: do not require an
  // industrial park before people can live in the first houses.
  const informalJobs = Math.floor(capacity * 0.35);
  const effectiveJobs = jobs + informalJobs;
  const desirability = Math.max(0.05, Math.min(1,
    (happiness - pollution * 0.35) / 90
    + (powerOk ? 0.16 : -0.22)
    + (waterOk ? 0.16 : -0.22)
    + (hasSchool ? 0.05 : 0)
    + (hasHospital ? 0.05 : 0)
  ));
  const targetPop = Math.floor(capacity * (0.35 + desirability * 0.65));
  const growthRate = 3 + Math.floor(stats.population * 0.04);
  const popDelta = Math.sign(targetPop - stats.population) * Math.min(growthRate, Math.abs(targetPop - stats.population));
  const population = Math.max(0, stats.population + popDelta);
  const employmentFactor = effectiveJobs > 0 ? Math.min(1, effectiveJobs / Math.max(1, population)) : 0.35;
  const trafficPenalty = Math.min(15, buildings.filter(b => b.defId === 'road').length * 0.05);
  let happy = 50 + (happiness / Math.max(1, happinessCount || 1)) - pollution * 0.4 + parks * 0.3 + (hasSchool ? 4 : -3) + (hasHospital ? 4 : -2) + (powerOk ? 5 : -15) + (waterOk ? 5 : -15) + employmentFactor * 10 - trafficPenalty;
  happy = Math.max(0, Math.min(100, Math.round(happy)));
  const tier = [...TIERS].reverse().find(t => population >= t.pop)?.tier ?? 0;
  const taxIncome = Math.floor(population * 0.75 + jobs * 0.8 + commercialBonus(buildings));
  const net = taxIncome - Math.floor(upkeep);
  const money = Math.max(-10000, stats.money + net);
  const timeOfDay = (stats.timeOfDay + 0.25) % 24;
  const day = stats.day + (stats.timeOfDay + 0.25 >= 24 ? 1 : 0);
  return {
    stats: { money, population, capacity, jobs: effectiveJobs, happiness: happy, powerProduced: powerProd, powerUsed: powerUse, waterProduced: waterProd, waterUsed: waterUse, tier, day, timeOfDay },
    occupancy: capacity ? population / capacity : 0,
    jobs,
  };
}

function commercialBonus(buildings: PlacedBuilding[]): number {
  let bonus = 0;
  for (const b of buildings) {
    const def = BUILDING_BY_ID[b.defId];
    if (def?.category === 'commercial') bonus += (def.jobs || 0) * 0.5;
  }
  return bonus;
}

export function checkMissions(stats: CityStats, buildings: PlacedBuilding[], completed: string[]): { newlyCompleted: string[]; reward: number } {
  const newlyCompleted: string[] = [];
  let reward = 0;
  for (const m of MISSIONS) {
    if (completed.includes(m.id)) continue;
    if (m.check(stats, buildings)) { newlyCompleted.push(m.id); reward += m.reward; }
  }
  return { newlyCompleted, reward };
}

export function tierName(tier: number): string {
  return TIERS.find(t => t.tier === tier)?.name ?? 'Petit village';
}