import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Loader2, CheckCircle2, AlertCircle, Volume2, Globe, Sparkles } from 'lucide-react';

interface VoiceExceptionRecorderProps {
  lotId: string;
  onSuccess?: (result: any) => void;
  onCancel?: () => void;
  apiEndpoint?: string;
}

export const VoiceExceptionRecorder: React.FC<VoiceExceptionRecorderProps> = ({
  lotId,
  onSuccess,
  onCancel,
  apiEndpoint
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBase64, setAudioBase64] = useState<string | null>(null);
  const [audioBlobUrl, setAudioBlobUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [transcriptionResult, setTranscriptionResult] = useState<any | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<'ta-IN' | 'en-IN'>('ta-IN');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<any>(null);

  const maxDuration = 15; // 15 Seconds Max

  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const startRecording = async () => {
    setErrorMessage(null);
    setStatusMessage(null);
    setAudioBase64(null);
    setAudioBlobUrl(null);
    setTranscriptionResult(null);
    audioChunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const options = MediaRecorder.isTypeSupported('audio/webm')
        ? { mimeType: 'audio/webm' }
        : MediaRecorder.isTypeSupported('audio/mp4')
        ? { mimeType: 'audio/mp4' }
        : undefined;

      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());

        const audioBlob = new Blob(audioChunksRef.current, {
          type: mediaRecorder.mimeType || 'audio/webm'
        });

        const blobUrl = URL.createObjectURL(audioBlob);
        setAudioBlobUrl(blobUrl);

        // Convert Blob to Base64
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          const base64String = reader.result as string;
          setAudioBase64(base64String);
        };
      };

      mediaRecorder.start(200); // collect 200ms slices
      setIsRecording(true);
      setRecordingTime(0);

      timerIntervalRef.current = setInterval(() => {
        setRecordingTime((prev) => {
          if (prev >= maxDuration - 1) {
            stopRecording();
            return maxDuration;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err: any) {
      console.error('Microphone access error:', err);
      setErrorMessage(
        'Microphone access denied or unsupported. Please grant microphone permissions.'
      );
    }
  };

  const stopRecording = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const handlePointerDown = () => {
    if (!isRecording && !isSubmitting) {
      startRecording();
    }
  };

  const handlePointerUp = () => {
    if (isRecording) {
      stopRecording();
    }
  };

  const submitVoiceException = async () => {
    if (!audioBase64) {
      setErrorMessage('No audio recorded. Please hold the record button to capture an exception note.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setStatusMessage('Uploading audio to AWS S3 & initiating Amazon Transcribe job...');

    try {
      // Determine endpoint: default is /lots/{id}/voice-exception or mock proxy
      const targetUrl = apiEndpoint || `/api/aws/lots/${lotId}/voice-exception`;

      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          lotId,
          audio_base64: audioBase64,
          language_code: selectedLanguage,
          media_format: 'webm',
          recorded_by: 'Pickup Inspector'
        })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setTranscriptionResult(data);
        setStatusMessage('Voice exception successfully logged and queued for AI transcription!');
        if (onSuccess) onSuccess(data);
      } else {
        throw new Error(data.message || data.error || 'Failed to submit voice exception.');
      }
    } catch (err: any) {
      console.error('Voice Exception submission error:', err);
      setErrorMessage(err.message || 'Error communicating with AWS voice exception endpoint.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-[#162a3f] border border-[#545b64] rounded-sm p-5 text-white max-w-md w-full mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#545b64] pb-3">
        <div>
          <span className="text-[10px] font-mono font-bold text-[#ff9900] uppercase tracking-wider block">
            VOICE EXCEPTION NOTE
          </span>
          <h3 className="text-sm font-bold text-white uppercase font-mono">Lot: {lotId}</h3>
        </div>
        <div className="flex items-center space-x-1">
          <button
            type="button"
            onClick={() => setSelectedLanguage('ta-IN')}
            className={`px-2.5 py-1 rounded-sm text-xs font-bold uppercase transition cursor-pointer ${
              selectedLanguage === 'ta-IN'
                ? 'bg-[#ff9900] text-black font-bold'
                : 'bg-[#0f1b2a] text-gray-400 border border-[#545b64] hover:text-white'
            }`}
          >
            தமிழ் (Tamil)
          </button>
          <button
            type="button"
            onClick={() => setSelectedLanguage('en-IN')}
            className={`px-2.5 py-1 rounded-sm text-xs font-bold uppercase transition cursor-pointer ${
              selectedLanguage === 'en-IN'
                ? 'bg-[#ff9900] text-black font-bold'
                : 'bg-[#0f1b2a] text-gray-400 border border-[#545b64] hover:text-white'
            }`}
          >
            English
          </button>
        </div>
      </div>

      {/* Recording Display Area */}
      <div className="flex flex-col items-center justify-center space-y-3 py-2">
        {/* Large Interactive Hold To Record Button */}
        <div className="relative flex items-center justify-center">
          <button
            type="button"
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onTouchStart={handlePointerDown}
            onTouchEnd={handlePointerUp}
            disabled={isSubmitting}
            className={`relative z-10 w-28 h-28 rounded-full flex flex-col items-center justify-center transition-all active:scale-95 border-2 cursor-pointer ${
              isRecording
                ? 'bg-red-600 border-red-400 text-white'
                : audioBase64
                ? 'bg-green-700 border-green-500 text-white'
                : 'bg-[#ff9900] hover:bg-[#e88b00] border-amber-300 text-black'
            }`}
          >
            {isRecording ? (
              <>
                <Square className="w-8 h-8" />
                <span className="text-[10px] font-extrabold uppercase mt-1">Recording</span>
              </>
            ) : audioBase64 ? (
              <>
                <CheckCircle2 className="w-8 h-8" />
                <span className="text-[10px] font-extrabold uppercase mt-1">Recorded</span>
              </>
            ) : (
              <>
                <Mic className="w-10 h-10 text-black" />
                <span className="text-[10px] font-black uppercase tracking-wider mt-1 text-black">
                  Hold to Record
                </span>
              </>
            )}
          </button>
        </div>

        {/* Timer / Status Bar */}
        <div className="text-center space-y-1">
          <div className="text-xl font-mono font-bold text-[#ff9900]">
            00:{recordingTime < 10 ? `0${recordingTime}` : recordingTime} / 00:{maxDuration}
          </div>
          <p className="text-xs text-gray-400">
            {isRecording
              ? 'Release button to complete 15s recording'
              : audioBase64
              ? 'Audio captured! Click submit or hold again to re-record.'
              : 'Press & hold the button to record a voice note'}
          </p>
        </div>

        {/* Audio Waveform / Playback Preview */}
        {audioBlobUrl && !isRecording && (
          <div className="w-full bg-[#0f1b2a] p-2 rounded-sm border border-[#545b64] flex items-center space-x-3">
            <Volume2 className="w-4 h-4 text-[#ff9900] shrink-0" />
            <audio controls src={audioBlobUrl} className="w-full h-8 rounded-sm text-white" />
          </div>
        )}
      </div>

      {/* Messages */}
      {statusMessage && (
        <div className="bg-[#0f1b2a] border border-[#ff9900] rounded-sm p-2.5 text-xs text-[#ff9900] flex items-start space-x-2">
          <Sparkles className="w-4 h-4 shrink-0 text-[#ff9900] mt-0.5 animate-spin" />
          <span>{statusMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="bg-red-950/80 border border-red-600 rounded-sm p-2.5 text-xs text-red-300 flex items-start space-x-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      {transcriptionResult && (
        <div className="bg-[#0f1b2a] border border-green-600 rounded-sm p-3 text-xs text-green-300 space-y-1.5 font-mono">
          <div className="font-bold text-green-400 flex items-center gap-1.5 uppercase">
            <CheckCircle2 className="w-4 h-4" /> Amazon Transcribe Job Initialized
          </div>
          <p className="text-white">
            <span className="font-semibold text-gray-400 uppercase">Transcript:</span>{' '}
            {transcriptionResult.voice_transcript ||
              transcriptionResult.exception_note ||
              `[Tamil/English Voice Exception Recorded for ${lotId}]`}
          </p>
          <div className="text-[10px] text-gray-400 break-all bg-[#162a3f] p-2 rounded-sm border border-[#545b64]">
            S3 Key: {transcriptionResult.audio_proof_link || transcriptionResult.audio_s3_url}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex space-x-2 pt-2 border-t border-[#545b64]">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="flex-1 py-2 bg-[#0f1b2a] hover:bg-[#232f3e] border border-[#545b64] text-gray-300 rounded-sm font-bold text-xs uppercase tracking-wider transition cursor-pointer"
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={submitVoiceException}
          disabled={!audioBase64 || isSubmitting || isRecording}
          className={`flex-1 py-2 rounded-sm font-bold text-xs uppercase tracking-wider flex items-center justify-center space-x-2 transition cursor-pointer ${
            !audioBase64 || isSubmitting || isRecording
              ? 'bg-[#0f1b2a] text-gray-500 border border-[#545b64] cursor-not-allowed'
              : 'bg-[#ff9900] hover:bg-[#e88b00] text-black'
          }`}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin text-black" />
              <span>Transcribing...</span>
            </>
          ) : (
            <span>Submit Voice Note</span>
          )}
        </button>
      </div>
    </div>
  );
};

export default VoiceExceptionRecorder;
