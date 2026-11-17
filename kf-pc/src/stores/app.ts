import { defineStore } from 'pinia';

interface AppState {
  sidebarCollapsed: boolean;
  quickNavOpen: boolean;
  settingsOpen: boolean;
}

const STORAGE_KEY = 'mini-admin-app';

const defaultState: AppState = {
  sidebarCollapsed: false,
  quickNavOpen: true,
  settingsOpen: false
};

function loadState(): AppState {
  if (typeof localStorage === 'undefined') {
    return defaultState;
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState;
    return { ...defaultState, ...JSON.parse(raw) };
  } catch {
    return defaultState;
  }
}

export const useAppStore = defineStore('app', {
  state: (): AppState => ({ ...defaultState }),
  actions: {
    hydrate() {
      Object.assign(this, loadState());
      // 侧边栏固定为默认展开，不使用折叠态
      this.sidebarCollapsed = false;
    },
    persist() {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          sidebarCollapsed: this.sidebarCollapsed,
          quickNavOpen: this.quickNavOpen
        })
      );
    },
    toggleSidebar() {
      this.sidebarCollapsed = false;
    },
    toggleQuickNav() {
      this.quickNavOpen = !this.quickNavOpen;
    },
    openQuickNav() {
      this.quickNavOpen = true;
    },
    closeQuickNav() {
      this.quickNavOpen = false;
    },
    openSettings() {
      this.settingsOpen = true;
    },
    closeSettings() {
      this.settingsOpen = false;
    }
  }
});
