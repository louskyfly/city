import { BUILDING_BY_ID, MISSIONS, TIERS } from './data/buildings';
import type { CityStats, PlacedBuilding, Policies } from './types';

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
    pollution: 0,
    noise: 0,
    traffic: 0,
    schoolCoverage: 0,
    healthCoverage: 0,
    leisureCoverage: 0,
    safetyCoverage: 0,
    busCoverage: 0,
    taxRate: 9,
    income: 0,
    expenses: 0,
    tier: 0,
    day: 1,
    timeOfDay: 8,
  };
}

export function createDefaultPolicies(): Policies {
  return { green: false, transport: false, recycling: false };
}

interface Coverage {
  school: number; health: number; leisure: number; safety: number; bus: number;
}

function buildingCenter(b: PlacedBuilding) {
  const def = BUILDING_BY_ID[b.defId];
  return { x: b.x + ((def?.width ?? 1) - 1) / 2, z: b.z + ((def?.depth ?? 1) - 1) / 2 };
}

function distance(a: { x: number; z: number }, b: { x: number; z: number }) {
  const dx = a.x - b.x, dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

function computeCoverage(buildings: PlacedBuilding[]): Coverage {
  const homes = buildings.filter(b => {
    const def = BUILDING_BY_ID[b.defId];
    return def?.category === 'residential' && (def.capacity ?? 0) > 0;
  });
  if (homes.length === 0) return { school: 0, health: 0, leisure: 0, safety: 0, bus: 0 };

  const serviceProviders = buildings.filter(b => (BUILDING_BY_ID[b.defId]?.serviceRadius ?? 0) > 0);
  if (serviceProviders.length === 0) return { school: 0, health: 0, leisure: 0, safety: 0, bus: 0 };

  const covered = { school: 0, health: 0, leisure: 0, safety: 0, bus: 0 };
  for (const home of homes) {
    const hc = buildingCenter(home);
    let school = false, health = false, leisure = false, safety = false, bus = false;
    for (const provider of serviceProviders) {
      const def = BUILDING_BY_ID[provider.defId];
      if (!def?.serviceRadius) continue;
      if (distance(hc, buildingCenter(provider)) > def.serviceRadius) continue;
      if (def.id === 'school' || def.id === 'university') school = true;
      else if (def.id === 'hospital') health = true;
      else if (def.id === 'bus_stop') bus = true;
      else if (def.id === 'fire_station' || def.id === 'police_station' || def.id === 'town_hall') safety = true;
      else if (def.category === 'leisure') leisure = true;
    }
    if (school) covered.school++;
    if (health) covered.health++;
    if (leisure) covered.leisure++;
    if (safety) covered.safety++;
    if (bus) covered.bus++;
  }
  const pct = (n: number) => Math.round((n / homes.length) * 100);
  return { school: pct(covered.school), health: pct(covered.health), leisure: pct(covered.leisure), safety: pct(covered.safety), bus: pct(covered.bus) };
}

export function computeDerived(
  buildings: PlacedBuilding[],
  stats: CityStats,
  policies: Policies = createDefaultPolicies()
): { stats: CityStats; occupancy: number; jobs: number; coverage: Coverage } {
  let capacity = 0, jobs = 0, powerProd = 0, powerUse = 0, waterProd = 0, waterUse = 0;
  let happiness = 0, happinessCount = 0, pollution = 0, noise = 0, upkeep = 0;
  let hasSchool = false, hasHospital = false, parks = 0;
  let commercialCount = 0;

  for (const b of buildings) {
    const def = BUILDING_BY_ID[b.defId];
    if (!def) continue;
    const lvl = b.level || 1;
    capacity += (def.capacity || 0) * lvl;
    jobs += (def.jobs || 0) * lvl;
    powerProd += (def.powerProd || 0) * lvl;
    powerUse += (def.powerUse || 0) * lvl;
    waterProd += (def.waterProd || 0) * lvl;
    waterUse += (def.waterUse || 0) * lvl;
    happiness += (def.happiness || 0) * lvl;
    if (def.happiness) happinessCount++;
    pollution += (def.pollution || 0) * lvl;
    noise += (def.noise || 0) * lvl;
    upkeep += (def.upkeep || 0) * lvl;
    if (def.id === 'school' || def.id === 'university') hasSchool = true;
    if (def.id === 'hospital') hasHospital = true;
    if (def.category === 'leisure') parks++;
    if (def.category === 'commercial') commercialCount++;
  }

  const coverage = computeCoverage(buildings);
  const powerOk = powerProd >= powerUse;
  const waterOk = waterProd >= waterUse;

  const informalJobs = Math.floor(capacity * 0.35);
  const effectiveJobs = jobs + informalJobs;
  const taxRate = Math.max(0, Math.min(25, stats.taxRate ?? 9));

  // Pollution and noise are normalised to 0..100 for readability.
  let pollutionIndex = Math.max(0, pollution) * 2.4;
  if (policies.recycling) pollutionIndex *= 0.72;
  if (policies.green) pollutionIndex *= 0.8;
  pollutionIndex = Math.min(100, Math.round(pollutionIndex));
  const noiseIndex = Math.min(100, Math.round(Math.max(0, noise) * 1.5));

  const coverageAvg = (coverage.school + coverage.health + coverage.leisure + coverage.safety + coverage.bus) / 5;
  const taxPenalty = Math.max(0, taxRate - 11) * 0.9;
  const policyHappiness = (policies.green ? 4 : 0) + (policies.transport ? 4 : 0) + (policies.recycling ? 1 : 0);

  const desirability = Math.max(0.03, Math.min(1,
    0.28
    + coverageAvg * 0.0045
    + (powerOk ? 0.14 : -0.25)
    + (waterOk ? 0.14 : -0.25)
    + (hasSchool ? 0.03 : 0)
    + (hasHospital ? 0.03 : 0)
    - pollutionIndex * 0.005
    - noiseIndex * 0.003
    - Math.max(0, taxRate - 12) * 0.025
  ));

  const targetPop = Math.floor(capacity * (0.3 + desirability * 0.7));
  const growthRate = 3 + Math.floor(stats.population * 0.04);
  const popDelta = Math.sign(targetPop - stats.population) * Math.min(growthRate, Math.abs(targetPop - stats.population));
  const population = Math.max(0, stats.population + popDelta);
  const employmentFactor = effectiveJobs > 0 ? Math.min(1, effectiveJobs / Math.max(1, population)) : 0.35;

  const roadCount = buildings.filter(b => b.defId === 'road' || b.defId === 'bridge').length;
  const transportDiscount = policies.transport ? 0.65 : 1;
  const traffic = Math.min(100, Math.round(((population * 1.6) / Math.max(1, roadCount * 12)) * 10 * transportDiscount));
  const trafficPenalty = traffic * 0.12;

  let happy = 55
    + coverage.school * 0.12
    + coverage.health * 0.12
    + coverage.leisure * 0.08
    + coverage.safety * 0.06
    + coverage.bus * 0.04
    + parks * 0.25
    + policyHappiness
    + (powerOk ? 5 : -16)
    + (waterOk ? 5 : -16)
    + employmentFactor * 8
    - pollutionIndex * 0.18
    - noiseIndex * 0.12
    - taxPenalty
    - trafficPenalty;

  // Baseline bonus from the aggregated building happiness traits.
  if (happinessCount > 0) happy += happiness / happinessCount * 0.6;
  happy = Math.max(0, Math.min(100, Math.round(happy)));

  const tier = [...TIERS].reverse().find(t => population >= t.pop)?.tier ?? 0;

  // Budget: taxes on residents and businesses, municipal running costs.
  const taxMultiplier = 0.42 + taxRate * 0.058;
  const commercialBonus = commercialCount * 6;
  const income = Math.floor(population * taxMultiplier + jobs * 0.55 + commercialBonus);
  let policyCost = 0;
  if (policies.green) policyCost += 25 + Math.floor(upkeep * 0.05);
  if (policies.recycling) policyCost += 15 + Math.floor(upkeep * 0.03);
  if (policies.transport) policyCost += 20 + Math.floor(population * 0.03);
  const expenses = Math.floor(upkeep + policyCost);
  const net = income - expenses;
  const money = Math.max(-50000, stats.money + net);

  const timeOfDay = (stats.timeOfDay + 0.25) % 24;
  const day = stats.day + (stats.timeOfDay + 0.25 >= 24 ? 1 : 0);

  return {
    stats: {
      money, population, capacity, jobs: effectiveJobs, happiness: happy,
      powerProduced: powerProd, powerUsed: powerUse, waterProduced: waterProd, waterUsed: waterUse,
      pollution: pollutionIndex, noise: noiseIndex, traffic,
      schoolCoverage: coverage.school, healthCoverage: coverage.health,
      leisureCoverage: coverage.leisure, safetyCoverage: coverage.safety,
      busCoverage: coverage.bus, taxRate, income, expenses,
      tier, day, timeOfDay,
    },
    occupancy: capacity ? population / capacity : 0,
    jobs,
    coverage,
  };
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
