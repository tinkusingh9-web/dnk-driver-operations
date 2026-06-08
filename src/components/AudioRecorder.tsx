import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Play, Pause, AlertTriangle } from 'lucide-react';

interface AudioRecorderProps {
  onSave: (base64Audio: string) => void;
  label?: string;
}

export default function AudioRecorder({ onSave, label = "आवाज़ रिकॉर्ड करें (Record Voice)" }: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [supported, setSupported] = useState(true);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!navigator.mediaDevices || !window.MediaRecorder) {
      setSupported(false);
    }
    return () => {
      clearInterval(timerRef.current);
    };
  }, []);

  const startRecording = async () => {
    try {
      audioChunksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          const base64String = reader.result as string;
          onSave(base64String); // Pass the base64 WebM audio to parent
        };

        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);

        // Stop all tracks on the stream
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setDuration(0);
      timerRef.current = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("Failed to start speech recording", err);
      alert("माइक्रोफ़ोन अनुमति की आवश्यकता है (Microphone permission required)");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(timerRef.current);
    }
  };

  const togglePlayback = () => {
    if (!audioUrl) return;

    if (!audioPlayerRef.current) {
      const audio = new Audio(audioUrl);
      audio.onended = () => setIsPlaying(false);
      audioPlayerRef.current = audio;
    }

    if (isPlaying) {
      audioPlayerRef.current.pause();
      setIsPlaying(false);
    } else {
      audioPlayerRef.current.play();
      setIsPlaying(true);
    }
  };

  const formatSeconds = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  if (!supported) {
    return (
      <div className="flex items-center gap-1.5 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
        <span>इस मोबाइल पर वॉयस रिकॉर्डर उपलब्ध नहीं है। (Audio recording not supported in this browser)</span>
      </div>
    );
  }

  return (
    <div className="w-full p-4 rounded-xl border border-slate-200 bg-white shadow-sm flex flex-col items-center">
      <span className="text-sm font-medium text-slate-700 mb-3">{label}</span>

      <div className="flex items-center gap-4">
        {!isRecording ? (
          <button
            type="button"
            onClick={startRecording}
            className="w-16 h-16 rounded-full flex items-center justify-center bg-rose-600 hover:bg-rose-700 text-white shadow-md active:scale-95 transition-transform cursor-pointer"
          >
            <Mic className="w-8 h-8" />
          </button>
        ) : (
          <button
            type="button"
            onClick={stopRecording}
            className="w-16 h-16 rounded-full flex items-center justify-center bg-slate-800 text-white animate-pulse shadow-md active:scale-95 transition-transform cursor-pointer"
          >
            <Square className="w-7 h-7" />
          </button>
        )}

        {audioUrl && !isRecording && (
          <button
            type="button"
            onClick={togglePlayback}
            className="w-12 h-12 rounded-full flex items-center justify-center bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm active:scale-95 transition-transform cursor-pointer"
          >
            {isPlaying ? <span className="text-xs font-bold">PAUSE</span> : <Play className="w-5 h-5 ml-0.5" />}
          </button>
        )}
      </div>

      <div className="mt-3 text-center">
        {isRecording ? (
          <span className="text-rose-600 font-bold text-sm animate-pulse flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-600"></span>
            रिकॉर्डिंग जारी... {formatSeconds(duration)}
          </span>
        ) : audioUrl ? (
          <span className="text-emerald-600 text-xs font-semibold">
            रिकॉर्डिंग सेव की गई (Voice recorded successfully)
          </span>
        ) : (
          <span className="text-slate-400 text-xs">
            शुरू करने के लिए माइक दबाएं (Tap Mic to record)
          </span>
        )}
      </div>
    </div>
  );
}
