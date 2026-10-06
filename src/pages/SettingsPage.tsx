import React, { useState } from 'react';

export default function SettingsPage() {
  const [zabbixUrl, setZabbixUrl] = useState('https://zabbix.example.com/api_jsonrpc.php');
  const [zabbixToken, setZabbixToken] = useState('');
  const [readOnly, setReadOnly] = useState(true);
  const [timezone, setTimezone] = useState('Europe/Moscow');
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Настройки</h1>
        <p className="text-gray-500 mt-1">Конфигурация подключения к Zabbix и параметры системы</p>
      </div>

      {saved && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
          <i className="fas fa-check-circle mr-2"></i>Настройки сохранены
        </div>
      )}

      {/* Zabbix Connection */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <i className="fas fa-server text-blue-600"></i>Подключение к Zabbix
        </h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">API URL</label>
            <input value={zabbixUrl} onChange={e => setZabbixUrl(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm" />
            <p className="text-xs text-gray-400 mt-1">Endpoint JSON-RPC API Zabbix 7.0</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">API Token</label>
            <input type="password" value={zabbixToken} onChange={e => setZabbixToken(e.target.value)}
              placeholder="Bearer token для авторизации"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm" />
            <p className="text-xs text-gray-400 mt-1">Используется в заголовке Authorization: Bearer</p>
          </div>
          <button className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
            <i className="fas fa-plug mr-2"></i>Проверить подключение
          </button>
        </div>
      </div>

      {/* Safety */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <i className="fas fa-shield-alt text-green-600"></i>Безопасность
        </h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div>
              <p className="font-medium text-gray-900">Режим Read-Only</p>
              <p className="text-sm text-gray-500">Запрещает любые записи в Zabbix (sla.update)</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" checked={readOnly} onChange={e => setReadOnly(e.target.checked)} className="sr-only peer" />
              <div className="w-11 h-6 bg-gray-200 peer-focus:ring-4 peer-focus:ring-blue-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-800">
              <i className="fas fa-exclamation-triangle mr-2"></i>
              <strong>Внимание:</strong> В режиме Read-Only портал НЕ может создавать исключения простоя в Zabbix.
              Единственный пишущий метод — sla.update — заблокирован.
            </p>
          </div>
        </div>
      </div>

      {/* General */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <i className="fas fa-cog text-gray-600"></i>Общие
        </h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Часовой пояс</label>
            <select value={timezone} onChange={e => setTimezone(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
              <option value="Europe/Moscow">Europe/Moscow (UTC+3)</option>
              <option value="UTC">UTC</option>
              <option value="Asia/Yekaterinburg">Asia/Yekaterinburg (UTC+5)</option>
              <option value="Asia/Novosibirsk">Asia/Novosibirsk (UTC+7)</option>
            </select>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={handleSave} className="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-700">
          <i className="fas fa-save mr-2"></i>Сохранить настройки
        </button>
      </div>
    </div>
  );
}
