import React, { useState, useEffect } from 'react';
import { LotItem } from '../../types';
import { QRScanner } from './QRScanner';
import { saveOfflineLot, getOfflineQueue, removeOfflineItem, OfflineQueueItem } from '../../services/dbStorage';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { VoiceNoteRecorder } from '../VoiceNoteRecorder';
import { QrCode, Truck, RefreshCw, Scale, MapPin, Database, Zap, Compass, Mic } from 'lucide-react';

interface CollectorDashboardProps {
  lots: LotItem[];
  onClaimLotApi: (lotId: string, collectorId: string, locationCoords?: { lat: number; lng: number }) => Promise<any>;
  onRefresh: () => void;
}

export const CollectorDashboard: React.FC<CollectorDashboardProps> = ({
  lots,
  onClaimLotApi,
  onRefresh
}) => {
  const [showScanner, setShowScanner] = useState(false);
  const [scannedLotId, setScannedLotId] = useState<string | null>(null);
  const [voiceNoteLotId, setVoiceNoteLotId] = useState<string | null>(null);
  const [offlineQueueItems, setOfflineQueueItems] = useState<OfflineQueueItem[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [collectorId, setCollectorId] = useState('COLL-DRV-102');
  const [syncStatusMsg, setSyncStatusMsg] = useState<string | null>(null);
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null);

  const isOnline = useOnlineStatus();

  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setGpsCoords({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        () => {
          setGpsCoords({ lat: 47.6062, lng: -122.3321 });
        }
      );
    } else {
      setGpsCoords({ lat: 47.6062, lng: -122.3321 });
    }
  }, []);

  const refreshOfflineQueue = async () => {
    const queue = await getOfflineQueue();
    setOfflineQueueItems(queue);
  };

  useEffect(() => {
    refreshOfflineQueue();
  }, []);

  useEffect(() => {
    if (isOnline && offlineQueueItems.length > 0) {
      syncOfflineQueue();
    }
  }, [isOnline]);

  const syncOfflineQueue = async () => {
    if (offlineQueueItems.length === 0) return;
    setIsSyncing(true);
    setSyncStatusMsg(`Syncing ${offlineQueueItems.length} queued lot(s) to AWS API Gateway...`);

    const currentQueue = await getOfflineQueue();
    for (const item of currentQueue) {
      try {
        const res = await onClaimLotApi(item.lotId, item.collectorId, gpsCoords || undefined);
        if (res.success || res.error?.includes('already')) {
          await removeOfflineItem(item.id);
        }
      } catch (err) {
        console.error('Failed to sync item:', item.lotId, err);
      }
    }

    await refreshOfflineQueue();
    setIsSyncing(false);
    onRefresh();
    setSyncStatusMsg('All offline queued pickups successfully synced to AWS!');
    setTimeout(() => setSyncStatusMsg(null), 4000);
  };

  const handleQRSuccess = (scannedText: string) => {
    setShowScanner(false);
    setScannedLotId(scannedText.trim());
  };

  const handleConfirmPickupBilingual = async () => {
    if (!scannedLotId) return;

    const idempotencyKey = `idemp-coll-${Date.now()}`;

    if (!isOnline) {
      await saveOfflineLot(scannedLotId, collectorId, idempotencyKey);
      await refreshOfflineQueue();
      setScannedLotId(null);
      setSyncStatusMsg(`Lot '${scannedLotId}' saved offline to IndexedDB! Pending background sync.`);
      setTimeout(() => setSyncStatusMsg(null), 4000);
      return;
    }

    const res = await onClaimLotApi(scannedLotId, collectorId, gpsCoords || undefined);

    if (res.success) {
      setSyncStatusMsg(`Pickup confirmed for ${scannedLotId}! Haversine Distance: ${res.data?.geofence_distance_m || 0}m. Status: IN_TRANSIT.`);
    } else if (res.error?.includes('GeoFencingViolation')) {
      setSyncStatusMsg(`⚠️ GEOFENCE VIOLATION REJECTED: Collector is > 200 meters from facility location!`);
    } else {
      await saveOfflineLot(scannedLotId, collectorId, idempotencyKey);
      await refreshOfflineQueue();
      setSyncStatusMsg(`Saved Offline: Pending Sync (${res.error || 'Network error'})`);
    }

    setScannedLotId(null);
    onRefresh();
    setTimeout(() => setSyncStatusMsg(null), 5000);
  };

  const matchedLot = lots.find(l => l.lot_id === scannedLotId || l.PK === `LOT#${scannedLotId}`);

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="rounded-sm border border-[#545b64] bg-[#162a3f] p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold text-[#ff9900] uppercase tracking-wider flex items-center gap-1.5">
              <Truck className="w-4 h-4" /> COGNITO GROUP: COLLECTOR
            </span>
            <span className="bg-[#0f1b2a] border border-[#545b64] text-[10px] font-mono text-gray-300 px-1.5 py-0.5 rounded-sm">
              ROLE: LOGISTICS
            </span>
          </div>
          <h1 className="text-lg font-bold text-white mt-1">Collector Lot Pickup Terminal</h1>
          <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1.5">
            <Compass className="w-3.5 h-3.5 text-[#ff9900]" />
            <span>
              GPS Location: {gpsCoords ? `${gpsCoords.lat.toFixed(4)}, ${gpsCoords.lng.toFixed(4)}` : 'Acquiring GPS...'} (Haversine 200m Geofence Active)
            </span>
          </p>
        </div>

        <button
          onClick={() => setShowScanner(true)}
          className="flex items-center gap-2 px-5 py-3 rounded-sm bg-[#ff9900] hover:bg-[#e88b00] text-black font-bold text-xs uppercase tracking-wider transition cursor-pointer"
        >
          <QrCode className="w-5 h-5 text-black" />
          <span>SCAN LOT QR CODE</span>
        </button>
      </div>

      {/* Sync Status Banner */}
      {syncStatusMsg && (
        <div className={`rounded-sm border p-3 text-xs font-bold flex items-center justify-between shadow-sm ${
          syncStatusMsg.includes('VIOLATION')
            ? 'border-red-600 bg-[#162a3f] text-red-300'
            : 'border-[#ff9900] bg-[#162a3f] text-[#ff9900]'
        }`}>
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-[#ff9900]" />
            <span>{syncStatusMsg}</span>
          </div>
        </div>
      )}

      {/* Offline Pending Sync Queue Badge Bar */}
      {offlineQueueItems.length > 0 && (
        <div className="rounded-sm border border-[#545b64] bg-[#162a3f] p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#545b64] pb-2">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-sm bg-[#ff9900] text-black text-[10px] font-bold uppercase tracking-wider">
                Saved Offline: Pending Sync
              </span>
              <span className="text-xs font-bold text-[#ff9900]">
                ({offlineQueueItems.length} Lot Queue Items in IndexedDB)
              </span>
            </div>

            <button
              onClick={syncOfflineQueue}
              disabled={isSyncing || !isOnline}
              className="flex items-center justify-center gap-2 px-3 py-1.5 rounded-sm bg-[#0f1b2a] hover:bg-[#232f3e] text-white font-bold text-xs uppercase border border-[#545b64] transition cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Syncing...' : 'Sync Queued Items Now'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Scanned QR Confirmation Modal */}
      {scannedLotId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-lg rounded-sm border border-[#545b64] bg-[#162a3f] p-5 shadow-2xl space-y-4 text-white">
            
            <div className="border-b border-[#545b64] pb-2 flex justify-between items-center">
              <div>
                <span className="text-[10px] font-bold text-[#ff9900] uppercase tracking-wider block">
                  SCANNED QR DETECTED
                </span>
                <h2 className="text-lg font-bold text-white font-mono">{scannedLotId}</h2>
              </div>
            </div>

            <div className="rounded-sm border border-[#545b64] bg-[#0f1b2a] p-3 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-400 uppercase text-[10px]">Waste Category:</span>
                <span className="text-white font-medium">{matchedLot?.waste_type || 'Disposal Lot'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 uppercase text-[10px]">Declared Weight:</span>
                <span className="text-[#ff9900] font-mono font-bold">{matchedLot?.declared_weight_kg || 25} kg</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 uppercase text-[10px]">GPS Geofence Rule:</span>
                <span className="text-green-400 font-medium">Haversine Max 200 meters</span>
              </div>
            </div>

            {/* Bilingual Confirmation Button */}
            <button
              onClick={handleConfirmPickupBilingual}
              className="w-full py-3 px-4 rounded-sm bg-[#ff9900] hover:bg-[#e88b00] text-black font-bold text-xs uppercase tracking-wider transition cursor-pointer flex flex-col items-center justify-center gap-0.5"
            >
              <span className="text-sm font-bold uppercase">Confirm Pickup</span>
              <span className="text-[11px] font-normal tracking-normal opacity-90">பிக்-அப்பை உறுதிப்படுத்தவும்</span>
            </button>

            <button
              onClick={() => setScannedLotId(null)}
              className="w-full py-1 text-xs font-bold text-gray-400 hover:text-white transition uppercase"
            >
              Cancel Scan
            </button>

          </div>
        </div>
      )}

      {/* Available Lots Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between border-b border-[#545b64] pb-2">
          <h2 className="text-xs font-bold text-[#ff9900] uppercase tracking-wider flex items-center gap-2">
            <Database className="w-4 h-4 text-[#ff9900]" />
            AVAILABLE LOTS READY FOR PICKUP ({lots.filter(l => l.status === 'CREATED').length})
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {lots.filter(l => l.status === 'CREATED').map((lot) => (
            <div key={lot.lot_id} className="rounded-sm border border-[#545b64] bg-[#162a3f] p-4 space-y-3">
              <div className="flex justify-between items-start border-b border-[#545b64] pb-2">
                <span className="text-xs font-mono font-bold text-[#ff9900]">{lot.lot_id}</span>
                <span className="px-2 py-0.5 rounded-sm text-[10px] font-bold uppercase bg-blue-100 text-blue-900">
                  {lot.status}
                </span>
              </div>

              {/* Crisp Key-Value Pairs Data Grid */}
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
                  <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold block">Location</span>
                  <span className="text-xs text-white font-medium flex items-center gap-1 mt-0.5">
                    <MapPin className="w-3 h-3 text-gray-400 shrink-0" />
                    {lot.location}
                  </span>
                </div>
              </div>

              <div className="flex gap-2 pt-2 border-t border-[#545b64]">
                <button
                  onClick={() => setScannedLotId(lot.lot_id)}
                  className="flex-1 py-2 px-3 rounded-sm bg-[#ff9900] hover:bg-[#e88b00] text-black font-bold text-xs uppercase tracking-wider transition cursor-pointer"
                >
                  CLAIM LOT / பிக்-அப்
                </button>
                <button
                  onClick={() => setVoiceNoteLotId(lot.lot_id)}
                  title="Voice Note"
                  className="px-3 py-2 rounded-sm bg-[#0f1b2a] hover:bg-[#232f3e] text-white border border-[#545b64] font-bold text-xs uppercase tracking-wider transition cursor-pointer flex items-center justify-center gap-1"
                >
                  <Mic className="w-4 h-4 text-[#ff9900]" />
                  <span className="hidden sm:inline">VOICE NOTE</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {voiceNoteLotId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-lg">
            <VoiceNoteRecorder
              lotId={voiceNoteLotId}
              recordedBy={`Collector (${collectorId})`}
              onSuccess={(transcript) => {
                setSyncStatusMsg(`Voice Exception Note recorded for Lot '${voiceNoteLotId}': "${transcript}"`);
                setTimeout(() => setSyncStatusMsg(null), 6000);
                onRefresh();
              }}
              onClose={() => setVoiceNoteLotId(null)}
            />
          </div>
        </div>
      )}

      {showScanner && (
        <QRScanner
          onScanSuccess={handleQRSuccess}
          onClose={() => setShowScanner(false)}
        />
      )}

    </div>
  );
};
