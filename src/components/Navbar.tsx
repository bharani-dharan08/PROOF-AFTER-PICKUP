import React from 'react';
import { AppRole } from '../types';
import { PWAInstallButton } from './PWAInstallButton';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { ShieldCheck, Building2, Truck, Factory, ShieldAlert, Cpu, Wifi, WifiOff } from 'lucide-react';

interface NavbarProps {
  currentRole: AppRole;
  onSelectRole: (role: AppRole) => void;
  pendingQueueCount: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentRole,
  onSelectRole,
  pendingQueueCount
}) => {
  const isOnline = useOnlineStatus();

  return (
    <header className="sticky top-0 z-40 border-b border-[#545b64] bg-[#232f3e]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          
          {/* Service Header / Logo & Breadcrumbs */}
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-[#ff9900] text-black">
              <ShieldCheck className="w-5 h-5 font-bold" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold tracking-tight text-white uppercase">
                AWS Console <span className="text-[#ff9900] mx-1">/</span> ProofAfterPickup
              </span>
              <div className="hidden lg:flex items-center gap-1.5 ml-2">
                <span className="bg-[#0f1b2a] border border-[#545b64] text-[11px] font-mono text-gray-300 px-2 py-0.5 rounded-sm">
                  AWS SAM
                </span>
                <span className="bg-[#0f1b2a] border border-[#545b64] text-[11px] font-mono text-gray-300 px-2 py-0.5 rounded-sm">
                  DynamoDB
                </span>
                <span className="bg-[#0f1b2a] border border-[#545b64] text-[11px] font-mono text-gray-300 px-2 py-0.5 rounded-sm">
                  Transcribe
                </span>
              </div>
            </div>
          </div>

          {/* AWS Console Style Role Navigation Tabs */}
          <nav className="flex items-center h-full space-x-1">
            <button
              onClick={() => onSelectRole('Society')}
              className={`flex items-center gap-1.5 h-14 px-3 text-xs font-semibold uppercase tracking-wider transition cursor-pointer border-b-2 ${
                currentRole === 'Society'
                  ? 'border-[#ff9900] bg-[#162a3f] text-white'
                  : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-[#162a3f]'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Society</span>
              {pendingQueueCount > 0 && (
                <span className="ml-1 rounded-sm bg-[#ff9900] text-black text-[10px] font-bold px-1.5 py-0.2">
                  {pendingQueueCount}
                </span>
              )}
            </button>

            <button
              onClick={() => onSelectRole('Collector')}
              className={`flex items-center gap-1.5 h-14 px-3 text-xs font-semibold uppercase tracking-wider transition cursor-pointer border-b-2 ${
                currentRole === 'Collector'
                  ? 'border-[#ff9900] bg-[#162a3f] text-white'
                  : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-[#162a3f]'
              }`}
            >
              <Truck className="w-3.5 h-3.5" />
              <span>Collector</span>
            </button>

            <button
              onClick={() => onSelectRole('Receiver')}
              className={`flex items-center gap-1.5 h-14 px-3 text-xs font-semibold uppercase tracking-wider transition cursor-pointer border-b-2 ${
                currentRole === 'Receiver'
                  ? 'border-[#ff9900] bg-[#162a3f] text-white'
                  : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-[#162a3f]'
              }`}
            >
              <Factory className="w-3.5 h-3.5" />
              <span>Receiver</span>
            </button>

            <button
              onClick={() => onSelectRole('Supervisor')}
              className={`flex items-center gap-1.5 h-14 px-3 text-xs font-semibold uppercase tracking-wider transition cursor-pointer border-b-2 ${
                currentRole === 'Supervisor'
                  ? 'border-[#ff9900] bg-[#162a3f] text-white'
                  : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-[#162a3f]'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Supervisor</span>
            </button>

            <button
              onClick={() => onSelectRole('AWS_Studio')}
              className={`flex items-center gap-1.5 h-14 px-3 text-xs font-semibold uppercase tracking-wider transition cursor-pointer border-b-2 ${
                currentRole === 'AWS_Studio'
                  ? 'border-[#ff9900] bg-[#162a3f] text-white'
                  : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-[#162a3f]'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">AWS SAM Architecture</span>
            </button>
          </nav>

          {/* Right Status Indicator */}
          <div className="flex items-center gap-2">
            <div className={`hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-[11px] font-mono border ${
              isOnline
                ? 'bg-green-950/80 border-green-600 text-green-300'
                : 'bg-yellow-950/80 border-yellow-600 text-yellow-300'
            }`}>
              {isOnline ? <Wifi className="w-3 h-3 text-green-400" /> : <WifiOff className="w-3 h-3 text-yellow-400" />}
              <span>{isOnline ? 'REGION: us-east-1 [ONLINE]' : 'OFFLINE SYNC'}</span>
            </div>

            <PWAInstallButton />
          </div>

        </div>
      </div>
    </header>
  );
};
