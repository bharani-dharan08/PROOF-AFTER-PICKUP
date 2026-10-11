import React, { useState, useRef, useEffect } from 'react';
import { postVoiceExceptionNoteApi } from '../services/apiService';
import { Mic, Square, Play, RefreshCw, CheckCircle2, AlertOctagon, X, Sparkles, Volume2, Globe } from 'lucide-react';

interface VoiceNoteRecorderProps {
  lotId: string;
  recordedBy?: string;
  onSuccess?: (transcript: string, audioS3Url: string) => void;
  onClose?: () => void;
}

export const VoiceNoteRecorder: React.FC<VoiceNoteRecorderProps> = ({
  lotId,
  recordedBy = 'Field Operator',
  onSuccess,
  onClose
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [languageCode, setLanguageCode] = useState<'ta-IN' | 'en-US'>('ta-IN');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [transcriptionResult, setTranscriptionResult] = useState<string | null>(null);
  const [s3AudioUrl, setS3AudioUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);

  // Maximum 10-second recording duration
  const MAX_SECONDS = 10;

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const startRecording = async () => {
    setErrorMessage(null);
    setTranscriptionResult(null);
    setAudioBlob(null);
    setAudioUrl(null);
    audioChunksRef.current = [];
    setRecordingSeconds(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);

        // Stop media tracks
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start(100);
      setIsRecording(true);

      // Start 10-second countdown timer
      timerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => {
          if (prev >= MAX_SECONDS - 1) {
            stopRecording();
            return MAX_SECONDS;
          }
          return prev + 1;
        });
      }, 1000);

    } catch (err: any) {
      console.error('MediaRecorder Access Error:', err);
      setErrorMessage('Microphone access denied. Please enable audio permissions on your device.');
    }
  };

  const stopRecording = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const convertBlobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        resolve(base64String);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const handleUploadAndTranscribe = async () => {
    if (!audioBlob) {
      setErrorMessage('Please record an audio clip first.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      // Convert audio blob to Base64
      const base64Audio = await convertBlobToBase64(audioBlob);

      // Send to Python Lambda endpoint / Amazon Transcribe service
      const res = await postVoiceExceptionNoteApi(lotId, {
        audio_base64: base64Audio,
        language_code: languageCode,
        recorded_by: recordedBy
      });

      setIsSubmitting(false);

      if (res.success && res.voice_transcript) {
        setTranscriptionResult(res.voice_transcript);
        if (res.audio_s3_url) setS3AudioUrl(res.audio_s3_url);
        if (onSuccess) onSuccess(res.voice_transcript, res.audio_s3_url || '');
      } else {
        setErrorMessage(res.error || 'Failed to process voice note with Amazon Transcribe.');
      }
    } catch (err: any) {
      setIsSubmitting(false);
      setErrorMessage(err?.message || 'Error converting audio file.');
    }
  };

  return (
    <div className="rounded-xl border-2 border-amber-500 bg-zinc-950 p-5 shadow-2xl font-mono space-y-4 text-zinc-100 relative overflow-hidden">
      
      {/* Hazard Banner */}
      <div className="absolute top-0 left-0 right-0 h-1.5 bg-[repeating-linear-gradient(45deg,#f59e0b,#f59e0b_10px,#09090b_10px,#09090b_20px)]" />

      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 pb-3 pt-1">
        <div className="flex items-center gap-2">
          <Mic className="w-5 h-5 text-amber-500 animate-pulse" />
          <div>
            <h3 className="text-sm font-black uppercase text-amber-400 tracking-wider">
              VOICE-FIRST EXCEPTION NOTE
            </h3>
            <span className="text-[10px] text-zinc-400">
              AWS Transcribe (Tamil / English) — Lot {lotId}
            </span>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="p-1 text-zinc-400 hover:text-white transition">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Language Selector */}
      <div className="flex items-center justify-between bg-zinc-900 p-2.5 rounded-lg border border-zinc-800 text-xs">
        <span className="flex items-center gap-1.5 text-zinc-300 font-bold">
          <Globe className="w-4 h-4 text-amber-500" />
          <span>Language / மொழி:</span>
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setLanguageCode('ta-IN')}
            className={`px-3 py-1 rounded font-bold text-xs transition ${
              languageCode === 'ta-IN'
                ? 'bg-amber-500 text-zinc-950 font-black shadow-md'
                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
            }`}
          >
            Tamil (தமிழ்)
          </button>
          <button
            type="button"
            onClick={() => setLanguageCode('en-US')}
            className={`px-3 py-1 rounded font-bold text-xs transition ${
              languageCode === 'en-US'
                ? 'bg-amber-500 text-zinc-950 font-black shadow-md'
                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
            }`}
          >
            English
          </button>
        </div>
      </div>

      {/* MediaRecorder Controls & Waveform Animation */}
      <div className="rounded-xl border-2 border-dashed border-zinc-800 bg-zinc-900/80 p-5 text-center space-y-4">
        
        {isRecording ? (
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-rose-500/20 border border-rose-500/60 text-rose-400 font-black text-xs animate-pulse">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
              RECORDING AUDIO ({MAX_SECONDS - recordingSeconds}s REMAINING)
            </div>

            {/* Simulated Waveform Pulse */}
            <div className="flex justify-center items-center gap-1 h-12">
              {[40, 70, 30, 90, 60, 100, 40, 80, 50, 90, 30, 60].map((height, idx) => (
                <div
                  key={idx}
                  className="w-1.5 bg-amber-500 rounded-full animate-bounce"
                  style={{
                    height: `${height}%`,
                    animationDelay: `${idx * 0.08}s`
                  }}
                />
              ))}
            </div>

            <button
              onClick={stopRecording}
              className="px-6 py-3 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-black text-xs uppercase tracking-wider flex items-center gap-2 mx-auto shadow-lg active:scale-95 transition cursor-pointer"
            >
              <Square className="w-4 h-4 fill-white" />
              <span>STOP RECORDING</span>
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-zinc-400">
              Press record and speak your exception note (Max 10 seconds audio clip)
            </p>

            {!audioUrl ? (
              <button
                onClick={startRecording}
                className="px-6 py-4 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 mx-auto shadow-xl shadow-amber-500/20 active:scale-95 transition cursor-pointer min-h-[50px]"
              >
                <Mic className="w-5 h-5 stroke-[2.5]" />
                <span>START 10s VOICE RECORDING</span>
              </button>
            ) : (
              <div className="space-y-3">
                <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800 space-y-2">
                  <span className="text-[10px] font-bold text-amber-400 uppercase tracking-widest flex items-center justify-center gap-1">
                    <Volume2 className="w-3.5 h-3.5" /> Audio Clip Preview ({recordingSeconds}s)
                  </span>
                  <audio controls src={audioUrl} className="w-full h-10 rounded" />
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={startRecording}
                    className="flex-1 py-2.5 px-3 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs uppercase flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Re-Record</span>
                  </button>

                  <button
                    onClick={handleUploadAndTranscribe}
                    disabled={isSubmitting}
                    className="flex-1 py-2.5 px-3 rounded bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-lg shadow-amber-500/20 transition cursor-pointer disabled:opacity-50"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>{isSubmitting ? 'Transcribing...' : 'Upload & Transcribe'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Error Message */}
      {errorMessage && (
        <div className="p-3 rounded-lg bg-rose-950/80 border border-rose-500/60 text-rose-300 text-xs flex items-center gap-2">
          <AlertOctagon className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Transcribed Text Result */}
      {transcriptionResult && (
        <div className="p-4 rounded-xl border-2 border-emerald-500/80 bg-zinc-900 space-y-2 text-xs">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
            <span className="font-bold text-emerald-400 flex items-center gap-1.5 uppercase">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              AWS Transcribe Output ({languageCode}):
            </span>
            <span className="text-[10px] text-zinc-400 font-bold">Attached to Lot {lotId}</span>
          </div>

          <p className="text-zinc-100 font-sans italic bg-zinc-950 p-3 rounded border border-zinc-800 leading-relaxed">
            "{transcriptionResult}"
          </p>

          {s3AudioUrl && (
            <div className="text-[10px] text-zinc-400 flex items-center justify-between pt-1">
              <span>S3 Audio Object:</span>
              <a
                href={s3AudioUrl}
                target="_blank"
                rel="noreferrer"
                className="text-amber-400 font-mono hover:underline truncate max-w-[200px]"
              >
                {s3AudioUrl.split('/').pop()}
              </a>
            </div>
          )}
        </div>
      )}

    </div>
  );
};
