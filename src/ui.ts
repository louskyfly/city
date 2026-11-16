import { BUILDINGS, MISSIONS, TIERS } from './data/buildings';
import type { BuildingCategory, CityStats, Policies, StatsPoint } from './types';
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
          <div class="catalog" id="management" style="display:none"></div>
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
        <div class="pause-overlay" id="pause-overlay" style="display:none">
          <div class="pause-card">
            <div class="pause-icon">⏸</div>
            <h3>En pause</h3>
            <p class="small">La simulation et la circulation sont suspendues.</p>
            <div class="row">
              <button class="btn primary" id="resume-btn">Reprendre</button>
              <button class="btn" id="pause-menu-btn">Menu</button>
            </div>
          </div>
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
    this.setPaused(speed === 0);
  }

  setPaused(paused: boolean) {
    const overlay = this.root.querySelector('#pause-overlay') as HTMLElement | null;
    if (overlay) overlay.style.display = paused ? 'flex' : 'none';
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
    const managementVisible = (this.root.querySelector('#management') as HTMLElement | null)?.style.display === 'grid';
    tabs.innerHTML = cats.map(c => `<button class="tab ${!missionsVisible && !managementVisible && c.id === this.activeCategory ? 'active' : ''}" data-cat="${c.id}">${c.label}</button>`).join('')
      + `<button class="tab ${missionsVisible ? 'active' : ''}" data-cat="missions">Missions</button>`
      + `<button class="tab ${managementVisible ? 'active' : ''}" data-cat="management">Gestion</button>`;
    tabs.querySelectorAll('.tab').forEach(el => el.addEventListener('click', () => {
      const cat = (el as HTMLElement).dataset.cat!;
      const catalog = this.root.querySelector('#catalog') as HTMLElement | null;
      const missions = this.root.querySelector('#missions') as HTMLElement | null;
      const management = this.root.querySelector('#management') as HTMLElement | null;
      if (!catalog || !missions || !management) return;
      catalog.style.display = 'none';
      missions.style.display = 'none';
      management.style.display = 'none';
      if (cat === 'missions') {
        missions.style.display = 'grid';
        this.renderMissions(this.lastCompleted);
        this.onAction('open-missions');
      } else if (cat === 'management') {
        management.style.display = 'grid';
        this.onAction('open-management');
      } else {
        this.activeCategory = cat as BuildingCategory;
        catalog.style.display = 'grid';
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

  renderManagement(stats: CityStats, policies: Policies, history: StatsPoint[]) {
    const el = this.root.querySelector('#management');
    if (!el) return;
    el.innerHTML = `
      <div class="mg-section">
        <div class="mg-title">Fiscalité</div>
        <div class="mg-tax-row">
          <input id="mg-tax" type="range" min="0" max="25" step="1" value="${stats.taxRate}" class="mg-slider" aria-label="Taux d'imposition">
          <b id="mg-tax-value">${stats.taxRate} %</b>
        </div>
        <div class="small">Des impôts élevés augmentent les revenus mais réduisent le bonheur.</div>
      </div>
      <div class="mg-section">
        <div class="mg-title">Politiques</div>
        <button class="mg-policy ${policies.green ? 'active' : ''}" data-policy="green">
          <b>Ville verte</b><span>−20 % pollution · bonheur · coût d’entretien</span>
        </button>
        <button class="mg-policy ${policies.transport ? 'active' : ''}" data-policy="transport">
          <b>Transport public</b><span>Réduit la pénalité de circulation · bonheur</span>
        </button>
        <button class="mg-policy ${policies.recycling ? 'active' : ''}" data-policy="recycling">
          <b>Recyclage</b><span>−28 % pollution · coût d’entretien</span>
        </button>
      </div>
      <div class="mg-section">
        <div class="mg-title">Qualité de vie</div>
        <div class="mg-grid">
          <div><span>Pollution</span><b id="mg-pollution">${stats.pollution}</b></div>
          <div><span>Bruit</span><b id="mg-noise">${stats.noise}</b></div>
          <div><span>Circulation</span><b id="mg-traffic">${stats.traffic}</b></div>
          <div><span>Écoles</span><b id="mg-school">${stats.schoolCoverage} %</b></div>
          <div><span>Santé</span><b id="mg-health">${stats.healthCoverage} %</b></div>
          <div><span>Loisirs</span><b id="mg-leisure">${stats.leisureCoverage} %</b></div>
          <div><span>Sécurité</span><b id="mg-safety">${stats.safetyCoverage} %</b></div>
          <div><span>Bus</span><b id="mg-bus">${stats.busCoverage} %</b></div>
          <div><span>Bonheur</span><b id="mg-happiness">${stats.happiness} %</b></div>
        </div>
      </div>
      <div class="mg-section">
        <div class="mg-title">Transports</div>
        <div class="mg-grid">
          <div><span>Couverture bus</span><b id="mg-bus2">${stats.busCoverage} %</b></div>
          <div><span>Politique</span><b>${policies.transport ? 'Active' : '—'}</b></div>
        </div>
        <button class="btn" id="mg-route-btn" style="margin-top:7px;width:100%">Afficher la ligne de bus</button>
      </div>
      <div class="mg-section">
        <div class="mg-title">Budget / tick</div>
        <div class="mg-grid">
          <div><span>Revenus</span><b class="good" id="mg-income">+${stats.income} €</b></div>
          <div><span>Dépenses</span><b class="bad" id="mg-expenses">−${stats.expenses} €</b></div>
          <div><span>Solde</span><b id="mg-balance">${stats.income - stats.expenses >= 0 ? '+' : ''}${stats.income - stats.expenses} €</b></div>
          <div><span>Trésorerie</span><b id="mg-money">${Math.round(stats.money)} €</b></div>
        </div>
      </div>
      <div class="mg-section">
        <div class="mg-title">Population</div>
        <div class="mg-spark" id="mg-spark">${this.sparkline(history, 'population')}</div>
      </div>
      <div class="mg-section">
        <div class="mg-title">Trésorerie</div>
        <div class="mg-spark" id="mg-spark-money">${this.sparkline(history, 'money', 'var(--good)')}</div>
      </div>
      <div class="mg-section">
        <div class="mg-title">Sauvegardes</div>
        <div class="row">
          <button class="btn" data-save-slot="1">Slot 1</button>
          <button class="btn" data-save-slot="2">Slot 2</button>
          <button class="btn" data-save-slot="3">Slot 3</button>
        </div>
        <div class="small">Sauvegarde automatique toutes les 25 s. Les slots manuels restent disponibles dans « Charger une ville ».</div>
      </div>`;
    const slider = el.querySelector('#mg-tax') as HTMLInputElement | null;
    slider?.addEventListener('input', () => {
      const label = el.querySelector('#mg-tax-value');
      if (label) label.textContent = `${slider.value} %`;
      this.onAction('set-tax', { value: Number(slider.value) });
    });
    el.querySelectorAll('[data-policy]').forEach(btn => btn.addEventListener('click', () => {
      btn.classList.toggle('active');
      this.onAction('toggle-policy', { policy: (btn as HTMLElement).dataset.policy });
    }));
    el.querySelectorAll('[data-save-slot]').forEach(btn => btn.addEventListener('click', () => {
      this.onAction('save-slot', { slot: Number((btn as HTMLElement).dataset.saveSlot) });
    }));
    el.querySelector('#mg-route-btn')?.addEventListener('click', (event) => {
      const btn = event.currentTarget as HTMLButtonElement;
      const hiding = btn.textContent?.includes('Masquer') ?? false;
      btn.textContent = hiding ? 'Afficher la ligne de bus' : 'Masquer la ligne de bus';
      this.onAction('toggle-bus-route');
    });
  }

  updateManagement(stats: CityStats, history: StatsPoint[]) {
    const el = this.root.querySelector('#management') as HTMLElement | null;
    if (!el || el.style.display === 'none') return;
    const set = (id: string, value: string) => {
      const node = el.querySelector('#' + id);
      if (node) node.textContent = value;
    };
    set('mg-pollution', `${stats.pollution}`);
    set('mg-noise', `${stats.noise}`);
    set('mg-traffic', `${stats.traffic}`);
    set('mg-school', `${stats.schoolCoverage} %`);
    set('mg-health', `${stats.healthCoverage} %`);
    set('mg-leisure', `${stats.leisureCoverage} %`);
    set('mg-safety', `${stats.safetyCoverage} %`);
    set('mg-bus', `${stats.busCoverage} %`);
    set('mg-bus2', `${stats.busCoverage} %`);
    set('mg-happiness', `${stats.happiness} %`);
    set('mg-income', `+${stats.income} €`);
    set('mg-expenses', `−${stats.expenses} €`);
    const balance = stats.income - stats.expenses;
    set('mg-balance', `${balance >= 0 ? '+' : ''}${balance} €`);
    set('mg-money', `${Math.round(stats.money)} €`);
    const spark = el.querySelector('#mg-spark');
    if (spark) spark.innerHTML = this.sparkline(history, 'population', 'var(--accent)', false);
    const sparkMoney = el.querySelector('#mg-spark-money');
    if (sparkMoney) sparkMoney.innerHTML = this.sparkline(history, 'money', 'var(--good)', false);
  }

  private sparkline(history: StatsPoint[], key: 'population' | 'money' = 'population', color = 'var(--accent)', showEmpty = true): string {
    const pts = history.slice(-60);
    if (pts.length < 2) {
      return showEmpty ? '<div class="small">Données en cours de collecte…</div>' : '';
    }
    const w = 300, h = 54;
    const values = pts.map(p => p[key]);
    const max = Math.max(10, ...values);
    const min = key === 'money' ? Math.min(0, ...values) : 0;
    const range = Math.max(1, max - min);
    const step = w / (pts.length - 1);
    const poly = pts.map((p, i) => {
      const v = p[key];
      return `${(i * step).toFixed(1)},${(h - ((v - min) / range) * (h - 6) - 3).toFixed(1)}`;
    }).join(' ');
    const last = pts[pts.length - 1];
    const label = key === 'money' ? `${Math.round(last.money)} €` : `${last.population} hab.`;
    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="width:100%;height:54px;display:block">
      <polyline points="${poly}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>
    </svg>
    <div class="small" style="display:flex;justify-content:space-between"><span>J${pts[0].day}</span><span>${label}</span><span>J${last.day}</span></div>`;
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
    this.root.querySelector('#resume-btn')?.addEventListener('click', () => this.onAction('resume'));
    this.root.querySelector('#pause-menu-btn')?.addEventListener('click', () => this.onAction('menu'));
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
