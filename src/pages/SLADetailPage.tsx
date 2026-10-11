import React from 'react';
import { ArrowLeft } from 'lucide-react';
import SLADetailCard from '../components/SLADetailCard';

interface SLADetailPageProps {
  slaId: string;
  onBack: () => void;
}

export default function SLADetailPage({ slaId, onBack }: SLADetailPageProps) {
  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-muted hover:text-content">
        <ArrowLeft className="mr-2" />Назад
      </button>
      <SLADetailCard slaId={slaId} />
    </div>
  );
}