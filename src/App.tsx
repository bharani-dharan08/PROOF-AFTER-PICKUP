import React from 'react';
import { usePickupStore } from './hooks/usePickupStore';
import { Navbar } from './components/Navbar';
import { SocietyView } from './components/Roles/SocietyView';
import { CollectorView } from './components/Roles/CollectorView';
import { ReceiverView } from './components/Roles/ReceiverView';
import { SupervisorView } from './components/Roles/SupervisorView';
import { AWSStudio } from './components/AWSArchitecture/AWSStudio';
import { OfflineIndicator } from './components/OfflineIndicator';
import { ShieldCheck, CheckCircle2, AlertTriangle, Info } from 'lucide-react';

export default function App() {
  const {
    lots,
    offlineQueue,
    currentRole,
    setCurrentRole,
    isLoading,
    toastMessage,
    createLot,
    claimLot,
    confirmReceipt,
    refreshLots
  } = usePickupStore();

  return (
    <div className="min-h-screen bg-[#0f1b2a] text-white flex flex-col font-sans selection:bg-[#ff9900]/30 selection:text-white">
      
      {/* Toast Notification - AWS Cloudscape Banner Style */}
      {toastMessage && (
        <div className={`fixed top-16 right-4 z-50 flex items-center gap-2.5 rounded-sm border px-4 py-3 text-xs font-semibold shadow-md transition ${
          toastMessage.type === 'success'
            ? 'border-green-600 bg-[#162a3f] text-green-300'
            : toastMessage.type === 'error'
            ? 'border-red-600 bg-[#162a3f] text-red-300'
            : 'border-[#ff9900] bg-[#162a3f] text-[#ff9900]'
        }`}>
          {toastMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
          ) : toastMessage.type === 'error' ? (
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
          ) : (
            <Info className="w-4 h-4 text-[#ff9900] shrink-0" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Navigation Header */}
      <Navbar
        currentRole={currentRole}
        onSelectRole={setCurrentRole}
        pendingQueueCount={offlineQueue.length}
      />

      {/* Main Content Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-sm bg-[#162a3f] border border-[#545b64] text-[#ff9900] animate-spin">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Loading ProofAfterPickup-Lots from DynamoDB...</p>
          </div>
        ) : (
          <>
            {currentRole === 'Society' && (
              <SocietyView lots={lots} onCreateLot={createLot} />
            )}

            {currentRole === 'Collector' && (
              <CollectorView lots={lots} onClaimLot={claimLot} onRefresh={refreshLots} />
            )}

            {currentRole === 'Receiver' && (
              <ReceiverView lots={lots} onConfirmReceipt={confirmReceipt} />
            )}

            {currentRole === 'Supervisor' && (
              <SupervisorView lots={lots} />
            )}

            {currentRole === 'AWS_Studio' && (
              <AWSStudio />
            )}
          </>
        )}

      </main>

      <OfflineIndicator />

      {/* AWS Console Footer & Watermark */}
      <footer className="w-full border-t border-[#545b64] bg-[#232f3e] py-4 px-4 text-center">
        <p className="text-gray-600 text-xs uppercase tracking-[0.2em] font-semibold">
          PROUDLY ENGINEERED BY HACKNEST SOLUTIONS
        </p>
      </footer>

    </div>
  );
}
