import React from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';
import Button from './ui/Button';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Смена ключа (например, при переходе на другую страницу) сбрасывает границу. */
  resetKey?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Граница ошибок: падение одной страницы больше не даёт «белый экран» —
 * показываем аккуратную заглушку с возможностью перезагрузить или уйти на дашборд.
 */
export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="p-6">
        <div className="max-w-lg mx-auto mt-10 bg-surface rounded-xl shadow-card border border-line p-6 text-center">
          <div className="w-12 h-12 rounded-full bg-danger-soft flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="text-danger-fg" />
          </div>
          <h2 className="text-lg font-semibold text-content mb-2">Что-то пошло не так</h2>
          <p className="text-sm text-muted mb-1">
            Раздел не удалось отобразить. Данные на сервере не изменены.
          </p>
          <p className="text-xs text-faint mb-5 break-words">{error.message}</p>
          <div className="flex justify-center gap-3">
            <Button variant="secondary" onClick={() => this.setState({ error: null })}>
              Попробовать снова
            </Button>
            <Button
              variant="primary"
  
              onClick={() => window.location.reload()}
            >
              Перезагрузить
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
