import React, { useId } from 'react';

/**
 * Логотип портала — инлайн-SVG (без внешних файлов и CDN, чтобы работало
 * в закрытом контуре). Абстрактный «узел модели здоровья»: шестиугольник
 * с расходящимися связями — отсылка к дереву услуг и SLA-метрикам.
 */
export default function BrandMark({ className = 'w-9 h-9' }: { className?: string }) {
  const id = useId();
  const gradId = `bm-${id.replace(/:/g, '')}`;
  return (
    <svg viewBox="0 0 32 32" className={className} role="img" aria-label="SLA Planner">
      <rect x="1" y="1" width="30" height="30" rx="8" fill={`url(#${gradId})`} />
      <rect x="1" y="1" width="30" height="30" rx="8" fill="none" stroke="rgba(255,255,255,0.18)" />
      <path d="M16 6.8l7.2 4.1v8.2L16 23.2 8.8 19.1v-8.2L16 6.8z" stroke="#fff" strokeWidth="1.4" opacity="0.9" />
      <circle cx="16" cy="15" r="2.5" fill="#fff" />
      <path
        d="M16 7.6v4.4M9.6 10.4l4.2 2.4M22.4 10.4l-4.2 2.4M9.6 18.6l4.2-2.4M22.4 18.6l-4.2-2.4M16 17.9v4.2"
        stroke="#fff"
        strokeWidth="1.1"
        opacity="0.65"
      />
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3f6cae" />
          <stop offset="1" stopColor="#2a4875" />
        </linearGradient>
      </defs>
    </svg>
  );
}
