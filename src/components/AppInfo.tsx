import React, { useEffect, useState } from 'react';
import { Logo } from './Logo';
import { useStore } from '../store';
import { Github, X, ArrowUpCircle } from 'lucide-react';

const GITHUB_REPO = 'https://github.com/andrei-savin/m3u4me';
const GITHUB_API_LATEST = 'https://api.github.com/repos/andrei-savin/m3u4me/releases/latest';

interface VersionInfo {
  current: string;
  latest: string | null;
  updateAvailable: boolean;
  releaseUrl: string | null;
}

/** Compares two semver strings. Returns 1 if b > a, -1 if a > b, 0 if equal. */
function compareSemver(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (nb > na) return 1;
    if (na > nb) return -1;
  }
  return 0;
}

export function useVersionInfo(): VersionInfo {
  const [info, setInfo] = useState<VersionInfo>({
    current: '…',
    latest: null,
    updateAvailable: false,
    releaseUrl: null,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Fetch local version
        const localRes = await fetch('/api/version');
        const { version: current } = await localRes.json();

        // Fetch latest GitHub release
        let latest: string | null = null;
        let releaseUrl: string | null = null;
        try {
          const ghRes = await fetch(GITHUB_API_LATEST);
          if (ghRes.ok) {
            const data = await ghRes.json();
            latest = (data.tag_name || '').replace(/^v/, '');
            releaseUrl = data.html_url || null;
          }
        } catch {
          // GitHub unreachable — that's fine
        }

        if (!cancelled) {
          setInfo({
            current,
            latest,
            updateAvailable: latest ? compareSemver(current, latest) > 0 : false,
            releaseUrl,
          });
        }
      } catch {
        // Local API unreachable
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return info;
}

interface AppInfoProps {
  open: boolean;
  onClose: () => void;
}

export default function AppInfo({ open, onClose }: AppInfoProps) {
  const { accentColor, logoBgColor } = useStore();
  const versionInfo = useVersionInfo();

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-white dark:bg-[#272727] amoled:dark:bg-[#1a1a1a] rounded elev-24 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header with close */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">About</h2>
          <button
            onClick={onClose}
            className="md-btn p-1.5 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Logo */}
        <div className="flex justify-center px-6 pb-4">
          <div className="px-6 py-4 rounded-lg">
            <Logo className="h-8 w-auto text-gray-900 dark:text-white" />
          </div>
        </div>

        {/* Description */}
        <div className="px-6 pb-5 text-center">
          <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
            Your new favourite IPTV playlist manager!
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-500 mt-1.5 leading-relaxed">
            This app is AI-generated. Nothing ever leaves your device, no data is being collected.
          </p>
        </div>

        {/* GitHub button */}
        <div className="px-6 pb-4 flex justify-center">
          <a
            href={GITHUB_REPO}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 h-9 px-5 rounded-full text-sm font-medium transition-colors"
            style={{
              backgroundColor: accentColor,
              color: '#ffffff',
            }}
          >
            <Github className="h-4 w-4" />
            View on GitHub
          </a>
        </div>

        {/* Version & Update */}
        <div className="px-6 pb-5 flex flex-col items-center gap-2">
          <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">
            v{versionInfo.current}
          </span>
          {versionInfo.updateAvailable && versionInfo.releaseUrl && (
            <a
              href={versionInfo.releaseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full transition-colors"
              style={{ backgroundColor: accentColor + '18', color: accentColor }}
            >
              <ArrowUpCircle className="h-3.5 w-3.5" />
              Update available: v{versionInfo.latest}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
