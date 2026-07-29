import { useEffect, useState, useCallback } from 'react';

// ── Session token management ────────────────────────────────────────
const SESSION_KEY = 'm3u4me-session-token';

export function getSessionToken(): string | null {
  return sessionStorage.getItem(SESSION_KEY);
}

export function setSessionToken(token: string) {
  sessionStorage.setItem(SESSION_KEY, token);
}

export function clearSessionToken() {
  sessionStorage.removeItem(SESSION_KEY);
}

function authHeaders(): Record<string, string> {
  const token = getSessionToken();
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

/** Wraps fetch to inject auth token and handle 401s globally */
async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const headers = { ...authHeaders(), ...(options.headers as Record<string, string> || {}) };
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401 && !url.includes('/api/auth/')) {
    clearSessionToken();
    window.dispatchEvent(new Event('auth-expired'));
  }
  return res;
}

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
  getPlaylists: () => authFetch('/api/playlists').then(r => r.json()),
  createPlaylist: (name: string) => authFetch('/api/playlists', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({name}) }).then(r=>r.json()),
  updatePlaylist: (playlistId: string, updates: any) => authFetch(`/api/playlists/${playlistId}`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(updates) }),
  deletePlaylist: (playlistId: string) => authFetch(`/api/playlists/${playlistId}`, { method: 'DELETE' }),
  getChannels: (playlistId: string) => authFetch(`/api/playlists/${playlistId}/channels`).then(r => r.json()),
  updateChannel: (playlistId: string, channelId: string, updates: any) => authFetch(`/api/playlists/${playlistId}/channels/${channelId}`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(updates) }),
  deleteChannel: (playlistId: string, channelId: string) => authFetch(`/api/playlists/${playlistId}/channels/${channelId}`, { method: 'DELETE' }),
  bulkAddChannels: (playlistId: string, channels: any[]) => authFetch(`/api/playlists/${playlistId}/channels/bulk`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({channels}) }),
  bulkUpdateChannels: (playlistId: string, ids: string[], updates: any) => authFetch(`/api/playlists/${playlistId}/channels/bulk-update`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ids, updates}) }),
  bulkDeleteChannels: (playlistId: string, ids: string[]) => authFetch(`/api/playlists/${playlistId}/channels/bulk-delete`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ids}) }),
  reorderChannels: (playlistId: string, orders: Record<string, number>) => authFetch(`/api/playlists/${playlistId}/channels/reorder`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({orders}) }),
  search: (q: string) => authFetch(`/api/search?q=${encodeURIComponent(q)}`).then(r => r.json()),
  healthCheck: (channels: { id: string; url: string }[]) =>
    authFetch('/api/health-check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channels }) }).then(r => r.json()),
  bulkReplace: (playlistId: string, search: string, replace: string, field: string, ids?: string[]) =>
    authFetch(`/api/playlists/${playlistId}/channels/bulk-replace`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ search, replace, field, ...(ids ? { ids } : {}) }) }).then(r => r.json()),

  // Auth
  getAuthStatus: () => fetch('/api/auth/status').then(r => r.json()),
  login: (password: string) => fetch('/api/auth/login', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ password }) }).then(r => r.json().then(data => ({ ...data, ok: r.ok, status: r.status }))),
  setPassword: (password: string, currentPassword?: string) => authFetch('/api/auth/set-password', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ password, currentPassword }) }).then(r => r.json().then(data => ({ ...data, ok: r.ok, status: r.status }))),
  recover: (recoveryKey: string, newPassword: string) => fetch('/api/auth/recover', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ recoveryKey, newPassword }) }).then(r => r.json().then(data => ({ ...data, ok: r.ok, status: r.status }))),
  removePassword: (currentPassword: string) => authFetch('/api/auth/remove-password', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ currentPassword }) }).then(r => r.json().then(data => ({ ...data, ok: r.ok, status: r.status }))),
  logout: () => authFetch('/api/auth/logout', { method: 'POST' }),
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
