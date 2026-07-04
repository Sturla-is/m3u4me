import { useEffect, useState, useCallback } from 'react';

export interface Playlist {
  id: string;
  name: string;
  userId: string;
  categories: string[];
  exportId: string;
  shortId: number;
  createdAt: number;
  updatedAt: number;
}

export interface Channel {
  id: string;
  playlistId: string;
  name: string;
  url: string;
  logo: string | null;
  tvgId: string | null;
  category: string;
  order: number;
  isHidden?: boolean;
  createdAt: number;
  updatedAt: number;
}

// Custom event target for triggering refetches across components
export const dbEvents = new EventTarget();
export const triggerRefresh = () => dbEvents.dispatchEvent(new Event('refresh'));

export const api = {
  getPlaylists: () => fetch('/api/playlists').then(r => r.json()),
  createPlaylist: (name: string) => fetch('/api/playlists', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({name}) }).then(r=>r.json()),
  updatePlaylist: (playlistId: string, updates: any) => fetch(`/api/playlists/${playlistId}`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(updates) }),
  deletePlaylist: (playlistId: string) => fetch(`/api/playlists/${playlistId}`, { method: 'DELETE' }),
  getChannels: (playlistId: string) => fetch(`/api/playlists/${playlistId}/channels`).then(r => r.json()),
  updateChannel: (playlistId: string, channelId: string, updates: any) => fetch(`/api/playlists/${playlistId}/channels/${channelId}`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(updates) }),
  deleteChannel: (playlistId: string, channelId: string) => fetch(`/api/playlists/${playlistId}/channels/${channelId}`, { method: 'DELETE' }),
  bulkAddChannels: (playlistId: string, channels: any[]) => fetch(`/api/playlists/${playlistId}/channels/bulk`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({channels}) }),
  bulkUpdateChannels: (playlistId: string, ids: string[], updates: any) => fetch(`/api/playlists/${playlistId}/channels/bulk-update`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ids, updates}) }),
  bulkDeleteChannels: (playlistId: string, ids: string[]) => fetch(`/api/playlists/${playlistId}/channels/bulk-delete`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ids}) }),
  reorderChannels: (playlistId: string, orders: Record<string, number>) => fetch(`/api/playlists/${playlistId}/channels/reorder`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({orders}) }),
  search: (q: string) => fetch(`/api/search?q=${encodeURIComponent(q)}`).then(r => r.json()),
  healthCheck: (channels: { id: string; url: string }[]) =>
    fetch('/api/health-check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channels }) }).then(r => r.json())
};

export function usePlaylists() {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPl = useCallback(async () => {
    try {
      const data = await api.getPlaylists();
      setPlaylists(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPl();
    dbEvents.addEventListener('refresh', fetchPl);
    return () => dbEvents.removeEventListener('refresh', fetchPl);
  }, [fetchPl]);

  return { playlists, loading };
}

export function useChannels(playlistId: string | null) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [fetchedFor, setFetchedFor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchCh = useCallback(async () => {
    if (!playlistId) {
      setChannels([]);
      setFetchedFor(null);
      setLoading(false);
      return;
    }
    try {
      const data = await api.getChannels(playlistId);
      setChannels(data);
      setFetchedFor(playlistId);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [playlistId]);

  useEffect(() => {
    fetchCh();
    dbEvents.addEventListener('refresh', fetchCh);
    return () => dbEvents.removeEventListener('refresh', fetchCh);
  }, [fetchCh]);

  // Return empty channels synchronously when the fetched data is for a different playlist,
  // preventing stale channels from contaminating computations in the new playlist's context.
  return { channels: fetchedFor === playlistId ? channels : [], loading };
}
