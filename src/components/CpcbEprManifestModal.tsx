import React, { useState } from 'react';
import { generateCpcbEprManifestApi, EprManifestResponse } from '../services/apiService';
import { FileSpreadsheet, Download, RefreshCw, Calendar, ShieldCheck, MapPin, X, FileText, ExternalLink } from 'lucide-react';

interface CpcbEprManifestModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CpcbEprManifestModal: React.FC<CpcbEprManifestModalProps> = ({ isOpen, onClose }) => {
  const [startDate, setStartDate] = useState('2026-01-01');
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [stateName, setStateName] = useState('Tamil Nadu');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<EprManifestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    const res = await generateCpcbEprManifestApi({
      start_date: startDate,
      end_date: endDate,
      state: stateName,
      generated_by: 'CPCB Authorized Auditor / ProofAfterPickup'
    });

    setLoading(false);
    if (!res.success) {
      setError(res.error || 'Failed to generate CPCB EPR Manifest.');
    } else {
      setResult(res);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 overflow-y-auto">
      <div className="bg-[#162a3f] border border-[#545b64] rounded-sm max-w-2xl w-full p-5 text-white shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white transition p-1"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3 border-b border-[#545b64] pb-3 mb-4">
          <div className="w-8 h-8 rounded-sm bg-[#ff9900] text-black flex items-center justify-center font-bold">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
              CPCB EPR MANIFEST GENERATOR
              <span className="text-[10px] bg-[#0f1b2a] text-[#ff9900] border border-[#545b64] px-1.5 py-0.5 rounded-sm font-mono">
                CPCB COMPLIANCE
              </span>
            </h2>
            <p className="text-xs text-gray-400">
              Generate Central Pollution Control Board (CPCB) plastic waste manifests categorized by EPR Category I, II, & III.
            </p>
          </div>
        </div>

        <form onSubmit={handleGenerate} className="space-y-4 mb-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-[10px] uppercase font-semibold text-gray-400 mb-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-[#ff9900]" /> START DATE
              </label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full bg-[#0f1b2a] border border-[#545b64] rounded-sm p-2 text-xs text-white focus:outline-none focus:border-[#ff9900] font-mono"
                required
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase font-semibold text-gray-400 mb-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-[#ff9900]" /> END DATE
              </label>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full bg-[#0f1b2a] border border-[#545b64] rounded-sm p-2 text-xs text-white focus:outline-none focus:border-[#ff9900] font-mono"
                required
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase font-semibold text-gray-400 mb-1 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-[#ff9900]" /> JURISDICTION STATE
              </label>
              <select
                value={stateName}
                onChange={e => setStateName(e.target.value)}
                className="w-full bg-[#0f1b2a] border border-[#545b64] rounded-sm p-2 text-xs text-white focus:outline-none focus:border-[#ff9900]"
              >
                <option value="Tamil Nadu">Tamil Nadu</option>
                <option value="Karnataka">Karnataka</option>
                <option value="Maharashtra">Maharashtra</option>
                <option value="Delhi NCR">Delhi NCR</option>
                <option value="Telangana">Telangana</option>
              </select>
            </div>
          </div>

          <div className="bg-[#0f1b2a] p-3 rounded-sm border border-[#545b64] text-xs text-gray-300 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#ff9900] shrink-0" />
              Queries <code className="text-[#ff9900] font-mono">PROCESSOR_ACCEPTED</code> items in DynamoDB table <code className="text-white font-mono">ProofAfterPickup-Lots</code>.
            </span>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-[#ff9900] hover:bg-[#e88b00] text-black font-bold text-xs uppercase tracking-wider rounded-sm transition cursor-pointer flex items-center gap-2 shrink-0 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-black" /> GENERATING...
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4 text-black" /> GENERATE CPCB CSV
                </>
              )}
            </button>
          </div>
        </form>

        {error && (
          <div className="bg-red-950/80 border border-red-600 text-red-200 text-xs p-3 rounded-sm mb-4">
            {error}
          </div>
        )}

        {result && result.success && (
          <div className="bg-[#0f1b2a] border border-[#545b64] rounded-sm p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-[#545b64] pb-2">
              <div>
                <span className="text-xs text-[#ff9900] font-mono font-bold uppercase tracking-wider block">
                  MANIFEST ID: {result.manifest_id}
                </span>
                <span className="text-[11px] text-gray-400">
                  Total Processed Lots: <strong className="text-white">{result.records_count}</strong>
                </span>
              </div>

              {result.s3_presigned_url && (
                <a
                  href={result.s3_presigned_url}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 bg-green-100 text-green-900 font-bold text-xs uppercase tracking-wider rounded-sm transition flex items-center gap-1.5"
                >
                  <Download className="w-4 h-4" /> DOWNLOAD CSV REPORT
                </a>
              )}
            </div>

            {/* Category Breakdown */}
            {result.category_breakdown && (
              <div className="grid grid-cols-3 gap-2 pt-1 font-mono text-xs">
                <div className="bg-[#162a3f] p-2 rounded-sm border border-[#545b64]">
                  <span className="text-[10px] text-gray-400 block uppercase font-semibold">Category I (Rigid)</span>
                  <span className="text-white font-bold">{result.category_breakdown['Category I: Rigid'] || 0} kg</span>
                </div>
                <div className="bg-[#162a3f] p-2 rounded-sm border border-[#545b64]">
                  <span className="text-[10px] text-gray-400 block uppercase font-semibold">Category II (Flexible)</span>
                  <span className="text-white font-bold">{result.category_breakdown['Category II: Flexible'] || 0} kg</span>
                </div>
                <div className="bg-[#162a3f] p-2 rounded-sm border border-[#545b64]">
                  <span className="text-[10px] text-gray-400 block uppercase font-semibold">Category III (MLP)</span>
                  <span className="text-white font-bold">{result.category_breakdown['Category III: MLP'] || 0} kg</span>
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
};
