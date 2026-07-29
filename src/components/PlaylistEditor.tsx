import React, { useState, useMemo, useEffect, useRef } from 'react';
import { usePlaylists, useChannels, Channel, api, triggerRefresh } from '../apiClient';
import { useStore, contrastText } from '../store';
import { parseM3U } from '../utils/m3uParser';
import {
  Upload, Link as LinkIcon, Download, Check,
  GripVertical, CheckSquare, Square, Trash2, Eye, EyeOff, Plus, ArrowUp, ArrowDown, Activity, X,
  Replace, Search,
} from 'lucide-react';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

/* ── Inline text-field style used for in-row editing ─────────────────────── */
const inlineInputCls = 'border-b-2 border-blue-600 dark:border-blue-400 bg-transparent text-sm text-gray-900 dark:text-white px-0.5 py-0 focus:outline-none w-full';

const restrictToVerticalAxis = ({ transform }: any) => ({ ...transform, x: 0 });

/* ── Sortable channel row ─────────────────────────────────────────────────── */
type HealthStatus = 'checking' | 'ok' | 'error' | 'timeout' | 'skipped';
type HealthEntry = { status: HealthStatus; checkedAt: number };

function formatCheckedAt(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}, ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function HealthDot({ status }: { status: HealthStatus }) {
  const base = 'w-2 h-2 rounded-full shrink-0';
  if (status === 'checking') return <div className={`${base} bg-gray-400 dark:bg-gray-500 animate-pulse`} />;
  if (status === 'ok')       return <div className={`${base} bg-green-500`} />;
  if (status === 'error')    return <div className={`${base} bg-red-500`} />;
  if (status === 'timeout')  return <div className={`${base} bg-amber-400`} />;
  return <div className={`${base} bg-gray-300 dark:bg-gray-600`} />;
}

function SortableChannelItem({
  channel, isSelected, toggleSelection,
  onUpdate, onDelete, onToggleHide,
  activeEditId, setActiveEditId, colWidths, isHighlighted, rowIndex, onRightClick, healthSt,
}: {
  key?: string | number;
  channel: Channel;
  isSelected: boolean;
  toggleSelection: (id: string, shiftKey: boolean) => void;
  onUpdate: (id: string, field: string, value: string) => void;
  onDelete: (id: string) => void;
  onToggleHide: (id: string, isHidden: boolean) => void;
  activeEditId: string | null;
  setActiveEditId: (id: string | null) => void;
  colWidths: { name: number };
  isHighlighted: boolean;
  rowIndex: number;
  onRightClick: (e: React.MouseEvent) => void;
  healthSt?: HealthEntry;
}) {
  const { logoBgColor, hideUrls } = useStore();
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: channel.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  useEffect(() => {
    if (activeEditId !== channel.id && editingField) setEditingField(null);
  }, [activeEditId, channel.id, editingField]);

  const startEdit = (field: string, value: string) => {
    setEditingField(field);
    setEditValue(value);
    setActiveEditId(channel.id);
  };

  const saveEdit = () => {
    if (editingField && editValue !== (channel[editingField as keyof Channel] || '')) {
      onUpdate(channel.id, editingField, editValue);
    }
    setEditingField(null);
    if (activeEditId === channel.id) setActiveEditId(null);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') saveEdit();
    if (e.key === 'Escape') { setEditingField(null); if (activeEditId === channel.id) setActiveEditId(null); }
  };

  const rowBase = 'flex items-center h-14 border-b border-gray-100 dark:border-white/6 group transition-colors';
  const isEven = rowIndex % 2 === 0;
  const rowBg = channel.isHidden
    ? 'bg-red-50 dark:bg-red-950/25 amoled:dark:bg-red-950/35'
    : isHighlighted
      ? 'bg-amber-50 dark:bg-amber-900/20 amoled:dark:bg-amber-900/25'
      : isSelected
        ? 'bg-blue-50/60 dark:bg-blue-900/10 amoled:dark:bg-blue-900/20'
        : isEven
          ? 'bg-white dark:bg-[#1e1e1e] amoled:dark:bg-black hover:bg-gray-50 dark:hover:bg-white/3 amoled:dark:hover:bg-white/4'
          : 'bg-gray-50/70 dark:bg-[#222222] amoled:dark:bg-[#0d0d0d] hover:bg-gray-100/70 dark:hover:bg-white/5 amoled:dark:hover:bg-white/5';

  return (
    <div id={`ch-${channel.id}`} ref={setNodeRef} style={style} className={`${rowBase} ${rowBg}`} onContextMenu={onRightClick}>

      {/* Drag handle */}
      <div
        {...attributes} {...listeners}
        className="w-8 shrink-0 flex items-center justify-center cursor-grab active:cursor-grabbing text-gray-300 dark:text-gray-700"
      >
        <GripVertical className="h-4 w-4" />
      </div>

      {/* Checkbox */}
      <div className="w-8 shrink-0 flex items-center justify-center">
        <button
          onClick={e => toggleSelection(channel.id, e.shiftKey)}
          className="md-btn p-1 rounded-full text-gray-400 dark:text-gray-600 hover:text-blue-600 dark:hover:text-blue-400"
        >
          {isSelected
            ? <CheckSquare className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            : <Square className="h-4 w-4" />}
        </button>
      </div>

      {/* Logo — NOTE: no overflow:hidden here so the popup isn't clipped */}
      <div className="relative w-14 mx-3 shrink-0 flex items-center justify-center">
        <div
          className="cursor-pointer"
          onClick={e => { e.stopPropagation(); startEdit('logo', channel.logo || ''); }}
        >
          {channel.logo
            ? <img src={channel.logo} alt="" className="w-10 h-7 object-contain rounded border border-gray-200 dark:border-white/10 hover:border-blue-400" style={{ backgroundColor: logoBgColor === 'transparent' ? undefined : logoBgColor }} />
            : <div className="w-10 h-7 rounded border border-gray-200 dark:border-white/10 hover:border-blue-400 flex items-center justify-center text-[8px] font-bold text-gray-400 uppercase" style={{ backgroundColor: logoBgColor === 'transparent' ? undefined : logoBgColor }}>{channel.name.substring(0, 3)}</div>
          }
        </div>

        {/* Logo URL popover */}
        {editingField === 'logo' && (
          <div
            className="absolute top-9 left-0 z-30 w-64 bg-white dark:bg-[#272727] rounded elev-8 p-4"
            onClick={e => e.stopPropagation()}
          >
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Logo URL</label>
            <input
              autoFocus
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onKeyDown={handleKey}
              placeholder="https://…"
              className="w-full border border-gray-300 dark:border-gray-600 rounded px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:border-blue-600 bg-transparent text-gray-900 dark:text-white placeholder-gray-400 mb-3"
            />
            {editValue ? (
              <div className="w-10 h-7 mb-3 overflow-hidden rounded border border-gray-200 dark:border-white/10 flex items-center justify-center" style={{ backgroundColor: logoBgColor === 'transparent' ? undefined : logoBgColor }}>
                <img src={editValue} alt="Preview" className="w-full h-full object-contain" onError={e => (e.currentTarget.style.display = 'none')} />
              </div>
            ) : null}
            <div className="flex justify-end gap-1">
              <button onClick={() => setEditingField(null)} className="md-btn h-8 px-3 rounded text-[11px] font-medium uppercase tracking-wider text-gray-600 dark:text-gray-400">Cancel</button>
              <button onClick={saveEdit} className="md-btn h-8 px-3 rounded text-[11px] font-medium uppercase tracking-wider text-blue-700 dark:text-blue-400">Save</button>
            </div>
          </div>
        )}
      </div>

      {/* Name + URL */}
      <div className="shrink-0 pr-4 flex flex-col justify-center gap-0.5 overflow-hidden" style={{ width: colWidths.name }}>
        {editingField === 'name'
          ? <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)} onBlur={saveEdit} onKeyDown={handleKey} className={inlineInputCls} onClick={e => e.stopPropagation()} />
          : <p onClick={() => startEdit('name', channel.name)} className={`text-sm font-medium truncate cursor-text hover:underline decoration-dashed underline-offset-2 ${isSelected ? 'text-blue-700 dark:text-blue-400' : 'text-gray-900 dark:text-white'}`} title="Click to edit">{channel.name || 'Unnamed'}</p>
        }
        {!hideUrls && (editingField === 'url'
          ? <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)} onBlur={saveEdit} onKeyDown={handleKey} className={`${inlineInputCls} font-mono text-[11px]`} onClick={e => e.stopPropagation()} />
          : <p onClick={() => startEdit('url', channel.url || '')} className="text-[11px] font-mono text-gray-400 dark:text-gray-500 truncate cursor-text hover:underline decoration-dashed underline-offset-2" title="Click to edit">{channel.url || '— no url —'}</p>
        )}
      </div>

      {/* TVG ID — fills remaining space */}
      <div className="flex-1 pr-4 hidden md:flex items-center overflow-hidden">
        {editingField === 'tvgId'
          ? <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)} onBlur={saveEdit} onKeyDown={handleKey} className={`${inlineInputCls} font-mono text-[11px]`} onClick={e => e.stopPropagation()} />
          : <span onClick={() => startEdit('tvgId', channel.tvgId || '')} className={`font-mono text-[11px] truncate cursor-text hover:underline decoration-dashed underline-offset-2 ${channel.tvgId ? 'text-gray-500 dark:text-gray-400' : 'text-gray-300 dark:text-gray-600 italic'}`}>{channel.tvgId || '—'}</span>
        }
      </div>

      {/* Health status */}
      {healthSt && (
        <div className="hidden md:flex items-center gap-1.5 shrink-0 pr-4">
          <HealthDot status={healthSt.status} />
          {healthSt.status !== 'checking' && (
            <>
              <span className={`text-[11px] font-medium ${
                healthSt.status === 'ok'      ? 'text-green-600 dark:text-green-400' :
                healthSt.status === 'error'   ? 'text-red-500 dark:text-red-400' :
                healthSt.status === 'timeout' ? 'text-amber-500' :
                'text-gray-400 dark:text-gray-500'
              }`}>
                {healthSt.status === 'ok' ? 'Online' : healthSt.status === 'error' ? 'Offline' : healthSt.status === 'timeout' ? 'Timeout' : 'Skipped'}
              </span>
              <span className="text-[10px] font-mono text-gray-400 dark:text-gray-500">
                {formatCheckedAt(healthSt.checkedAt)}
              </span>
            </>
          )}
        </div>
      )}

      {/* Row actions */}
      <div className="w-16 shrink-0 flex items-center justify-end gap-0.5 pr-2">
        <button
          onClick={() => onToggleHide(channel.id, !!channel.isHidden)}
          className="md-btn p-1.5 rounded-full text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
          title={channel.isHidden ? 'Include in export' : 'Exclude from export'}
        >
          {channel.isHidden ? <EyeOff className="h-3.5 w-3.5 text-amber-500" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
        <button
          onClick={() => onDelete(channel.id)}
          className="md-btn p-1.5 rounded-full text-gray-400 hover:text-red-600 dark:hover:text-red-400"
          title="Delete channel"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

/* ── Main editor ──────────────────────────────────────────────────────────── */
export default function PlaylistEditor({ playlistId }: { playlistId: string }) {
  const { playlists } = usePlaylists();
  const playlist = playlists.find(p => p.id === playlistId);
  const { channels, loading } = useChannels(playlistId);

  const [importing, setImporting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showImportLink, setShowImportLink] = useState(false);
  const [importUrl, setImportUrl] = useState('');

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  const [bulkCategory, setBulkCategory] = useState('');
  const [showCategoryPrompt, setShowCategoryPrompt] = useState(false);
  const [newBulkCategoryName, setNewBulkCategoryName] = useState('');
  const [activeEditId, setActiveEditId] = useState<string | null>(null);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [colWidths, setColWidths] = useState(() => {
    // Fixed columns: drag(32) + checkbox(32) + logo+margin(80) + actions(64) + sidebar(256) ≈ 464px
    const available = Math.max(200, window.innerWidth - 464);
    return { name: Math.round(available * 0.7) };
  });
  const resizing = useRef<{ startX: number; startW: number } | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const pendingScrollId = useRef<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ channelId: string; x: number; y: number } | null>(null);
  const pendingInsert = useRef<{ newId: string; insertAfterIndex: number } | null>(null);
  const [healthStatus, setHealthStatus] = useState<Map<string, HealthEntry>>(new Map());
  const [healthProgress, setHealthProgress] = useState<{ done: number; total: number } | null>(null);
  const [showHealthMenu, setShowHealthMenu] = useState(false);
  const cancelHealthRef = useRef(false);
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [frSearch, setFrSearch] = useState('');
  const [frReplace, setFrReplace] = useState('');
  const [frScope, setFrScope] = useState<'playlist' | 'category' | 'selected'>('category');
  const [frField, setFrField] = useState<'url' | 'name'>('url');
  const [frResult, setFrResult] = useState<{ modified: number } | null>(null);
  const [frRunning, setFrRunning] = useState(false);

  const { activeCategory, accentColor, setUndoEntry } = useStore();
  const onAccent = contrastText(accentColor); // '#fff' or '#000' depending on luminance
  const onAccentMuted = onAccent === '#ffffff' ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.60)';

  const categories = useMemo(() => playlist?.categories || [], [playlist?.categories]);
  const displayedChannels = useMemo(() => channels.filter(c => c.category === activeCategory), [channels, activeCategory]);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageInputValue, setPageInputValue] = useState('1');
  const pageSize = 100;
  const listScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeCategory, playlistId, frSearch]);

  useEffect(() => {
    setPageInputValue(String(currentPage));
  }, [currentPage]);

  const handlePageChange = (p: number) => {
    setCurrentPage(p);
    listScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const totalPages = Math.max(1, Math.ceil(displayedChannels.length / pageSize));
  const paginatedChannels = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return displayedChannels.slice(start, start + pageSize);
  }, [displayedChannels, currentPage]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const typing = document.activeElement instanceof HTMLInputElement
        || document.activeElement instanceof HTMLTextAreaElement;
      if (typing || contextMenu) return;
      if (e.key === 'Escape' && selectedIds.size > 0) {
        setSelectedIds(new Set()); setLastSelectedId(null);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.size > 0) {
        e.preventDefault(); setShowBulkDeleteConfirm(true);
      } else if (e.key === ' ' && selectedIds.size > 0) {
        e.preventDefault();
        const selected = displayedChannels.filter(c => selectedIds.has(c.id));
        const shouldHide = selected.filter(c => c.isHidden).length < selected.length / 2;
        api.bulkUpdateChannels(playlistId, Array.from(selectedIds), { isHidden: shouldHide }).then(triggerRefresh);
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        e.preventDefault();
        setSelectedIds(new Set(displayedChannels.map(c => c.id)));
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [selectedIds, displayedChannels, playlistId, contextMenu]);

  useEffect(() => {
    if (!contextMenu) return;
    const dismiss = () => setContextMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') dismiss(); };
    document.addEventListener('mousedown', dismiss);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', dismiss);
      document.removeEventListener('keydown', onKey);
    };
  }, [contextMenu]);

  useEffect(() => {
    const pending = pendingInsert.current;
    if (!pending) return;
    const newCh = displayedChannels.find(c => c.id === pending.newId);
    if (!newCh) return;
    pendingInsert.current = null;

    const withoutNew = displayedChannels.filter(c => c.id !== pending.newId);
    const insertAt = Math.max(0, Math.min(pending.insertAfterIndex + 1, withoutNew.length));
    const reordered = [...withoutNew.slice(0, insertAt), newCh, ...withoutNew.slice(insertAt)];

    const orders: Record<string, number> = {};
    reordered.forEach((ch, i) => {
      if (ch.order !== displayedChannels[i].order) orders[ch.id] = displayedChannels[i].order;
    });

    if (Object.keys(orders).length > 0) {
      api.reorderChannels(playlistId, orders)
        .then(() => { pendingScrollId.current = pending.newId; triggerRefresh(); })
        .catch(console.error);
    } else {
      pendingScrollId.current = pending.newId;
    }
  }, [displayedChannels]);

  useEffect(() => {
    const id = pendingScrollId.current;
    if (!id) return;
    const el = document.getElementById(`ch-${id}`);
    if (!el) return;
    pendingScrollId.current = null;
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    setHighlightedId(id);
    const t = setTimeout(() => setHighlightedId(null), 2000);
    return () => clearTimeout(t);
  }, [displayedChannels]);

  if (!playlist) return null;

  const exportUrl = `${window.location.protocol}//${window.location.host}/${playlist.shortId}`;

  /* ── Handlers ──────────────────────────────────────────────────────────── */

  const importFromUrl = async () => {
    if (!importUrl) return;
    setImporting(true); setShowImportLink(false);
    try {
      const res = await fetch(`/api/proxy?url=${encodeURIComponent(importUrl)}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const parsed = parseM3U(await res.text());
      if (parsed.length > 0) { await api.bulkAddChannels(playlistId, parsed); triggerRefresh(); }
    } catch { alert('Failed to import. Check that the URL is accessible and returns valid M3U.'); }
    finally { setImporting(false); setImportUrl(''); }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const parsed = parseM3U(await file.text());
      if (parsed.length > 0) { await api.bulkAddChannels(playlistId, parsed); triggerRefresh(); }
    } catch (err) { console.error(err); }
    finally { setImporting(false); if (e.target) e.target.value = ''; }
  };

  const copyToClipboard = () => {
    const write = () => { setCopied(true); setTimeout(() => setCopied(false), 2000); };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(exportUrl).then(write).catch(fallback);
    } else {
      fallback();
    }
    function fallback() {
      // Works over plain HTTP on a local network where clipboard API is unavailable
      const el = document.createElement('textarea');
      el.value = exportUrl;
      el.style.cssText = 'position:fixed;opacity:0;top:0;left:0;';
      document.body.appendChild(el);
      el.select();
      try { document.execCommand('copy'); write(); } catch {}
      document.body.removeChild(el);
    }
  };

  const toggleSelection = (id: string, shiftKey: boolean) => {
    const next = new Set(selectedIds);
    if (shiftKey && lastSelectedId) {
      const a = displayedChannels.findIndex(c => c.id === lastSelectedId);
      const b = displayedChannels.findIndex(c => c.id === id);
      if (a !== -1 && b !== -1) for (let i = Math.min(a, b); i <= Math.max(a, b); i++) next.add(displayedChannels[i].id);
    } else {
      next.has(id) ? next.delete(id) : next.add(id);
    }
    setSelectedIds(next);
    setLastSelectedId(id);
  };

  const selectAll = () => {
    setSelectedIds(selectedIds.size === displayedChannels.length && displayedChannels.length > 0
      ? new Set()
      : new Set(displayedChannels.map(c => c.id)));
  };

  const handleChannelUpdate = async (id: string, field: string, value: string) => {
    try { await api.updateChannel(playlistId, id, { [field]: value.trim() || null }); triggerRefresh(); }
    catch (e) { console.error(e); }
  };

  const handleToggleHide = async (id: string, current: boolean) => {
    try { await api.updateChannel(playlistId, id, { isHidden: !current }); triggerRefresh(); }
    catch (e) { console.error(e); }
  };

  const handleSingleDelete = async (id: string) => {
    const channel = channels.find(c => c.id === id);
    if (!channel) return;
    try {
      await api.deleteChannel(playlistId, id);
      triggerRefresh();
      const { id: _id, playlistId: _pid, createdAt: _c, updatedAt: _u, ...rest } = channel;
      setUndoEntry({
        description: `Deleted "${channel.name}"`,
        restore: async () => { await api.bulkAddChannels(playlistId, [rest]); triggerRefresh(); },
      });
    } catch (e) { console.error(e); }
  };

  const executeBulkMove = async (targetCategory: string) => {
    if (!targetCategory) return;
    try {
      await api.bulkUpdateChannels(playlistId, Array.from(selectedIds), { category: targetCategory });
      triggerRefresh();
      setBulkCategory(''); setSelectedIds(new Set()); setLastSelectedId(null);
    } catch (e) { console.error(e); }
  };

  const handleBulkMove = async (val: string) => {
    if (val === 'NEW_CATEGORY') { setNewBulkCategoryName(''); setShowCategoryPrompt(true); }
    else if (val) await executeBulkMove(val);
  };

  const confirmBulkDelete = async () => {
    const toDelete = channels.filter(c => selectedIds.has(c.id));
    try {
      await api.bulkDeleteChannels(playlistId, Array.from(selectedIds));
      triggerRefresh(); setSelectedIds(new Set()); setLastSelectedId(null);
      const restoreData = toDelete.map(({ id: _id, playlistId: _pid, createdAt: _c, updatedAt: _u, ...rest }) => rest);
      setUndoEntry({
        description: `Deleted ${toDelete.length} channel${toDelete.length !== 1 ? 's' : ''}`,
        restore: async () => { await api.bulkAddChannels(playlistId, restoreData); triggerRefresh(); },
      });
    } catch (e) { console.error(e); }
    finally { setShowBulkDeleteConfirm(false); }
  };

  const handleDragEnd = async (event: any) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = displayedChannels.findIndex(c => c.id === active.id);
      const newIndex = displayedChannels.findIndex(c => c.id === over.id);
      const reordered = arrayMove(displayedChannels, oldIndex, newIndex) as Channel[];
      const start = Math.min(oldIndex, newIndex);
      const end = Math.max(oldIndex, newIndex);
      const orders: Record<string, number> = {};
      for (let i = start; i <= end; i++) orders[reordered[i].id] = displayedChannels[i].order;
      try { await api.reorderChannels(playlistId, orders); triggerRefresh(); } catch {}
    }
  };

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    resizing.current = { startX: e.clientX, startW: colWidths.name };
    const onMove = (ev: MouseEvent) => {
      if (!resizing.current) return;
      const w = Math.max(80, resizing.current.startW + ev.clientX - resizing.current.startX);
      setColWidths({ name: w });
    };
    const onUp = () => {
      resizing.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const handleInsertChannel = async (channelId: string, position: 'above' | 'below') => {
    setContextMenu(null);
    const targetIndex = displayedChannels.findIndex(c => c.id === channelId);
    if (targetIndex === -1) return;
    try {
      const resp = await api.bulkAddChannels(playlistId, [{
        name: 'New Channel', url: '', logo: '', tvgId: '',
        category: activeCategory || 'General',
        order: channels.length,
      }]);
      const data = await resp.json();
      if (data.ids?.[0]) {
        pendingInsert.current = {
          newId: data.ids[0],
          insertAfterIndex: position === 'above' ? targetIndex - 1 : targetIndex,
        };
      }
      triggerRefresh();
    } catch (e) { console.error(e); }
  };

  const handleAddChannel = async () => {
    try {
      const resp = await api.bulkAddChannels(playlistId, [{
        name: 'New Channel', url: '', logo: '', tvgId: '',
        category: activeCategory || 'General',
        order: channels.length,
      }]);
      const data = await resp.json();
      if (data.ids?.[0]) pendingScrollId.current = data.ids[0];
      triggerRefresh();
    } catch (e) { console.error(e); }
  };

  const runHealthCheck = async (toCheck: Channel[]) => {
    if (healthProgress) return;
    setShowHealthMenu(false);
    cancelHealthRef.current = false;
    const BATCH = 8;
    setHealthStatus(prev => {
      const next = new Map(prev);
      toCheck.forEach(c => next.set(c.id, { status: 'checking', checkedAt: 0 }));
      return next;
    });
    setHealthProgress({ done: 0, total: toCheck.length });
    for (let i = 0; i < toCheck.length; i += BATCH) {
      if (cancelHealthRef.current) break;
      const batch = toCheck.slice(i, i + BATCH);
      try {
        const { results } = await api.healthCheck(batch.map(c => ({ id: c.id, url: c.url })));
        setHealthStatus(prev => {
          const next = new Map(prev);
          const now = Date.now();
          results.forEach((r: any) => {
            const status: HealthStatus = r.skipped ? 'skipped' : r.timeout ? 'timeout' : r.ok ? 'ok' : 'error';
            next.set(r.id, { status, checkedAt: now });
          });
          return next;
        });
      } catch { /* leave batch as 'checking' on network failure */ }
      setHealthProgress({ done: Math.min(i + BATCH, toCheck.length), total: toCheck.length });
    }
    setHealthProgress(null);
  };

  const cancelHealthCheck = () => {
    cancelHealthRef.current = true;
    setHealthProgress(null);
    setHealthStatus((prev: Map<string, HealthEntry>) => {
      const next = new Map(prev);
      next.forEach((entry, id) => { if (entry.status === 'checking') next.delete(id); });
      return next;
    });
  };

  const publishExport = () => {
    // exportUrl already points to the short numeric route which serves the M3U directly
    window.location.href = exportUrl;
  };

  /* ── Render ────────────────────────────────────────────────────────────── */

  /* Toolbar button styles — adapt to whatever is readable on the accent bg */
  const toolbarBtn = `md-btn flex items-center gap-1.5 h-9 px-3 rounded text-xs font-medium uppercase tracking-wider`;
  const toolbarBtnOutlined = `${toolbarBtn} border`;

  return (
    <div className="flex flex-col h-full bg-gray-100 dark:bg-[#121212] amoled:dark:bg-black relative">

      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <header className="shrink-0 z-20 elev-4" style={{ backgroundColor: accentColor }}>
        <div className="flex items-center h-14 px-6 gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <h2 className="text-base font-medium truncate" style={{ color: onAccent }}>
              {playlist.name}
              {activeCategory && (
                <span className="font-light" style={{ color: onAccentMuted }}> / {activeCategory}</span>
              )}
            </h2>
            <span
              className="text-[11px] font-medium px-1.5 py-0.5 rounded shrink-0"
              style={{ backgroundColor: 'rgba(0,0,0,0.15)', color: onAccent }}
            >
              {channels.length}
            </span>
          </div>

          <div className="flex items-center gap-1 relative">
            <button
              onClick={copyToClipboard}
              className={toolbarBtnOutlined}
              style={{ color: onAccent, borderColor: `${onAccent}55` }}
              title="Copy export URL"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <LinkIcon className="h-3.5 w-3.5" />}
              <span>{copied ? 'Copied' : 'Copy link'}</span>
            </button>

            <button
              onClick={() => setShowImportLink(s => !s)}
              className={toolbarBtn}
              style={{ color: onAccent }}
            >
              <LinkIcon className="h-3.5 w-3.5" />
              <span>From URL</span>
            </button>

            <label
              className={`${importing ? 'opacity-50 pointer-events-none' : ''} ${toolbarBtn} cursor-pointer`}
              style={{ color: onAccent }}
            >
              <Upload className="h-3.5 w-3.5" />
              <span>{importing ? 'Importing…' : 'Upload'}</span>
              <input type="file" accept=".m3u,.m3u8" className="hidden" onChange={handleFileUpload} />
            </label>

            <button
              onClick={() => { setShowFindReplace(true); setFrSearch(''); setFrReplace(''); setFrResult(null); if (selectedIds.size > 0) setFrScope('selected'); else setFrScope('category'); }}
              disabled={channels.length === 0}
              className={`${toolbarBtn} disabled:opacity-40`}
              style={{ color: onAccent }}
              title="Find & Replace"
            >
              <Replace className="h-3.5 w-3.5" />
              <span>Replace</span>
            </button>

            <button
              onClick={publishExport}
              disabled={channels.length === 0}
              className={`${toolbarBtnOutlined} disabled:opacity-40`}
              style={{ color: onAccent, borderColor: `${onAccent}55`, backgroundColor: 'rgba(0,0,0,0.15)' }}
            >
              <Download className="h-3.5 w-3.5" />
              <span>Download</span>
            </button>

            {/* Health check button */}
            <div className="relative">
              {healthProgress ? (
                <div className="flex items-center gap-2 h-9 px-3" style={{ color: onAccentMuted }}>
                  <Activity className="h-3.5 w-3.5 animate-pulse" />
                  <span className="text-xs font-medium uppercase tracking-wider tabular-nums">
                    {healthProgress.done}/{healthProgress.total}
                  </span>
                  <button onClick={cancelHealthCheck} className="ml-1 opacity-70 hover:opacity-100" title="Cancel">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowHealthMenu(s => !s)}
                  className={toolbarBtn}
                  style={{ color: onAccent }}
                >
                  <Activity className="h-3.5 w-3.5" />
                  <span>Check</span>
                </button>
              )}
              {showHealthMenu && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setShowHealthMenu(false)} />
                  <div className="absolute right-0 top-full mt-1 w-52 bg-white dark:bg-[#272727] rounded elev-8 z-40 py-1 text-sm">
                    <button
                      onClick={() => runHealthCheck(displayedChannels)}
                      className="md-btn w-full flex items-center gap-2.5 px-4 py-2 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/8 text-left"
                    >
                      <Activity className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                      Check this category
                      <span className="ml-auto text-xs text-gray-400">{displayedChannels.length}</span>
                    </button>
                    <button
                      onClick={() => runHealthCheck(channels)}
                      className="md-btn w-full flex items-center gap-2.5 px-4 py-2 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/8 text-left"
                    >
                      <Activity className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                      Check entire playlist
                      <span className="ml-auto text-xs text-gray-400">{channels.length}</span>
                    </button>
                    {selectedIds.size > 0 && (
                      <button
                        onClick={() => runHealthCheck(channels.filter(c => selectedIds.has(c.id)))}
                        className="md-btn w-full flex items-center gap-2.5 px-4 py-2 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/8 text-left"
                      >
                        <Activity className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                        Check selected
                        <span className="ml-auto text-xs text-gray-400">{selectedIds.size}</span>
                      </button>
                    )}
                    {healthStatus.size > 0 && (
                      <>
                        <div className="border-t border-gray-100 dark:border-white/8 my-1" />
                        <button
                          onClick={() => { setHealthStatus(new Map()); setShowHealthMenu(false); }}
                          className="md-btn w-full flex items-center gap-2.5 px-4 py-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/8 text-left"
                        >
                          Clear results
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Import-URL popover — deliberately white/dark card, not accent-colored */}
            {showImportLink && (
              <div className="absolute top-12 right-0 w-80 bg-white dark:bg-[#272727] rounded elev-8 p-4 z-50">
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">M3U URL</label>
                <input
                  type="url"
                  value={importUrl}
                  onChange={e => setImportUrl(e.target.value)}
                  placeholder="http://example.com/playlist.m3u"
                  className="w-full border border-gray-300 dark:border-gray-600 rounded px-3 py-2 text-sm mb-3 focus:outline-none bg-transparent text-gray-900 dark:text-white placeholder-gray-400"
                  onFocus={e => (e.target.style.borderColor = accentColor)}
                  onBlur={e => (e.target.style.borderColor = '')}
                />
                <div className="flex justify-end gap-1">
                  <button onClick={() => setShowImportLink(false)} className="md-btn h-8 px-3 rounded text-xs font-medium uppercase tracking-wider text-gray-600 dark:text-gray-400">Cancel</button>
                  <button onClick={importFromUrl} disabled={!importUrl} className="md-btn h-8 px-3 rounded text-xs font-medium uppercase tracking-wider disabled:opacity-40" style={{ color: accentColor }}>Import</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Bulk-selection bar ────────────────────────────────────────────── */}
      {selectedIds.size > 0 && (
        <div className="shrink-0 h-12 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800/50 px-6 flex items-center justify-between gap-4">
          <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
            {selectedIds.size} selected
          </span>
          <div className="flex items-center gap-2">
            <select
              value={bulkCategory}
              onChange={e => handleBulkMove(e.target.value)}
              className="text-xs font-medium border border-blue-300 dark:border-blue-700 rounded h-8 px-2 focus:outline-none focus:border-blue-600 bg-white dark:bg-[#1e1e1e] text-gray-700 dark:text-gray-200"
            >
              <option value="">Move to…</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
              <option value="NEW_CATEGORY">+ New category…</option>
            </select>
            <button
              onClick={() => runHealthCheck(channels.filter(c => selectedIds.has(c.id)))}
              disabled={!!healthProgress}
              className="md-btn h-8 px-3 rounded text-xs font-medium uppercase tracking-wider text-gray-600 dark:text-gray-300 flex items-center gap-1 disabled:opacity-40"
            >
              <Activity className="h-3.5 w-3.5" /> Check
            </button>
            <button onClick={() => setShowBulkDeleteConfirm(true)} className="md-btn h-8 px-3 rounded text-xs font-medium uppercase tracking-wider text-red-600 dark:text-red-400 flex items-center gap-1">
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
            <button onClick={() => { setSelectedIds(new Set()); setLastSelectedId(null); }} className="md-btn h-8 px-3 rounded text-xs font-medium uppercase tracking-wider text-gray-600 dark:text-gray-400">
              Clear
            </button>
          </div>
        </div>
      )}

      {/* ── Channel list ─────────────────────────────────────────────────── */}
      <div ref={listScrollRef} className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-sm text-gray-400 dark:text-gray-500 animate-pulse">
            Loading channels…
          </div>
        ) : channels.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center mb-4">
              <Upload className="w-7 h-7 text-blue-500 dark:text-blue-400" />
            </div>
            <p className="text-base font-medium text-gray-700 dark:text-gray-300">No channels yet</p>
            <p className="mt-1 text-sm text-gray-400 dark:text-gray-500 max-w-xs">Import an M3U file using the Upload or From URL buttons above, or add one manually.</p>
            <button
              onClick={handleAddChannel}
              className="mt-5 md-btn flex items-center gap-1.5 h-9 px-4 rounded text-sm font-medium text-white elev-1"
              style={{ backgroundColor: accentColor }}
            >
              <Plus className="h-4 w-4" />
              Add channel
            </button>
          </div>
        ) : (
          <div className="bg-white dark:bg-[#1e1e1e] amoled:dark:bg-black">

            {/* Column header */}
            <div className="sticky top-0 z-10 flex items-center h-11 bg-gray-50 dark:bg-[#242424] amoled:dark:bg-[#111] border-b border-gray-200 dark:border-white/8 select-none">
              {/* drag + checkbox placeholders */}
              <div className="w-8 shrink-0" />
              <div className="w-8 shrink-0 flex items-center justify-center">
                <button onClick={selectAll} className="md-btn p-1 rounded-full text-gray-400 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-400">
                  {selectedIds.size === displayedChannels.length && displayedChannels.length > 0
                    ? <CheckSquare className="h-4 w-4" />
                    : <Square className="h-4 w-4" />}
                </button>
              </div>
              <div className="w-14 mx-3 shrink-0 text-[10px] font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 text-center">Logo</div>
              {/* Name column — resizable */}
              <div className="relative shrink-0 text-[10px] font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400" style={{ width: colWidths.name }}>
                Channel Name
                <div
                  onMouseDown={startResize}
                  className="absolute right-0 top-0 bottom-0 w-3 flex items-center justify-center cursor-col-resize"
                >
                  <div className="w-px h-4 bg-gray-300 dark:bg-white/20 rounded-full" />
                </div>
              </div>
              {/* TVG ID column — fills remaining space */}
              <div className="flex-1 pr-4 text-[10px] font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 hidden md:block">
                TVG / EPG ID
              </div>
              <div className="w-16 shrink-0 flex justify-end">
                <button onClick={handleAddChannel} className="md-btn flex items-center gap-1 h-7 px-3 text-white rounded text-[11px] font-medium uppercase tracking-wider elev-1" style={{ backgroundColor: accentColor }}>
                  <Plus className="h-3 w-3" />
                  <span>Add</span>
                </button>
              </div>
            </div>

            {/* Rows */}
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd} modifiers={[restrictToVerticalAxis]}>
              <SortableContext items={paginatedChannels.map(c => c.id)} strategy={verticalListSortingStrategy}>
                {paginatedChannels.map((channel, i) => (
                  <SortableChannelItem
                    key={channel.id}
                    channel={channel}
                    isSelected={selectedIds.has(channel.id)}
                    toggleSelection={toggleSelection}
                    onUpdate={handleChannelUpdate}
                    onDelete={handleSingleDelete}
                    onToggleHide={handleToggleHide}
                    activeEditId={activeEditId}
                    setActiveEditId={setActiveEditId}
                    colWidths={colWidths}
                    isHighlighted={channel.id === highlightedId}
                    rowIndex={i}
                    onRightClick={e => { e.preventDefault(); setContextMenu({ channelId: channel.id, x: e.clientX, y: e.clientY }); }}
                    healthSt={healthStatus.get(channel.id)}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </div>
        )}
      </div>

      {/* Pagination controls */}
      {totalPages > 1 && (
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-white/8 bg-gray-50 dark:bg-[#242424] amoled:dark:bg-[#111]">
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, displayedChannels.length)} of {displayedChannels.length} channels
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="md-btn px-3 py-1.5 rounded text-sm font-medium border border-gray-300 dark:border-gray-600 disabled:opacity-50 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5"
            >
              Previous
            </button>
            <div className="flex items-center gap-1.5 mx-1">
              <input
                type="number"
                min={1}
                max={totalPages}
                value={pageInputValue}
                onChange={e => setPageInputValue(e.target.value)}
                onBlur={() => {
                  const p = parseInt(pageInputValue, 10);
                  if (!isNaN(p) && p >= 1 && p <= totalPages) handlePageChange(p);
                  else setPageInputValue(String(currentPage));
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    const p = parseInt(pageInputValue, 10);
                    if (!isNaN(p) && p >= 1 && p <= totalPages) handlePageChange(p);
                    else setPageInputValue(String(currentPage));
                  }
                }}
                className="w-14 text-center border border-gray-300 dark:border-gray-600 rounded py-1 text-sm bg-white dark:bg-[#1e1e1e] text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
              />
              <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">/ {totalPages}</span>
            </div>
            <button
              onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className="md-btn px-3 py-1.5 rounded text-sm font-medium border border-gray-300 dark:border-gray-600 disabled:opacity-50 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5"
            >
              Next
            </button>
          </div>
        </div>
      )}


      {/* ── Context menu ─────────────────────────────────────────────────── */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-white dark:bg-[#272727] rounded elev-8 py-1 min-w-[200px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onMouseDown={e => e.stopPropagation()}
        >
          <button
            onClick={() => handleInsertChannel(contextMenu.channelId, 'above')}
            className="md-btn w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/8 text-left"
          >
            <ArrowUp className="h-4 w-4 shrink-0 text-gray-400" />
            Insert channel above
          </button>
          <button
            onClick={() => handleInsertChannel(contextMenu.channelId, 'below')}
            className="md-btn w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/8 text-left"
          >
            <ArrowDown className="h-4 w-4 shrink-0 text-gray-400" />
            Insert channel below
          </button>
        </div>
      )}

      {/* ── Dialog: Bulk move to new category ────────────────────────────── */}
      {showCategoryPrompt && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#272727] amoled:dark:bg-[#1a1a1a] rounded elev-24 max-w-sm w-full">
            <h2 className="text-xl font-medium text-gray-900 dark:text-white px-6 pt-6 pb-5">New Category</h2>
            <div className="px-6 pb-2">
              <input
                autoFocus
                value={newBulkCategoryName}
                onChange={e => setNewBulkCategoryName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') { executeBulkMove(newBulkCategoryName.trim()); setShowCategoryPrompt(false); }
                  if (e.key === 'Escape') { setShowCategoryPrompt(false); setBulkCategory(''); }
                }}
                placeholder="Category name"
                className="w-full border border-gray-400 dark:border-gray-500 rounded px-3 py-2.5 text-sm focus:outline-none focus:border-blue-700 dark:focus:border-blue-400 bg-transparent text-gray-900 dark:text-white placeholder-gray-400"
              />
            </div>
            <div className="flex justify-end gap-1 px-4 py-4">
              <button onClick={() => { setShowCategoryPrompt(false); setBulkCategory(''); }} className="md-btn h-9 px-4 rounded text-xs font-medium uppercase tracking-wider text-gray-600 dark:text-gray-300">Cancel</button>
              <button
                onClick={() => { executeBulkMove(newBulkCategoryName.trim()); setShowCategoryPrompt(false); }}
                disabled={!newBulkCategoryName.trim()}
                className="md-btn h-9 px-4 rounded text-xs font-medium uppercase tracking-wider text-blue-700 dark:text-blue-400 disabled:opacity-40"
              >
                Move
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Dialog: Bulk delete ───────────────────────────────────────────── */}
      {showBulkDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-sm bg-white dark:bg-[#272727] amoled:dark:bg-[#1a1a1a] rounded elev-24">
            <h2 className="text-xl font-medium text-gray-900 dark:text-white px-6 pt-6 pb-2">Delete Channels</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 px-6 pb-6">
              Delete {selectedIds.size} selected channel{selectedIds.size !== 1 ? 's' : ''}?
            </p>
            <div className="flex justify-end gap-1 px-4 pb-4">
              <button onClick={() => setShowBulkDeleteConfirm(false)} className="md-btn h-9 px-4 rounded text-xs font-medium uppercase tracking-wider text-gray-600 dark:text-gray-300">Cancel</button>
              <button onClick={confirmBulkDelete} className="md-btn h-9 px-4 rounded text-xs font-medium uppercase tracking-wider text-red-600 dark:text-red-400">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Dialog: Find & Replace ──────────────────────────────────────── */}
      {showFindReplace && (() => {
        // Compute scope channel IDs for preview
        const scopeChannels: Channel[] = frScope === 'playlist'
          ? channels
          : frScope === 'category'
            ? channels.filter(c => c.category === activeCategory)
            : frScope === 'selected'
              ? channels.filter(c => selectedIds.has(c.id))
              : [];
        const matchCount = frSearch
          ? scopeChannels.filter(c => c[frField]?.includes(frSearch)).length
          : 0;


        const handleExecuteReplace = async () => {
          if (!frSearch) return;
          setFrRunning(true);
          try {
            let ids: string[] | undefined;
            if (frScope === 'category') ids = channels.filter(c => c.category === activeCategory).map(c => c.id);
            else if (frScope === 'selected') ids = Array.from(selectedIds);
            // frScope === 'playlist' → ids = undefined (server replaces all)
            const result = await api.bulkReplace(playlistId, frSearch, frReplace, frField, ids);
            setFrResult({ modified: result.modified });
            if (result.modified > 0) triggerRefresh();
          } catch (e) { console.error(e); }
          finally { setFrRunning(false); }
        };

        return (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-[#272727] amoled:dark:bg-[#1a1a1a] rounded elev-24 max-w-md w-full">
              <h2 className="text-xl font-medium text-gray-900 dark:text-white px-6 pt-6 pb-4 flex items-center gap-2">
                <Replace className="h-5 w-5" />
                Find & Replace
              </h2>

              <div className="px-6 space-y-4">
                {/* Search input */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Find</label>
                  <input
                    autoFocus
                    value={frSearch}
                    onChange={e => { setFrSearch(e.target.value); setFrResult(null); }}
                    placeholder={`Text to find in ${frField === 'url' ? 'URLs' : 'names'}…`}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-blue-600 dark:focus:border-blue-400 bg-transparent text-gray-900 dark:text-white placeholder-gray-400"
                  />
                </div>

                {/* Replace input */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Replace with</label>
                  <input
                    value={frReplace}
                    onChange={e => { setFrReplace(e.target.value); setFrResult(null); }}
                    placeholder="Replacement text…"
                    className="w-full border border-gray-300 dark:border-gray-600 rounded px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-blue-600 dark:focus:border-blue-400 bg-transparent text-gray-900 dark:text-white placeholder-gray-400"
                  />
                </div>

                {/* Field selector */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Target Field</label>
                  <select
                    value={frField}
                    onChange={e => { setFrField(e.target.value as 'url' | 'name'); setFrResult(null); }}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded px-3 py-2.5 text-sm focus:outline-none focus:border-blue-600 dark:focus:border-blue-400 bg-transparent text-gray-900 dark:text-white"
                  >
                    <option value="url">Stream URL</option>
                    <option value="name">Channel Name</option>
                  </select>
                </div>

                {/* Scope selector */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Scope</label>
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-2.5 px-3 py-2 rounded hover:bg-gray-50 dark:hover:bg-white/5 cursor-pointer">
                      <input type="radio" name="fr-scope" value="playlist" checked={frScope === 'playlist'}
                        onChange={() => { setFrScope('playlist'); setFrResult(null); }}
                        className="accent-blue-600" />
                      <span className="text-sm text-gray-700 dark:text-gray-200">All channels in playlist</span>
                      <span className="ml-auto text-xs text-gray-400 tabular-nums">{channels.length}</span>
                    </label>
                    <label className="flex items-center gap-2.5 px-3 py-2 rounded hover:bg-gray-50 dark:hover:bg-white/5 cursor-pointer">
                      <input type="radio" name="fr-scope" value="category" checked={frScope === 'category'}
                        onChange={() => { setFrScope('category'); setFrResult(null); }}
                        className="accent-blue-600" />
                      <span className="text-sm text-gray-700 dark:text-gray-200">All in this category</span>
                      <span className="ml-auto text-xs text-gray-400">{activeCategory ?? '—'}</span>
                    </label>
                    <label className={`flex items-center gap-2.5 px-3 py-2 rounded ${selectedIds.size > 0 ? 'hover:bg-gray-50 dark:hover:bg-white/5 cursor-pointer' : 'opacity-60 cursor-default'}`}>
                      <input type="radio" name="fr-scope" value="selected" checked={frScope === 'selected'}
                        onChange={() => { if (selectedIds.size > 0) { setFrScope('selected'); setFrResult(null); } }}
                        disabled={selectedIds.size === 0}
                        className="accent-blue-600" />
                      <span className="text-sm text-gray-700 dark:text-gray-200">Selected channels only</span>
                      {selectedIds.size > 0 ? (
                        <span className="ml-auto text-xs text-gray-400 tabular-nums">{selectedIds.size}</span>
                      ) : (
                        <span className="ml-auto text-[10px] text-gray-500 italic">Select channels first</span>
                      )}
                    </label>

                  </div>
                </div>

                {/* Match preview */}
                {frSearch && (
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded bg-gray-50 dark:bg-white/5">
                    <Search className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                    <span className={`text-sm font-medium tabular-nums ${
                      matchCount > 0
                        ? 'text-blue-700 dark:text-blue-400'
                        : 'text-gray-400 dark:text-gray-500'
                    }`}>
                      {matchCount} of {scopeChannels.length} channel{scopeChannels.length !== 1 ? 's' : ''} match
                    </span>
                  </div>
                )}

                {/* Result message */}
                {frResult && (
                  <div className={`flex items-center gap-2 px-3 py-2.5 rounded ${
                    frResult.modified > 0
                      ? 'bg-green-50 dark:bg-green-900/20'
                      : 'bg-gray-50 dark:bg-white/5'
                  }`}>
                    <Check className={`h-3.5 w-3.5 shrink-0 ${
                      frResult.modified > 0 ? 'text-green-600 dark:text-green-400' : 'text-gray-400'
                    }`} />
                    <span className={`text-sm font-medium ${
                      frResult.modified > 0
                        ? 'text-green-700 dark:text-green-400'
                        : 'text-gray-500 dark:text-gray-400'
                    }`}>
                      {frResult.modified > 0
                        ? `Replaced in ${frResult.modified} channel${frResult.modified !== 1 ? 's' : ''}`
                        : 'No channels were modified'
                      }
                    </span>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-1 px-4 py-4">
                <button
                  onClick={() => setShowFindReplace(false)}
                  className="md-btn h-9 px-4 rounded text-xs font-medium uppercase tracking-wider text-gray-600 dark:text-gray-300"
                >
                  {frResult ? 'Done' : 'Cancel'}
                </button>
                <button
                  onClick={handleExecuteReplace}
                  disabled={!frSearch || matchCount === 0 || frRunning}
                  className="md-btn h-9 px-4 rounded text-xs font-medium uppercase tracking-wider disabled:opacity-40"
                  style={{ color: frSearch && matchCount > 0 ? accentColor : undefined }}
                >
                  {frRunning ? 'Replacing…' : 'Replace All'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}
