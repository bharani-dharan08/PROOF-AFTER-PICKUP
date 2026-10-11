import React, { useState } from 'react';
import { LotItem } from '../../types';
import { ShieldAlert, Server, Database, AlertOctagon, Activity, FileText, FileSpreadsheet } from 'lucide-react';
import { CpcbEprManifestModal } from '../CpcbEprManifestModal';

interface SupervisorViewProps {
  lots: LotItem[];
}

export const SupervisorView: React.FC<SupervisorViewProps> = ({ lots }) => {
  const [selectedLot, setSelectedLot] = useState<LotItem | null>(lots[0] || null);
  const [isEprModalOpen, setIsEprModalOpen] = useState(false);

  const exceptions = lots.filter(l => l.status === 'EXCEPTION_FLAGGED' || (l.weight_mismatch_pct && l.weight_mismatch_pct > 10) || l.is_contaminated);

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="rounded-sm border border-[#545b64] bg-[#162a3f] p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold text-[#ff9900] uppercase tracking-wider flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4" /> COGNITO GROUP: SUPERVISOR / CPCB OFFICER
            </span>
            <span className="bg-[#0f1b2a] border border-[#545b64] text-[10px] font-mono text-gray-300 px-1.5 py-0.5 rounded-sm">
              ROLE: AUDITOR
            </span>
          </div>
          <h1 className="text-lg font-bold text-white mt-1">Operations Control & Exception Pipeline Inspector</h1>
          <p className="text-xs text-gray-400 mt-0.5 max-w-xl">
            Monitor single-table <code className="text-[#ff9900] font-mono">ProofAfterPickup-Lots</code>, EventBridge rules, SQS FIFO exception queue alerts, and generate CPCB EPR Manifest reports.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setIsEprModalOpen(true)}
            className="px-4 py-2.5 rounded-sm bg-[#ff9900] hover:bg-[#e88b00] text-black font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-black" />
            CPCB EPR MANIFEST GENERATOR
          </button>

          <span className="px-3 py-2 rounded-sm border border-red-600 bg-[#0f1b2a] text-red-300 text-xs font-bold font-mono flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-red-400" />
            {exceptions.length} ACTIVE EXCEPTIONS
          </span>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-sm border border-[#545b64] bg-[#162a3f] p-4 space-y-1">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Single-Table Lots</span>
          <div className="flex items-baseline justify-between pt-1">
            <span className="text-2xl font-bold text-white font-mono">{lots.length}</span>
            <Database className="w-5 h-5 text-[#ff9900]" />
          </div>
          <p className="text-[10px] text-gray-400">ProofAfterPickup-Lots</p>
        </div>

        <div className="rounded-sm border border-[#545b64] bg-[#162a3f] p-4 space-y-1">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Confirmed Received</span>
          <div className="flex items-baseline justify-between pt-1">
            <span className="text-2xl font-bold text-green-400 font-mono">
              {lots.filter(l => l.status === 'CONFIRMED_RECEIVED' || l.status === 'PROCESSOR_ACCEPTED').length}
            </span>
            <Activity className="w-5 h-5 text-green-400" />
          </div>
          <p className="text-[10px] text-gray-400">Within 10% Tolerance</p>
        </div>

        <div className="rounded-sm border border-[#545b64] bg-[#162a3f] p-4 space-y-1">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">EventBridge Exceptions</span>
          <div className="flex items-baseline justify-between pt-1">
            <span className="text-2xl font-bold text-red-400 font-mono">{exceptions.length}</span>
            <AlertOctagon className="w-5 h-5 text-red-400" />
          </div>
          <p className="text-[10px] text-gray-400">Weight Mismatch / Contaminated</p>
        </div>

        <div className="rounded-sm border border-[#545b64] bg-[#162a3f] p-4 space-y-1">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">SQS FIFO Queue</span>
          <div className="flex items-baseline justify-between pt-1">
            <span className="text-2xl font-bold text-[#ff9900] font-mono">
              {exceptions.length}
            </span>
            <Server className="w-5 h-5 text-[#ff9900]" />
          </div>
          <p className="text-[10px] text-gray-400">proofafterpickup-exceptions.fifo</p>
        </div>
      </div>

      {/* SQS FIFO Exception Alerts List */}
      {exceptions.length > 0 && (
        <div className="rounded-sm border border-red-600 bg-[#162a3f] p-5 space-y-4">
          <h2 className="text-xs font-bold text-red-300 uppercase tracking-wider flex items-center gap-2 border-b border-[#545b64] pb-2">
            <AlertOctagon className="w-4 h-4 text-red-400" />
            SQS FIFO Queue Exception Messages (Weight &gt; 10% or Contaminated)
          </h2>

          <div className="space-y-3">
            {exceptions.map((ex) => (
              <div key={ex.lot_id} className="rounded-sm border border-[#545b64] bg-[#0f1b2a] p-3 space-y-2 text-xs">
                <div className="flex justify-between items-center border-b border-[#545b64] pb-2">
                  <span className="font-mono text-[#ff9900] font-bold">{ex.lot_id}</span>
                  <span className="px-2 py-0.5 rounded-sm text-[10px] font-bold bg-yellow-100 text-yellow-900 uppercase">
                    STATUS: EXCEPTION_FLAGGED
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 font-mono text-xs">
                  <div>
                    <span className="text-gray-400 block text-[10px] uppercase font-semibold">Declared Weight</span>
                    <span className="text-white font-medium">{ex.declared_weight_kg} kg</span>
                  </div>
                  <div>
                    <span className="text-gray-400 block text-[10px] uppercase font-semibold">Actual Received</span>
                    <span className="text-[#ff9900] font-medium">{ex.actual_weight_kg || 'N/A'} kg</span>
                  </div>
                  <div>
                    <span className="text-gray-400 block text-[10px] uppercase font-semibold">Mismatch Delta</span>
                    <span className="text-red-400 font-bold">{ex.weight_mismatch_pct || '0'}%</span>
                  </div>
                </div>

                {ex.is_contaminated && (
                  <p className="text-red-400 font-bold text-xs pt-1 border-t border-[#545b64] mt-1">
                    ⚠️ Batch flagged as CONTAMINATED by plant receiver {ex.receiver_id}.
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Single-Table Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="rounded-sm border border-[#545b64] bg-[#162a3f] p-5 space-y-4">
          <h2 className="text-xs font-bold text-white flex items-center gap-2 uppercase tracking-wider border-b border-[#545b64] pb-2">
            <FileText className="w-4 h-4 text-[#ff9900]" />
            Select Single-Table Lot Item
          </h2>

          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {lots.map((l) => (
              <button
                key={l.lot_id}
                onClick={() => setSelectedLot(l)}
                className={`w-full text-left p-3 rounded-sm border transition cursor-pointer ${
                  selectedLot?.lot_id === l.lot_id
                    ? 'border-[#ff9900] bg-[#0f1b2a]'
                    : 'border-[#545b64] bg-[#162a3f] hover:bg-[#0f1b2a]'
                }`}
              >
                <div className="flex justify-between items-center text-xs">
                  <span className="font-mono text-[#ff9900] font-bold">{l.lot_id}</span>
                  <span className="text-[10px] text-gray-400 uppercase">{l.status}</span>
                </div>
                <p className="text-xs text-gray-300 truncate mt-0.5">{l.waste_type}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2 rounded-sm border border-[#545b64] bg-[#162a3f] p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-[#545b64] pb-2">
            <div>
              <span className="text-[10px] font-mono text-[#ff9900] uppercase block">Single-Table Item JSON</span>
              <h2 className="text-xs font-bold text-white font-mono">PK: {selectedLot?.PK || 'LOT#ID'}</h2>
            </div>
            <span className="px-2 py-0.5 rounded-sm bg-[#0f1b2a] font-mono text-[10px] text-gray-300 border border-[#545b64]">
              Table: ProofAfterPickup-Lots
            </span>
          </div>

          <div className="rounded-sm bg-[#0f1b2a] p-4 border border-[#545b64] font-mono text-xs text-gray-200 max-h-[380px] overflow-auto">
            <pre>{JSON.stringify(selectedLot || lots[0], null, 2)}</pre>
          </div>
        </div>
      </div>

      {/* CPCB EPR Manifest Generator Modal */}
      <CpcbEprManifestModal
        isOpen={isEprModalOpen}
        onClose={() => setIsEprModalOpen(false)}
      />

    </div>
  );
};
