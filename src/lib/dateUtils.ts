// =========================================================================
// CENTRALIZED DATE & TIME FORMATTING UTILITIES (INDONESIAN DD-MM-YYYY STANDARD)
// =========================================================================

const INDONESIAN_MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

const INDONESIAN_DAYS = [
  'Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'
];

const SHORT_DAYS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

/**
 * Parses diverse date inputs (YYYY-MM-DD, ISO string, timestamp number, or Date)
 * into a safe, valid Date object normalized to local midnight or local time.
 */
export function parseDateInput(input: string | Date | number | null | undefined): Date {
  if (!input) return new Date();
  if (input instanceof Date) return isNaN(input.getTime()) ? new Date() : input;

  if (typeof input === 'number') {
    const d = new Date(input);
    return isNaN(d.getTime()) ? new Date() : d;
  }

  const str = String(input).trim();

  // Handle YYYY-MM-DD pattern directly to avoid timezone shift
  const ymdMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10) - 1;
    const day = parseInt(ymdMatch[3], 10);
    return new Date(year, month, day, 12, 0, 0);
  }

  // Handle DD-MM-YYYY or DD/MM/YYYY
  const dmyMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1;
    const year = parseInt(dmyMatch[3], 10);
    return new Date(year, month, day, 12, 0, 0);
  }

  const d = new Date(str);
  return isNaN(d.getTime()) ? new Date() : d;
}

/**
 * Format to standard DD-MM-YYYY (e.g., "20-11-2026")
 */
export function formatToDDMMYYYY(input: string | Date | number | null | undefined, separator: string = '-'): string {
  const d = parseDateInput(input);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}${separator}${month}${separator}${year}`;
}

/**
 * Format to full Indonesian date (e.g., "20 November 2026")
 */
export function formatToIndonesianDate(input: string | Date | number | null | undefined): string {
  const d = parseDateInput(input);
  const day = d.getDate();
  const month = INDONESIAN_MONTHS[d.getMonth()] || '';
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}

/**
 * Format to Indonesian day and date (e.g., "Jumat, 20 November 2026")
 */
export function formatToDayDate(input: string | Date | number | null | undefined): string {
  const d = parseDateInput(input);
  const dayName = INDONESIAN_DAYS[d.getDay()] || '';
  return `${dayName}, ${formatToIndonesianDate(d)}`;
}

/**
 * Format to short day and date (e.g., "Jum, 20-11-2026")
 */
export function formatShortDayDate(input: string | Date | number | null | undefined): string {
  const d = parseDateInput(input);
  const dayName = SHORT_DAYS[d.getDay()] || '';
  return `${dayName}, ${formatToDDMMYYYY(d)}`;
}

/**
 * Format to short chart day and date (e.g., "Jum, 20-11")
 */
export function formatChartDate(input: string | Date | number | null | undefined): string {
  const d = parseDateInput(input);
  const dayName = SHORT_DAYS[d.getDay()] || '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${dayName}, ${day}-${month}`;
}
