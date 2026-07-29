import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AppState {
  activePlaylistId: string | null;
  setActivePlaylistId: (id: string | null) => void;
  activeCategory: string | null;
  setActiveCategory: (cat: string | null) => void;
  isSidebarOpen: boolean;
  setSidebarOpen: (isOpen: boolean) => void;
  logoBgColor: string;
  setLogoBgColor: (color: string) => void;
  accentColor: string;
  setAccentColor: (color: string) => void;
  isDarkMode: boolean;
  setDarkMode: (isDark: boolean) => void;
  isAmoledMode: boolean;
  setAmoledMode: (isAmoled: boolean) => void;
  hideUrls: boolean;
  setHideUrls: (hide: boolean) => void;
  showSettings: boolean;
  setShowSettings: (show: boolean) => void;
  undoEntry: { description: string; restore: () => Promise<void> } | null;
  setUndoEntry: (entry: { description: string; restore: () => Promise<void> } | null) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      activePlaylistId: null,
      setActivePlaylistId: (id) => set({ activePlaylistId: id, activeCategory: null }),
      activeCategory: null,
      setActiveCategory: (cat) => set({ activeCategory: cat }),
      isSidebarOpen: true,
      setSidebarOpen: (isOpen) => set({ isSidebarOpen: isOpen }),
      logoBgColor: '#f1f5f9',
      setLogoBgColor: (color) => set({ logoBgColor: color }),
      accentColor: '#1565C0',
      setAccentColor: (color) => set({ accentColor: color }),
      isDarkMode: false,
      setDarkMode: (isDark) => set({ isDarkMode: isDark }),
      isAmoledMode: false,
      setAmoledMode: (isAmoled) => set({ isAmoledMode: isAmoled }),
      hideUrls: false,
      setHideUrls: (hide) => set({ hideUrls: hide }),
      showSettings: false,
      setShowSettings: (show) => set({ showSettings: show }),
      undoEntry: null,
      setUndoEntry: (entry) => set({ undoEntry: entry }),
    }),
    {
      name: 'm3u-manager-storage',
      partialize: (state) => ({
        logoBgColor: state.logoBgColor,
        accentColor: state.accentColor,
        isDarkMode: state.isDarkMode,
        isAmoledMode: state.isAmoledMode,
      }),
    }
  )
);

/** Returns '#ffffff' or '#000000' depending on which gives better contrast. */
export function contrastText(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 145 ? '#000000' : '#ffffff';
}

/** Appends a two-hex-digit alpha to a #RRGGBB string (e.g. 0x18 ≈ 9 %). */
export function accentAlpha(hex: string, alpha: string): string {
  return `${hex}${alpha}`;
}
