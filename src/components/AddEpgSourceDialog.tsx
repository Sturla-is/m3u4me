import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { api, triggerEpgRefresh, EpgSource } from '../apiClient';
import { useStore, notifyError } from '../store';
import Dialog from './Dialog';

interface AddEpgSourceDialogProps {
  open: boolean;
  onClose: () => void;
  editingSource?: EpgSource | null;
}

export default function AddEpgSourceDialog({ open, onClose, editingSource }: AddEpgSourceDialogProps) {
  const { accentColor } = useStore();
  const [tab, setTab] = useState<'xml' | 'xtream'>('xml');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // EPG Link State
  const [xmlName, setXmlName] = useState('');
  const [xmlUrl, setXmlUrl] = useState('');
  const [xmlInterval, setXmlInterval] = useState(12);

  // Xtream State
  const [xtreamName, setXtreamName] = useState('');
  const [xtreamUrl, setXtreamUrl] = useState('');
  const [xtreamUser, setXtreamUser] = useState('');
  const [xtreamPass, setXtreamPass] = useState('');
  const [xtreamInterval, setXtreamInterval] = useState(12);

  useEffect(() => {
    if (open) {
      if (editingSource) {
        setTab(editingSource.type);
        if (editingSource.type === 'xml') {
          setXmlName(editingSource.name);
          setXmlUrl(editingSource.url);
          setXmlInterval(editingSource.refreshIntervalHours || 12);
          setXtreamName('');
          setXtreamUrl('');
          setXtreamUser('');
          setXtreamPass('');
          setXtreamInterval(12);
        } else {
          setXtreamName(editingSource.name);
          setXtreamUrl(editingSource.url);
          setXtreamUser(editingSource.xtreamCredentials?.username || '');
          setXtreamPass(editingSource.xtreamCredentials?.password || '');
          setXtreamInterval(editingSource.refreshIntervalHours || 12);
          setXmlName('');
          setXmlUrl('');
          setXmlInterval(12);
        }
      } else {
        setTab('xml');
        setXmlName('');
        setXmlUrl('');
        setXmlInterval(12);
        setXtreamName('');
        setXtreamUrl('');
        setXtreamUser('');
        setXtreamPass('');
        setXtreamInterval(12);
      }
      setIsSubmitting(false);
    }
  }, [open, editingSource]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const payload = tab === 'xml'
        ? {
            name: xmlName,
            url: xmlUrl,
            type: 'xml' as const,
            refreshIntervalHours: xmlInterval,
          }
        : {
            name: xtreamName,
            url: xtreamUrl,
            type: 'xtream' as const,
            xtreamCredentials: { username: xtreamUser, password: xtreamPass },
            refreshIntervalHours: xtreamInterval,
          };

      if (editingSource) {
        await api.updateEpgSource(editingSource.id, payload);

        // If URL or credentials changed, trigger a refresh to fetch new EPG data
        let needsRefresh = false;
        if (tab === 'xml' && xmlUrl !== (editingSource.url || '')) {
          needsRefresh = true;
        } else if (tab === 'xtream') {
          if (xtreamUrl !== (editingSource.url || '')) needsRefresh = true;
          if (xtreamUser !== (editingSource.xtreamCredentials?.username || '')) needsRefresh = true;
          if (xtreamPass !== (editingSource.xtreamCredentials?.password || '')) needsRefresh = true;
        }

        if (needsRefresh) {
          await api.refreshEpgSource(editingSource.id);
        }
      } else {
        // @ts-ignore
        await api.createEpgSource(payload);
      }
      
      triggerEpgRefresh();
      onClose();
    } catch (error) {
      console.error(editingSource ? 'Failed to update EPG source' : 'Failed to add EPG source', error);
      notifyError(error, editingSource ? 'Failed to update EPG source.' : 'Failed to add EPG source.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isFormValid = () => {
    if (tab === 'xml') return xmlName.trim() !== '' && xmlUrl.trim() !== '';
    return xtreamName.trim() !== '' && xtreamUrl.trim() !== '' && xtreamUser.trim() !== '' && xtreamPass.trim() !== '';
  };

  const inputClasses = "w-full border border-gray-400 dark:border-gray-500 rounded px-3 py-2.5 text-sm focus:outline-none bg-transparent text-gray-900 dark:text-white placeholder-gray-400";

  return (
    <Dialog onClose={onClose}>
        <h2 className="text-xl font-medium text-gray-900 dark:text-white px-6 pt-6 pb-4">
          {editingSource ? 'Edit EPG Source' : 'Add EPG Source'}
        </h2>

        {/* Tabs */}
        <div className="flex px-6 border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setTab('xml')}
            className={`flex-1 pb-2 text-sm font-medium ${tab === 'xml' ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'} relative`}
            disabled={!!editingSource && editingSource.type !== 'xml'}
            style={editingSource && editingSource.type !== 'xml' ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
          >
            EPG Link
            {tab === 'xml' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5" style={{ backgroundColor: accentColor }} />
            )}
          </button>
          <button
            onClick={() => setTab('xtream')}
            className={`flex-1 pb-2 text-sm font-medium ${tab === 'xtream' ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'} relative`}
            disabled={!!editingSource && editingSource.type !== 'xtream'}
            style={editingSource && editingSource.type !== 'xtream' ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
          >
            Xtream Codes API
            {tab === 'xtream' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5" style={{ backgroundColor: accentColor }} />
            )}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
          {tab === 'xml' ? (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Name</label>
                <input
                  type="text"
                  placeholder="My EPG Source"
                  value={xmlName}
                  onChange={(e) => setXmlName(e.target.value)}
                  className={inputClasses}
                  style={{ '--tw-ring-color': accentColor } as React.CSSProperties}
                  onFocus={(e) => (e.target.style.borderColor = accentColor)}
                  onBlur={(e) => (e.target.style.borderColor = '')}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">URL</label>
                <input
                  type="url"
                  placeholder="https://example.com/epg.xml.gz"
                  value={xmlUrl}
                  onChange={(e) => setXmlUrl(e.target.value)}
                  className={inputClasses}
                  style={{ '--tw-ring-color': accentColor } as React.CSSProperties}
                  onFocus={(e) => (e.target.style.borderColor = accentColor)}
                  onBlur={(e) => (e.target.style.borderColor = '')}
                />
                <p className="text-[10px] text-gray-500 mt-1">Supports .xml and .gz compressed files</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Refresh Interval</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    value={xmlInterval}
                    onChange={(e) => setXmlInterval(parseInt(e.target.value) || 1)}
                    className={inputClasses + " w-24"}
                    style={{ '--tw-ring-color': accentColor } as React.CSSProperties}
                    onFocus={(e) => (e.target.style.borderColor = accentColor)}
                    onBlur={(e) => (e.target.style.borderColor = '')}
                  />
                  <span className="text-sm text-gray-600 dark:text-gray-400">hours</span>
                </div>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Name</label>
                <input
                  type="text"
                  placeholder="My Xtream Source"
                  value={xtreamName}
                  onChange={(e) => setXtreamName(e.target.value)}
                  className={inputClasses}
                  style={{ '--tw-ring-color': accentColor } as React.CSSProperties}
                  onFocus={(e) => (e.target.style.borderColor = accentColor)}
                  onBlur={(e) => (e.target.style.borderColor = '')}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Server URL</label>
                <input
                  type="url"
                  placeholder="http://example.com:8080"
                  value={xtreamUrl}
                  onChange={(e) => setXtreamUrl(e.target.value)}
                  className={inputClasses}
                  style={{ '--tw-ring-color': accentColor } as React.CSSProperties}
                  onFocus={(e) => (e.target.style.borderColor = accentColor)}
                  onBlur={(e) => (e.target.style.borderColor = '')}
                />
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Username</label>
                  <input
                    type="text"
                    value={xtreamUser}
                    onChange={(e) => setXtreamUser(e.target.value)}
                    className={inputClasses}
                    style={{ '--tw-ring-color': accentColor } as React.CSSProperties}
                    onFocus={(e) => (e.target.style.borderColor = accentColor)}
                    onBlur={(e) => (e.target.style.borderColor = '')}
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Password</label>
                  <input
                    type="password"
                    value={xtreamPass}
                    onChange={(e) => setXtreamPass(e.target.value)}
                    className={inputClasses}
                    style={{ '--tw-ring-color': accentColor } as React.CSSProperties}
                    onFocus={(e) => (e.target.style.borderColor = accentColor)}
                    onBlur={(e) => (e.target.style.borderColor = '')}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Refresh Interval</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    value={xtreamInterval}
                    onChange={(e) => setXtreamInterval(parseInt(e.target.value) || 1)}
                    className={inputClasses + " w-24"}
                    style={{ '--tw-ring-color': accentColor } as React.CSSProperties}
                    onFocus={(e) => (e.target.style.borderColor = accentColor)}
                    onBlur={(e) => (e.target.style.borderColor = '')}
                  />
                  <span className="text-sm text-gray-600 dark:text-gray-400">hours</span>
                </div>
                <p className="text-[10px] text-gray-500 mt-1">Will fetch EPG from the server's XMLTV endpoint</p>
              </div>
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
              {editingSource ? 'Save Changes' : 'Add Source'}
            </button>
          </div>
        </form>
    </Dialog>
  );
}
