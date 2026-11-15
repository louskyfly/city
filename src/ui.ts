import { BUILDINGS, MISSIONS, TIERS } from './data/buildings';
import type { BuildingCategory, CityStats } from './types';
import { tierName } from './simulation';

export type Screen = 'menu' | 'game' | 'load' | 'settings';

export class UI {
  root: HTMLElement;
  onAction: (action: string, payload?: any) => void = () => {};
  selectedDefId: string | null = null;
  activeCategory: BuildingCategory = 'residential';
  tool: 'select' | 'build' | 'bulldoze' = 'select';
  screen: Screen = 'menu';
  toastTimer?: number;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  renderMenu(hasAuto: boolean) {
    this.screen = 'menu';
    this.root.innerHTML = `
      <div class="overlay"><div class="menu-card">
        <h1>City Builder</h1>
        <p>Construisez votre ville, gérez son économie et faites grandir une véritable métropole.</p>
        <div class="menu-grid">
          <div class="list-item"><h2>Nouvelle partie</h2><p class="small">Terrain vierge, budget initial et missions de progression.</p></div>
          <div class="list-item"><h2>Gestion vivante</h2><p class="small">Population, budget, eau, électricité, bonheur et circulation.</p></div>
          <div class="list-item"><h2>Conçu pour iPad</h2><p class="small">Contrôles tactiles, interface paysage et sauvegarde locale.</p></div>
        </div>
        <div class="menu-actions">
          <button class="btn primary" data-action="new">Nouvelle partie</button>
          <button class="btn" data-action="continue" ${hasAuto ? '' : 'disabled'}>Continuer</button>
          <button class="btn" data-action="load-screen">Charger une ville</button>
          <button class="btn" data-action="settings">Paramètres</button>
        </div>
      </div></div>`;
    this.bindMenu();
  }

  renderLoad(slots: { slot: string; timestamp: number; population: number; money: number }[]) {
    this.screen = 'load';
    this.root.innerHTML = `<div class="overlay"><div class="menu-card"><h2>Charger une ville</h2>
      <div class="list">${slots.length ? slots.map(s => `<div class="list-item"><strong>${s.slot}</strong><div class="small">${new Date(s.timestamp).toLocaleString()} · ${s.population} hab. · ${Math.round(s.money)} €</div>
      <div class="menu-actions"><button class="btn primary" data-action="load-slot" data-slot="${s.slot}">Charger</button><button class="btn" data-action="delete-slot" data-slot="${s.slot}">Supprimer</button></div></div>`).join('') : '<p class="small">Aucune sauvegarde trouvée.</p>'}</div>
      <div class="menu-actions"><button class="btn" data-action="menu">Retour</button></div></div></div>`;
    this.root.querySelectorAll('[data-action]').forEach(el => el.addEventListener('click', () => {
      const e = el as HTMLElement; this.onAction(e.dataset.action!, { slot: e.dataset.slot });
    }));
  }

  renderSettings() {
    this.screen = 'settings';
    this.root.innerHTML = `<div class="overlay"><div class="menu-card"><h2>Paramètres</h2>
      <div class="list">
        <div class="list-item"><strong>Contrôles</strong><div class="small">Souris : glisser pour déplacer, molette pour zoom, clic droit pour pivoter. Tactile : 1 doigt déplacer, 2 doigts zoom/pivoter, toucher pour sélectionner.</div></div>
        <div class="list-item"><strong>Sauvegarde</strong><div class="small">Sauvegarde automatique régulière et emplacements manuels. Les données restent dans le navigateur.</div></div>
        <div class="list-item"><strong>Performance</strong><div class="small">Rendu 3D optimisé pour iPad avec ombres dynamiques et simulation progressive.</div></div>
      </div>
      <div class="menu-actions"><button class="btn" data-action="menu">Retour</button></div></div></div>`;
    this.bindMenu();
  }

  private bindMenu() {
    this.root.querySelectorAll('[data-action]').forEach(el => el.addEventListener('click', () => {
      const e = el as HTMLElement; this.onAction(e.dataset.action!, { slot: e.dataset.slot });
    }));
  }

  renderGame(stats: CityStats, completedMissions: string[]) {
    this.screen = 'game';
    this.root.innerHTML = `
      <div class="game-root">
        <div id="scene-host"></div>
        <div class="hud-top" id="hud"></div>
        <div class="sidebar">
          <div class="sidebar-header"><h3>Construction</h3><span class="small" id="tier-label"></span></div>
          <div class="tabs" id="tabs"></div>
          <div class="catalog" id="catalog"></div>
          <div class="catalog" id="missions" style="display:none"></div>
        </div>
        <div class="info-panel" id="info-panel"><h4>Ville</h4><p>Sélectionnez un bâtiment ou placez une construction.</p></div>
        <div class="bottom-bar">
          <button class="btn" data-tool="select">Sélection</button>
          <button class="btn" data-tool="bulldoze">Supprimer</button>
          <button class="btn" id="save-btn">Sauvegarder</button>
          <button class="btn" id="menu-btn">Menu</button>
          <div class="spacer"></div>
          <button class="btn" data-speed="0">Pause</button>
          <button class="btn active" data-speed="1">x1</button>
          <button class="btn" data-speed="2">x2</button>
          <button class="btn" data-speed="3">x3</button>
        </div>
      </div>`;
    this.renderTabs();
    this.renderCatalog(stats.tier);
    this.updateHUD(stats, completedMissions);
    this.bindGameControls();
  }

  getSceneHost(): HTMLElement { return this.root.querySelector('#scene-host') as HTMLElement; }

  renderTabs() {
    const cats: { id: BuildingCategory; label: string }[] = [
      { id: 'residential', label: 'Résidentiel' }, { id: 'commercial', label: 'Commercial' }, { id: 'industrial', label: 'Industriel' },
      { id: 'services', label: 'Services' }, { id: 'leisure', label: 'Loisirs' }, { id: 'infrastructure', label: 'Infra.' },
    ];
    const tabs = this.root.querySelector('#tabs')!;
    tabs.innerHTML = cats.map(c => `<button class="tab ${c.id===this.activeCategory?'active':''}" data-cat="${c.id}">${c.label}</button>`).join('') + `<button class="tab" data-cat="missions">Missions</button>`;
    tabs.querySelectorAll('.tab').forEach(el => el.addEventListener('click', () => {
      const cat = (el as HTMLElement).dataset.cat!;
      if (cat === 'missions') {
        (this.root.querySelector('#catalog') as HTMLElement).style.display = 'none';
        (this.root.querySelector('#missions') as HTMLElement).style.display = 'grid';
        this.renderMissions();
      } else {
        this.activeCategory = cat as BuildingCategory;
        (this.root.querySelector('#catalog') as HTMLElement).style.display = 'grid';
        (this.root.querySelector('#missions') as HTMLElement).style.display = 'none';
        this.onAction('category', { category: this.activeCategory });
      }
      this.renderTabs();
    }));
  }

  renderCatalog(tier: number) {
    const items = BUILDINGS.filter(b => b.category === this.activeCategory);
    const el = this.root.querySelector('#catalog');
    if (!el) return;
    el.innerHTML = items.map(b => {
      const locked = b.unlockTier > tier;
      return `<button class="build-card ${this.selectedDefId===b.id?'selected':''} ${locked?'locked':''}" data-def="${b.id}" ${locked?'disabled':''}>
        <div class="name">${b.name}</div>
        <div class="meta">${b.cost} € · entretien ${b.upkeep} €/tick · ${b.width}x${b.depth}</div>
        <div class="meta">${b.description}${locked?` · Débloqué: ${TIERS.find(t=>t.tier===b.unlockTier)?.name||''}`:''}</div>
      </button>`;
    }).join('');
    el.querySelectorAll('[data-def]').forEach(btn => btn.addEventListener('click', () => {
      const id = (btn as HTMLElement).dataset.def!;
      this.selectedDefId = id; this.tool = 'build';
      this.onAction('select-def', { defId: id });
      this.renderCatalog(tier);
      this.syncToolButtons();
    }));
  }

  renderMissions(completed: string[] = []) {
    const el = this.root.querySelector('#missions');
    if (!el) return;
    el.innerHTML = MISSIONS.map(m => `<div class="build-card ${completed.includes(m.id)?'selected':''}"><div class="name">${completed.includes(m.id)?'✅ ':''}${m.title}</div><div class="meta">${m.description}</div><div class="meta">Récompense: ${m.reward} €</div></div>`).join('');
  }

  updateHUD(stats: CityStats, completedMissions: string[]) {
    const hud = this.root.querySelector('#hud');
    if (!hud) return;
    const netPower = stats.powerProduced - stats.powerUsed;
    const netWater = stats.waterProduced - stats.waterUsed;
    hud.innerHTML = [
      ['Argent', `${Math.round(stats.money)} €`, stats.money < 0 ? 'bad':''],
      ['Population', `${stats.population}`, ''],
      ['Bonheur', `${stats.happiness}%`, stats.happiness < 40 ? 'bad': stats.happiness < 60 ? 'warn':''],
      ['Électricité', `${stats.powerUsed}/${stats.powerProduced}`, netPower < 0 ? 'bad':''],
      ['Eau', `${stats.waterUsed}/${stats.waterProduced}`, netWater < 0 ? 'bad':''],
      ['Stade', tierName(stats.tier), ''],
      ['Jour', `${stats.day} · ${Math.floor(stats.timeOfDay)}h`, ''],
    ].map(([l,v,c]) => `<div class="stat-pill"><div class="label">${l}</div><div class="value" style="color:${c==='bad'?'var(--bad)':c==='warn'?'var(--warn)':'var(--text)'}">${v}</div></div>`).join('');
    const tierLabel = this.root.querySelector('#tier-label');
    if (tierLabel) tierLabel.textContent = tierName(stats.tier);
    if ((this.root.querySelector('#missions') as HTMLElement)?.style.display !== 'none') this.renderMissions(completedMissions);
  }

  showInfo(html: string) {
    const p = this.root.querySelector('#info-panel');
    if (p) p.innerHTML = html;
  }

  bindGameControls() {
    this.root.querySelectorAll('[data-tool]').forEach(el => el.addEventListener('click', () => {
      this.tool = (el as HTMLElement).dataset.tool as any;
      if (this.tool !== 'build') this.selectedDefId = null;
      this.onAction('tool', { tool: this.tool });
      this.syncToolButtons();
    }));
    this.root.querySelectorAll('[data-speed]').forEach(el => el.addEventListener('click', () => {
      this.onAction('speed', { speed: Number((el as HTMLElement).dataset.speed) });
      this.root.querySelectorAll('[data-speed]').forEach(b => b.classList.remove('active'));
      el.classList.add('active');
    }));
    this.root.querySelector('#save-btn')?.addEventListener('click', () => this.onAction('save'));
    this.root.querySelector('#menu-btn')?.addEventListener('click', () => this.onAction('menu'));
    this.syncToolButtons();
  }

  syncToolButtons() {
    this.root.querySelectorAll('[data-tool]').forEach(el => {
      const t = (el as HTMLElement).dataset.tool;
      el.classList.toggle('active', t === this.tool);
    });
  }

  toast(msg: string) {
    const old = this.root.querySelector('.toast'); if (old) old.remove();
    const d = document.createElement('div'); d.className = 'toast'; d.textContent = msg;
    this.root.querySelector('.game-root')?.appendChild(d);
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => d.remove(), 2600);
  }
}