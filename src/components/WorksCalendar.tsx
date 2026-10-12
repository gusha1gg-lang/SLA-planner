import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PlannedWork } from '../types';
import { mskDateKey } from '../time';

/**
 * Месячный календарь плановых работ (сетка Пн–Вс, переключение месяцев).
 * Используется в режиме «Календарь» на «Плановых работах» и как блок на «Дашборде».
 * Работа попадает в день, если `started_at ≤ день ≤ ended_at` (даты по МСК).
 */
interface WorksCalendarProps {
  works: PlannedWork[];
  /** Клик по работе (на «Дашборде» — переход к «Плановым работам»). Не задан — карточки некликабельны. */
  onWorkClick?: (work: PlannedWork) => void;
}

/** Цвет карточки работы по статусу (как в списке «Плановых работ»). */
function chipClass(status: string): string {
  if (status === 'done') return 'bg-ok-soft text-ok-fg';
  if (status === 'planned') return 'bg-accent-soft text-accent';
  if (status === 'draft') return 'bg-surface-2 text-muted';
  return 'bg-warn-soft text-warn-fg'; // active / cancelled / sync_error
}

export default function WorksCalendar({ works, onWorkClick }: WorksCalendarProps) {
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [calYear, setCalYear] = useState(new Date().getFullYear());

  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(calYear, calMonth, 1).getDay() || 7;
  const today = new Date();

  const getWorksForDay = (day: number) => {
    const key = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return works.filter(w => {
      const start = mskDateKey(w.started_at);
      const end = mskDateKey(w.ended_at);
      return start !== '' && end !== '' && start <= key && key <= end;
    });
  };

  const prevMonth = () => {
    if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); } else setCalMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); } else setCalMonth(m => m + 1);
  };

  return (
    <div className="bg-surface rounded-xl shadow-card border border-line p-5">
      <div className="flex items-center justify-between mb-4">
        <button onClick={prevMonth} aria-label="Предыдущий месяц"
          className="p-2 hover:bg-surface-2 rounded-lg transition-colors"><ChevronLeft /></button>
        <h3 className="text-lg font-semibold">
          {new Date(calYear, calMonth).toLocaleString('ru-RU', { month: 'long', year: 'numeric' })}
        </h3>
        <button onClick={nextMonth} aria-label="Следующий месяц"
          className="p-2 hover:bg-surface-2 rounded-lg transition-colors"><ChevronRight /></button>
      </div>
      <div className="grid grid-cols-7 gap-px bg-line rounded-lg overflow-hidden">
        {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(d => (
          <div key={d} className="bg-surface-2 p-2 text-center text-xs font-medium text-muted">{d}</div>
        ))}
        {Array.from({ length: firstDayOfWeek - 1 }, (_, i) => (
          <div key={`empty-${i}`} className="bg-surface-2 p-2 min-h-[80px]"></div>
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const dayWorks = getWorksForDay(day);
          const isToday = day === today.getDate() && calMonth === today.getMonth() && calYear === today.getFullYear();
          return (
            <div key={day} className={`bg-surface p-2 min-h-[80px] ${isToday ? 'ring-2 ring-brand-500 ring-inset' : ''}`}>
              <div className={`text-sm font-medium mb-1 ${isToday ? 'text-accent' : 'text-content'}`}>{day}</div>
              {dayWorks.slice(0, 2).map(w => {
                const cls = `text-xs px-1.5 py-0.5 rounded mb-0.5 truncate ${chipClass(w.status)}`;
                return onWorkClick ? (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => onWorkClick(w)}
                    title={`Открыть в «Плановых работах»: ${w.title}`}
                    className={`block w-full text-left cursor-pointer hover:brightness-95 transition ${cls}`}
                  >
                    {w.title}
                  </button>
                ) : (
                  <div key={w.id} className={cls}>{w.title}</div>
                );
              })}
              {dayWorks.length > 2 && <div className="text-xs text-faint">+{dayWorks.length - 2} ещё</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
