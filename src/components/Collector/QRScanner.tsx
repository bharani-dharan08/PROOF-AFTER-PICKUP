import React, { useEffect, useRef, useState } from 'react';
import { Html5QrcodeScanner, Html5QrcodeScanType } from 'html5-qrcode';
import { Camera, X, Scan, Zap, AlertCircle } from 'lucide-react';

interface QRScannerProps {
  onScanSuccess: (scannedText: string) => void;
  onClose: () => void;
}

export const QRScanner: React.FC<QRScannerProps> = ({ onScanSuccess, onClose }) => {
  const [manualCode, setManualCode] = useState('');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

  useEffect(() => {
    const scannerId = 'qr-reader-container';

    try {
      const scanner = new Html5QrcodeScanner(
        scannerId,
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA],
          rememberLastUsedCamera: true
        },
        /* verbose= */ false
      );

      scannerRef.current = scanner;

      scanner.render(
        (decodedText) => {
          if (decodedText) {
            try {
              scanner.clear();
            } catch {
              // ignore cleanup error
            }
            onScanSuccess(decodedText);
          }
        },
        (errorMessage) => {
          // ignore transient frame decode errors
        }
      );
    } catch (err: any) {
      setCameraError('Camera access unavailable or blocked. Use manual scanner below.');
    }

    return () => {
      if (scannerRef.current) {
        try {
          scannerRef.current.clear();
        } catch {
          // cleanup
        }
      }
    };
  }, [onScanSuccess]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualCode.trim()) {
      onScanSuccess(manualCode.trim());
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/90 p-4 backdrop-blur-md">
      <div className="w-full max-w-md rounded-xl border-2 border-amber-500 bg-zinc-900 text-zinc-100 shadow-2xl overflow-hidden font-mono">
        
        {/* Rugged Header */}
        <div className="flex items-center justify-between border-b-2 border-amber-500 bg-zinc-950 px-4 py-3">
          <div className="flex items-center gap-2">
            <Scan className="w-5 h-5 text-amber-500 animate-pulse" />
            <span className="text-sm font-black tracking-widest text-amber-500 uppercase">
              INDUSTRIAL QR SCANNER
            </span>
          </div>
          <button
            onClick={onClose}
            className="rounded bg-zinc-800 p-2 text-zinc-300 hover:bg-amber-500 hover:text-zinc-950 transition cursor-pointer"
          >
            <X className="w-5 h-5 font-bold" />
          </button>
        </div>

        {/* Scanner Viewport */}
        <div className="p-4 space-y-4">
          
          <div className="relative rounded-lg border-2 border-dashed border-zinc-700 bg-zinc-950 p-2 overflow-hidden min-h-[280px]">
            {/* HTML5 QR Camera Container */}
            <div id="qr-reader-container" className="w-full text-zinc-100" />

            {cameraError && (
              <div className="p-4 text-center text-xs text-amber-400 bg-zinc-900/90 rounded border border-amber-500/30 my-4 space-y-2">
                <AlertCircle className="w-6 h-6 mx-auto text-amber-500" />
                <p className="font-bold">{cameraError}</p>
              </div>
            )}
          </div>

          {/* Manual Input Fallback for gloved testing or simulated barcode scanning */}
          <form onSubmit={handleManualSubmit} className="space-y-2 border-t-2 border-zinc-800 pt-3">
            <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
              Manual Barcode / Lot ID Input
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="e.g. LOT-SOC-9821"
                className="flex-1 rounded border-2 border-zinc-700 bg-zinc-950 px-3 py-2.5 text-xs text-amber-400 font-bold uppercase focus:border-amber-500 focus:outline-none"
              />
              <button
                type="submit"
                className="px-4 py-2.5 rounded bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black text-xs uppercase tracking-wider transition cursor-pointer"
              >
                Scan
              </button>
            </div>
          </form>

        </div>

        {/* Footer info */}
        <div className="bg-zinc-950 px-4 py-2 text-[10px] text-zinc-500 border-t border-zinc-800 flex justify-between uppercase">
          <span>Camera Optic: Active</span>
          <span>Targeting: Auto-Focus</span>
        </div>

      </div>
    </div>
  );
};
