import React from 'react';
import { EpgProgramme } from '../apiClient';
import { useStore } from '../store';
import { formatTime } from '../utils/formatTime';
import { X } from 'lucide-react';
import Dialog from './Dialog';

export interface EpgProgramDialogProps {
  programme: EpgProgramme | null;
  onClose: () => void;
  onAssignChannel?: (channelId: string) => void;
}

export function parseXmltvTime(str: string): Date {
  if (!str || str.length < 14) return new Date();
  
  const year = parseInt(str.substring(0, 4), 10);
  const month = parseInt(str.substring(4, 6), 10) - 1;
  const day = parseInt(str.substring(6, 8), 10);
  const hour = parseInt(str.substring(8, 10), 10);
  const minute = parseInt(str.substring(10, 12), 10);
  const second = parseInt(str.substring(12, 14), 10);
  
  let date = new Date(Date.UTC(year, month, day, hour, minute, second));
  
  const tzMatch = str.match(/([+-]\d{2})(\d{2})$/);
  if (tzMatch) {
    const tzSign = tzMatch[1].startsWith('+') ? 1 : -1;
    const tzHour = parseInt(tzMatch[1].substring(1), 10);
    const tzMin = parseInt(tzMatch[2], 10);
    const tzOffsetMs = tzSign * (tzHour * 60 + tzMin) * 60000;
    date = new Date(date.getTime() - tzOffsetMs);
  }
  
  return date;
}

function formatDuration(ms: number): string {
  const totalMins = Math.floor(ms / 60000);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

export default function EpgProgramDialog({ programme, onClose, onAssignChannel }: EpgProgramDialogProps) {
  const { accentColor, is24Hour } = useStore();

  if (!programme) return null;

  const startDate = parseXmltvTime(programme.start);
  const endDate = parseXmltvTime(programme.stop);
  const durationMs = endDate.getTime() - startDate.getTime();

  const formattedTime = new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: !is24Hour,
  }).format(startDate);

  const formattedEndTime = formatTime(endDate, is24Hour);

  return (
    <Dialog onClose={onClose} maxWidth="max-w-lg" panelClassName="rounded max-h-[90vh]">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100 dark:border-white/10 shrink-0">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white truncate pr-4">
            {programme.title}
          </h2>
          <button 
            onClick={onClose} 
            className="md-btn p-1.5 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 shrink-0"
            aria-label="Close dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        
        <div className="px-6 py-4 overflow-y-auto">
          <p className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-4" style={{ color: accentColor }}>
            {formattedTime} &ndash; {formattedEndTime} ({formatDuration(durationMs)})
          </p>
          
          {programme.subTitle && (
            <h3 className="text-base font-medium text-gray-800 dark:text-gray-200 mb-2">
              {programme.subTitle}
            </h3>
          )}
          
          {programme.desc && (
            <div className="text-sm text-gray-700 dark:text-gray-400 space-y-2 mb-4 leading-relaxed whitespace-pre-wrap">
              {programme.desc}
            </div>
          )}

          <div className="flex flex-wrap gap-2 mt-4">
            {programme.category && (
              <span className="px-2.5 py-1 text-xs font-medium rounded bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300">
                {programme.category}
              </span>
            )}
            {programme.episodeNum && (
              <span className="px-2.5 py-1 text-xs font-medium rounded bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300">
                Ep: {programme.episodeNum}
              </span>
            )}
            {programme.date && (
              <span className="px-2.5 py-1 text-xs font-medium rounded bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300">
                Year: {programme.date}
              </span>
            )}
            {programme.rating && (
              <span className="px-2.5 py-1 text-xs font-medium rounded bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300">
                Rating: {programme.rating}
              </span>
            )}
          </div>
        </div>

        {onAssignChannel && (
          <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100 dark:border-white/10 shrink-0">
            <button
              onClick={() => onAssignChannel(programme.channel)}
              className="md-btn h-9 px-4 rounded text-xs font-medium uppercase tracking-wider"
              style={{ color: accentColor }}
            >
              Assign this channel's EPG
            </button>
          </div>
        )}
    </Dialog>
  );
}
