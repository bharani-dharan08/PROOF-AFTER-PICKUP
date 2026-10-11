import React, { useState } from 'react';
import { LotItem } from '../../types';
import { Building2, Plus, Scale, MapPin, PackageCheck, ShieldCheck } from 'lucide-react';

interface SocietyViewProps {
  lots: LotItem[];
  onCreateLot: (
    payload: {
      lot_id?: string;
      declared_weight_kg: number;
      waste_type: string;
      society_id: string;
      location: string;
    },
    idempotencyKey: string
  ) => Promise<any>;
}

export const SocietyView: React.FC<SocietyViewProps> = ({ lots, onCreateLot }) => {
  const [showModal, setShowModal] = useState(false);
  const [declaredWeight, setDeclaredWeight] = useState<number>(30.0);
  const [wasteType, setWasteType] = useState('Category I: Rigid Plastics');
  const [societyId, setSocietyId] = useState('SOC-SEATTLE-01');
  const [location, setLocation] = useState('742 Evergreen Terrace, Seattle WA');
  const [idempotencyKey, setIdempotencyKey] = useState('idemp-lot-' + Math.random().toString(36).substring(2, 9));
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    await onCreateLot(
      {
        declared_weight_kg: Number(declaredWeight),
        waste_type: wasteType,
        society_id: societyId,
        location
      },
      idempotencyKey
    );
    setIsSubmitting(false);
    setShowModal(false);
    setIdempotencyKey('idemp-lot-' + Math.random().toString(36).substring(2, 9));
  };

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="rounded-sm border border-[#545b64] bg-[#162a3f] p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold text-[#ff9900] uppercase tracking-wider flex items-center gap-1.5">
              <Building2 className="w-4 h-4" /> COGNITO GROUP: SOCIETY
            </span>
            <span className="bg-[#0f1b2a] border border-[#545b64] text-[10px] font-mono text-gray-300 px-1.5 py-0.5 rounded-sm">
              ROLE: CREATOR
            </span>
          </div>
          <h1 className="text-lg font-bold text-white mt-1">Disposal & Pickup Lot Creator</h1>
          <p className="text-xs text-gray-400 mt-0.5 max-w-xl">
            Create waste disposal lots with declared weights. Invokes <code className="text-[#ff9900] font-mono">CreateLot</code> Lambda with write-only IAM policy (<code className="text-[#ff9900] font-mono">dynamodb:PutItem</code>).
          </p>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-sm bg-[#ff9900] hover:bg-[#e88b00] text-black font-bold text-xs uppercase tracking-wider transition cursor-pointer"
        >
          <Plus className="w-4 h-4 text-black" />
          <span>CREATE NEW LOT</span>
        </button>
      </div>

      {/* Lot Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {lots.map((lot) => {
          let badgeClass = "bg-blue-100 text-blue-900";
          if (lot.status === 'CONFIRMED_RECEIVED' || lot.status === 'PROCESSOR_ACCEPTED') {
            badgeClass = "bg-green-100 text-green-800";
          } else if (lot.status === 'EXCEPTION_FLAGGED' || lot.status === 'EXCEPTION_PENDING') {
            badgeClass = "bg-yellow-100 text-yellow-900";
          }

          return (
            <div
              key={lot.lot_id}
              className="rounded-sm border border-[#545b64] bg-[#162a3f] p-4 space-y-3"
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[11px] font-mono text-[#ff9900] font-bold">{lot.lot_id}</span>
                  <h3 className="text-xs font-bold text-white flex items-center gap-1.5 mt-0.5">
                    <PackageCheck className="w-4 h-4 text-gray-400" />
                    {lot.waste_type}
                  </h3>
                </div>

                <span className={`px-2 py-0.5 rounded-sm text-[10px] font-bold uppercase tracking-wider ${badgeClass}`}>
                  {lot.status}
                </span>
              </div>

              {/* Data Grid: Crisp Key-Value Pairs */}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#545b64]">
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold block">Declared Weight</span>
                  <span className="text-sm text-white font-mono font-medium">{lot.declared_weight_kg} kg</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold block">Society ID</span>
                  <span className="text-sm text-white font-mono font-medium">{lot.society_id}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold block">Address Location</span>
                  <span className="text-xs text-white font-medium flex items-center gap-1 mt-0.5">
                    <MapPin className="w-3 h-3 text-gray-400 shrink-0" />
                    {lot.location}
                  </span>
                </div>
              </div>

            </div>
          );
        })}
      </div>

      {/* Modal: Create Lot */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-md rounded-sm border border-[#545b64] bg-[#162a3f] p-5 shadow-2xl text-white space-y-4">
            <h2 className="text-sm font-bold text-white flex items-center gap-2 border-b border-[#545b64] pb-2">
              <Building2 className="w-4 h-4 text-[#ff9900]" />
              CREATE DISPOSAL LOT (AWS SAM DYNAMODB)
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-gray-400 uppercase tracking-wider text-[10px] font-semibold mb-1">Declared Weight (kg)</label>
                <input
                  type="number"
                  step="0.1"
                  value={declaredWeight}
                  onChange={(e) => setDeclaredWeight(parseFloat(e.target.value))}
                  className="w-full rounded-sm border border-[#545b64] bg-[#0f1b2a] px-3 py-2 text-white font-mono font-bold focus:border-[#ff9900] focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-gray-400 uppercase tracking-wider text-[10px] font-semibold mb-1">CPCB Waste Category</label>
                <select
                  value={wasteType}
                  onChange={(e) => setWasteType(e.target.value)}
                  className="w-full rounded-sm border border-[#545b64] bg-[#0f1b2a] px-3 py-2 text-white focus:border-[#ff9900] focus:outline-none"
                >
                  <option value="Category I: Rigid Plastics">Category I: Rigid Plastics</option>
                  <option value="Category II: Flexible Plastics">Category II: Flexible Plastics</option>
                  <option value="Category III: Multilayered (MLP)">Category III: Multilayered (MLP)</option>
                  <option value="Category IV: Compostable Plastics">Category IV: Compostable Plastics</option>
                </select>
              </div>

              <div>
                <label className="block text-gray-400 uppercase tracking-wider text-[10px] font-semibold mb-1">Pickup Address Location</label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full rounded-sm border border-[#545b64] bg-[#0f1b2a] px-3 py-2 text-white focus:border-[#ff9900] focus:outline-none"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#545b64]">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-sm border border-[#545b64] bg-[#0f1b2a] text-gray-300 font-bold uppercase text-[10px] hover:bg-[#232f3e] transition"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-sm bg-[#ff9900] hover:bg-[#e88b00] text-black font-bold uppercase tracking-wider text-[10px] transition cursor-pointer"
                >
                  {isSubmitting ? 'CREATING...' : 'SUBMIT LOT'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
