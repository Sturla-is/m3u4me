import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { usePlaylists, api, triggerRefresh } from '../apiClient';
import { useStore, accentAlpha } from '../store';
import { Plus, Settings, FileAudio, Menu, Trash2, Eye, EyeOff, Keyboard, Search, Info, ArrowUpCircle } from 'lucide-react';
import PlaylistEditor from './PlaylistEditor';
import CategoryList from './CategoryList';
import Spotlight from './Spotlight';
import AppInfo, { useVersionInfo } from './AppInfo';
import { Logo } from './Logo';

export default function Dashboard() {
  const { user } = useAuth();
  const { playlists, loading } = usePlaylists();
  const {
    activePlaylistId, setActivePlaylistId,
    isSidebarOpen, setSidebarOpen,
    accentColor,
    hideUrls, setHideUrls,
    undoEntry, setUndoEntry,
    setActiveCategory,
    setShowSettings,
  } = useStore();
  const [isCreating, setIsCreating] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showAppInfo, setShowAppInfo] = useState(false);
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const versionInfo = useVersionInfo();
  const mod = /mac/i.test(navigator.platform) ? 'Cmd' : 'Ctrl';

  const handleSpotlightNavigate = (playlistId: string, category: string, channelId: string) => {
    setActivePlaylistId(playlistId);
    setActiveCategory(category);
    // Scroll to the channel after the playlist editor has rendered
    setTimeout(() => {
      const el = document.getElementById(`ch-${channelId}`);
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.animate([{ backgroundColor: 'rgba(234,179,8,0.25)' }, { backgroundColor: 'transparent' }], { duration: 1800, easing: 'ease-out' }); }
    }, 350);
  };
  const [deletePlaylistId, setDeletePlaylistId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [sidebarWidth, setSidebarWidth] = useState(256);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const sidebarResizing = useRef<{ startX: number; startW: number } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    if (undoEntry) {
      undoTimerRef.current = setTimeout(() => setUndoEntry(null), 5000);
    }
    return () => { if (undoTimerRef.current) clearTimeout(undoTimerRef.current); };
  }, [undoEntry]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && undoEntry) {
        e.preventDefault();
        if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
        undoEntry.restore();
        setUndoEntry(null);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [undoEntry]);

  const startSidebarResize = (e: React.MouseEvent) => {
    e.preventDefault();
    if (sidebarRef.current) sidebarRef.current.style.transition = 'none';
    sidebarResizing.current = { startX: e.clientX, startW: sidebarWidth };
    const onMove = (ev: MouseEvent) => {
      if (!sidebarResizing.current) return;
      const w = Math.max(160, Math.min(480, sidebarResizing.current.startW + ev.clientX - sidebarResizing.current.startX));
      setSidebarWidth(w);
    };
    const onUp = () => {
      if (sidebarRef.current) sidebarRef.current.style.transition = '';
      sidebarResizing.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const confirmRenamePlaylist = async () => {
    const newName = renameValue.trim();
    const id = renamingId;
    setRenamingId(null);
    if (!id || !newName) return;
    try {
      await api.updatePlaylist(id, { name: newName });
      triggerRefresh();
    } catch (e) { console.error(e); }
  };

  const handleCreatePlaylist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlaylistName.trim() || !user) return;
    setIsCreating(false);
    try {
      const pl = await api.createPlaylist(newPlaylistName.trim());
      triggerRefresh();
      setNewPlaylistName('');
      setActivePlaylistId(pl.id);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-gray-100 dark:bg-[#121212] amoled:dark:bg-black font-sans">

      {/* ── Top App Bar ─────────────────────────────────────────────────── */}
      {/* ── Update Banner ───────────────────────────────────────────────── */}
      {versionInfo.updateAvailable && !updateDismissed && versionInfo.releaseUrl && (
        <div className="shrink-0 z-30 flex items-center justify-center gap-3 px-4 py-2 text-sm font-medium text-white" style={{ backgroundColor: accentColor }}>
          <ArrowUpCircle className="h-4 w-4 shrink-0" />
          <span>A new version of m3u4me is available: <strong>v{versionInfo.latest}</strong></span>
          <a
            href={versionInfo.releaseUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:opacity-80 transition-opacity"
          >
            View release
          </a>
          <button onClick={() => setUpdateDismissed(true)} className="ml-auto p-0.5 rounded hover:bg-white/20 transition-colors" aria-label="Dismiss">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      )}

      <nav className="h-16 shrink-0 z-30 bg-white dark:bg-[#1e1e1e] amoled:dark:bg-[#0a0a0a] elev-4 flex items-center px-2 gap-1">
        <button
          onClick={() => setSidebarOpen(!isSidebarOpen)}
          className="md-btn p-2 rounded-full text-gray-600 dark:text-gray-300"
          aria-label="Toggle navigation drawer"
        >
          <Menu className="h-6 w-6" />
        </button>

        <div className="flex items-center ml-2 flex-1">
          <Logo className="h-6 w-auto text-gray-900 dark:text-white shrink-0" />
        </div>

        <button
          onClick={() => { /* opens via Spotlight's own keydown; this is a click target */ document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true })); }}
          className="md-btn hidden sm:flex items-center gap-2 h-9 px-4 rounded text-xs font-medium border border-gray-300 dark:border-white/15 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          title={`Search (${mod}+K)`}
        >
          <Search className="h-4 w-4" />
          <span className="text-gray-400 dark:text-gray-500">Search…</span>
          <kbd className="ml-1 font-mono text-[10px] text-gray-400 dark:text-gray-500">{mod}+K</kbd>
        </button>

        <button
          onClick={() => setHideUrls(!hideUrls)}
          className="md-btn hidden sm:flex items-center gap-2 h-9 px-4 rounded text-xs font-medium uppercase tracking-wider border border-gray-300 dark:border-white/15 text-gray-600 dark:text-gray-300"
          title={hideUrls ? 'Show stream URLs' : 'Hide stream URLs'}
        >
          {hideUrls ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          <span>{hideUrls ? 'Show URLs' : 'Hide URLs'}</span>
        </button>

        {/* Keyboard shortcuts */}
        <button
          onClick={() => setShowShortcuts(true)}
          className="md-btn p-2 rounded-full text-gray-600 dark:text-gray-400"
          aria-label="Keyboard shortcuts"
          title="Keyboard shortcuts"
        >
          <Keyboard className="h-5 w-5" />
        </button>

        {/* App Info */}
        <button
          onClick={() => setShowAppInfo(true)}
          className="md-btn p-2 rounded-full text-gray-600 dark:text-gray-400"
          aria-label="About m3u4me"
          title="About m3u4me"
        >
          <Info className="h-5 w-5" />
        </button>

        {/* Settings */}
        <button
          onClick={() => setShowSettings(true)}
          className="md-btn p-2 rounded-full text-gray-600 dark:text-gray-400 ml-1"
          aria-label="Settings"
        >
          <Settings className="h-5 w-5" />
        </button>
      </nav>

      <div className="flex flex-1 overflow-hidden">

        {/* ── Navigation Drawer ────────────────────────────────────────────── */}
        <div
          ref={sidebarRef}
          className={`${isSidebarOpen ? '' : 'w-0 overflow-hidden'} shrink-0 flex flex-col bg-white dark:bg-[#1e1e1e] amoled:dark:bg-black elev-1 z-10 transition-[width] duration-200 relative`}
          style={isSidebarOpen ? { width: sidebarWidth } : undefined}
        >
          <div className="flex-1 overflow-y-auto py-2">

            {/* Section: Playlists */}
            <div className="flex items-center px-4 pt-3 pb-2">
              <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-gray-500 dark:text-gray-400 flex-1">
                Playlists
              </p>
              <button
                onClick={() => setIsCreating(true)}
                className="md-btn p-1 rounded-full text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                title="New playlist"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>

            <nav className="space-y-0.5 px-2">
              {playlists.map((pl) => {
                const isActive = activePlaylistId === pl.id;
                return (
                  <div key={pl.id} className="relative group flex items-center rounded hover:bg-gray-100 dark:hover:bg-white/6" style={isActive ? { backgroundColor: accentAlpha(accentColor, '18') } : undefined}>
                    {isActive && (
                      <div
                        className="absolute left-0 top-1 bottom-1 w-0.5 rounded-r"
                        style={{ backgroundColor: accentColor }}
                      />
                    )}
                    {renamingId === pl.id ? (
                      <div className="flex-1 flex items-center h-12 pl-4 pr-10 gap-3">
                        <svg className="w-4 h-4 shrink-0 opacity-60 text-gray-700 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                        </svg>
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={e => setRenameValue(e.target.value)}
                          onBlur={confirmRenamePlaylist}
                          onKeyDown={e => {
                            if (e.key === 'Enter') confirmRenamePlaylist();
                            if (e.key === 'Escape') setRenamingId(null);
                          }}
                          className="flex-1 min-w-0 text-sm font-medium bg-transparent border-b-2 border-blue-600 dark:border-blue-400 focus:outline-none text-gray-900 dark:text-white px-0.5"
                        />
                      </div>
                    ) : (
                      <button
                        onClick={() => setActivePlaylistId(pl.id)}
                        onDoubleClick={() => { setRenamingId(pl.id); setRenameValue(pl.name); }}
                        className="flex-1 flex items-center h-12 pl-4 pr-10 gap-3 rounded text-sm font-medium text-left truncate transition-colors text-gray-700 dark:text-gray-300"
                        style={isActive ? { color: accentColor } : undefined}
                      >
                        <svg className="w-4 h-4 shrink-0 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                        </svg>
                        <span className="truncate">{pl.name}</span>
                      </button>
                    )}
                    <button
                      onClick={() => setDeletePlaylistId(pl.id)}
                      className="md-btn absolute right-1 p-1.5 rounded-full text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-all"
                      title="Delete playlist"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
              {playlists.length === 0 && !loading && (
                <p className="text-sm text-gray-400 dark:text-gray-500 px-2 py-4 text-center">
                  No playlists yet
                </p>
              )}
            </nav>

            {/* Section: Categories */}
            {activePlaylistId && <CategoryList playlistId={activePlaylistId} />}
          </div>

          {/* Resize handle */}
          {isSidebarOpen && (
            <div
              onMouseDown={startSidebarResize}
              className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-gray-300 dark:hover:bg-white/15 transition-colors z-20"
            />
          )}
        </div>

        {/* ── Main content ─────────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0">
          {activePlaylistId ? (
            <PlaylistEditor playlistId={activePlaylistId} />
          ) : (
            <div className="flex-1 flex items-center justify-center bg-gray-100 dark:bg-[#121212] amoled:dark:bg-black">
              <div className="text-center">
                <FileAudio className="mx-auto h-16 w-16 text-gray-300 dark:text-gray-700 mb-4" />
                <p className="text-base font-medium text-gray-500 dark:text-gray-400">No playlist selected</p>
                <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">Choose a playlist from the drawer to start editing.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Dialog: New Playlist ─────────────────────────────────────────── */}
      {isCreating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-sm bg-white dark:bg-[#272727] amoled:dark:bg-[#1a1a1a] rounded elev-24">
            <h2 className="text-xl font-medium text-gray-900 dark:text-white px-6 pt-6 pb-5">
              New Playlist
            </h2>
            <div className="px-6 pb-2">
              <input
                autoFocus
                type="text"
                value={newPlaylistName}
                onChange={e => setNewPlaylistName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleCreatePlaylist(e);
                  if (e.key === 'Escape') { setIsCreating(false); setNewPlaylistName(''); }
                }}
                placeholder="Playlist name"
                className="w-full border border-gray-400 dark:border-gray-500 rounded px-3 py-2.5 text-sm focus:outline-none bg-transparent text-gray-900 dark:text-white placeholder-gray-400"
                style={{ '--tw-ring-color': accentColor } as React.CSSProperties}
                onFocus={e => (e.target.style.borderColor = accentColor)}
                onBlur={e => (e.target.style.borderColor = '')}
              />
            </div>
            <div className="flex justify-end gap-1 px-4 py-4">
              <button
                onClick={() => { setIsCreating(false); setNewPlaylistName(''); }}
                className="md-btn h-9 px-4 rounded text-xs font-medium uppercase tracking-wider text-gray-600 dark:text-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={handleCreatePlaylist}
                disabled={!newPlaylistName.trim()}
                className="md-btn h-9 px-4 rounded text-xs font-medium uppercase tracking-wider disabled:opacity-40"
                style={{ color: accentColor }}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Dialog: Delete Playlist ──────────────────────────────────────── */}
      {deletePlaylistId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-sm bg-white dark:bg-[#272727] amoled:dark:bg-[#1a1a1a] rounded elev-24">
            <h2 className="text-xl font-medium text-gray-900 dark:text-white px-6 pt-6 pb-2">
              Delete Playlist
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 px-6 pb-6">
              Are you sure? All channels in this playlist will be permanently deleted.
            </p>
            <div className="flex justify-end gap-1 px-4 pb-4">
              <button
                onClick={() => setDeletePlaylistId(null)}
                className="md-btn h-9 px-4 rounded text-xs font-medium uppercase tracking-wider text-gray-600 dark:text-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const id = deletePlaylistId;
                  const pl = playlists.find(p => p.id === id);
                  setDeletePlaylistId(null);
                  try {
                    const channels = await api.getChannels(id);
                    await api.deletePlaylist(id);
                    if (activePlaylistId === id) setActivePlaylistId(null);
                    triggerRefresh();
                    setUndoEntry({
                      description: `Deleted playlist "${pl?.name}"`,
                      restore: async () => {
                        const newPl = await api.createPlaylist(pl?.name || 'Restored Playlist');
                        if (channels.length > 0) {
                          const restoreData = channels.map(({ id: _id, playlistId: _pid, createdAt: _c, updatedAt: _u, ...rest }: any) => rest);
                          await api.bulkAddChannels(newPl.id, restoreData);
                        }
                        if (pl?.categories?.length) await api.updatePlaylist(newPl.id, { categories: pl.categories });
                        triggerRefresh();
                        setActivePlaylistId(newPl.id);
                      },
                    });
                  } catch (e) { console.error(e); }
                }}
                className="md-btn h-9 px-4 rounded text-xs font-medium uppercase tracking-wider text-red-600 dark:text-red-400"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <Spotlight onNavigate={handleSpotlightNavigate} />

      {/* ── App Info Dialog ──────────────────────────────────────────────── */}
      <AppInfo open={showAppInfo} onClose={() => setShowAppInfo(false)} />

      {/* ── Dialog: Keyboard Shortcuts ──────────────────────────────────── */}
      {showShortcuts && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setShowShortcuts(false)}>
          <div className="w-full max-w-sm bg-white dark:bg-[#272727] amoled:dark:bg-[#1a1a1a] rounded elev-24" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100 dark:border-white/10">
              <h2 className="text-xl font-medium text-gray-900 dark:text-white">Keyboard Shortcuts</h2>
              <button onClick={() => setShowShortcuts(false)} className="md-btn p-1.5 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="px-6 py-4 space-y-1">
              {([
                [[mod, 'K'], 'Open search'],
                [[mod, 'A'], 'Select all channels in category'],
                [['Esc'], 'Clear selection'],
                [['Del'], 'Delete selected channels'],
                [['Space'], 'Toggle visibility of selected channels'],
                [[mod, 'Z'], 'Undo last destructive action'],
              ] as [string[], string][]).map(([keys, label]) => (
                <div key={label} className="flex items-center justify-between py-2.5 border-b border-gray-100 dark:border-white/8 last:border-0">
                  <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
                  <div className="flex items-center gap-1 shrink-0 ml-4">
                    {keys.map((k, i) => (
                      <React.Fragment key={k}>
                        {i > 0 && <span className="text-xs text-gray-400">+</span>}
                        <kbd className="inline-flex items-center px-2 py-1 rounded text-[11px] font-medium font-mono bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-white/15 shadow-sm">
                          {k}
                        </kbd>
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="px-6 pb-5 pt-1">
              <p className="text-xs text-gray-400 dark:text-gray-500">Shortcuts are active when no text field is focused.</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Undo Snackbar ────────────────────────────────────────────────── */}
      {undoEntry && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 rounded bg-gray-800 dark:bg-[#333] text-white shadow-xl elev-8 text-sm">
          <span>{undoEntry.description}</span>
          <button
            onClick={() => {
              if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
              undoEntry.restore();
              setUndoEntry(null);
            }}
            className="font-medium uppercase text-xs tracking-wider px-2 py-1 rounded hover:bg-white/10 transition-colors"
            style={{ color: accentColor }}
          >
            Undo
          </button>
          <button
            onClick={() => {
              if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
              setUndoEntry(null);
            }}
            className="text-gray-400 hover:text-white transition-colors text-lg leading-none"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
