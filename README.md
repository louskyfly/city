# City Builder — Build Your City

Un jeu de construction et de gestion de ville isométrique, en 3D temps réel avec **Three.js**, pensé pour le **tactile (iPad)** et le bureau.

> Construisez votre ville, gérez son économie, ses habitants, l'énergie, l'eau et le bonheur, et faites-la évoluer du petit village à la mégapole.

## Lancer le projet

```bash
npm install
npm run dev
```

Build de production :

```bash
npm run build
npm run preview
```

Le projet est déployable sur GitHub Pages. La base Vite est configurée sur `/city/`
(`vite.config.ts`) et le workflow `.github/workflows/deploy.yml` publie `dist/`
via GitHub Actions.

## Fonctionnalités

### Rendu 3D
- Scène 3D isométrique **orthographique** (vue fixe, pas de rotation libre).
- Terrain plat constructible, décor naturel (arbres, fleurs, rochers), plans d'eau
  et forêt en périphérie.
- Ombres portées, éclairage dynamique, cycle jour/nuit, fenêtres éclairées la nuit.
- Météo (pluie) activable.
- Bâtiments procéduraux différenciés : maisons à toit en pente, immeubles à
  façades vitrées, château d'eau, centrale électrique, stade, parc, station-service…

### Contrôles
- **Souris** : glisser pour déplacer la vue, molette pour zoomer, clic pour
  sélectionner/placer.
- **Tactile** : un doigt pour déplacer/toucher, deux doigts pour zoomer et
  déplacer la vue. La vue reste isométrique.
- **Pause** : bouton Pause ou `Espace`, avec écran de pause et reprise.
- Raccourcis : `Échap` annule l'outil en cours, `Espace` met en pause, `R`
  recentre la caméra.

### Construction
- Grille de 64 × 64 cases.
- Catalogue : résidentiel, commercial, industriel, services, loisirs,
  infrastructures, avec **déblocage par palier**.
- **Grands bâtiments** : résidence de luxe, gratte-ciel résidentiel, tour de
  bureaux, hôtel, gare, université, parc d'attractions, parc central, centre
  commercial et stade.
- Placement avec aperçu et validation de l'emplacement.
- **Démolition avec remboursement partiel** (30 % de la valeur, selon le niveau).
- Routes posables en continu (glisser), trottoirs et marquages.
- Arrêts de bus uniquement au bord d'une route, pour former de vraies lignes.
- Sélection d'un bâtiment : rayon de service affiché, fiche détaillée,
  **amélioration jusqu'au niveau 5** (le bâtiment grandit), **déplacement**,
  **suppression**, recentrage.

### Gestion de la ville
- Onglet **Gestion** : taux d'imposition réglable, politiques publiques
  (ville verte, transport public, recyclage), qualité de vie, budget par tick,
  courbe de population et sauvegardes manuelles.
- Couverture des services (écoles, santé, loisirs, sécurité, bus) calculée par
  rayon autour des bâtiments et visible sur la carte.
- Pollution et bruit générés par l'industrie et les commerces, réduits par les
  parcs et les politiques.
- Missions étendues (population, services, transports, skyline, air pur…).

### Simulation
- Économie : budget, coûts de construction, entretien, revenus, faillite possible.
- Population progressive selon les logements, l'emploi, les services et les
  utilités.
- Électricité et eau : production, consommation, déficits.
- Bonheur : services publics, espaces verts, pollution, chômage, circulation.
- Statistiques en direct dans le HUD et le résumé de ville.

### Progression
- Paliers : Petit village → Bourg → Petite ville → Grande ville → Métropole →
  Mégapole.
- Missions avec récompenses (population, école, bonheur, centre commercial,
  électricité, réseau routier).

### Monde vivant
- Véhicules variés (voitures, camions, bus, véhicules de service) en circulation,
  avec voies décalées pour éviter les chevauchements.
- **Lignes de bus** : les arrêts de bus, placés le long des routes, créent un
  réseau parcouru par des bus (recherche de chemin sur le réseau routier).
  La ligne peut être affichée sur la carte depuis l'onglet Gestion.
- Feux de circulation animés aux intersections.
- Indice de **circulation** calculé selon la population et le réseau routier.
- Brouillard, pluie et météo changeant au fil des jours.

### Sauvegardes
- Sauvegarde automatique toutes les 25 secondes.
- **3 emplacements manuels** (Slot 1/2/3) depuis l'onglet Gestion.
- Chargement, suppression, reprise de la dernière ville.
- Données stockées localement (`localStorage`), avec récupération défensive en
  cas de sauvegarde invalide.

### iPad / PWA
- Interface adaptative paysage et portrait, zones de sécurité (`safe-area`).
- Boutons larges et zones tactiles confortables.
- Manifest PWA + service worker pour l'installation sur l'écran d'accueil.
- Rendu optimisé : ombres, pixel ratio limité, flore en `InstancedMesh`,
  véhicules limités, façades fusionnées par texture.

## Cartes disponibles

- **Plaine verdoyante** — terrain équilibré et dégagé.
- **Collines** — reliefs et rochers en périphérie.
- **Rivière & lac** — plans d'eau et espaces naturels.
- **Forêt** — couvert végétal dense autour de la zone constructible.

## Architecture

```
src/
  main.ts             bootstrap + PWA
  game.ts             orchestration (boucle, caméra, entrées, construction, sauvegardes)
  world.ts            scène 3D, terrain, flore instanciée, bâtiments, routes, véhicules, météo
  simulation.ts       économie, population, utilités, bonheur, paliers, missions
  ui.ts               menus, HUD, catalogue, panneaux, contrôles
  save/SaveManager.ts persistance localStorage
  data/buildings.ts   définitions des bâtiments, paliers, missions
  types.ts            modèles de données
  style.css           interface responsive
public/
  icon.svg            icône PWA
  manifest.webmanifest
  sw.js               service worker
```

## Notes

- Aucun asset 3D externe : tous les modèles sont générés procéduralement.
- Les données de jeu restent dans le navigateur ; aucun serveur n'est requis.
- Le projet est conçu pour rester jouable sur iPad en paysage.
