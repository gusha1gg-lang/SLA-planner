/**
 * Единое время проекта — Москва (MSK, UTC+3, без перехода на летнее время).
 *
 * Бэкенд отдаёт моменты времени в UTC с явной зоной (`...Z`). Чтобы интерфейс
 * показывал одно и то же время независимо от часового пояса браузера/машины,
 * все метки форматируются через `Intl` с `timeZone: 'Europe/Moscow'`.
 */

export const MSK_TZ = 'Europe/Moscow';

function toDate(value?: string | number | Date | null): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Части даты/времени по Москве (через formatToParts — без проблем с разделителями). */
function mskParts(value?: string | number | Date | null) {
  const d = toDate(value);
  if (!d) return null;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: MSK_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour'), mi: get('minute'), s: get('second') };
}

/** «дд.мм.гггг, чч:мм» по Москве. */
export function formatDateTime(value?: string | number | Date | null): string {
  const p = mskParts(value);
  return p ? `${p.d}.${p.m}.${p.y}, ${p.h}:${p.mi}` : '—';
}

/** «дд.мм, чч:мм» по Москве. */
export function formatDateTimeShort(value?: string | number | Date | null): string {
  const p = mskParts(value);
  return p ? `${p.d}.${p.m}, ${p.h}:${p.mi}` : '—';
}

/** «дд.мм.гггг» по Москве. */
export function formatDate(value?: string | number | Date | null): string {
  const p = mskParts(value);
  return p ? `${p.d}.${p.m}.${p.y}` : '—';
}

/** «чч:мм:сс» по Москве. */
export function formatTime(value?: string | number | Date | null): string {
  const p = mskParts(value);
  return p ? `${p.h}:${p.mi}:${p.s}` : '—';
}

/** Ключ дня «гггг-мм-дд» по Москве (для календаря). */
export function mskDateKey(value?: string | number | Date | null): string {
  const p = mskParts(value);
  return p ? `${p.y}-${p.m}-${p.d}` : '';
}

/** Момент → значение для <input type="datetime-local"> в московском времени. */
export function toMskInputValue(value?: string | number | Date | null): string {
  const p = mskParts(value);
  return p ? `${p.y}-${p.m}-${p.d}T${p.h}:${p.mi}` : '';
}

/**
 * Значение <input type="datetime-local"> (московское) → Date (момент).
 * MSK = UTC+3 круглый год, поэтому смещение фиксированное.
 */
export function mskInputToDate(value: string): Date {
  return new Date(value.length === 16 ? `${value}:00+03:00` : `${value}+03:00`);
}
