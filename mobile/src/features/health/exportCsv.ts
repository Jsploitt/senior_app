import { Platform } from 'react-native';
import type { LogEntry } from '../../transport/types';
import { csvFilename, toCsv } from './csv';

export type ExportResult =
  { ok: true; filename: string; via: 'share' | 'download' } | { ok: false; reason: string };

/**
 * Write the CSV and hand it to the OS: expo-sharing on native (cache file), Blob download on web.
 * Local only: nothing leaves the phone unless the user picks a share target.
 */
export async function exportCsv(entries: readonly LogEntry[], now: Date = new Date()): Promise<ExportResult> {
  const filename = csvFilename(now);
  const csv = toCsv(entries);
  try {
    if (Platform.OS === 'web') {
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return { ok: true, filename, via: 'download' };
    }
    /* eslint-disable @typescript-eslint/no-require-imports */
    const fs = require('expo-file-system') as typeof import('expo-file-system');
    const Sharing = require('expo-sharing') as typeof import('expo-sharing');
    /* eslint-enable @typescript-eslint/no-require-imports */
    const file = new fs.File(fs.Paths.cache, filename);
    file.create({ overwrite: true });
    await file.write(csv);
    if (!(await Sharing.isAvailableAsync())) {
      return { ok: false, reason: 'Sharing is not available on this device.' };
    }
    await Sharing.shareAsync(file.uri, {
      mimeType: 'text/csv',
      UTI: 'public.comma-separated-values-text',
      dialogTitle: 'Export event log',
    });
    return { ok: true, filename, via: 'share' };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}
