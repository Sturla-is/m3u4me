import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useStore, accentAlpha } from '../store';
import { usePlaylists, useChannels, api, triggerRefresh } from '../apiClient';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2, Plus } from 'lucide-react';

const restrictToVerticalAxis = ({ transform }: any) => ({ ...transform, x: 0 });

function SortableCategoryItem({
  category, isActive, onClick, onDelete, count, accentColor,
  isRenaming, renameValue, onRenameStart, onRenameChange, onRenameConfirm, onRenameCancel,
}: {
  key?: string | number;
  category: string;
  isActive: boolean;
  onClick: () => void;
  onDelete: () => void;
  count: number;
  accentColor: string;
  isRenaming: boolean;
  renameValue: string;
  onRenameStart: () => void;
  onRenameChange: (v: string) => void;
  onRenameConfirm: () => void;
  onRenameCancel: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: category });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRenaming) inputRef.current?.select();
  }, [isRenaming]);

  return (
    <div ref={setNodeRef} style={{ ...style, backgroundColor: isActive ? accentAlpha(accentColor, '18') : undefined }} className="relative group flex items-center rounded hover:bg-gray-100 dark:hover:bg-white/6">
      {/* Active left indicator */}
      {isActive && (
        <div className="absolute left-0 top-1 bottom-1 w-0.5 rounded-r" style={{ backgroundColor: accentColor }} />
      )}

      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="pl-3 pr-1 py-3 cursor-grab active:cursor-grabbing text-gray-300 dark:text-gray-600"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </div>

      {/* Row content */}
      {isRenaming ? (
        <div className="flex-1 flex items-center h-11 pr-2 gap-2.5 min-w-0">
          <svg className="w-4 h-4 shrink-0 opacity-60 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 6h16M4 12h16m-7 6h7" />
          </svg>
          <input
            ref={inputRef}
            value={renameValue}
            onChange={e => onRenameChange(e.target.value)}
            onBlur={onRenameConfirm}
            onKeyDown={e => {
              if (e.key === 'Enter') onRenameConfirm();
              if (e.key === 'Escape') onRenameCancel();
            }}
            className="flex-1 min-w-0 text-sm font-medium bg-transparent border-b-2 border-blue-600 dark:border-blue-400 focus:outline-none text-gray-900 dark:text-white px-0.5"
          />
        </div>
      ) : (
        <button
          onClick={onClick}
          onDoubleClick={e => { e.stopPropagation(); onRenameStart(); }}
          className="flex-1 flex items-center h-11 pr-2 gap-2.5 text-sm font-medium text-left truncate transition-colors text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
          style={isActive ? { color: accentColor } : undefined}
        >
          <svg className="w-4 h-4 shrink-0 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 6h16M4 12h16m-7 6h7" />
          </svg>
          <span className="flex-1 truncate">{category}</span>
          <span
            className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${!isActive ? 'bg-gray-100 dark:bg-white/8 text-gray-500 dark:text-gray-400' : ''}`}
            style={isActive ? { backgroundColor: accentAlpha(accentColor, '22'), color: accentColor } : undefined}
          >
            {count}
          </span>
        </button>
      )}

      {/* Delete */}
      <button
        onClick={e => { e.stopPropagation(); onDelete(); }}
        className="md-btn p-1.5 mr-1 rounded-full text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-all"
        title="Delete category"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export default function CategoryList({ playlistId }: { playlistId: string }) {
  const { activeCategory, setActiveCategory, accentColor, setUndoEntry } = useStore();
  const { playlists } = usePlaylists();
  const { channels } = useChannels(playlistId);
  const playlist = playlists.find(p => p.id === playlistId);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [renamingCategory, setRenamingCategory] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const availableCats = useMemo(() => {
    const cats = new Set(channels.map(c => c.category).filter(Boolean));
    if (cats.size === 0 && channels.length > 0) cats.add('General');
    return cats;
  }, [channels]);

  const categories = useMemo(() => {
    const savedCats = playlist?.categories || [];
    const orderedCats: string[] = [];
    const seen = new Set<string>();
    savedCats.forEach(c => { orderedCats.push(c); seen.add(c); });
    availableCats.forEach(c => { if (!seen.has(c)) orderedCats.push(c); });
    return orderedCats;
  }, [playlist?.categories, availableCats]);

  useEffect(() => {
    if (!playlist) return;
    const same = playlist.categories?.length === categories.length
      && playlist.categories?.every((c, i) => c === categories[i]);
    if (!same && categories.length > 0) {
      api.updatePlaylist(playlistId, { categories }).then(triggerRefresh).catch(console.error);
    }
  }, [categories, playlist]);

  useEffect(() => {
    if (!activeCategory && categories.length > 0) {
      setActiveCategory(categories[0]);
    } else if (activeCategory && !categories.includes(activeCategory) && categories.length > 0) {
      setActiveCategory(categories[0]);
    }
  }, [categories, activeCategory, setActiveCategory]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    channels.forEach(c => { if (c.category) map.set(c.category, (map.get(c.category) || 0) + 1); });
    return map;
  }, [channels]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = async (event: any) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const newArray = arrayMove(categories, categories.indexOf(active.id as string), categories.indexOf(over.id as string));
      try {
        await api.updatePlaylist(playlistId, { categories: newArray });
        triggerRefresh();
      } catch (e) { console.error(e); }
    }
  };

  const confirmRenameCategory = async () => {
    const oldName = renamingCategory;
    const newName = renameValue.trim();
    setRenamingCategory(null);
    if (!oldName || !newName || newName === oldName) return;
    try {
      const toUpdate = channels.filter(c => c.category === oldName).map(c => c.id);
      if (toUpdate.length > 0) await api.bulkUpdateChannels(playlistId, toUpdate, { category: newName });
      const newCats = categories.map(c => c === oldName ? newName : c);
      await api.updatePlaylist(playlistId, { categories: newCats });
      if (activeCategory === oldName) setActiveCategory(newName);
      triggerRefresh();
    } catch (e) { console.error(e); }
  };

  const confirmDeleteCategory = async () => {
    if (!showDeleteConfirm || !playlist) return;
    const catName = showDeleteConfirm;
    const toDeleteChannels = channels.filter(c => c.category === catName);
    const toDeleteIds = toDeleteChannels.map(c => c.id);
    const remainingCats = categories.filter(c => c !== catName);
    setShowDeleteConfirm(null);
    try {
      if (toDeleteIds.length > 0) await api.bulkDeleteChannels(playlistId, toDeleteIds);
      await api.updatePlaylist(playlistId, { categories: remainingCats.length ? remainingCats : ['General'] });
      triggerRefresh();
      setUndoEntry({
        description: `Deleted category "${catName}" (${toDeleteChannels.length} channels)`,
        restore: async () => {
          const restoreData = toDeleteChannels.map(({ id: _id, playlistId: _pid, createdAt: _c, updatedAt: _u, ...rest }) => rest);
          if (restoreData.length > 0) await api.bulkAddChannels(playlistId, restoreData);
          await api.updatePlaylist(playlistId, { categories: [...remainingCats, catName] });
          triggerRefresh();
        },
      });
    } catch (e) { console.error(e); }
  };

  const handleAddCategory = async () => {
    const name = newCategoryName.trim();
    if (!name || !playlist) return;
    try {
      await api.updatePlaylist(playlistId, { categories: [...categories, name] });
      setActiveCategory(name);
      triggerRefresh();
    } catch (e) { console.error(e); }
    finally { setNewCategoryName(''); setShowAddCategory(false); }
  };

  if (!playlist) return null;

  return (
    <div className="mt-4">
      {/* Section header */}
      <div className="flex items-center px-4 pt-3 pb-1">
        <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-gray-500 dark:text-gray-400 flex-1">
          Categories
        </p>
        <button
          onClick={() => setShowAddCategory(true)}
          className="md-btn p-1 rounded-full text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
          title="Add category"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Sortable list */}
      <div className="px-2">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd} modifiers={[restrictToVerticalAxis]}>
          <SortableContext items={categories} strategy={verticalListSortingStrategy}>
            {categories.map(c => (
              <SortableCategoryItem
                key={c}
                category={c}
                isActive={activeCategory === c}
                count={counts.get(c) || 0}
                onClick={() => setActiveCategory(c)}
                onDelete={() => setShowDeleteConfirm(c)}
                accentColor={accentColor}
                isRenaming={renamingCategory === c}
                renameValue={renameValue}
                onRenameStart={() => { setRenamingCategory(c); setRenameValue(c); }}
                onRenameChange={setRenameValue}
                onRenameConfirm={confirmRenameCategory}
                onRenameCancel={() => setRenamingCategory(null)}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>

      {/* ── Dialog: Delete Category ────────────────────────────────────────── */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-sm bg-white dark:bg-[#272727] amoled:dark:bg-[#1a1a1a] rounded elev-24">
            <h2 className="text-xl font-medium text-gray-900 dark:text-white px-6 pt-6 pb-2">
              Delete Category
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 px-6 pb-6">
              Delete <strong className="text-gray-800 dark:text-gray-200">{showDeleteConfirm}</strong> and all its channels? This cannot be undone.
            </p>
            <div className="flex justify-end gap-1 px-4 pb-4">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="md-btn h-9 px-4 rounded text-xs font-medium uppercase tracking-wider text-gray-600 dark:text-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteCategory}
                className="md-btn h-9 px-4 rounded text-xs font-medium uppercase tracking-wider text-red-600 dark:text-red-400"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Dialog: Add Category ───────────────────────────────────────────── */}
      {showAddCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-sm bg-white dark:bg-[#272727] amoled:dark:bg-[#1a1a1a] rounded elev-24">
            <h2 className="text-xl font-medium text-gray-900 dark:text-white px-6 pt-6 pb-5">
              New Category
            </h2>
            <div className="px-6 pb-2">
              <input
                autoFocus
                value={newCategoryName}
                onChange={e => setNewCategoryName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleAddCategory();
                  if (e.key === 'Escape') { setShowAddCategory(false); setNewCategoryName(''); }
                }}
                placeholder="Category name"
                className="w-full border border-gray-400 dark:border-gray-500 rounded px-3 py-2.5 text-sm focus:outline-none focus:border-blue-700 dark:focus:border-blue-400 bg-transparent text-gray-900 dark:text-white placeholder-gray-400"
              />
            </div>
            <div className="flex justify-end gap-1 px-4 py-4">
              <button
                onClick={() => { setShowAddCategory(false); setNewCategoryName(''); }}
                className="md-btn h-9 px-4 rounded text-xs font-medium uppercase tracking-wider text-gray-600 dark:text-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={handleAddCategory}
                disabled={!newCategoryName.trim()}
                className="md-btn h-9 px-4 rounded text-xs font-medium uppercase tracking-wider text-blue-700 dark:text-blue-400 disabled:opacity-40"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
