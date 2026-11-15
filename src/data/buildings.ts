import type { BuildingDef, Mission } from '../types';

export const BUILDINGS: BuildingDef[] = [
  // Residential
  { id: 'house', name: 'Maison individuelle', category: 'residential', cost: 100, upkeep: 2, width: 1, depth: 1, height: 1, color: 0xf4d35e, roofColor: 0xc0392b, capacity: 4, powerUse: 1, waterUse: 1, happiness: 2, unlockTier: 0, description: 'Logement pour une petite famille.' },
  { id: 'small_apartment', name: 'Petit immeuble', category: 'residential', cost: 350, upkeep: 6, width: 1, depth: 1, height: 2, color: 0xe8d5b7, roofColor: 0x7f8c8d, capacity: 12, powerUse: 3, waterUse: 3, happiness: 1, unlockTier: 1, description: 'Immeuble de quartier.' },
  { id: 'large_apartment', name: 'Grand immeuble', category: 'residential', cost: 900, upkeep: 14, width: 2, depth: 2, height: 4, color: 0xdfe6e9, roofColor: 0x636e72, capacity: 60, powerUse: 10, waterUse: 10, happiness: 0, unlockTier: 2, description: 'Densité résidentielle élevée.' },
  { id: 'modern_residence', name: 'Résidence moderne', category: 'residential', cost: 1400, upkeep: 20, width: 2, depth: 1, height: 4, color: 0xb2bec3, roofColor: 0x0984e3, capacity: 50, powerUse: 12, waterUse: 12, happiness: 3, unlockTier: 3, description: 'Confort et standing.' },
  { id: 'villa', name: 'Villa', category: 'residential', cost: 700, upkeep: 10, width: 2, depth: 2, height: 1.2, color: 0xfff3cd, roofColor: 0xd35400, capacity: 6, powerUse: 4, waterUse: 4, happiness: 6, unlockTier: 2, description: 'Quartier pavillonnaire haut de gamme.' },
  // Commercial
  { id: 'shop', name: 'Boutique', category: 'commercial', cost: 200, upkeep: 4, width: 1, depth: 1, height: 1.2, color: 0x74b9ff, roofColor: 0x0984e3, jobs: 6, powerUse: 2, waterUse: 1, happiness: 2, unlockTier: 0, description: 'Commerce de proximité.' },
  { id: 'restaurant', name: 'Restaurant', category: 'commercial', cost: 300, upkeep: 6, width: 1, depth: 1, height: 1.2, color: 0xff7675, roofColor: 0xd63031, jobs: 8, powerUse: 3, waterUse: 3, happiness: 3, unlockTier: 1, description: 'Lieu de vie et d’emploi.' },
  { id: 'supermarket', name: 'Supermarché', category: 'commercial', cost: 600, upkeep: 10, width: 2, depth: 2, height: 1.4, color: 0x55efc4, roofColor: 0x00b894, jobs: 20, powerUse: 6, waterUse: 3, happiness: 3, unlockTier: 1, description: 'Approvisionnement des habitants.' },
  { id: 'mall', name: 'Centre commercial', category: 'commercial', cost: 1800, upkeep: 25, width: 3, depth: 2, height: 2, color: 0xa29bfe, roofColor: 0x6c5ce7, jobs: 60, powerUse: 18, waterUse: 8, happiness: 6, unlockTier: 3, description: 'Pôle commercial majeur.' },
  { id: 'gas_station', name: 'Station-service', category: 'commercial', cost: 450, upkeep: 8, width: 2, depth: 1, height: 0.8, color: 0xffeaa7, roofColor: 0xfdcb6e, jobs: 5, powerUse: 3, waterUse: 2, happiness: 1, pollution: 2, unlockTier: 2, description: 'Carburant pour la circulation.' },
  // Industrial
  { id: 'factory', name: 'Usine', category: 'industrial', cost: 800, upkeep: 18, width: 2, depth: 2, height: 2, color: 0xb2bec3, roofColor: 0x636e72, jobs: 40, powerUse: 15, waterUse: 8, happiness: -4, pollution: 12, unlockTier: 1, description: 'Production industrielle et emplois.' },
  { id: 'warehouse', name: 'Entrepôt', category: 'industrial', cost: 500, upkeep: 8, width: 2, depth: 2, height: 1.5, color: 0xdfe6e9, roofColor: 0x95a5a6, jobs: 15, powerUse: 5, waterUse: 2, happiness: -1, pollution: 3, unlockTier: 1, description: 'Logistique et stockage.' },
  { id: 'power_plant', name: 'Centrale électrique', category: 'industrial', cost: 1200, upkeep: 30, width: 2, depth: 2, height: 2.5, color: 0xfab1a0, roofColor: 0xe17055, jobs: 25, powerProd: 120, waterUse: 10, happiness: -6, pollution: 18, unlockTier: 0, description: 'Produit de l’électricité pour la ville.' },
  { id: 'industry_zone', name: 'Zone industrielle', category: 'industrial', cost: 1500, upkeep: 22, width: 3, depth: 2, height: 2, color: 0x95a5a6, roofColor: 0x2d3436, jobs: 80, powerUse: 20, waterUse: 10, happiness: -5, pollution: 15, unlockTier: 3, description: 'Pôle d’emplois industriel.' },
  // Services
  { id: 'school', name: 'École', category: 'services', cost: 500, upkeep: 12, width: 2, depth: 1, height: 1.5, color: 0xffeaa7, roofColor: 0xe67e22, jobs: 12, powerUse: 4, waterUse: 3, happiness: 6, unlockTier: 0, description: 'Éducation des enfants.' },
  { id: 'hospital', name: 'Hôpital', category: 'services', cost: 900, upkeep: 25, width: 2, depth: 2, height: 2.2, color: 0xffffff, roofColor: 0xe74c3c, jobs: 30, powerUse: 10, waterUse: 8, happiness: 10, unlockTier: 1, description: 'Soins et santé publique.' },
  { id: 'fire_station', name: 'Caserne de pompiers', category: 'services', cost: 450, upkeep: 14, width: 2, depth: 1, height: 1.4, color: 0xff7675, roofColor: 0xc0392b, jobs: 10, powerUse: 4, waterUse: 3, happiness: 5, unlockTier: 1, description: 'Protection contre les incendies.' },
  { id: 'police_station', name: 'Commissariat', category: 'services', cost: 450, upkeep: 14, width: 1, depth: 2, height: 1.6, color: 0x74b9ff, roofColor: 0x2d3436, jobs: 10, powerUse: 4, waterUse: 2, happiness: 5, unlockTier: 2, description: 'Sécurité des quartiers.' },
  { id: 'town_hall', name: 'Mairie', category: 'services', cost: 700, upkeep: 16, width: 2, depth: 2, height: 2, color: 0xf9e79f, roofColor: 0x7d6608, jobs: 15, powerUse: 5, waterUse: 3, happiness: 4, unlockTier: 2, description: 'Administration de la ville.' },
  { id: 'water_tower', name: 'Château d’eau', category: 'services', cost: 600, upkeep: 12, width: 1, depth: 1, height: 3, color: 0x81ecec, roofColor: 0x00cec9, jobs: 3, powerUse: 6, waterProd: 100, unlockTier: 0, description: 'Alimente la ville en eau.' },
  // Leisure
  { id: 'park', name: 'Parc', category: 'leisure', cost: 150, upkeep: 5, width: 2, depth: 2, height: 0.3, color: 0x55efc4, roofColor: 0x00b894, powerUse: 1, waterUse: 2, happiness: 8, pollution: -4, unlockTier: 0, description: 'Espace vert apprécié des habitants.' },
  { id: 'green_space', name: 'Espace vert', category: 'leisure', cost: 80, upkeep: 2, width: 1, depth: 1, height: 0.2, color: 0x00b894, roofColor: 0x00b894, waterUse: 1, happiness: 3, pollution: -2, unlockTier: 0, description: 'Arbres et pelouses.' },
  { id: 'stadium', name: 'Stade', category: 'leisure', cost: 2200, upkeep: 40, width: 3, depth: 3, height: 1.8, color: 0xdfe6e9, roofColor: 0x0984e3, jobs: 30, powerUse: 20, waterUse: 12, happiness: 14, unlockTier: 4, description: 'Grands événements sportifs.' },
  { id: 'cinema', name: 'Cinéma', category: 'leisure', cost: 700, upkeep: 12, width: 2, depth: 1, height: 1.6, color: 0x6c5ce7, roofColor: 0x2d3436, jobs: 10, powerUse: 8, waterUse: 3, happiness: 7, unlockTier: 2, description: 'Divertissement culturel.' },
  { id: 'sports_center', name: 'Centre sportif', category: 'leisure', cost: 900, upkeep: 18, width: 2, depth: 2, height: 1.5, color: 0x00cec9, roofColor: 0x0984e3, jobs: 12, powerUse: 10, waterUse: 6, happiness: 9, unlockTier: 3, description: 'Santé et loisirs.' },
  // Infrastructure
  { id: 'road', name: 'Route', category: 'infrastructure', cost: 20, upkeep: 1, width: 1, depth: 1, height: 0.05, color: 0x636e72, roofColor: 0x636e72, unlockTier: 0, description: 'Permet la circulation et dessert les bâtiments.' },
  { id: 'bridge', name: 'Pont', category: 'infrastructure', cost: 120, upkeep: 3, width: 1, depth: 1, height: 0.3, color: 0xb2bec3, roofColor: 0xb2bec3, unlockTier: 2, description: 'Franchissement décoratif (route surélevée).' },
  { id: 'sidewalk', name: 'Trottoir', category: 'infrastructure', cost: 10, upkeep: 0, width: 1, depth: 1, height: 0.04, color: 0xdfe6e9, roofColor: 0xdfe6e9, happiness: 1, unlockTier: 1, description: 'Améliore le cadre urbain.' },
  { id: 'power_line', name: 'Réseau électrique', category: 'infrastructure', cost: 30, upkeep: 1, width: 1, depth: 1, height: 0.8, color: 0xf1c40f, roofColor: 0xf39c12, unlockTier: 0, description: 'Étend la couverture électrique.' },
  { id: 'pipe', name: 'Canalisation', category: 'infrastructure', cost: 25, upkeep: 1, width: 1, depth: 1, height: 0.08, color: 0x0984e3, roofColor: 0x0984e3, unlockTier: 0, description: 'Étend la couverture en eau.' },
];

export const BUILDING_BY_ID = Object.fromEntries(BUILDINGS.map(b => [b.id, b])) as Record<string, BuildingDef>;

export const TIERS = [
  { tier: 0, name: 'Petit village', pop: 0 },
  { tier: 1, name: 'Bourg', pop: 60 },
  { tier: 2, name: 'Petite ville', pop: 300 },
  { tier: 3, name: 'Grande ville', pop: 1200 },
  { tier: 4, name: 'Métropole', pop: 4000 },
  { tier: 5, name: 'Mégapole', pop: 10000 },
];

export const MISSIONS: Mission[] = [
  { id: 'pop500', title: 'Village en croissance', description: 'Atteindre 500 habitants.', reward: 2000, check: s => s.population >= 500 },
  { id: 'school', title: 'Éducation pour tous', description: 'Construire une école.', reward: 500, check: (_, b) => b.some(x => x.defId === 'school') },
  { id: 'happy80', title: 'Ville heureuse', description: 'Atteindre 80 % de satisfaction (100 habitants min.).', reward: 1500, check: s => s.population >= 100 && s.happiness >= 80 },
  { id: 'mall', title: 'Cœur commerçant', description: 'Construire un centre commercial.', reward: 1200, check: (_, b) => b.some(x => x.defId === 'mall') },
  { id: 'power', title: 'Ville alimentée', description: 'Produire suffisamment d’électricité.', reward: 800, check: s => s.powerProduced >= s.powerUsed && s.powerProduced > 0 },
  { id: 'bus', title: 'Mobilité urbaine', description: 'Construire 20 routes pour structurer le réseau.', reward: 1000, check: (_, b) => b.filter(x => x.defId === 'road' || x.defId === 'bridge').length >= 20 },
];
