import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";

const DATA_DIR = path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_FILE = path.join(DATA_DIR, "db.json");

// Define types matching frontend
interface Playlist {
  id: string;
  name: string;
  userId: string;
  categories: string[];
  exportId: string;
  shortId: number;
  createdAt: number;
  updatedAt: number;
}

interface Channel {
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

interface Database {
  playlists: Playlist[];
  channels: Channel[];
}

// Initial DB
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify({ playlists: [], channels: [] }, null, 2));
}

// Simple DB sync functions (fine for local single-user apps)
function readDb(): Database {
  try {
    const data = fs.readFileSync(DB_FILE, "utf-8");
    return JSON.parse(data);
  } catch (e) {
    return { playlists: [], channels: [] };
  }
}

function writeDb(data: Database) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// ── Auth helpers ─────────────────────────────────────────────────────────
const AUTH_FILE = path.join(DATA_DIR, 'auth.json');
const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_KEYLEN = 64;
const PBKDF2_DIGEST = 'sha512';

interface AuthData {
  passwordHash: string;  // hex
  passwordSalt: string;  // hex
  recoveryKeyHash: string;  // hex
  recoveryKeySalt: string;  // hex
}

const activeSessions = new Set<string>();

function readAuth(): AuthData | null {
  try {
    if (!fs.existsSync(AUTH_FILE)) return null;
    return JSON.parse(fs.readFileSync(AUTH_FILE, 'utf-8'));
  } catch { return null; }
}

function writeAuth(data: AuthData) {
  fs.writeFileSync(AUTH_FILE, JSON.stringify(data, null, 2));
}

function deleteAuth() {
  if (fs.existsSync(AUTH_FILE)) fs.unlinkSync(AUTH_FILE);
  activeSessions.clear();
}

function hashPassword(password: string, salt?: string): Promise<{ hash: string; salt: string }> {
  return new Promise((resolve, reject) => {
    const s = salt || crypto.randomBytes(32).toString('hex');
    crypto.pbkdf2(password, s, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST, (err, key) => {
      if (err) reject(err);
      else resolve({ hash: key.toString('hex'), salt: s });
    });
  });
}

function generateToken(): string {
  return crypto.randomBytes(64).toString('hex');
}

function generateRecoveryKey(): string {
  // 24-char alphanumeric, grouped as XXXX-XXXX-XXXX-XXXX-XXXX-XXXX for readability
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O/1/I
  let key = '';
  const bytes = crypto.randomBytes(24);
  for (let i = 0; i < 24; i++) key += chars[bytes[i] % chars.length];
  return key;
}

function formatRecoveryKey(key: string): string {
  return key.match(/.{1,4}/g)!.join('-');
}

// Assign shortIds to any playlists that pre-date this feature
function migrateShortIds() {
  const db = readDb();
  let max = Math.max(0, ...db.playlists.map(p => p.shortId || 0));
  let changed = false;
  for (const pl of db.playlists) {
    if (!pl.shortId) { pl.shortId = ++max; changed = true; }
  }
  if (changed) writeDb(db);
}
migrateShortIds();

function serveM3U(playlist: Playlist, db: Database, res: any) {
  const catIndex = new Map(playlist.categories.map((cat, i) => [cat, i]));
  const channels = db.channels
    .filter(c => c.playlistId === playlist.id && !c.isHidden)
    .sort((a, b) => {
      const catA = catIndex.has(a.category) ? catIndex.get(a.category)! : playlist.categories.length;
      const catB = catIndex.has(b.category) ? catIndex.get(b.category)! : playlist.categories.length;
      if (catA !== catB) return catA - catB;
      return a.order - b.order;
    });
  res.setHeader("Content-Type", "audio/x-mpegurl");
  res.setHeader("Content-Disposition", `inline; filename="${playlist.shortId}.m3u"`);
  let m3u = "#EXTM3U\n";
  channels.forEach(ch => {
    let extinf = `#EXTINF:-1`;
    if (ch.tvgId) extinf += ` tvg-id="${ch.tvgId}"`;
    if (ch.logo)  extinf += ` tvg-logo="${ch.logo}"`;
    if (ch.category) extinf += ` group-title="${ch.category}"`;
    extinf += `,${ch.name}\n${ch.url}\n`;
    m3u += extinf;
  });
  res.send(m3u);
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 8080;

  app.use(express.json({ limit: '50mb' }));

  // ── Auth middleware ──────────────────────────────────────────────────
  const publicPaths = ['/auth/status', '/auth/login', '/auth/recover'];
  app.use('/api', (req, res, next) => {
    // Skip auth for public auth endpoints
    if (publicPaths.includes(req.path)) return next();
    // Skip auth for M3U serving endpoints handled outside /api
    const auth = readAuth();
    if (!auth) return next(); // No password set — allow all
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const token = header.slice(7);
    if (!activeSessions.has(token)) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }
    next();
  });

  // ── Auth routes ────────────────────────────────────────────────────
  app.get('/api/auth/status', (_req, res) => {
    const auth = readAuth();
    res.json({ enabled: !!auth });
  });

  app.post('/api/auth/login', async (req, res) => {
    const auth = readAuth();
    if (!auth) return res.json({ token: null, message: 'No password set' });
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'Password required' });
    try {
      const { hash } = await hashPassword(password, auth.passwordSalt);
      if (hash !== auth.passwordHash) {
        return res.status(401).json({ error: 'Incorrect password' });
      }
      const token = generateToken();
      activeSessions.add(token);
      res.json({ token });
    } catch {
      res.status(500).json({ error: 'Internal error' });
    }
  });

  app.post('/api/auth/set-password', async (req, res) => {
    const auth = readAuth();
    const { password, currentPassword } = req.body;
    if (!password || password.length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters' });
    }
    // If a password is already set, verify the current one
    if (auth) {
      if (!currentPassword) return res.status(400).json({ error: 'Current password required' });
      const { hash } = await hashPassword(currentPassword, auth.passwordSalt);
      if (hash !== auth.passwordHash) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }
    }
    try {
      const { hash: passwordHash, salt: passwordSalt } = await hashPassword(password);
      const recoveryKey = generateRecoveryKey();
      const { hash: recoveryKeyHash, salt: recoveryKeySalt } = await hashPassword(recoveryKey);
      writeAuth({ passwordHash, passwordSalt, recoveryKeyHash, recoveryKeySalt });
      res.json({ recoveryKey: formatRecoveryKey(recoveryKey) });
    } catch {
      res.status(500).json({ error: 'Internal error' });
    }
  });

  app.post('/api/auth/recover', async (req, res) => {
    const auth = readAuth();
    if (!auth) return res.status(400).json({ error: 'No password set' });
    const { recoveryKey, newPassword } = req.body;
    if (!recoveryKey || !newPassword) {
      return res.status(400).json({ error: 'Recovery key and new password required' });
    }
    if (newPassword.length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters' });
    }
    try {
      // Strip formatting dashes from recovery key
      const cleanKey = recoveryKey.replace(/-/g, '').toUpperCase();
      const { hash } = await hashPassword(cleanKey, auth.recoveryKeySalt);
      if (hash !== auth.recoveryKeyHash) {
        return res.status(401).json({ error: 'Invalid recovery key' });
      }
      const { hash: passwordHash, salt: passwordSalt } = await hashPassword(newPassword);
      const newRecoveryKey = generateRecoveryKey();
      const { hash: recoveryKeyHash, salt: recoveryKeySalt } = await hashPassword(newRecoveryKey);
      writeAuth({ passwordHash, passwordSalt, recoveryKeyHash, recoveryKeySalt });
      // Clear all existing sessions
      activeSessions.clear();
      // Create a new session for the user
      const token = generateToken();
      activeSessions.add(token);
      res.json({ token, recoveryKey: formatRecoveryKey(newRecoveryKey) });
    } catch {
      res.status(500).json({ error: 'Internal error' });
    }
  });

  app.post('/api/auth/remove-password', async (req, res) => {
    const auth = readAuth();
    if (!auth) return res.json({ success: true });
    const { currentPassword } = req.body;
    if (!currentPassword) return res.status(400).json({ error: 'Current password required' });
    try {
      const { hash } = await hashPassword(currentPassword, auth.passwordSalt);
      if (hash !== auth.passwordHash) {
        return res.status(401).json({ error: 'Incorrect password' });
      }
      deleteAuth();
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: 'Internal error' });
    }
  });

  app.post('/api/auth/logout', (_req, res) => {
    const header = _req.headers.authorization;
    if (header && header.startsWith('Bearer ')) {
      activeSessions.delete(header.slice(7));
    }
    res.json({ success: true });
  });

  // --- API Routes ---

  app.get("/api/version", (_req, res) => {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
      res.json({ version: pkg.version });
    } catch {
      res.json({ version: "0.0.0" });
    }
  });

  app.get("/api/playlists", (req, res) => {
    const db = readDb();
    res.json(db.playlists);
  });

  app.post("/api/playlists", (req, res) => {
    const db = readDb();
    const { name } = req.body;
    const nextShortId = Math.max(0, ...db.playlists.map(p => p.shortId || 0)) + 1;
    const newPlaylist: Playlist = {
      id: uuidv4(),
      name: name || "Unnamed Playlist",
      userId: "local-user",
      categories: ["General"],
      exportId: uuidv4(),
      shortId: nextShortId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    db.playlists.push(newPlaylist);
    writeDb(db);
    res.json(newPlaylist);
  });

  app.put("/api/playlists/:playlistId", (req, res) => {
    const db = readDb();
    const { playlistId } = req.params;
    const idx = db.playlists.findIndex(p => p.id === playlistId);
    if (idx !== -1) {
      db.playlists[idx] = { ...db.playlists[idx], ...req.body, updatedAt: Date.now() };
      writeDb(db);
      res.json(db.playlists[idx]);
    } else {
      res.status(404).json({ error: "Not found" });
    }
  });

  app.delete("/api/playlists/:playlistId", (req, res) => {
    const db = readDb();
    const { playlistId } = req.params;
    db.playlists = db.playlists.filter(p => p.id !== playlistId);
    db.channels = db.channels.filter(c => c.playlistId !== playlistId);
    writeDb(db);
    res.json({ success: true });
  });

  app.get("/api/playlists/:playlistId/channels", (req, res) => {
    const db = readDb();
    const { playlistId } = req.params;
    const channels = db.channels.filter(c => c.playlistId === playlistId).sort((a, b) => a.order - b.order);
    res.json(channels);
  });

  app.post("/api/playlists/:playlistId/channels/bulk", (req, res) => {
    const db = readDb();
    const { playlistId } = req.params;
    const { channels } = req.body;
    
    // Auto increment order
    const existing = db.channels.filter(c => c.playlistId === playlistId);
    let maxOrder = existing.length > 0 ? Math.max(...existing.map(c => c.order)) : 0;

    const newChannels: Channel[] = channels.map((c: any, i: number) => {
      // Find category and add it to playlist if missing
      const cat = c.category || "General";
      return {
        id: uuidv4(),
        playlistId,
        name: c.name || "Unknown",
        url: c.url || "",
        logo: c.logo || null,
        tvgId: c.tvgId || null,
        category: cat,
        order: maxOrder + i + 1,
        isHidden: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
    });

    db.channels = [...db.channels, ...newChannels];

    // Update categories — preserve existing order, append new ones at the end
    const playlist = db.playlists.find(p => p.id === playlistId);
    if (playlist) {
      const existingSet = new Set(playlist.categories);
      newChannels.forEach(c => {
        if (!existingSet.has(c.category)) {
          playlist.categories.push(c.category);
          existingSet.add(c.category);
        }
      });
    }

    writeDb(db);
    res.json({ success: true, added: newChannels.length, ids: newChannels.map((c: Channel) => c.id) });
  });

  app.put("/api/playlists/:playlistId/channels/:channelId", (req, res) => {
    const db = readDb();
    const { channelId } = req.params;
    const idx = db.channels.findIndex(c => c.id === channelId);
    if (idx !== -1) {
      db.channels[idx] = { ...db.channels[idx], ...req.body, updatedAt: Date.now() };
      writeDb(db);
      res.json(db.channels[idx]);
    } else {
      res.status(404).json({ error: "Not found" });
    }
  });

  app.delete("/api/playlists/:playlistId/channels/:channelId", (req, res) => {
    const db = readDb();
    const { channelId } = req.params;
    db.channels = db.channels.filter(c => c.id !== channelId);
    writeDb(db);
    res.json({ success: true });
  });

  app.post("/api/playlists/:playlistId/channels/bulk-update", (req, res) => {
    const db = readDb();
    const { playlistId } = req.params;
    const { ids, updates } = req.body;
    db.channels = db.channels.map(c => {
      if (c.playlistId === playlistId && ids.includes(c.id)) {
        return { ...c, ...updates, updatedAt: Date.now() };
      }
      return c;
    });

    // Handle new category dynamic pushing
    if (updates.category) {
      const playlist = db.playlists.find(p => p.id === playlistId);
      if (playlist && !playlist.categories.includes(updates.category)) {
        playlist.categories.push(updates.category);
      }
    }

    writeDb(db);
    res.json({ success: true });
  });

  app.post("/api/playlists/:playlistId/channels/bulk-replace", (req, res) => {
    const db = readDb();
    const { playlistId } = req.params;
    const { search, replace, field, ids } = req.body;
    if (!search || typeof search !== "string") {
      return res.status(400).json({ error: "Missing search string" });
    }
    const targetField = field || "url";
    let modified = 0;
    db.channels = db.channels.map(c => {
      if (c.playlistId !== playlistId) return c;
      if (ids && Array.isArray(ids) && !ids.includes(c.id)) return c;
      const current = (c as any)[targetField];
      if (typeof current !== "string" || !current.includes(search)) return c;
      const updated = current.replaceAll(search, replace ?? "");
      if (updated === current) return c;
      modified++;
      return { ...c, [targetField]: updated, updatedAt: Date.now() };
    });
    if (modified > 0) writeDb(db);
    res.json({ success: true, modified });
  });

  app.post("/api/playlists/:playlistId/channels/bulk-delete", (req, res) => {
    const db = readDb();
    const { playlistId } = req.params;
    const { ids } = req.body;
    db.channels = db.channels.filter(c => !(c.playlistId === playlistId && ids.includes(c.id)));
    writeDb(db);
    res.json({ success: true });
  });

  app.post("/api/playlists/:playlistId/channels/reorder", (req, res) => {
    const db = readDb();
    const { playlistId } = req.params;
    const { orders } = req.body; // { id: newOrder }
    db.channels = db.channels.map(c => {
      if (c.playlistId === playlistId && orders[c.id] !== undefined) {
        return { ...c, order: orders[c.id], updatedAt: Date.now() };
      }
      return c;
    });
    writeDb(db);
    res.json({ success: true });
  });

  app.post("/api/health-check", async (req, res) => {
    const { channels } = req.body as { channels: { id: string; url: string }[] };
    if (!Array.isArray(channels)) return res.status(400).json({ error: 'Invalid input' });
    const TIMEOUT_MS = 8000;
    const results = await Promise.all(
      channels.map(async ({ id, url }) => {
        if (!url) return { id, ok: false, code: null, skipped: true };
        if (!/^https?:\/\//i.test(url)) return { id, ok: false, code: null, skipped: true };
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
        try {
          const r = await fetch(url, { method: 'HEAD', signal: controller.signal });
          clearTimeout(timer);
          return { id, ok: r.status < 400, code: r.status };
        } catch (e: any) {
          clearTimeout(timer);
          if (e.name === 'AbortError') return { id, ok: false, code: null, timeout: true };
          // Some servers reject HEAD — try a GET that we abort immediately after headers
          const c2 = new AbortController();
          const t2 = setTimeout(() => c2.abort(), TIMEOUT_MS);
          try {
            const r2 = await fetch(url, { method: 'GET', signal: c2.signal });
            clearTimeout(t2);
            c2.abort();
            return { id, ok: r2.status < 400, code: r2.status };
          } catch (e2: any) {
            clearTimeout(t2);
            if (e2.name === 'AbortError') return { id, ok: false, code: null, timeout: true };
            return { id, ok: false, code: null };
          }
        }
      })
    );
    res.json({ results });
  });

  app.get("/api/search", (req, res) => {
    const q = String(req.query.q || '').trim().toLowerCase();
    if (!q) return res.json([]);
    const db = readDb();
    const results = db.channels
      .filter(c =>
        c.name?.toLowerCase().includes(q) ||
        c.url?.toLowerCase().includes(q) ||
        c.tvgId?.toLowerCase().includes(q)
      )
      .slice(0, 50)
      .map(c => ({
        id: c.id,
        playlistId: c.playlistId,
        playlistName: db.playlists.find(p => p.id === c.playlistId)?.name ?? '',
        name: c.name,
        url: c.url,
        tvgId: c.tvgId,
        logo: c.logo,
        category: c.category,
        isHidden: c.isHidden,
      }));
    res.json(results);
  });

  // Legacy long-form URL (kept for backwards compatibility)
  app.get("/api/playlists/:exportId.m3u", (req, res) => {
    const db = readDb();
    const playlist = db.playlists.find(p => p.exportId === req.params.exportId);
    if (!playlist) return res.status(404).send("Playlist not found");
    serveM3U(playlist, db, res);
  });

  // Proxy endpoint for downloading external M3U Links
  app.get("/api/proxy", async (req, res) => {
    const targetUrl = req.query.url as string;
    if (!targetUrl) return res.status(400).send("Missing URL");
    try {
      const response = await fetch(targetUrl);
      if (!response.ok) throw new Error("Failed to fetch");
      const text = await response.text();
      res.setHeader("Content-Type", "text/plain");
      res.send(text);
    } catch (e) {
      res.status(500).send("Error fetching URL");
    }
  });

  // Short numeric URL: /1  /2  /3 …
  app.get(/^\/(\d+)$/, (req, res) => {
    const shortId = parseInt(req.params[0], 10);
    const db = readDb();
    const playlist = db.playlists.find(p => p.shortId === shortId);
    if (!playlist) return res.status(404).send("Playlist not found");
    serveM3U(playlist, db, res);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
