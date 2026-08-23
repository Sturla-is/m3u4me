import React, { useState, useRef, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { api } from '../apiClient';
import { useStore, notifyError } from '../store';
import Dialog from './Dialog';

interface NewPlaylistDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (playlistId: string) => void;
}

type StartMode = 'empty' | 'import';
type ImportTab = 'url' | 'file';

export default function NewPlaylistDialog({ open, onClose, onCreated }: NewPlaylistDialogProps) {
  const { accentColor } = useStore();
  const [mode, setMode] = useState<StartMode>('empty');
  const [importTab, setImportTab] = useState<ImportTab>('url');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // null = not yet checked, string = warning to show, and a boolean tracking whether
  // the user has already seen it and clicked through once (so the next submit proceeds anyway).
  const [warning, setWarning] = useState<string | null>(null);
  const [warningConfirmed, setWarningConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setMode('empty');
      setImportTab('url');
      setName('');
      setUrl('');
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setWarning(null);
      setWarningConfirmed(false);
      setIsSubmitting(false);
    }
  }, [open]);

  if (!open) return null;

  const resetImportInputs = () => {
    setWarning(null);
    setWarningConfirmed(false);
  };

  const isFormValid = () => {
    if (!name.trim()) return false;
    if (mode === 'empty') return true;
    if (importTab === 'url') return url.trim() !== '';
    return file !== null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid() || isSubmitting) return;

    if (mode === 'empty') {
      setIsSubmitting(true);
      try {
        const pl = await api.createPlaylist(name.trim());
        onCreated(pl.id);
      } catch (err) {
        console.error(err);
        notifyError(err, 'Failed to create playlist.');
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: { name: string; url?: string; content?: string; confirmWarning?: boolean } = {
        name: name.trim(),
        confirmWarning: warningConfirmed,
      };
      if (importTab === 'url') {
        payload.url = url.trim();
      } else if (file) {
        payload.content = await file.text();
      }

      const result: any = await api.importPlaylist(payload);

      if (result?.error) {
        notifyError(new Error(result.error));
        return;
      }
      if (result?.warning) {
        setWarning(result.warning);
        setWarningConfirmed(true); // next submit proceeds despite the warning
        return;
      }
      onCreated(result.id);
    } catch (err) {
      console.error(err);
      notifyError(err, 'Failed to import playlist.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClasses = "w-full border border-gray-400 dark:border-gray-500 rounded px-3 py-2.5 text-sm focus:outline-none bg-transparent text-gray-900 dark:text-white placeholder-gray-400";

  return (
    <Dialog onClose={onClose}>
        <h2 className="text-xl font-medium text-gray-900 dark:text-white px-6 pt-6 pb-4">
          New Playlist
        </h2>

        {/* Start mode */}
        <div className="flex px-6 border-b border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={() => setMode('empty')}
            className={`flex-1 pb-2 text-sm font-medium ${mode === 'empty' ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'} relative`}
          >
            Empty Playlist
            {mode === 'empty' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5" style={{ backgroundColor: accentColor }} />
            )}
          </button>
          <button
            type="button"
            onClick={() => setMode('import')}
            className={`flex-1 pb-2 text-sm font-medium ${mode === 'import' ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'} relative`}
          >
            Import M3U
            {mode === 'import' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5" style={{ backgroundColor: accentColor }} />
            )}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Name</label>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Playlist name"
              className={inputClasses}
              style={{ '--tw-ring-color': accentColor } as React.CSSProperties}
              onFocus={e => (e.target.style.borderColor = accentColor)}
              onBlur={e => (e.target.style.borderColor = '')}
            />
          </div>

          {mode === 'import' && (
            <>
              {/* Sub-tabs for import source */}
              <div className="flex gap-4 text-xs font-medium">
                <button
                  type="button"
                  onClick={() => { setImportTab('url'); resetImportInputs(); }}
                  className={importTab === 'url' ? '' : 'text-gray-500 dark:text-gray-400'}
                  style={importTab === 'url' ? { color: accentColor } : undefined}
                >
                  From URL
                </button>
                <button
                  type="button"
                  onClick={() => { setImportTab('file'); resetImportInputs(); }}
                  className={importTab === 'file' ? '' : 'text-gray-500 dark:text-gray-400'}
                  style={importTab === 'file' ? { color: accentColor } : undefined}
                >
                  From File
                </button>
              </div>

              {importTab === 'url' ? (
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Playlist URL</label>
                  <input
                    type="url"
                    placeholder="https://example.com/playlist.m3u"
                    value={url}
                    onChange={(e) => { setUrl(e.target.value); resetImportInputs(); }}
                    className={inputClasses}
                    style={{ '--tw-ring-color': accentColor } as React.CSSProperties}
                    onFocus={(e) => (e.target.style.borderColor = accentColor)}
                    onBlur={(e) => (e.target.style.borderColor = '')}
                  />
                  <p className="text-[10px] text-gray-500 mt-1">Supports M3U and XSPF playlists — not M3U8 livestream links</p>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">File</label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".m3u,.m3u8,.xspf"
                    onChange={(e) => { setFile(e.target.files?.[0] || null); resetImportInputs(); }}
                    className={inputClasses + " file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:bg-gray-100 dark:file:bg-gray-800 file:text-gray-700 dark:file:text-gray-300"}
                    style={{ '--tw-ring-color': accentColor } as React.CSSProperties}
                    onFocus={(e) => (e.target.style.borderColor = accentColor)}
                    onBlur={(e) => (e.target.style.borderColor = '')}
                  />
                </div>
              )}

              {warning && (
                <p className="text-[11px] text-amber-500 dark:text-amber-400 font-medium -mt-2">
                  ⚠ {warning}{warningConfirmed ? ' — Click Create again to import anyway.' : ''}
                </p>
              )}
            </>
          )}

          <div className="flex justify-end gap-1 mt-2">
            <button
              type="button"
              onClick={onClose}
              className="md-btn h-9 px-4 rounded text-xs font-medium uppercase tracking-wider text-gray-600 dark:text-gray-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isFormValid() || isSubmitting}
              className="md-btn h-9 px-4 rounded text-xs font-medium uppercase tracking-wider disabled:opacity-40 flex items-center gap-2"
              style={{ color: accentColor }}
            >
              {isSubmitting && <Loader2 className="w-3 h-3 animate-spin" />}
              Create
            </button>
          </div>
        </form>
    </Dialog>
  );
}
