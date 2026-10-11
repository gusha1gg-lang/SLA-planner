import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, Plug, Save, Server, Settings, ShieldCheck } from 'lucide-react';
import { useToast } from '../context/ToastContext';

export default function SettingsPage() {
  const { showToast } = useToast();
  const [zabbixUrl, setZabbixUrl] = useState('https://zabbix.example.com/api_jsonrpc.php');
  const [zabbixToken, setZabbixToken] = useState('');
  const [readOnly, setReadOnly] = useState(true);
  const [timezone, setTimezone] = useState('Europe/Moscow');
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    showToast('success', 'Настройки сохранены');
    setTimeout(() => setSaved(false), 2000);
  };

  const handleTestConnection = async () => {
    showToast('info', 'Проверка подключения к Zabbix...');
    // В реальности — вызов API для проверки
    setTimeout(() => {
      showToast('warning', 'Zabbix не подключен (демо-режим)');
    }, 1500);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-content">Настройки</h1>
        <p className="text-muted mt-1">Конфигурация подключения к Zabbix и параметры системы</p>
      </div>

      {saved && (
        <div className="bg-ok-soft border border-ok-line text-ok-fg px-4 py-3 rounded-lg text-sm">
          <CheckCircle2 className="mr-2" />Настройки сохранены
        </div>
      )}

      {/* Zabbix Connection */}
      <div className="bg-surface rounded-xl shadow-card border border-line p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Server className="text-accent" />Подключение к Zabbix
        </h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-content mb-1">API URL</label>
            <input value={zabbixUrl} onChange={e => setZabbixUrl(e.target.value)}
              className="w-full px-3 py-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-brand-500 outline-none font-mono text-sm" />
            <p className="text-xs text-faint mt-1">Endpoint JSON-RPC API Zabbix 7.0</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-content mb-1">API Token</label>
            <input type="password" value={zabbixToken} onChange={e => setZabbixToken(e.target.value)}
              placeholder="Bearer token для авторизации"
              className="w-full px-3 py-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-brand-500 outline-none font-mono text-sm" />
            <p className="text-xs text-faint mt-1">Используется в заголовке Authorization: Bearer</p>
          </div>
          <button onClick={handleTestConnection} className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700">
            <Plug className="mr-2" />Проверить подключение
          </button>
        </div>
      </div>

      {/* Safety */}
      <div className="bg-surface rounded-xl shadow-card border border-line p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <ShieldCheck className="text-ok-fg" />Безопасность
        </h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-surface-2 rounded-lg">
            <div>
              <p className="font-medium text-content">Режим Read-Only</p>
              <p className="text-sm text-muted">Запрещает любые записи в Zabbix (sla.update)</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" checked={readOnly} onChange={e => setReadOnly(e.target.checked)} className="sr-only peer" />
              <div className="w-11 h-6 bg-line peer-focus:ring-4 peer-focus:ring-accent-line rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-line-strong after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-600"></div>
            </label>
          </div>
          <div className="p-4 bg-warn-soft border border-warn-line rounded-lg">
            <p className="text-sm text-warn-fg">
              <AlertTriangle className="mr-2" />
              <strong>Внимание:</strong> В режиме Read-Only портал НЕ может создавать исключения простоя в Zabbix.
              Единственный пишущий метод — sla.update — заблокирован.
            </p>
          </div>
        </div>
      </div>

      {/* General */}
      <div className="bg-surface rounded-xl shadow-card border border-line p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Settings className="text-muted" />Общие
        </h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-content mb-1">Часовой пояс</label>
            <select value={timezone} onChange={e => setTimezone(e.target.value)}
              className="w-full px-3 py-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-brand-500 outline-none">
              <option value="Europe/Moscow">Europe/Moscow (UTC+3)</option>
              <option value="UTC">UTC</option>
              <option value="Asia/Yekaterinburg">Asia/Yekaterinburg (UTC+5)</option>
              <option value="Asia/Novosibirsk">Asia/Novosibirsk (UTC+7)</option>
            </select>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={handleSave} className="bg-brand-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-brand-700">
          <Save className="mr-2" />Сохранить настройки
        </button>
      </div>
    </div>
  );
}
