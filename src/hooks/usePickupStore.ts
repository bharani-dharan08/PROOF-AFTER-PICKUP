import { useState, useEffect, useCallback } from 'react';
import { LotItem, AppRole, OfflineQueuedAction } from '../types';
import { fetchLotsApi, createLotApi, claimLotApi, confirmReceiptApi } from '../services/apiService';
import { useOnlineStatus } from './useOnlineStatus';

const LOCAL_STORAGE_KEY = 'proof_after_pickup_lots_v2';
const OFFLINE_QUEUE_KEY = 'proof_after_pickup_offline_queue_v2';

export function usePickupStore() {
  const [lots, setLots] = useState<LotItem[]>([]);
  const [offlineQueue, setOfflineQueue] = useState<OfflineQueuedAction[]>([]);
  const [currentRole, setCurrentRole] = useState<AppRole>('Society');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  const isOnline = useOnlineStatus();

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4500);
  };

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const serverItems = await fetchLotsApi();
      if (serverItems && serverItems.length > 0) {
        setLots(serverItems);
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(serverItems));
      } else {
        const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (saved) setLots(JSON.parse(saved));
      }
    } catch {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) setLots(JSON.parse(saved));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const savedQueue = localStorage.getItem(OFFLINE_QUEUE_KEY);
    if (savedQueue) setOfflineQueue(JSON.parse(savedQueue));
  }, [loadData]);

  // Sync Offline Queue
  useEffect(() => {
    if (isOnline && offlineQueue.length > 0) {
      showToast(`Online detected! Flushing ${offlineQueue.length} queued offline actions to AWS API...`, 'info');
      
      const processQueue = async () => {
        const remainingQueue: OfflineQueuedAction[] = [];
        for (const action of offlineQueue) {
          if (action.type === 'CREATE_LOT') {
            const res = await createLotApi(action.payload, action.idempotencyKey);
            if (!res.success && !res.cached) remainingQueue.push(action);
          }
        }
        setOfflineQueue(remainingQueue);
        localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remainingQueue));
        loadData();
        showToast('Offline actions successfully processed by AWS SAM backend!', 'success');
      };

      processQueue();
    }
  }, [isOnline, offlineQueue, loadData]);

  useEffect(() => {
    if (lots.length > 0) {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(lots));
    }
  }, [lots]);

  // Create Lot (Society)
  const createLot = async (payload: {
    lot_id?: string;
    declared_weight_kg: number;
    waste_type: string;
    society_id: string;
    location: string;
  }, idempotencyKey: string) => {
    if (!isOnline) {
      const queuedAction: OfflineQueuedAction = {
        id: Math.random().toString(36).substring(2, 9),
        type: 'CREATE_LOT',
        idempotencyKey,
        payload,
        timestamp: Date.now()
      };
      const updatedQueue = [...offlineQueue, queuedAction];
      setOfflineQueue(updatedQueue);
      localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(updatedQueue));
      showToast('Offline mode active: Lot buffered in local PWA queue.', 'info');
      return { success: true, queued: true };
    }

    const res = await createLotApi(payload, idempotencyKey);
    if (res.success && res.data) {
      setLots(prev => [res.data!, ...prev.filter(l => l.lot_id !== res.data!.lot_id)]);
      showToast(`Lot ${res.data.lot_id} created in ProofAfterPickup-Lots table!`, 'success');
      return { success: true, item: res.data };
    } else {
      showToast(`Creation Error: ${res.error}`, 'error');
      return { success: false, error: res.error };
    }
  };

  // Claim Lot (Collector)
  const claimLot = async (lotId: string, collectorId: string) => {
    const res = await claimLotApi(lotId, collectorId);
    if (res.success && res.data) {
      setLots(prev => prev.map(l => l.lot_id === lotId ? res.data! : l));
      showToast(`Lot ${lotId} claimed by ${collectorId}!`, 'success');
      return { success: true, item: res.data };
    } else {
      showToast(`Claim Error: ${res.error}`, 'error');
      return { success: false, error: res.error };
    }
  };

  // Confirm Receipt (Receiver)
  const confirmReceipt = async (
    lotId: string,
    payload: {
      receiver_id: string;
      actual_weight_kg: number;
      is_contaminated: boolean;
      evidence_image_url?: string;
    }
  ) => {
    const res = await confirmReceiptApi(lotId, payload);
    if (res.success && res.data) {
      setLots(prev => prev.map(l => l.lot_id === lotId ? res.data! : l));
      if (res.exceptionTriggered) {
        showToast(`EXCEPTION TRIGGERED on ${lotId}: Weight mismatch > 10% or contamination detected! Published to EventBridge.`, 'error');
      } else {
        showToast(`Receipt confirmed for Lot ${lotId}. Weight verified within tolerance.`, 'success');
      }
      return { success: true, item: res.data };
    } else {
      showToast(`Confirmation Error: ${res.error}`, 'error');
      return { success: false, error: res.error };
    }
  };

  return {
    lots,
    offlineQueue,
    currentRole,
    setCurrentRole,
    isLoading,
    toastMessage,
    showToast,
    createLot,
    claimLot,
    confirmReceipt,
    refreshLots: loadData
  };
}
