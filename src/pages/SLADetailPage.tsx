import React from 'react';
import SLADetailCard from '../components/SLADetailCard';

interface SLADetailPageProps {
  slaId: string;
  onBack: () => void;
}

export default function SLADetailPage({ slaId, onBack }: SLADetailPageProps) {
  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-gray-500 hover:text-gray-700">
        <i className="fas fa-arrow-left mr-2"></i>Назад
      </button>
      <SLADetailCard slaId={slaId} />
    </div>
  );
}