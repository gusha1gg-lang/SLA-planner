/**
 * Склейка CSS-классов с отсечением «пустых» значений.
 * Свой микропомощник, чтобы не тянуть clsx ради десятка вызовов.
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
