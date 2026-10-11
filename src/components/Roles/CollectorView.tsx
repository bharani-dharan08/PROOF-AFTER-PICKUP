import React from 'react';
import { LotItem } from '../../types';
import { CollectorDashboard } from '../Collector/CollectorDashboard';

interface CollectorViewProps {
  lots: LotItem[];
  onClaimLot: (lotId: string, collectorId: string) => Promise<any>;
  onRefresh?: () => void;
}

export const CollectorView: React.FC<CollectorViewProps> = ({ lots, onClaimLot, onRefresh }) => {
  return (
    <CollectorDashboard
      lots={lots}
      onClaimLotApi={onClaimLot}
      onRefresh={onRefresh || (() => {})}
    />
  );
};
