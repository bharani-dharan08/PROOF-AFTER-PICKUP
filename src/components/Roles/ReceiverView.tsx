import React, { useState } from 'react';
import { LotItem } from '../../types';
import { EvidenceCaptureModal } from '../Receiver/EvidenceCaptureModal';
import { Factory, Scale, CheckCircle2, Camera, X } from 'lucide-react';

interface ReceiverViewProps {
  lots: LotItem[];
  onConfirmReceipt: (
    lotId: string,
    payload: {
      receiver_id: string;
      actual_weight_kg: number;
      is_contaminated: boolean;
      evidence_image_url?: string;
      evidence_object_key?: string;
    }
  ) => Promise<any>;
}

export const ReceiverView: React.FC<ReceiverViewProps> = ({ lots, onConfirmReceipt }) => {
  const [selectedLot, setSelectedLot] = useState<LotItem | null>(null);
  const [actualWeight, setActualWeight] = useState<number>(25.0);
  const [isContaminated, setIsContaminated] = useState<boolean>(false);
  const [evidenceObjectKey, setEvidenceObjectKey] = useState<string | null>(null);
  const [evidencePublicUrl, setEvidencePublicUrl] = useState<string | null>(null);
  const [showEvidenceModal, setShowEvidenceModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const claimedLots = lots.filter(l => l.status === 'CLAIMED' || l.status === 'IN_TRANSIT');

  const handleOpenConfirmModal = (lot: LotItem) => {
    setSelectedLot(lot);
    setActualWeight(lot.declared_weight_kg);
    setIsContaminated(false);
    setEvidenceObjectKey(null);
    setEvidencePublicUrl(null);
  };

  const handleEvidenceUploaded = (objectKey: string, publicUrl: string) => {
    setEvidenceObjectKey(objectKey);
    setEvidencePublicUrl(publicUrl);
    setShowEvidenceModal(false);
  };

  const handleExecuteConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLot) return;

    setIsSubmitting(true);
    await onConfirmReceipt(selectedLot.lot_id, {
      receiver_id: 'RECV-RECYCLING-PLANT-01',
      actual_weight_kg: Number(actualWeight),
      is_contaminated: isContaminated,
      evidence_image_url: evidencePublicUrl || undefined,
      evidence_object_key: evidenceObjectKey || undefined
    });
    setIsSubmitting(false);
    setSelectedLot(null);
  };

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="rounded-sm border border-[#545b64] bg-[#162a3f] p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold text-[#ff9900] uppercase tracking-wider flex items-center gap-1.5">
              <Factory className="w-4 h-4" /> COGNITO GROUP: RECEIVER
            </span>
            <span className="bg-[#0f1b2a] border border-[#545b64] text-[10px] font-mono text-gray-300 px-1.5 py-0.5 rounded-sm">
              ROLE: PROCESSOR & VERIFIER
            </span>
          </div>
          <h1 className="text-lg font-bold text-white mt-1">Recycling Plant Receipt & Photographic Evidence</h1>
          <p className="text-xs text-gray-400 mt-0.5 max-w-xl">
            Verify lot arrival, measure actual weight, and capture camera evidence for contamination exceptions via S3 Pre-signed POST URLs.
          </p>
        </div>
      </div>

      {/* Claimed Lots Awaiting Receipt */}
      <div className="space-y-3">
        <h2 className="text-xs font-bold text-[#ff9900] uppercase tracking-wider flex items-center gap-2 border-b border-[#545b64] pb-2">
          IN-TRANSIT LOTS AWAITING RECEIPT ({claimedLots.length})
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {claimedLots.map((lot) => (
            <div key={lot.lot_id} className="rounded-sm border border-[#545b64] bg-[#162a3f] p-4 space-y-3">
              <div className="flex justify-between items-start border-b border-[#545b64] pb-2">
                <span className="text-xs font-mono font-bold text-[#ff9900]">{lot.lot_id}</span>
                <span className="px-2 py-0.5 rounded-sm text-[10px] font-bold uppercase bg-yellow-100 text-yellow-900">
                  {lot.status}
                </span>
              </div>

              {/* Data Grid: Key-Value Pairs */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold block">Waste Category</span>
                  <span className="text-xs text-white font-medium">{lot.waste_type}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold block">Declared Weight</span>
                  <span className="text-xs text-white font-mono font-medium">{lot.declared_weight_kg} kg</span>
                </div>
                <div className="col-span-2">
                  <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold block">Origin Society</span>
                  <span className="text-xs text-white font-mono font-medium">{lot.society_id}</span>
                </div>
              </div>

              <button
                onClick={() => handleOpenConfirmModal(lot)}
                className="w-full py-2 px-3 rounded-sm bg-[#ff9900] hover:bg-[#e88b00] text-black font-bold text-xs uppercase tracking-wider transition cursor-pointer flex items-center justify-center gap-2"
              >
                <Factory className="w-4 h-4 text-black" />
                <span>VERIFY & CONFIRM RECEIPT</span>
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Confirm Modal */}
      {selectedLot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-md rounded-sm border border-[#545b64] bg-[#162a3f] p-5 shadow-2xl text-white space-y-4">
            <div className="flex items-center justify-between border-b border-[#545b64] pb-2">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Scale className="w-4 h-4 text-[#ff9900]" /> CONFIRM RECEIPT: {selectedLot.lot_id}
              </h3>
              <button onClick={() => setSelectedLot(null)} className="p-1 text-gray-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleExecuteConfirm} className="space-y-4 text-xs">
              <div className="rounded-sm bg-[#0f1b2a] p-3 border border-[#545b64] space-y-1">
                <span className="text-gray-400 text-[10px] font-bold uppercase block">LOT SUMMARY:</span>
                <p className="text-white font-bold">{selectedLot.waste_type}</p>
                <p className="text-[#ff9900] font-mono">Declared Weight: {selectedLot.declared_weight_kg} kg</p>
              </div>

              <div>
                <label className="block text-gray-400 uppercase tracking-wider text-[10px] font-semibold mb-1">
                  Measured Actual Received Weight (kg)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={actualWeight}
                  onChange={(e) => setActualWeight(parseFloat(e.target.value))}
                  className="w-full rounded-sm border border-[#545b64] bg-[#0f1b2a] px-3 py-2 text-white font-mono font-bold focus:border-[#ff9900] focus:outline-none"
                  required
                />
              </div>

              <div className="rounded-sm border border-[#545b64] bg-[#0f1b2a] p-3 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isContaminated}
                    onChange={(e) => setIsContaminated(e.target.checked)}
                    className="rounded-sm border-[#545b64] text-red-500 focus:ring-red-500 h-4 w-4 bg-[#162a3f]"
                  />
                  <span className="font-bold text-red-400 uppercase text-xs">Flag as Contaminated Batch</span>
                </label>

                {/* S3 Evidence Photo Upload Section */}
                <div className="pt-2 border-t border-[#545b64] flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-gray-400 block font-semibold uppercase">Photographic Evidence:</span>
                    {evidenceObjectKey ? (
                      <span className="text-[10px] text-green-400 font-mono font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Photo Uploaded
                      </span>
                    ) : (
                      <span className="text-[10px] text-gray-500 italic">No photo attached</span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowEvidenceModal(true)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-sm bg-[#162a3f] hover:bg-[#232f3e] border border-[#545b64] text-white font-bold text-[10px] uppercase transition cursor-pointer"
                  >
                    <Camera className="w-3.5 h-3.5 text-[#ff9900]" />
                    <span>{evidenceObjectKey ? 'Change Photo' : 'Capture Photo (S3)'}</span>
                  </button>
                </div>
              </div>

              {/* Live Variance Preview */}
              {selectedLot.declared_weight_kg > 0 && (
                <div className={`rounded-sm p-3 border text-xs font-mono ${
                  Math.abs(selectedLot.declared_weight_kg - actualWeight) / selectedLot.declared_weight_kg > 0.1 || isContaminated
                    ? 'bg-red-950/40 border-red-600 text-red-300'
                    : 'bg-green-950/40 border-green-600 text-green-300'
                }`}>
                  <div className="flex justify-between items-center">
                    <span className="uppercase text-[10px]">Weight Mismatch %:</span>
                    <span className="font-bold text-sm">
                      {((Math.abs(selectedLot.declared_weight_kg - actualWeight) / selectedLot.declared_weight_kg) * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#545b64]">
                <button
                  type="button"
                  onClick={() => setSelectedLot(null)}
                  className="px-4 py-2 rounded-sm border border-[#545b64] bg-[#0f1b2a] text-gray-300 font-bold uppercase text-[10px] hover:bg-[#232f3e] transition"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-sm bg-[#ff9900] hover:bg-[#e88b00] text-black font-bold uppercase tracking-wider text-[10px] transition cursor-pointer"
                >
                  {isSubmitting ? 'CONFIRMING...' : 'CONFIRM RECEIPT'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* S3 Evidence Photo Capture Modal */}
      {showEvidenceModal && selectedLot && (
        <EvidenceCaptureModal
          lotId={selectedLot.lot_id}
          onEvidenceUploaded={handleEvidenceUploaded}
          onClose={() => setShowEvidenceModal(false)}
        />
      )}

    </div>
  );
};
