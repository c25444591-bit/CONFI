import React, { useEffect, useState, useRef } from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2, Gauge, ChevronUp, X, Check, Cloud, Laptop, FileAudio, Mic, StopCircle, Trash2 } from 'lucide-react';
import { ttsService } from '../services/ttsService';
import { VoiceName, AudioFormat } from '../types';

interface AudioControllerProps {
  isPlaying: boolean;
  isPaused: boolean;
  pageNumber: number;
  selectedVoiceURI: string | null;
  playbackRate: number;
  useCloudTTS: boolean;
  audioFormat: AudioFormat;
  userVoiceSample: string | null;
  onTogglePlay: () => void;
  onVoiceChange: (voiceURI: string) => void;
  onPlaybackRateChange: (rate: number) => void;
  onPrevPage: () => void;
  onNextPage: () => void;
  onToggleCloudMode: (useCloud: boolean) => void;
  onFormatChange: (format: AudioFormat) => void;
  onRecordVoice: (base64Audio: string | null) => void;
  canGoNext: boolean;
  canGoPrev: boolean;
}

export const AudioController: React.FC<AudioControllerProps> = ({
  isPlaying,
  isPaused,
  pageNumber,
  selectedVoiceURI,
  playbackRate,
  useCloudTTS,
  audioFormat,
  userVoiceSample,
  onTogglePlay,
  onVoiceChange,
  onPlaybackRateChange,
  onPrevPage,
  onNextPage,
  onToggleCloudMode,
  onFormatChange,
  onRecordVoice,
  canGoNext,
  canGoPrev
}) => {
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [showVoiceList, setShowVoiceList] = useState(false);
  const [showRecorder, setShowRecorder] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  
  const voiceListRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!useCloudTTS) {
      const loadVoices = () => {
        const voices = ttsService.getVoices();
        setAvailableVoices(voices);
        if (!selectedVoiceURI && voices.length > 0) {
          onVoiceChange(voices[0].voiceURI);
        }
      };
      loadVoices();
      window.speechSynthesis.onvoiceschanged = loadVoices;
      return () => { window.speechSynthesis.onvoiceschanged = null; };
    }
  }, [selectedVoiceURI, onVoiceChange, useCloudTTS]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (voiceListRef.current && !voiceListRef.current.contains(event.target as Node)) {
        setShowVoiceList(false);
      }
    };
    if (showVoiceList) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showVoiceList]);

  const isActive = isPlaying && !isPaused;

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/wav' }); // Prefer WAV/WebM
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = () => {
          const base64 = reader.result as string;
          // Remove prefix (data:audio/wav;base64,) to keep just the data
          const cleanBase64 = base64.split(',')[1];
          onRecordVoice(cleanBase64);
          setShowRecorder(false);
        };
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      
      timerRef.current = window.setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("No se pudo acceder al micrófono. Verifica los permisos.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop(); // Stop stream
      // Don't save
    }
    setIsRecording(false);
    setShowRecorder(false);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const getVoiceDetails = (voiceName: string) => {
    if (userVoiceSample && voiceName === 'custom-voice') {
       return {
        cleanName: 'Mi Voz (Clonada)',
        origin: 'Usuario',
        flag: '🎙️',
        engine: 'Gemini Mimicry'
      };
    }

    if (useCloudTTS) {
      return {
        cleanName: voiceName,
        origin: 'Google AI',
        flag: '⚡',
        engine: 'Neural Gemini 2.5'
      };
    }

    const voice = availableVoices.find(v => v.voiceURI === voiceName);
    if (!voice) return { cleanName: voiceName || 'Seleccionar', origin: '', flag: '🔊', engine: '' };

    let origin = "Desconocido";
    let flag = "🌎";
    
    if (voice.lang === 'es-AR') { origin = "Argentina"; flag = "🇦🇷"; }
    else if (voice.lang === 'es-MX') { origin = "México"; flag = "🇲🇽"; }
    else if (voice.lang === 'es-ES') { origin = "España"; flag = "🇪🇸"; }
    else if (voice.lang === 'es-US') { origin = "EE.UU. (Latino)"; flag = "🇺🇸"; }
    else if (voice.lang === 'es-419') { origin = "Latinoamérica"; flag = "🌎"; }

    let cleanName = voice.name
      .replace(/Microsoft|Google|Android|English|Spanish|Español/g, '')
      .replace(/\(.*\)/g, '')
      .trim();

    if (!cleanName) cleanName = "Voz del sistema";

    let engine = "Sistema";
    if (voice.name.includes('Google')) engine = "Google";
    if (voice.name.includes('Samsung')) engine = "Samsung";
    if (voice.name.includes('Microsoft')) engine = "Microsoft";
    if (voice.name.toLowerCase().includes('premium')) engine += " (Premium)";

    return { cleanName, origin, flag, engine };
  };

  const handlePreview = (e: React.MouseEvent, uri: string) => {
    e.stopPropagation();
    if (!useCloudTTS) {
      ttsService.previewVoice(uri);
    }
  };

  const currentDetails = getVoiceDetails(selectedVoiceURI || '');

  // Helper to render voice item
  const renderVoiceItem = (uri: string, name: string, flag: string, origin: string, engine: string) => {
    const isSelected = selectedVoiceURI === uri;
    return (
      <div 
        key={uri}
        onClick={() => {
          onVoiceChange(uri);
          setShowVoiceList(false);
        }}
        className={`group flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors border border-transparent ${isSelected ? 'bg-yellow-900/20 border-yellow-900/50' : 'hover:bg-stone-800 hover:border-stone-700'}`}
      >
        <div className="text-2xl flex-shrink-0">{flag}</div>
        <div className="flex-1 min-w-0">
          <div className={`font-bold text-sm truncate ${isSelected ? 'text-yellow-400' : 'text-stone-200'}`}>
            {name}
          </div>
          <div className="text-xs text-stone-500 truncate">
            {origin} • {engine}
          </div>
        </div>
        
        {isSelected && <Check size={16} className="text-yellow-500 flex-shrink-0" />}
        
        {!useCloudTTS && (
          <button 
            onClick={(e) => handlePreview(e, uri)}
            className="p-2 rounded-full bg-stone-800 text-stone-400 opacity-0 group-hover:opacity-100 hover:bg-yellow-600 hover:text-black transition-all"
            title="Escuchar prueba"
          >
            <Play size={14} className="fill-current" />
          </button>
        )}
      </div>
    );
  };

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 bg-[#111] border-t border-yellow-900/30 shadow-[0_-4px_20px_-5px_rgba(0,0,0,0.5)] p-4 z-50">
        <div className="max-w-6xl mx-auto flex flex-col lg:flex-row items-center justify-between gap-4">
          
          {/* Info Area */}
          <div className="hidden lg:flex flex-col min-w-[120px]">
            <span className="text-xs uppercase tracking-wider text-yellow-600 font-bold">Leyendo ahora</span>
            <span className="font-serif font-bold text-yellow-500 text-xl">Página {pageNumber}</span>
          </div>

          {/* Main Controls */}
          <div className="flex items-center gap-6 md:gap-8 flex-1 justify-center order-1 lg:order-2">
            <button 
              onClick={onPrevPage}
              disabled={!canGoPrev}
              className="text-stone-400 hover:text-yellow-400 disabled:opacity-30 transition-colors p-3 rounded-full hover:bg-white/5"
              aria-label="Página anterior"
            >
              <SkipBack size={32} className="fill-current" />
            </button>

            <button
              onClick={onTogglePlay}
              className="bg-yellow-600 text-black p-5 rounded-full hover:bg-yellow-500 transition-transform active:scale-95 disabled:bg-stone-700 disabled:text-stone-500 shadow-lg flex items-center justify-center w-16 h-16 ring-4 ring-black"
              aria-label={isActive ? "Pausar" : "Reproducir"}
            >
              {isActive ? (
                <Pause size={32} className="fill-current" />
              ) : (
                <Play size={32} className="fill-current ml-1" />
              )}
            </button>

            <button 
              onClick={onNextPage}
              disabled={!canGoNext}
              className="text-stone-400 hover:text-yellow-400 disabled:opacity-30 transition-colors p-3 rounded-full hover:bg-white/5"
              aria-label="Siguiente página"
            >
              <SkipForward size={32} className="fill-current" />
            </button>
          </div>

          {/* Settings Group */}
          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto justify-center lg:justify-end order-2 lg:order-3">
            
            {/* Engine Switcher */}
            <div className="flex bg-stone-900 rounded-lg border border-stone-800 p-1">
              <button
                onClick={() => onToggleCloudMode(false)}
                className={`p-2 rounded flex items-center gap-1 transition-all ${!useCloudTTS ? 'bg-stone-700 text-white shadow-sm' : 'text-stone-500 hover:text-stone-300'}`}
                title="Modo Local (Offline)"
              >
                <Laptop size={16} />
              </button>
              <button
                onClick={() => onToggleCloudMode(true)}
                className={`p-2 rounded flex items-center gap-1 transition-all ${useCloudTTS ? 'bg-yellow-700 text-white shadow-sm' : 'text-stone-500 hover:text-stone-300'}`}
                title="Modo Nube (Gemini AI)"
              >
                <Cloud size={16} />
              </button>
            </div>

            {/* Speed Control */}
            <div className="flex items-center gap-2 bg-stone-800 px-3 py-2 rounded-lg border border-stone-700 hover:border-yellow-600 transition-colors">
              <Gauge size={18} className="text-stone-400" />
              <select 
                value={playbackRate} 
                onChange={(e) => onPlaybackRateChange(Number(e.target.value))}
                className="bg-transparent text-base font-bold text-stone-200 outline-none cursor-pointer w-10 appearance-none text-center focus:text-yellow-400"
                aria-label="Velocidad de reproducción"
              >
                <option value={0.8}>0.8x</option>
                <option value={0.9}>0.9x</option>
                <option value={1}>1x</option>
                <option value={1.2}>1.2x</option>
                <option value={1.5}>1.5x</option>
                <option value={2}>2x</option>
              </select>
            </div>

            {/* Voice Selector */}
            <div className="relative" ref={voiceListRef}>
              <button 
                onClick={() => setShowVoiceList(!showVoiceList)}
                className="flex items-center gap-2 bg-stone-800 pl-3 pr-2 py-2 rounded-lg border border-stone-700 hover:border-yellow-600 transition-colors w-full sm:w-auto sm:max-w-[200px]"
              >
                <Volume2 size={20} className="text-stone-400 flex-shrink-0" />
                <div className="flex flex-col items-start overflow-hidden">
                  <span className="text-[10px] text-stone-500 leading-none uppercase font-bold">{useCloudTTS ? 'Gemini AI' : 'Voz Local'}</span>
                  <span className="text-sm font-bold text-stone-200 truncate w-full text-left">
                    {currentDetails.cleanName}
                  </span>
                </div>
                <ChevronUp size={16} className={`text-stone-500 transition-transform ${showVoiceList ? 'rotate-180' : ''}`} />
              </button>

              {/* Voice Popup List */}
              {showVoiceList && (
                <div className="absolute bottom-full right-0 mb-2 w-80 bg-stone-900 border border-stone-700 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[60vh] animate-in fade-in slide-in-from-bottom-2 z-50">
                  <div className="p-3 border-b border-stone-800 bg-stone-950 flex justify-between items-center sticky top-0 z-10">
                    <span className="text-xs font-bold uppercase tracking-wider text-stone-500">
                      {useCloudTTS ? 'Seleccionar Voz IA' : 'Seleccionar Narrador Local'}
                    </span>
                    <button onClick={() => setShowVoiceList(false)} className="text-stone-500 hover:text-white">
                      <X size={16} />
                    </button>
                  </div>
                  
                  <div className="overflow-y-auto p-1">
                    {useCloudTTS ? (
                      <>
                        {/* Custom Voice Option */}
                        <div 
                          onClick={() => {
                            if (userVoiceSample) {
                              onVoiceChange('custom-voice');
                              setShowVoiceList(false);
                            } else {
                              setShowRecorder(true);
                              setShowVoiceList(false);
                            }
                          }}
                          className={`group flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors border border-dashed border-stone-700 hover:border-yellow-600 bg-stone-900/50 mb-2`}
                        >
                          <div className="text-2xl flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-yellow-900/30 text-yellow-500">
                            <Mic size={18} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-sm text-yellow-400">
                              {userVoiceSample ? 'Usar mi voz clonada' : 'Clonar mi voz'}
                            </div>
                            <div className="text-xs text-stone-500">
                              {userVoiceSample ? 'Haz clic para seleccionar' : 'Graba 5s para imitar tu estilo'}
                            </div>
                          </div>
                          {userVoiceSample && (
                             <button 
                               onClick={(e) => {
                                 e.stopPropagation();
                                 onRecordVoice(null); // Delete
                               }}
                               className="p-2 hover:text-red-400 text-stone-500"
                             >
                               <Trash2 size={14} />
                             </button>
                          )}
                        </div>
                        
                        {/* Standard Voices */}
                        {Object.values(VoiceName).map(voiceName => 
                          renderVoiceItem(voiceName, voiceName, '⚡', 'Google Cloud', 'Gemini Neural')
                        )}
                      </>
                    ) : (
                      // Local Voices List
                      availableVoices.length === 0 ? (
                        <div className="p-4 text-center text-stone-500 text-sm">Cargando voces...</div>
                      ) : (
                        availableVoices.map((voice) => {
                          const details = getVoiceDetails(voice.voiceURI);
                          return renderVoiceItem(voice.voiceURI, details.cleanName, details.flag, details.origin, details.engine);
                        })
                      )
                    )}
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>
      </div>

      {/* Recording Modal */}
      {showRecorder && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-700 rounded-2xl p-8 max-w-md w-full text-center shadow-2xl animate-in zoom-in-95">
            <h3 className="text-xl font-bold text-white mb-2">Clonar tu Voz</h3>
            <p className="text-stone-400 text-sm mb-6">
              Graba entre 5 y 10 segundos leyendo un texto. Gemini usará esta muestra para intentar imitar tu tono y estilo al leer el libro.
            </p>

            <div className="flex flex-col items-center gap-4 mb-8">
              <div className={`relative flex items-center justify-center w-24 h-24 rounded-full transition-all duration-300 ${isRecording ? 'bg-red-500/20 ring-4 ring-red-500/30 scale-110' : 'bg-stone-800'}`}>
                {isRecording && (
                  <span className="absolute animate-ping inline-flex h-full w-full rounded-full bg-red-500 opacity-20"></span>
                )}
                <Mic size={40} className={isRecording ? 'text-red-500' : 'text-stone-400'} />
              </div>
              
              <div className="text-2xl font-mono font-bold text-white">
                00:0{recordingTime}
              </div>
              
              <div className="text-xs text-stone-500 bg-stone-950 px-3 py-1 rounded-full">
                {isRecording ? "Grabando..." : "Listo para grabar"}
              </div>
            </div>

            {isRecording ? (
               <button 
                onClick={stopRecording}
                className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all"
               >
                 <StopCircle size={20} /> Detener y Guardar
               </button>
            ) : (
               <button 
                onClick={startRecording}
                className="w-full py-3 bg-white hover:bg-stone-200 text-black font-bold rounded-xl flex items-center justify-center gap-2 transition-all"
               >
                 <Mic size={20} /> Comenzar Grabación
               </button>
            )}
            
            <button 
              onClick={cancelRecording}
              className="mt-4 text-stone-500 hover:text-white text-sm font-medium"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </>
  );
};