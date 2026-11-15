import { BUILDINGS, MISSIONS, TIERS } from './data/buildings';
import type { BuildingCategory, CityStats } from './types';
import { tierName } from './simulation';

export type Screen = 'menu' | 'game' | 'load' | 'settings' | 'newmap';

export const MAPS = [
  { id: 'plaine', name: 'Plaine verdoyante', desc: 'Terrain équilibré et dégagé, idéal pour apprendre et bâtir librement.' },
  { id: 'collines', name: 'Collines', desc: 'Reliefs et rochers en périphérie, grande zone constructible au centre.' },
  { id: 'riviere', name: 'Rivière & lac', desc: 'Plan d’eau et espaces naturels, pour une ville au bord de l’eau.' },
  { id: 'foret', name: 'Forêt', desc: 'Dense couvert végétal, ambiance nature et parcs à proximité.' },
];

export class UI {
  root: HTMLElement;
  onAction: (action: string, payload?: any) => void = () => {};
  selectedDefId: string | null = null;
  activeCategory: BuildingCategory = 'residential';
  tool: 'select' | 'build' | 'bulldoze' | 'move' = 'select';
  screen: Screen = 'menu';
  toastTimer?: number;
  private lastTier = 0;
  private lastCompleted: string[] = [];

  constructor(root: HTMLElement) { this.root = root; }

  // ------------------------------------------------------------------ menus

  renderMenu(hasAuto: boolean) {
    this.screen = 'menu';
    this.root.innerHTML = `
      <div class="overlay"><div class="menu-card">
        <h1>City <span class="accent">Builder</span></h1>
        <p>Un jeu de construction et de gestion de ville isométrique. Bâtissez quartier par quartier, gérez budget, population, énergie, eau et bonheur jusqu’à la mégapole.</p>
        <div class="menu-grid">
          <div class="list-item feat"><div class="ic">🏗️</div><div><h2>Construire</h2><p class="small">Résidentiel, commerces, industrie, services, loisirs et infrastructures sur une grille isométrique.</p></div></div>
          <div class="list-item feat"><div class="ic">📊</div><div><h2>Gérer</h2><p class="small">Économie, population, électricité, eau, bonheur, missions et paliers de progression.</p></div></div>
          <div class="list-item feat"><div class="ic">🚗</div><div><h2>Faire vivre</h2><p class="small">Routes, véhicules, feux de circulation, cycle jour/nuit et météo.</p></div></div>
        </div>
        <div class="menu-actions">
          <button class="btn primary" data-action="new-screen">Nouvelle partie</button>
          <button class="btn" data-action="demo">Ville d’exemple</button>
          <button class="btn" data-action="continue" ${hasAuto ? '' : 'disabled'}>Continuer</button>
          <button class="btn" data-action="load-screen">Charger une ville</button>
          <button class="btn" data-action="settings">Paramètres</button>
        </div>
      </div></div>`;
    this.bindMenu();
  }

  renderNewMap() {
    this.screen = 'newmap';
    this.root.innerHTML = `<div class="overlay"><div class="menu-card">
      <h2>Choisir une carte</h2>
      <p>Chaque carte propose un environnement différent. La zone constructible centrale est toujours plate et prête à accueillir votre ville.</p>
      <div class="menu-grid">${MAPS.map(m => `
        <div class="list-item">
          <h2>${m.name}</h2>
          <p class="small">${m.desc}</p>
          <div class="menu-actions"><button class="btn primary" data-action="new" data-map="${m.id}">Commencer</button></div>
        </div>`).join('')}</div>
      <div class="menu-actions"><button class="btn" data-action="menu">Retour</button></div>
    </div></div>`;
    this.bindMenu();
  }

  renderLoad(slots: { slot: string; timestamp: number; population: number; money: number }[]) {
    this.screen = 'load';
    this.root.innerHTML = `<div class="overlay"><div class="menu-card">
      <h2>Charger une ville</h2>
      <div class="list">${slots.length ? slots.map(s => `
        <div class="list-item">
          <strong>${s.slot === 'auto' ? 'Sauvegarde automatique' : s.slot}</strong>
          <div class="small">${new Date(s.timestamp).toLocaleString('fr-FR')} · ${s.population} hab. · ${Math.round(s.money)} €</div>
          <div class="menu-actions">
            <button class="btn primary" data-action="load-slot" data-slot="${s.slot}">Charger</button>
            ${s.slot !== 'auto' ? `<button class="btn" data-action="delete-slot" data-slot="${s.slot}">Supprimer</button>` : ''}
          </div>
        </div>`).join('') : '<p class="small">Aucune sauvegarde trouvée.</p>'}</div>
      <div class="menu-actions"><button class="btn" data-action="menu">Retour</button></div>
    </div></div>`;
    this.bindMenu();
  }

  renderSettings() {
    this.screen = 'settings';
    this.root.innerHTML = `<div class="overlay"><div class="menu-card">
      <h2>Paramètres</h2>
      <div class="list">
        <div class="list-item"><h2>Contrôles (souris)</h2><p class="small">Glisser : déplacer la vue. Molette : zoom. Clic : sélectionner/placer. Clic droit : aucun effet (vue verrouillée en isométrique).</p></div>
        <div class="list-item"><h2>Contrôles (tactile)</h2><p class="small">Un doigt : déplacer la vue / toucher pour agir. Deux doigts : zoom par pincement et déplacement. La rotation n’est pas nécessaire : la vue reste isométrique.</p></div>
        <div class="list-item"><h2>Construction</h2><p class="small">Sélection, Déplacer, Supprimer. Maintenez le doigt/le clic sur la carte avec une route ou une démolition pour agir en continu. Échap annule l’outil.</p></div>
        <div class="list-item"><h2>Sauvegarde</h2><p class="small">Sauvegarde automatique toutes les 25 secondes + emplacement manuel. Les villes restent stockées dans le navigateur.</p></div>
      </div>
      <div class="menu-actions"><button class="btn" data-action="menu">Retour</button></div>
    </div></div>`;
    this.bindMenu();
  }

  private bindMenu() {
    this.root.querySelectorAll('[data-action]').forEach(el => el.addEventListener('click', () => {
      const e = el as HTMLElement;
      this.onAction(e.dataset.action!, { slot: e.dataset.slot, mapId: e.dataset.map });
    }));
  }

  // ------------------------------------------------------------------- game

  renderGame(stats: CityStats, completedMissions: string[]) {
    this.screen = 'game';
    this.lastTier = stats.tier;
    this.lastCompleted = completedMissions;
    this.root.innerHTML = `
      <div class="game-root">
        <div id="scene-host"></div>
        <div class="hud-top" id="hud"></div>
        <div class="sidebar">
          <div class="sidebar-header">
            <div><h3>Construction</h3><span class="tier" id="tier-label">${tierName(stats.tier)}</span></div>
            <div class="header-actions">
              <button class="icon-btn" id="recenter-btn" title="Recentrer">⌖</button>
              <button class="icon-btn" id="weather-btn" title="Météo">☔</button>
              <button class="icon-btn" id="save-btn" title="Sauvegarder">💾</button>
              <button class="icon-btn" id="menu-btn" title="Menu">☰</button>
            </div>
          </div>
          <div class="tabs" id="tabs"></div>
          <div class="catalog" id="catalog"></div>
          <div class="catalog" id="missions" style="display:none"></div>
          <div class="sidebar-footer" id="city-summary"></div>
        </div>
        <div class="info-panel" id="info-panel">
          <h4>Bienvenue dans votre ville</h4>
          <p>Pour démarrer : construisez une <b>centrale électrique</b> et un <b>château d’eau</b>, puis des maisons et des routes.</p>
          <p class="small">Choisissez un bâtiment à droite, touchez la carte pour le placer. Glissez pour déplacer la vue, pincez pour zoomer.</p>
        </div>
        <div class="bottom-bar">
          <button class="btn" data-tool="select">Sélection</button>
          <button class="btn" data-tool="move">Déplacer</button>
          <button class="btn" data-tool="bulldoze">Supprimer</button>
          <div class="spacer"></div>
          <button class="btn" data-speed="0">Pause</button>
          <button class="btn active" data-speed="1">×1</button>
          <button class="btn" data-speed="2">×2</button>
          <button class="btn" data-speed="3">×3</button>
        </div>
      </div>`;
    this.renderTabs();
    this.renderCatalog(stats.tier);
    this.updateHUD(stats, completedMissions);
    this.updateSummary(stats);
    this.bindGameControls();
  }

  updateSummary(stats: CityStats) {
    const root = this.root.querySelector('#city-summary');
    if (!root) return;
    const netPower = stats.powerProduced - stats.powerUsed;
    const netWater = stats.waterProduced - stats.waterUsed;
    const chip = (label: string, value: string, tone = '') => `<div class="sum-chip ${tone}"><span>${label}</span><b>${value}</b></div>`;
    root.innerHTML = [
      chip('Logements', `${stats.population}/${stats.capacity}`),
      chip('Emplois', `${stats.jobs ?? 0}`),
      chip('Électricité', netPower >= 0 ? 'OK' : `−${-netPower}`, netPower >= 0 ? 'good' : 'bad'),
      chip('Eau', netWater >= 0 ? 'OK' : `−${-netWater}`, netWater >= 0 ? 'good' : 'bad'),
    ].join('');
  }

  getSceneHost(): HTMLElement { return this.root.querySelector('#scene-host') as HTMLElement; }

  setSpeedButtons(speed: number) {
    this.root.querySelectorAll('[data-speed]').forEach(el => {
      (el as HTMLElement).classList.toggle('active', Number((el as HTMLElement).dataset.speed) === speed);
    });
  }

  renderTabs() {
    const cats: { id: BuildingCategory; label: string }[] = [
      { id: 'residential', label: 'Résidentiel' },
      { id: 'commercial', label: 'Commercial' },
      { id: 'industrial', label: 'Industriel' },
      { id: 'services', label: 'Services' },
      { id: 'leisure', label: 'Loisirs' },
      { id: 'infrastructure', label: 'Infra.' },
    ];
    const tabs = this.root.querySelector('#tabs');
    if (!tabs) return;
    const missionsVisible = (this.root.querySelector('#missions') as HTMLElement | null)?.style.display === 'grid';
    tabs.innerHTML = cats.map(c => `<button class="tab ${!missionsVisible && c.id === this.activeCategory ? 'active' : ''}" data-cat="${c.id}">${c.label}</button>`).join('')
      + `<button class="tab ${missionsVisible ? 'active' : ''}" data-cat="missions">Missions</button>`;
    tabs.querySelectorAll('.tab').forEach(el => el.addEventListener('click', () => {
      const cat = (el as HTMLElement).dataset.cat!;
      const catalog = this.root.querySelector('#catalog') as HTMLElement | null;
      const missions = this.root.querySelector('#missions') as HTMLElement | null;
      if (!catalog || !missions) return;
      if (cat === 'missions') {
        catalog.style.display = 'none';
        missions.style.display = 'grid';
        this.renderMissions(this.lastCompleted);
      } else {
        this.activeCategory = cat as BuildingCategory;
        catalog.style.display = 'grid';
        missions.style.display = 'none';
        this.renderCatalog(this.lastTier);
      }
      this.renderTabs();
    }));
  }

  renderCatalog(tier: number) {
    this.lastTier = tier;
    const el = this.root.querySelector('#catalog');
    if (!el) return;
    const items = BUILDINGS.filter(b => b.category === this.activeCategory);
    el.innerHTML = items.map(b => {
      const locked = b.unlockTier > tier;
      return `<button class="build-card ${this.selectedDefId === b.id ? 'selected' : ''} ${locked ? 'locked' : ''}" data-def="${b.id}" ${locked ? 'disabled' : ''}>
        <div class="name"><span>${b.name}</span><span class="cost">${b.cost} €</span></div>
        <div class="meta">Entretien ${b.upkeep} €/tick · ${b.width}×${b.depth}</div>
        <div class="meta desc">${locked ? `Débloqué au palier : ${TIERS.find(t => t.tier === b.unlockTier)?.name || '—'}` : b.description}</div>
      </button>`;
    }).join('');
    el.querySelectorAll('[data-def]').forEach(btn => btn.addEventListener('click', () => {
      const id = (btn as HTMLElement).dataset.def!;
      this.selectedDefId = id;
      this.tool = 'build';
      this.onAction('select-def', { defId: id });
      this.renderCatalog(tier);
      this.syncToolButtons();
    }));
  }

  renderMissions(completed: string[] = []) {
    this.lastCompleted = completed;
    const el = this.root.querySelector('#missions');
    if (!el) return;
    el.innerHTML = MISSIONS.map(m => `
      <div class="build-card ${completed.includes(m.id) ? 'selected' : ''}">
        <div class="name">${completed.includes(m.id) ? '✅ ' : ''}${m.title}</div>
        <div class="meta">${m.description}</div>
        <div class="meta">Récompense : ${m.reward} €</div>
      </div>`).join('');
  }

  updateHUD(stats: CityStats, completedMissions: string[], weather?: string) {
    this.lastCompleted = completedMissions;
    this.lastTier = stats.tier;
    const hud = this.root.querySelector('#hud');
    if (!hud) return;
    const netPower = stats.powerProduced - stats.powerUsed;
    const netWater = stats.waterProduced - stats.waterUsed;
    const rows: [string, string, string][] = [
      ['Argent', `${Math.round(stats.money)} €`, stats.money < 0 ? 'bad' : ''],
      ['Population', `${stats.population}`, ''],
      ['Bonheur', `${stats.happiness} %`, stats.happiness < 40 ? 'bad' : stats.happiness < 60 ? 'warn' : ''],
      ['Électricité', `${stats.powerUsed}/${stats.powerProduced}`, netPower < 0 ? 'bad' : ''],
      ['Eau', `${stats.waterUsed}/${stats.waterProduced}`, netWater < 0 ? 'bad' : ''],
      ['Palier', tierName(stats.tier), ''],
      ['Temps', `J${stats.day} · ${String(Math.floor(stats.timeOfDay)).padStart(2, '0')}h`, ''],
      ['Météo', weather === 'rain' ? 'Pluie' : 'Clair', ''],
    ];
    hud.innerHTML = rows.map(([label, value, tone]) => `<div class="stat-pill"><div class="label">${label}</div><div class="value" style="color:${tone === 'bad' ? 'var(--bad)' : tone === 'warn' ? 'var(--warn)' : 'var(--text)'}">${value}</div></div>`).join('');
    const tierLabel = this.root.querySelector('#tier-label');
    if (tierLabel) tierLabel.textContent = tierName(stats.tier);
    this.updateSummary(stats);
    const missionsEl = this.root.querySelector('#missions') as HTMLElement | null;
    if (missionsEl && missionsEl.style.display === 'grid') this.renderMissions(completedMissions);
  }

  showInfo(html: string) {
    const panel = this.root.querySelector('#info-panel');
    if (panel) panel.innerHTML = html;
  }

  bindGameControls() {
    this.root.querySelectorAll('[data-tool]').forEach(el => el.addEventListener('click', () => {
      this.tool = (el as HTMLElement).dataset.tool as any;
      if (this.tool !== 'build') this.selectedDefId = null;
      this.onAction('tool', { tool: this.tool });
      this.syncToolButtons();
      if (this.tool === 'select') this.showInfo('<h4>Ville</h4><p>Touchez un bâtiment pour voir ses détails.</p>');
      if (this.tool === 'bulldoze') this.showInfo('<h4>Démolition</h4><p>Touchez ou glissez sur les constructions à démolir.</p>');
      if (this.tool === 'move') this.showInfo('<h4>Déplacer</h4><p>Touchez un bâtiment, puis un emplacement libre.</p>');
    }));
    this.root.querySelectorAll('[data-speed]').forEach(el => el.addEventListener('click', () => {
      this.onAction('speed', { speed: Number((el as HTMLElement).dataset.speed) });
    }));
    this.root.querySelector('#save-btn')?.addEventListener('click', () => this.onAction('save'));
    this.root.querySelector('#menu-btn')?.addEventListener('click', () => this.onAction('menu'));
    this.root.querySelector('#recenter-btn')?.addEventListener('click', () => this.onAction('recenter'));
    this.root.querySelector('#weather-btn')?.addEventListener('click', () => this.onAction('toggle-weather'));
    this.syncToolButtons();
  }

  syncToolButtons() {
    this.root.querySelectorAll('[data-tool]').forEach(el => {
      const t = (el as HTMLElement).dataset.tool;
      (el as HTMLElement).classList.toggle('active', t === this.tool);
    });
  }

  toast(msg: string) {
    const old = this.root.querySelector('.toast');
    if (old) old.remove();
    const d = document.createElement('div');
    d.className = 'toast';
    d.textContent = msg;
    this.root.querySelector('.game-root')?.appendChild(d);
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => d.remove(), 2400);
  }
}
