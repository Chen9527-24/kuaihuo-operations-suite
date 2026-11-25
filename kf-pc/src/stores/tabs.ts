import { defineStore } from 'pinia';
import type { RouteLocationNormalizedLoaded } from 'vue-router';
import type { TabItem } from '@/types';
import { isLeafMenuPath } from '@/router/menu';

interface TabsState {
  tabs: TabItem[];
  favoritePaths: string[];
}

const STORAGE_KEY = 'mini-admin-tabs';

const defaultTab: TabItem = {
  title: '工作台',
  path: '/dashboard',
  name: 'DashboardView',
  closable: false
};

function defaultState(): TabsState {
  return { tabs: [{ ...defaultTab }], favoritePaths: [] };
}

function loadState(): TabsState {
  const state = defaultState();
  if (typeof localStorage === 'undefined') return state;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return state;
    const saved = JSON.parse(raw) as Partial<TabsState>;
    const currentTabs = (saved.tabs ?? []).filter(tab => tab.path !== defaultTab.path && isLeafMenuPath(tab.path));
    return {
      tabs: [...state.tabs, ...currentTabs],
      favoritePaths: (saved.favoritePaths ?? []).filter(isLeafMenuPath)
    };
  } catch {
    return state;
  }
}

export const useTabsStore = defineStore('tabs', {
  state: defaultState,
  getters: {
    hasFavorite: (state) => (path: string) => state.favoritePaths.includes(path)
  },
  actions: {
    hydrate() {
      Object.assign(this, loadState());
    },
    persist() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.$state));
    },
    visit(route: RouteLocationNormalizedLoaded) {
      const path = route.path;
      const title = String(route.meta.title ?? route.name ?? path);
      const name = String(route.name ?? path);
      const closable = Boolean(route.meta.closable ?? path !== '/dashboard');

      if (!this.tabs.some((tab) => tab.path === path)) {
        this.tabs.push({ path, title, name, closable });
      }
    },
    close(path: string) {
      this.tabs = this.tabs.filter((tab) => tab.path !== path || !tab.closable);
    },
    closeOthers(path: string) {
      this.tabs = this.tabs.filter((tab) => tab.path === path || !tab.closable);
    },
    closeAll() {
      this.tabs = this.tabs.filter((tab) => !tab.closable);
    },
    /** Clear route instances tied to the previous account or tenant context. */
    resetForAuthContext() {
      this.tabs = [{ ...defaultTab }];
    },
    toggleFavorite(path: string) {
      if (this.favoritePaths.includes(path)) {
        this.favoritePaths = this.favoritePaths.filter((item) => item !== path);
        return;
      }
      this.favoritePaths.unshift(path);
    }
  }
});
