import React from 'react';
import { ArrowLeft } from 'lucide-react';
import SLADetailCard from '../components/SLADetailCard';
import Button from '../components/ui/Button';

interface SLADetailPageProps {
  slaId: string;
  onBack: () => void;
}

export default function SLADetailPage({ slaId, onBack }: SLADetailPageProps) {
  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={onBack}>
        Назад
      </Button>
      <SLADetailCard slaId={slaId} />
    </div>
  );
}
