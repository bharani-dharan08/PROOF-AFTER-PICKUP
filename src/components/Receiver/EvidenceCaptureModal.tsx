import React, { useState } from 'react';
import { getEvidencePresignedPostApi, uploadToS3PresignedPost } from '../../services/apiService';
import { Camera, Upload, CheckCircle2, AlertOctagon, X, Sparkles, Image as ImageIcon } from 'lucide-react';

interface EvidenceCaptureModalProps {
  lotId: string;
  onEvidenceUploaded: (objectKey: string, publicUrl: string) => void;
  onClose: () => void;
}

export const EvidenceCaptureModal: React.FC<EvidenceCaptureModalProps> = ({
  lotId,
  onEvidenceUploaded,
  onClose
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [uploadedObjectKey, setUploadedObjectKey] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Handle Camera Capture / File Selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Execute 5-Minute S3 Presigned POST & Direct Upload
  const handleUploadToS3 = async () => {
    if (!selectedFile) {
      setErrorMessage('Please capture or select an evidence photo first.');
      return;
    }

    setIsUploading(true);
    setErrorMessage(null);

    // 1. Fetch 5-Minute S3 Pre-signed POST URL linked to lotId
    const presignRes = await getEvidencePresignedPostApi(lotId, selectedFile.type || 'image/jpeg');

    if (!presignRes.success || !presignRes.presigned_post) {
      setIsUploading(false);
      setErrorMessage(presignRes.error || 'Failed to request S3 Pre-signed POST URL.');
      return;
    }

    // 2. Direct binary upload to AWS S3 using FormData
    const isUploaded = await uploadToS3PresignedPost(presignRes.presigned_post, selectedFile);

    setIsUploading(false);

    if (isUploaded) {
      setUploadSuccess(true);
      const key = presignRes.object_key || `evidence/lots/${lotId}/${Date.now()}.jpg`;
      const publicUrl = presignRes.public_s3_url || previewUrl || '';
      setUploadedObjectKey(key);
      onEvidenceUploaded(key, publicUrl);
    } else {
      setErrorMessage('S3 direct upload failed. Please try again.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
      <div className="w-full max-w-md rounded-2xl border border-rose-500/40 bg-slate-900 p-6 shadow-2xl text-slate-100 space-y-4 font-mono">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-rose-400" />
            <h3 className="text-sm font-bold text-white uppercase">
              Contamination Evidence Photo
            </h3>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed">
          Upload photographic evidence for <strong className="text-amber-400 font-mono">{lotId}</strong>. Image will be uploaded directly to AWS S3 via a 5-minute pre-signed POST URL with key <code className="text-amber-300 font-mono">evidence/lots/{lotId}/*</code>.
        </p>

        {/* Camera Capture / Preview Area */}
        <div className="rounded-xl border-2 border-dashed border-slate-700 bg-slate-950 p-4 text-center space-y-3">
          {previewUrl ? (
            <div className="relative rounded-lg overflow-hidden border border-slate-700 max-h-56">
              <img src={previewUrl} alt="Evidence Preview" className="w-full h-48 object-cover mx-auto" />
            </div>
          ) : (
            <div className="py-6 space-y-2">
              <ImageIcon className="w-10 h-10 text-slate-600 mx-auto" />
              <p className="text-xs text-slate-400 font-sans">No photo captured yet.</p>
            </div>
          )}

          {/* Device Camera Input */}
          <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-amber-400 text-xs font-bold transition cursor-pointer">
            <Camera className="w-4 h-4" />
            <span>{previewUrl ? 'Retake Photo' : 'Capture with Camera'}</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleFileChange}
            />
          </label>
        </div>

        {errorMessage && (
          <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-xs text-rose-300 flex items-center gap-2">
            <AlertOctagon className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {uploadSuccess && uploadedObjectKey && (
          <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-800 text-xs text-emerald-300 space-y-1">
            <div className="flex items-center gap-2 font-bold">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>S3 Upload Successful (5-Min Presigned POST)</span>
            </div>
            <p className="text-[10px] font-mono text-slate-400 truncate">Key: {uploadedObjectKey}</p>
          </div>
        )}

        {/* Submit Actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 text-xs font-semibold hover:bg-slate-800 transition"
          >
            Close
          </button>

          <button
            type="button"
            onClick={handleUploadToS3}
            disabled={isUploading || !selectedFile || uploadSuccess}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs uppercase tracking-wider shadow-lg shadow-rose-600/30 transition cursor-pointer disabled:opacity-50"
          >
            <Upload className="w-4 h-4" />
            <span>{isUploading ? 'Uploading to S3...' : uploadSuccess ? 'Evidence Linked' : 'Upload to S3'}</span>
          </button>
        </div>

      </div>
    </div>
  );
};
