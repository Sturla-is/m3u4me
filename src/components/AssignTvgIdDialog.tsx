import React, { useState, useEffect } from 'react';
import { Search, ChevronDown, ChevronRight, Check, Loader2 } from 'lucide-react';
import { api, usePlaylists, triggerRefresh, Channel } from '../apiClient';
import { useStore, notifyError, notifyInfo } from '../store';
import ChannelLogo from './ChannelLogo';
import Dialog from './Dialog';

interface AssignTvgIdDialogProps {
  open: boolean;
  onClose: () => void;
  epgChannelId: string;
  epgDisplayName: string;
}

export default function AssignTvgIdDialog({ open, onClose, epgChannelId, epgDisplayName }: AssignTvgIdDialogProps) {
  const { playlists } = usePlaylists();
  const { accentColor, logoBgColor } = useStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedPlaylists, setExpandedPlaylists] = useState<Set<string>>(new Set());
  // Playlists the user has explicitly expanded/collapsed themselves - search-driven
  // auto-expand/collapse never overrides a playlist once the user has touched it.
  const [manualToggles, setManualToggles] = useState<Set<string>>(new Set());
  const [playlistChannels, setPlaylistChannels] = useState<Record<string, Channel[]>>({});
  const [loadingPlaylists, setLoadingPlaylists] = useState<Set<string>>(new Set());
  const [selectedChannels, setSelectedChannels] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setSearchQuery('');
      setExpandedPlaylists(new Set());
      setManualToggles(new Set());
      setSelectedChannels(new Set());
    }
  }, [open]);

  const loadPlaylistChannels = async (playlistId: string) => {
    if (playlistChannels[playlistId] || loadingPlaylists.has(playlistId)) return;
    setLoadingPlaylists((prev) => new Set(prev).add(playlistId));
    try {
      const channels = await api.getChannels(playlistId);
      setPlaylistChannels((prev) => ({ ...prev, [playlistId]: channels }));
    } catch (error) {
      console.error('Failed to load channels', error);
      notifyError(error, 'Failed to load channels.');
    } finally {
      setLoadingPlaylists((prev) => {
        const next = new Set(prev);
        next.delete(playlistId);
        return next;
      });
    }
  };

  // While searching, fetch every playlist's channels (not just the ones the user
  // happened to expand already) so the search can actually find matches anywhere.
  useEffect(() => {
    if (!open || !searchQuery.trim()) return;
    playlists.forEach((p) => loadPlaylistChannels(p.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, searchQuery, playlists]);

  // Auto-expand playlists that have a match while searching, and auto-collapse ones
  // that don't - but never fight a playlist the user has explicitly toggled themselves.
  useEffect(() => {
    if (!searchQuery.trim()) return;
    setExpandedPlaylists((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const playlist of playlists) {
        if (manualToggles.has(playlist.id)) continue;
        const channels = playlistChannels[playlist.id];
        if (!channels) continue;
        const hasMatch = channels.some((c) => (c.name || '').toLowerCase().includes(searchQuery.toLowerCase()));
        if (hasMatch && !next.has(playlist.id)) {
          next.add(playlist.id);
          changed = true;
        } else if (!hasMatch && next.has(playlist.id)) {
          next.delete(playlist.id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [searchQuery, playlistChannels, playlists, manualToggles]);

  if (!open) return null;

  const togglePlaylist = (playlistId: string) => {
    setManualToggles((prev) => new Set(prev).add(playlistId));
    setExpandedPlaylists((prev) => {
      const next = new Set(prev);
      if (next.has(playlistId)) {
        next.delete(playlistId);
      } else {
        next.add(playlistId);
        loadPlaylistChannels(playlistId);
      }
      return next;
    });
  };

  const toggleChannelSelection = (channelId: string) => {
    const newSelected = new Set(selectedChannels);
    if (newSelected.has(channelId)) {
      newSelected.delete(channelId);
    } else {
      newSelected.add(channelId);
    }
    setSelectedChannels(newSelected);
  };

  const handleAssign = async () => {
    setIsSubmitting(true);
    try {
      // Group selected channels by playlist so each playlist gets one batched
      // bulk-update-many request instead of one individual PUT per channel — the same
      // endpoint BulkEpgAssignDialog already uses for this exact kind of change.
      const updatesByPlaylist = new Map<string, { id: string; changes: any }[]>();
      for (const playlistId of Object.keys(playlistChannels)) {
        const channels = playlistChannels[playlistId];
        for (const channel of channels) {
          if (selectedChannels.has(channel.id)) {
            if (!updatesByPlaylist.has(playlistId)) updatesByPlaylist.set(playlistId, []);
            updatesByPlaylist.get(playlistId)!.push({ id: channel.id, changes: { tvgId: epgChannelId } });
          }
        }
      }
      const count = selectedChannels.size;
      await Promise.all(
        Array.from(updatesByPlaylist.entries()).map(([playlistId, updates]) =>
          api.bulkUpdateManyChannels(playlistId, updates)
        )
      );
      triggerRefresh();
      onClose();
      notifyInfo(`Assigned EPG to ${count} ${count === 1 ? 'channel' : 'channels'}.`);
    } catch (error) {
      console.error('Failed to assign tvg-id', error);
      notifyError(error, 'Failed to assign EPG source.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog onClose={onClose} maxWidth="max-w-md" panelClassName="rounded max-h-[70vh]">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-100 dark:border-white/10 shrink-0">
          <h2 className="text-xl font-medium text-gray-900 dark:text-white mb-2">Assign EPG Source</h2>
          <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-black/20 rounded">
            <div className="w-10 h-10 rounded bg-gray-200 dark:bg-white/10 flex items-center justify-center shrink-0 overflow-hidden">
              <span className="text-sm font-bold text-gray-400">EPG</span>
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-medium text-gray-900 dark:text-white truncate">{epgDisplayName}</span>
              <span className="text-xs text-gray-500 dark:text-gray-400 truncate">{epgChannelId}</span>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="px-6 py-3 border-b border-gray-100 dark:border-white/10 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search channels..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-full pl-9 pr-4 py-2 text-sm focus:outline-none bg-gray-50 dark:bg-black/20 text-gray-900 dark:text-white placeholder-gray-400"
              style={{ '--tw-ring-color': accentColor } as React.CSSProperties}
              onFocus={(e) => (e.target.style.borderColor = accentColor)}
              onBlur={(e) => (e.target.style.borderColor = '')}
            />
          </div>
        </div>

        {/* Playlists List */}
        <div className="flex-1 overflow-y-auto p-2">
          {playlists.map((playlist) => {
            const isExpanded = expandedPlaylists.has(playlist.id);
            const isLoading = loadingPlaylists.has(playlist.id);
            const channels = playlistChannels[playlist.id] || [];
            const filteredChannels = channels.filter((c) => (c.name || '').toLowerCase().includes(searchQuery.toLowerCase()));

            return (
              <div key={playlist.id} className="mb-1">
                <button
                  onClick={() => togglePlaylist(playlist.id)}
                  className="w-full flex items-center gap-2 p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded text-left"
                >
                  {isExpanded ? <ChevronDown className="h-4 w-4 text-gray-500" /> : <ChevronRight className="h-4 w-4 text-gray-500" />}
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{playlist.name}</span>
                  {isLoading && <Loader2 className="h-3 w-3 animate-spin text-gray-400 ml-auto" />}
                </button>

                {isExpanded && !isLoading && (
                  <div className="pl-6 pr-2 py-1 space-y-1">
                    {filteredChannels.length === 0 ? (
                      <div className="text-xs text-gray-500 py-2">No matching channels</div>
                    ) : (
                      <>
                        {filteredChannels.slice(0, 100).map((channel) => {
                          const isAssigned = channel.tvgId === epgChannelId;
                          const isSelected = selectedChannels.has(channel.id);

                          return (
                            <div
                              key={channel.id}
                              className="flex items-center gap-3 p-2 rounded hover:bg-gray-50 dark:hover:bg-white/5"
                            >
                              {isAssigned ? (
                                <div className="w-4 h-4 flex items-center justify-center rounded-sm" style={{ color: accentColor }}>
                                  <Check className="w-4 h-4" />
                                </div>
                              ) : (
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleChannelSelection(channel.id)}
                                  className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 focus:ring-0"
                                  style={{ accentColor }}
                                />
                              )}
                              
                              <ChannelLogo
                                logo={channel.logo}
                                name={channel.name}
                                logoBgColor={logoBgColor}
                                className="w-6 h-6 rounded"
                              />
                              
                              <div className="flex flex-col min-w-0 flex-1">
                                <span className="text-sm text-gray-800 dark:text-gray-200 truncate">{channel.name || 'Unnamed'}</span>
                                {channel.tvgId && !isAssigned && (
                                  <span className="text-[10px] text-gray-400 dark:text-gray-500 truncate">{channel.tvgId}</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                        {filteredChannels.length > 100 && (
                          <div className="text-xs text-center text-gray-500 dark:text-gray-400 pt-2 pb-1 italic">
                            Showing 100 of {filteredChannels.length}. Use search to find more.
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 dark:border-white/10 shrink-0 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="md-btn h-9 px-4 rounded text-xs font-medium uppercase tracking-wider text-gray-600 dark:text-gray-300"
          >
            Cancel
          </button>
          <button
            onClick={handleAssign}
            disabled={selectedChannels.size === 0 || isSubmitting}
            className="md-btn h-9 px-4 rounded text-xs font-medium uppercase tracking-wider disabled:opacity-40 flex items-center gap-2"
            style={{ color: accentColor }}
          >
            {isSubmitting && <Loader2 className="w-3 h-3 animate-spin" />}
            Assign to {selectedChannels.size} {selectedChannels.size === 1 ? 'channel' : 'channels'}
          </button>
        </div>
    </Dialog>
  );
}
