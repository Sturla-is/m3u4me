import React, { useState, useEffect, useMemo } from 'react';
import { api, EpgSource, EpgChannel, Channel } from '../apiClient';
import { useStore, notifyError } from '../store';
import { Loader2, Wand2, CheckCircle2, XCircle, Check } from 'lucide-react';
import Dialog from './Dialog';

interface BulkEpgAssignDialogProps {
  open: boolean;
  onClose: () => void;
  playlistId: string;
  channels: Channel[];
  activeCategory: string;
}

// --- Fuzzy matching ---
// A name's normalized form plus its precomputed trigram/word sets, built once via
// buildMatchIndex and then reused for every comparison it's involved in — see
// handleRunMatching, which used to rebuild the EPG side of this from scratch on every
// single playlist-channel comparison (O(N×M) redundant Set construction), which is what
// froze the tab on a large EPG source.
interface MatchIndex {
  norm: string;
  trigrams: Set<string>;
  words: Set<string>;
}

function buildMatchIndex(raw: string): MatchIndex {
  const norm = raw.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const trigrams = new Set<string>();
  const padded = `  ${norm}  `;
  for (let i = 0; i < padded.length - 2; i++) trigrams.add(padded.slice(i, i + 3));
  const words = new Set(norm.split(' ').filter(Boolean));
  return { norm, trigrams, words };
}

// Returns a score 0-1 indicating how well two pre-indexed names match. Higher is better.
// Uses a simple trigram + word overlap approach.
function fuzzyScore(a: MatchIndex, b: MatchIndex): number {
  if (a.norm === b.norm) return 1;
  if (!a.norm || !b.norm) return 0;

  let intersection = 0;
  for (const t of a.trigrams) if (b.trigrams.has(t)) intersection++;
  const trigramScore = (2 * intersection) / (a.trigrams.size + b.trigrams.size);

  let wordIntersection = 0;
  for (const w of a.words) if (b.words.has(w)) wordIntersection++;
  const wordScore = (2 * wordIntersection) / (a.words.size + b.words.size);

  return trigramScore * 0.5 + wordScore * 0.5;
}

const MIN_SCORE = 0.35;

interface Match {
  channel: Channel;
  epgChannel: EpgChannel;
  score: number;
  accepted: boolean;
}

type Scope = 'playlist' | 'category';

export default function BulkEpgAssignDialog({
  open, onClose, playlistId, channels, activeCategory,
}: BulkEpgAssignDialogProps) {
  const { accentColor } = useStore();

  const [sources, setSources] = useState<EpgSource[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState('');
  const [scope, setScope] = useState<Scope>('category');
  const [step, setStep] = useState<'config' | 'matching' | 'preview' | 'applying' | 'done'>('config');
  const [matches, setMatches] = useState<Match[]>([]);
  const [appliedCount, setAppliedCount] = useState(0);
  const [loadingMsg, setLoadingMsg] = useState('');

  const [isReverting, setIsReverting] = useState(false);
  const cancelRef = React.useRef(false);

  // Prevent closing tab while applying
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (step === 'applying') {
        e.preventDefault();
        e.returnValue = ''; // Required for some browsers to show dialog
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [step]);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setStep('config');
      setMatches([]);
      setAppliedCount(0);
      setSelectedSourceId('');
      setScope('category');
      setIsReverting(false);
      cancelRef.current = false;
      api.getEpgSources().then(s => {
        setSources(s);
        if (s.length === 1) setSelectedSourceId(s[0].id);
      }).catch(e => {
        console.error(e);
        notifyError(e, 'Failed to load EPG sources.');
      });
    }
  }, [open]);

  const scopedChannels = useMemo(() => {
    if (scope === 'category') return channels.filter(c => c.category === activeCategory);
    return channels;
  }, [scope, channels, activeCategory]);

  const handleRunMatching = async () => {
    if (!selectedSourceId) return;
    setStep('matching');
    setLoadingMsg('Loading EPG channels…');
    cancelRef.current = false;

    try {
      const epgChannels = await api.getEpgChannels(selectedSourceId);
      // Build each EPG channel's match index (normalized name + trigram/word sets) once,
      // up front, instead of recomputing it from scratch inside the loop below for every
      // playlist channel it gets compared against.
      const epgIndex = epgChannels.map(epg => ({ epg, index: buildMatchIndex(epg.displayName) }));

      // Score each playlist channel against all EPG channels, take the best match. Runs in
      // small chunks with a yield in between (instead of one long synchronous pass) so a
      // large playlist/EPG source doesn't freeze the tab, and so Cancel below can interrupt it.
      const newMatches: Match[] = [];
      const CHUNK_SIZE = 25;
      for (let i = 0; i < scopedChannels.length; i += CHUNK_SIZE) {
        if (cancelRef.current) { setStep('config'); return; }
        const chunk = scopedChannels.slice(i, i + CHUNK_SIZE);
        for (const ch of chunk) {
          const chIndex = buildMatchIndex(ch.name);
          let bestScore = 0;
          let bestEpg: EpgChannel | null = null;
          for (const { epg, index } of epgIndex) {
            const s = fuzzyScore(chIndex, index);
            if (s > bestScore) { bestScore = s; bestEpg = epg; }
          }
          if (bestEpg && bestScore >= MIN_SCORE) {
            newMatches.push({ channel: ch, epgChannel: bestEpg, score: bestScore, accepted: true });
          }
        }
        const done = Math.min(i + CHUNK_SIZE, scopedChannels.length);
        setLoadingMsg(`Matching ${done} / ${scopedChannels.length} playlist channels…`);
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      // Sort by score descending
      newMatches.sort((a, b) => b.score - a.score);
      setMatches(newMatches);
      setStep('preview');
    } catch (err) {
      console.error('Bulk EPG matching failed:', err);
      notifyError(err, 'Failed to match EPG channels.');
      setStep('config');
    }
  };

  const handleApply = async () => {
    cancelRef.current = false;
    setIsReverting(false);
    const toApply = matches.filter(m => m.accepted);
    if (toApply.length === 0) return;
    setStep('applying');
    
    let count = 0;
    const successfullyApplied: Match[] = [];
    const CHUNK_SIZE = 100;

    try {
      for (let i = 0; i < toApply.length; i += CHUNK_SIZE) {
        if (cancelRef.current) break;
        const chunk = toApply.slice(i, i + CHUNK_SIZE);
        const updates = chunk.map(m => ({ id: m.channel.id, changes: { tvgId: m.epgChannel.id } }));

        await api.bulkUpdateManyChannels(playlistId, updates);
        successfullyApplied.push(...chunk);
        count += chunk.length;
        setAppliedCount(count);
      }
    } catch (err) {
      console.error('Bulk EPG assignment failed:', err);
      notifyError(err, `Failed to apply EPG assignments after ${count} of ${toApply.length}.`);
      setStep('preview');
      return;
    }

    if (cancelRef.current) {
      setIsReverting(true);
      for (let i = 0; i < successfullyApplied.length; i += CHUNK_SIZE) {
        const chunk = successfullyApplied.slice(i, i + CHUNK_SIZE);
        // revert to whatever tvgId it had originally
        const revertUpdates = chunk.map(m => ({ id: m.channel.id, changes: { tvgId: m.channel.tvgId } }));
        await api.bulkUpdateManyChannels(playlistId, revertUpdates);
      }
      setIsReverting(false);
      cancelRef.current = false;
      setStep('preview');
      return;
    }

    setStep('done');
  };

  const toggleMatch = (idx: number) => {
    setMatches(prev => prev.map((m, i) => i === idx ? { ...m, accepted: !m.accepted } : m));
  };

  const acceptedCount = matches.filter(m => m.accepted).length;

  if (!open) return null;

  const scoreBar = (score: number) => {
    const pct = Math.round(score * 100);
    const color = score >= 0.75 ? '#22c55e' : score >= 0.5 ? '#f59e0b' : '#f97316';
    return (
      <div className="flex items-center gap-1.5 shrink-0">
        <div className="w-16 h-1.5 rounded-full bg-gray-200 dark:bg-white/10 overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
        </div>
        <span className="text-[10px] font-mono w-7 text-right" style={{ color }}>{pct}%</span>
      </div>
    );
  };

  return (
    <Dialog
      onClose={onClose}
      maxWidth="max-w-2xl"
      panelClassName="rounded-lg overflow-hidden max-h-[85vh]"
      scrimClassName="bg-black/60"
      // The 'applying' step blocks tab-close (see the beforeunload handler above) for
      // the same reason it shouldn't be dismissible via backdrop/Escape either: closing
      // mid-apply wouldn't stop the in-flight bulk-update-many calls, just hide the
      // "Cancel & Revert" affordance that's the only safe way to back out of them.
      dismissible={step !== 'applying'}
    >
        {/* Header */}
        <div className="flex items-center gap-3 px-6 pt-6 pb-4 shrink-0">
          <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: `${accentColor}20` }}>
            <Wand2 className="h-5 w-5" style={{ color: accentColor }} />
          </div>
          <div>
            <h2 className="text-lg font-medium text-gray-900 dark:text-white">Bulk EPG Assignment</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">Automatically match channel names to EPG entries using fuzzy search</p>
          </div>
        </div>

        {/* ── Step: config ── */}
        {step === 'config' && (
          <div className="flex flex-col gap-5 px-6 pb-6 flex-1 overflow-y-auto">
            {/* EPG Source picker */}
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">EPG Source</label>
              {sources.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500 italic">No EPG sources added yet. Add one in the EPG view.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {sources.map(s => (
                    <button
                      key={s.id}
                      onClick={() => setSelectedSourceId(s.id)}
                      className="flex items-center gap-3 px-4 py-3 rounded-lg border-2 transition-colors text-left"
                      style={selectedSourceId === s.id
                        ? { borderColor: accentColor, backgroundColor: `${accentColor}12` }
                        : { borderColor: 'transparent', backgroundColor: 'rgba(128,128,128,0.08)' }}
                    >
                      <div
                        className="w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors"
                        style={selectedSourceId === s.id
                          ? { borderColor: accentColor, backgroundColor: accentColor }
                          : { borderColor: 'currentColor' }}
                      >
                        {selectedSourceId === s.id && <Check className="w-2.5 h-2.5 text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{s.name}</p>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400">{s.channelCount.toLocaleString()} channels · {s.type === 'xtream' ? 'Xtream Codes' : 'XMLTV'}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Scope picker */}
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Assign to</label>
              <div className="grid grid-cols-2 gap-2">
                {(['category', 'playlist'] as Scope[]).map(s => (
                  <button
                    key={s}
                    onClick={() => setScope(s)}
                    className="px-4 py-3 rounded-lg border-2 transition-colors text-left"
                    style={scope === s
                      ? { borderColor: accentColor, backgroundColor: `${accentColor}12` }
                      : { borderColor: 'transparent', backgroundColor: 'rgba(128,128,128,0.08)' }}
                  >
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {s === 'category' ? `Current category` : 'Whole playlist'}
                    </p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                      {s === 'category'
                        ? `"${activeCategory}" — ${channels.filter(c => c.category === activeCategory).length} channels`
                        : `All categories — ${channels.length} channels`}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={onClose} className="md-btn h-9 px-4 rounded text-xs font-medium uppercase tracking-wider text-gray-600 dark:text-gray-300">Cancel</button>
              <button
                onClick={handleRunMatching}
                disabled={!selectedSourceId}
                className="md-btn h-9 px-4 rounded text-xs font-medium uppercase tracking-wider disabled:opacity-40 flex items-center gap-2"
                style={{ color: accentColor }}
              >
                <Wand2 className="h-3.5 w-3.5" />
                Match Channels
              </button>
            </div>
          </div>
        )}

        {/* ── Step: matching ── */}
        {step === 'matching' && (
          <div className="flex flex-col items-center justify-center gap-4 py-16 px-6">
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: accentColor }} />
            <p className="text-sm text-gray-600 dark:text-gray-400">{loadingMsg}</p>
            <button
              onClick={() => cancelRef.current = true}
              className="mt-4 md-btn h-9 px-4 rounded text-xs font-medium uppercase tracking-wider text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
            >
              Cancel
            </button>
          </div>
        )}

        {/* ── Step: preview ── */}
        {step === 'preview' && (
          <>
            <div className="px-6 py-3 shrink-0 border-b border-gray-200 dark:border-white/8 flex items-center justify-between gap-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <span className="font-semibold text-gray-900 dark:text-white">{matches.length}</span> matches found ·{' '}
                <span className="font-semibold" style={{ color: accentColor }}>{acceptedCount}</span> selected
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setMatches(prev => prev.map(m => ({ ...m, accepted: true })))}
                  className="text-[11px] underline text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                >Select all</button>
                <span className="text-gray-300 dark:text-white/20">|</span>
                <button
                  onClick={() => setMatches(prev => prev.map(m => ({ ...m, accepted: false })))}
                  className="text-[11px] underline text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                >Deselect all</button>
              </div>
            </div>

            {matches.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16 px-6 text-gray-400">
                <XCircle className="h-8 w-8" />
                <p className="text-sm">No matches found above the confidence threshold.</p>
                <button onClick={() => setStep('config')} className="text-xs underline" style={{ color: accentColor }}>Back to settings</button>
              </div>
            ) : (
              <>
                {/* Column headers */}
                <div className="px-4 py-1.5 shrink-0 grid gap-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-white/5"
                  style={{ gridTemplateColumns: '2rem 1fr 1fr 5.5rem' }}>
                  <span />
                  <span>Playlist Channel</span>
                  <span>EPG Channel</span>
                  <span>Confidence</span>
                </div>

                <div className="flex-1 overflow-y-auto">
                  {matches.map((m, i) => (
                    <button
                      key={m.channel.id}
                      onClick={() => toggleMatch(i)}
                      className="w-full grid gap-2 items-center px-4 py-2.5 border-b border-gray-100 dark:border-white/5 hover:bg-gray-50 dark:hover:bg-white/3 transition-colors text-left"
                      style={{ gridTemplateColumns: '2rem 1fr 1fr 5.5rem' }}
                    >
                      {/* Checkbox */}
                      <div className="flex items-center justify-center">
                        {m.accepted
                          ? <CheckCircle2 className="h-4 w-4" style={{ color: accentColor }} />
                          : <div className="h-4 w-4 rounded-full border-2 border-gray-300 dark:border-gray-600" />}
                      </div>
                      {/* Playlist channel */}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{m.channel.name}</p>
                        {m.channel.tvgId && (
                          <p className="text-[10px] font-mono text-gray-400 dark:text-gray-500 truncate">was: {m.channel.tvgId}</p>
                        )}
                      </div>
                      {/* EPG channel */}
                      <div className="min-w-0">
                        <p className="text-sm text-gray-800 dark:text-gray-200 truncate">{m.epgChannel.displayName}</p>
                        <p className="text-[10px] font-mono text-gray-400 dark:text-gray-500 truncate">{m.epgChannel.id}</p>
                      </div>
                      {/* Score bar */}
                      {scoreBar(m.score)}
                    </button>
                  ))}
                </div>

                <div className="px-6 py-4 shrink-0 border-t border-gray-200 dark:border-white/8 flex justify-end gap-2">
                  <button onClick={() => setStep('config')} className="md-btn h-9 px-4 rounded text-xs font-medium uppercase tracking-wider text-gray-600 dark:text-gray-300">Back</button>
                  <button
                    onClick={handleApply}
                    disabled={acceptedCount === 0}
                    className="md-btn h-9 px-4 rounded text-xs font-medium uppercase tracking-wider disabled:opacity-40 flex items-center gap-2"
                    style={{ color: accentColor }}
                  >
                    <Check className="h-3.5 w-3.5" />
                    Apply {acceptedCount} Assignment{acceptedCount !== 1 ? 's' : ''}
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {/* ── Step: applying ── */}
        {step === 'applying' && (
          <div className="flex flex-col items-center justify-center gap-4 py-16 px-6">
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: accentColor }} />
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {isReverting ? 'Reverting changes...' : `Applying ${appliedCount} / ${matches.filter(m => m.accepted).length}…`}
            </p>
            {!isReverting && (
              <button 
                onClick={() => cancelRef.current = true}
                className="mt-4 md-btn h-9 px-4 rounded text-xs font-medium uppercase tracking-wider text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                Cancel & Revert
              </button>
            )}
          </div>
        )}

        {/* ── Step: done ── */}
        {step === 'done' && (
          <div className="flex flex-col items-center justify-center gap-5 py-16 px-6">
            <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ backgroundColor: `${accentColor}20` }}>
              <CheckCircle2 className="h-8 w-8" style={{ color: accentColor }} />
            </div>
            <div className="text-center">
              <p className="text-lg font-medium text-gray-900 dark:text-white">Done!</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Successfully assigned EPG IDs to <strong>{appliedCount}</strong> channel{appliedCount !== 1 ? 's' : ''}.
              </p>
            </div>
            <button
              onClick={onClose}
              className="md-btn h-9 px-6 rounded text-xs font-medium uppercase tracking-wider"
              style={{ color: accentColor }}
            >
              Done
            </button>
          </div>
        )}
    </Dialog>
  );
}
