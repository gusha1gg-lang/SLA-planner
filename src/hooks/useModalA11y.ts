import { RefObject, useEffect, useRef } from 'react';

/** Фокусируемые элементы окна — для фокус-трапа по Tab. */
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Первое поле ввода — фокус при открытии окна (удобнее, чем кнопка закрытия). */
const FIRST_FIELD =
  'input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled])';

/**
 * Доступность модального окна (единообразно для всех модалок портала):
 *  - закрытие по `Escape`;
 *  - фокус-трап: Tab не уводит фокус за пределы окна;
 *  - при открытии фокус ставится в первое поле (или в окно);
 *  - при закрытии фокус возвращается на элемент, открывший окно;
 *  - фон не прокручивается, пока окно открыто.
 *
 * Панели окна нужен `ref={panelRef}` и `tabIndex={-1}`. Клик по затемнённому фону
 * обрабатывается отдельно (см. разметку окна).
 */
export function useModalA11y(
  isOpen: boolean,
  panelRef: RefObject<HTMLElement | null>,
  onClose: () => void,
) {
  // onClose держим в ref: эффект не должен перезапускаться (и перехватывать фокус)
  // при каждом рендере родителя с новой inline-функцией.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    const panel = panelRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Фокус внутрь окна — иначе Tab начинается с адресной строки/фона.
    if (panel) {
      const field = panel.querySelector<HTMLElement>(FIRST_FIELD);
      const first = panel.querySelector<HTMLElement>(FOCUSABLE);
      (field ?? first ?? panel).focus();
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;

      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter(el => el.offsetParent !== null || el === document.activeElement);
      if (items.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
  }, [isOpen, panelRef]);
}
