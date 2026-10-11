import React, { useState } from 'react';
import { CODE_FILES, downloadSamZip, CodeFileItem } from '../../services/samCodeStore';
import { Download, Copy, Check, FileCode, Layers, ArrowRight, Database, AlertOctagon, Server } from 'lucide-react';

export const AWSStudio: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<CodeFileItem>(CODE_FILES[0]);
  const [copied, setCopied] = useState(false);
  const [isZipping, setIsZipping] = useState(false);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(selectedFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadZip = async () => {
    setIsZipping(true);
    await downloadSamZip();
    setIsZipping(false);
  };

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="rounded-sm border border-[#545b64] bg-[#162a3f] p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold text-[#ff9900] uppercase tracking-wider">AWS SAM & PYTHON 3.12 BACKEND INSPECTOR</span>
          </div>
          <h1 className="text-lg font-bold text-white mt-1">ProofAfterPickup AWS SAM Infrastructure</h1>
          <p className="text-xs text-gray-400 mt-0.5 max-w-2xl">
            CloudFormation SAM template (`template.yaml`), Python 3.12 Lambdas, single-table DynamoDB (`ProofAfterPickup-Lots`), and EventBridge/SQS exception pipeline.
          </p>
        </div>

        <button
          onClick={handleDownloadZip}
          disabled={isZipping}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-sm bg-[#ff9900] hover:bg-[#e88b00] text-black font-bold text-xs uppercase tracking-wider transition cursor-pointer disabled:opacity-50"
        >
          <Download className="w-4 h-4 text-black" />
          <span>{isZipping ? 'EXPORTING...' : 'DOWNLOAD SAM REPO (.ZIP)'}</span>
        </button>
      </div>

      {/* Architecture Flow Diagram */}
      <div className="rounded-sm border border-[#545b64] bg-[#162a3f] p-5 space-y-4">
        <h2 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2 border-b border-[#545b64] pb-2">
          <Layers className="w-4 h-4 text-[#ff9900]" />
          Production AWS Serverless Single-Table & Exception Pipeline Architecture
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 text-center">
          
          <div className="rounded-sm border border-[#545b64] bg-[#0f1b2a] p-3 space-y-1">
            <span className="text-[10px] font-bold text-[#ff9900] uppercase block">1. Cognito Auth</span>
            <p className="text-xs font-bold text-white">4 User Groups</p>
            <p className="text-[10px] text-gray-400">Society, Collector, Receiver, Supervisor</p>
          </div>

          <div className="hidden md:flex items-center justify-center text-gray-500">
            <ArrowRight className="w-5 h-5" />
          </div>

          <div className="rounded-sm border border-[#545b64] bg-[#0f1b2a] p-3 space-y-1">
            <span className="text-[10px] font-bold text-[#ff9900] uppercase block">2. HTTP API Gateway</span>
            <p className="text-xs font-bold text-white">JWT Authorizer</p>
            <p className="text-[10px] text-gray-400">Route Authorization</p>
          </div>

          <div className="hidden md:flex items-center justify-center text-gray-500">
            <ArrowRight className="w-5 h-5" />
          </div>

          <div className="rounded-sm border border-[#545b64] bg-[#0f1b2a] p-3 space-y-1">
            <span className="text-[10px] font-bold text-[#ff9900] uppercase block">3. Python Lambdas</span>
            <p className="text-xs font-bold text-white">Core Functions</p>
            <p className="text-[10px] text-gray-400">Least-Privilege IAM Policies</p>
          </div>

        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 text-center">
          <div className="rounded-sm border border-[#545b64] bg-[#0f1b2a] p-3">
            <Database className="w-4 h-4 text-[#ff9900] mx-auto mb-1" />
            <span className="text-xs font-bold text-white block">ProofAfterPickup-Lots</span>
            <span className="text-[10px] text-gray-400">Single-Table DynamoDB with Streams</span>
          </div>

          <div className="rounded-sm border border-[#545b64] bg-[#0f1b2a] p-3">
            <AlertOctagon className="w-4 h-4 text-red-400 mx-auto mb-1" />
            <span className="text-xs font-bold text-white block">EventBridge & SQS FIFO</span>
            <span className="text-[10px] text-gray-400">Weight Mismatch &gt; 10% or Contamination</span>
          </div>

          <div className="rounded-sm border border-[#545b64] bg-[#0f1b2a] p-3">
            <Server className="w-4 h-4 text-[#ff9900] mx-auto mb-1" />
            <span className="text-xs font-bold text-white block">Private S3 Evidence Bucket</span>
            <span className="text-[10px] text-gray-400">Block Public Access Enabled</span>
          </div>
        </div>
      </div>

      {/* File Inspector Tabs */}
      <div className="rounded-sm border border-[#545b64] bg-[#162a3f] overflow-hidden">
        
        <div className="flex flex-wrap items-center justify-between border-b border-[#545b64] bg-[#0f1b2a] px-4 py-2 gap-2">
          <div className="flex flex-wrap gap-1">
            {CODE_FILES.map((file) => (
              <button
                key={file.filename}
                onClick={() => setSelectedFile(file)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-sm text-xs font-bold uppercase tracking-wider transition cursor-pointer ${
                  selectedFile.filename === file.filename
                    ? 'bg-[#ff9900] text-black'
                    : 'text-gray-400 hover:text-white hover:bg-[#162a3f]'
                }`}
              >
                <FileCode className="w-3.5 h-3.5" />
                <span>{file.filename}</span>
              </button>
            ))}
          </div>

          <button
            onClick={handleCopyCode}
            className="flex items-center gap-1.5 px-3 py-1 rounded-sm border border-[#545b64] bg-[#162a3f] text-white text-xs font-bold uppercase hover:bg-[#232f3e] transition cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5 text-gray-300" />}
            <span>{copied ? 'COPIED!' : 'COPY CODE'}</span>
          </button>
        </div>

        <div className="bg-[#0f1b2a] px-4 py-2 border-b border-[#545b64] text-xs text-gray-400 flex items-center justify-between font-mono">
          <span className="text-[#ff9900]">{selectedFile.path}</span>
          <span>{selectedFile.description}</span>
        </div>

        <div className="p-4 bg-[#0f1b2a] font-mono text-xs text-gray-200 overflow-x-auto max-h-[500px]">
          <pre className="leading-relaxed">
            <code>{selectedFile.content}</code>
          </pre>
        </div>

      </div>

    </div>
  );
};
