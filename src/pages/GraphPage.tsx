import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { SLA, Service } from '../types';
import { DataSet } from 'vis-data';
import { Network, Options } from 'vis-network';

export default function GraphPage() {
  const [slas, setSlas] = useState<SLA[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [links, setLinks] = useState<{ sla_id: number; service_id: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const networkRef = useRef<Network | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (slas.length > 0 && services.length > 0 && containerRef.current) {
      renderGraph();
    }
  }, [slas, services, links]);

  const loadData = async () => {
    try {
      const [s, svc, l] = await Promise.all([
        api.getSLAs(),
        api.getServices(),
        api.getSLAServiceLinks(),
      ]);
      setSlas(s);
      setServices(svc);
      setLinks(l);
    } finally {
      setLoading(false);
    }
  };

  const renderGraph = () => {
    if (!containerRef.current) return;

    const nodes = new DataSet<any>([
      ...slas.map(sla => ({
        id: `sla-${sla.id}`,
        label: sla.name,
        shape: 'box',
        color: { background: '#3B82F6', border: '#2563EB', highlight: { background: '#60A5FA', border: '#3B82F6' } },
        font: { color: '#ffffff', size: 14, face: 'Inter, sans-serif' },
        borderWidth: 2,
        shadow: true,
        margin: 12,
        level: 0,
      })),
      ...services.map(svc => ({
        id: `svc-${svc.id}`,
        label: svc.name,
        shape: 'ellipse',
        color: { background: '#8B5CF6', border: '#7C3AED', highlight: { background: '#A78BFA', border: '#8B5CF6' } },
        font: { color: '#ffffff', size: 12, face: 'Inter, sans-serif' },
        borderWidth: 2,
        shadow: true,
        margin: 10,
        level: svc.parent_zabbix_serviceid ? 2 : 1,
      })),
    ]);

    const edges = new DataSet<any>([
      // SLA → Service links
      ...links.map(link => ({
        from: `sla-${link.sla_id}`,
        to: `svc-${link.service_id}`,
        color: { color: '#94A3B8', highlight: '#3B82F6' },
        width: 2,
        arrows: { to: { enabled: true, scaleFactor: 0.5 } },
      })),
      // Service → Service (parent)
      ...services.filter(s => s.parent_zabbix_serviceid).map(s => ({
        from: `svc-${services.find(p => p.zabbix_serviceid === s.parent_zabbix_serviceid)?.id}`,
        to: `svc-${s.id}`,
        color: { color: '#CBD5E1', highlight: '#8B5CF6' },
        width: 1.5,
        dashes: true,
        arrows: { to: { enabled: true, scaleFactor: 0.4 } },
      })),
    ]);

    const options: Options = {
      physics: {
        enabled: true,
        barnesHut: {
          gravitationalConstant: -3000,
          centralGravity: 0.3,
          springLength: 150,
          springConstant: 0.04,
        },
        stabilization: { iterations: 100 },
      },
      interaction: {
        hover: true,
        tooltipDelay: 200,
      },
      layout: {
        hierarchical: {
          enabled: true,
          direction: 'UD',
          sortMethod: 'level',
          levelSeparation: 120,
          nodeSpacing: 160,
        },
      },
    };

    if (networkRef.current) {
      networkRef.current.destroy();
    }

    networkRef.current = new Network(containerRef.current, { nodes, edges }, options);
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><i className="fas fa-spinner fa-spin text-3xl text-blue-600"></i></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Граф SLA и услуг</h1>
          <p className="text-gray-500 mt-1">Визуализация связей SLA → Услуги (через теги)</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-sm text-gray-600">
            <span className="w-3 h-3 rounded bg-blue-500"></span> SLA
          </span>
          <span className="flex items-center gap-1.5 text-sm text-gray-600">
            <span className="w-3 h-3 rounded-full bg-purple-500"></span> Услуга
          </span>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div ref={containerRef} className="w-full h-[600px]" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="font-semibold text-gray-900 mb-3">SLA ({slas.length})</h3>
          <div className="space-y-2">
            {slas.map(sla => (
              <div key={sla.id} className="flex items-center justify-between text-sm">
                <span className="text-gray-700">{sla.name}</span>
                <span className="text-gray-400 font-mono text-xs">slaid={sla.zabbix_slaid}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="font-semibold text-gray-900 mb-3">Услуги ({services.length})</h3>
          <div className="space-y-2">
            {services.map(svc => (
              <div key={svc.id} className="flex items-center justify-between text-sm">
                <span className="text-gray-700">
                  {svc.parent_zabbix_serviceid && <i className="fas fa-level-up-alt text-gray-300 mr-2 text-xs"></i>}
                  {svc.name}
                </span>
                <span className="text-gray-400 font-mono text-xs">id={svc.zabbix_serviceid}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
