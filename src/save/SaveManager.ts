import type { SaveData } from '../types';

const PREFIX = 'citybuilder_save_';
const AUTO_SLOT = 'auto';
const VERSION = 1;

export class SaveManager {
  static slotKey(slot: string) { return PREFIX + slot; }

  static save(slot: string, data: SaveData): boolean {
    try {
      const payload = { ...data, version: VERSION, timestamp: Date.now() };
      localStorage.setItem(this.slotKey(slot), JSON.stringify(payload));
      localStorage.setItem(this.slotKey(AUTO_SLOT), JSON.stringify(payload));
      return true;
    } catch (e) {
      console.error('Save failed', e);
      return false;
    }
  }

  static load(slot: string): SaveData | null {
    try {
      const raw = localStorage.getItem(this.slotKey(slot));
      if (!raw) return null;
      const data = JSON.parse(raw) as SaveData;
      if (!data || typeof data !== 'object' || !Array.isArray(data.buildings)) throw new Error('Invalid save');
      return data;
    } catch (e) {
      console.error('Load failed, attempting recovery ignored', e);
      return null;
    }
  }

  static listSlots(): { slot: string; timestamp: number; population: number; money: number }[] {
    const out: { slot: string; timestamp: number; population: number; money: number }[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(PREFIX)) continue;
      const slot = k.slice(PREFIX.length);
      try {
        const d = JSON.parse(localStorage.getItem(k) || 'null') as SaveData | null;
        if (d?.stats) out.push({ slot, timestamp: d.timestamp || 0, population: d.stats.population || 0, money: d.stats.money || 0 });
      } catch {}
    }
    return out.sort((a, b) => b.timestamp - a.timestamp);
  }

  static deleteSlot(slot: string) {
    localStorage.removeItem(this.slotKey(slot));
  }

  static hasAuto(): boolean {
    return !!localStorage.getItem(this.slotKey(AUTO_SLOT));
  }
}
