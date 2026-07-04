import React, { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../apiClient';
import { useStore } from '../store';
import { Search, Tv, EyeOff } from 'lucide-react';

interface SearchResult {
  id: string;
  playlistId: string;
  playlistName: string;
  name: string;
  url: string;
  tvgId: string | null;
  logo: string | null;
  category: string;
  isHidden?: boolean;
}

function highlight(text: string, query: string) {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-transparent font-semibold" style={{ color: 'inherit' }}>
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

export default function Spotlight({ onNavigate }: {
  onNavigate: (playlistId: string, category: string, channelId: string) => void;
}) {
  const { accentColor, logoBgColor } = useStore();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setResults([]);
    setActiveIndex(0);
  }, []);

  // Open on Cmd/Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(o => !o);
      }
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [close]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) { setResults([]); setLoading(false); return; }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await api.search(query);
        setResults(data);
        setActiveIndex(0);
      } catch { setResults([]); }
      finally { setLoading(false); }
    }, 180);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${activeIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const select = (r: SearchResult) => {
    onNavigate(r.playlistId, r.category, r.id);
    close();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(i => Math.min(i + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && results[activeIndex]) select(results[activeIndex]);
    else if (e.key === 'Escape') close();
  };

  if (!open) return null;

  // Group results by playlist
  const grouped: Record<string, SearchResult[]> = {};
  for (const r of results) {
    if (!grouped[r.playlistName]) grouped[r.playlistName] = [];
    grouped[r.playlistName].push(r);
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center pt-[15vh] px-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onMouseDown={e => { if (e.target === e.currentTarget) close(); }}
    >
      <div
        className="w-full max-w-xl bg-white/90 dark:bg-[#1e1e1e]/95 amoled:dark:bg-[#111]/95 rounded-2xl overflow-hidden"
        style={{ boxShadow: '0 32px 80px rgba(0,0,0,0.45), 0 0 0 1px rgba(0,0,0,0.08)' }}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-200/70 dark:border-white/8">
          <Search className="h-5 w-5 shrink-0 text-gray-400 dark:text-gray-500" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search channels, URLs, TVG IDs…"
            className="flex-1 bg-transparent text-base text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none"
          />
          {loading && (
            <svg className="h-4 w-4 shrink-0 animate-spin text-gray-400" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          )}
          <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium font-mono bg-gray-100 dark:bg-white/10 text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-white/10">
            Esc
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[54vh] overflow-y-auto overscroll-contain">
          {!query.trim() ? (
            <div className="flex flex-col items-center justify-center py-10 text-sm text-gray-400 dark:text-gray-500 gap-2">
              <Search className="h-8 w-8 opacity-30" />
              <span>Type to search across all playlists</span>
            </div>
          ) : results.length === 0 && !loading ? (
            <div className="flex flex-col items-center justify-center py-10 text-sm text-gray-400 dark:text-gray-500 gap-2">
              <span>No results for <strong className="text-gray-600 dark:text-gray-300">"{query}"</strong></span>
            </div>
          ) : (
            <div className="pb-2">
              {Object.entries(grouped).map(([playlistName, items]) => (
                <div key={playlistName}>
                  {/* Group header */}
                  <div className="px-5 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400 dark:text-gray-500">
                    {playlistName}
                  </div>
                  {items.map(r => {
                    const globalIdx = results.indexOf(r);
                    const isActive = globalIdx === activeIndex;
                    return (
                      <div
                        key={r.id}
                        data-idx={globalIdx}
                        onMouseEnter={() => setActiveIndex(globalIdx)}
                        onClick={() => select(r)}
                        className="flex items-center gap-3 mx-2 px-3 py-2.5 rounded-xl cursor-pointer transition-colors"
                        style={isActive ? { backgroundColor: `${accentColor}18` } : undefined}
                      >
                        {/* Logo / icon */}
                        <div
                          className="w-9 h-7 shrink-0 rounded overflow-hidden flex items-center justify-center border border-gray-200/60 dark:border-white/8"
                          style={{ backgroundColor: logoBgColor === 'transparent' ? undefined : logoBgColor }}
                        >
                          {r.logo
                            ? <img src={r.logo} alt="" className="w-full h-full object-contain" onError={e => { e.currentTarget.style.display = 'none'; }} />
                            : <Tv className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />
                          }
                        </div>

                        {/* Text */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-sm font-medium truncate ${isActive ? '' : 'text-gray-900 dark:text-white'}`} style={isActive ? { color: accentColor } : undefined}>
                              {highlight(r.name || 'Unnamed', query)}
                            </span>
                            {r.isHidden && <EyeOff className="h-3 w-3 shrink-0 text-amber-500" />}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            {r.url && (
                              <span className="text-[11px] font-mono text-gray-400 dark:text-gray-500 truncate">
                                {highlight(r.url, query)}
                              </span>
                            )}
                            {r.tvgId && (
                              <span className="shrink-0 text-[10px] font-mono px-1.5 py-px rounded bg-gray-100 dark:bg-white/8 text-gray-500 dark:text-gray-400">
                                {highlight(r.tvgId, query)}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Category pill */}
                        <span className="shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 dark:bg-white/8 text-gray-500 dark:text-gray-400 hidden sm:inline">
                          {r.category}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer hint */}
        {results.length > 0 && (
          <div className="flex items-center gap-3 px-5 py-2.5 border-t border-gray-200/70 dark:border-white/8 text-[11px] text-gray-400 dark:text-gray-500">
            <span><kbd className="font-mono">↑↓</kbd> navigate</span>
            <span><kbd className="font-mono">↵</kbd> open</span>
            <span className="ml-auto">{results.length} result{results.length !== 1 ? 's' : ''}</span>
          </div>
        )}
      </div>
    </div>
  );
}
