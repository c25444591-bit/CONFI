import React, { useState, useEffect, useRef } from 'react';
import { parseBookContent } from './utils/textParser';
import { parsePDF } from './utils/pdfManager';
import { RAW_BOOK_CONTENT, BOOK_INDEX } from './data/bookContent';
import { BookPage } from './components/BookPage';
import { AudioController } from './components/AudioController';
import { PageData, Theme, ViewMode, VoiceName, AudioFormat, HistoryItem, TOCItem } from './types';
import { ttsService } from './services/ttsService';
import { generateSpeech } from './services/geminiService';
import { base64ToUint8Array, decodeAudioData } from './services/audioUtils';
import { Headphones, Settings, ZoomIn, ZoomOut, Eye, List, X, ChevronRight, Clock, History, ScrollText, Book, Upload, FileText, Loader2, AlertCircle, CheckCircle, Grid, ListTree, BookOpen } from 'lucide-react';

// Sonido de página (Page Flip Sound - Base64 corto para no depender de assets externos)
const PAGE_FLIP_SOUND = "data:audio/mp3;base64,//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq"; 

// --- Componente Toast para Notificaciones ---
const Toast: React.FC<{ message: string; type: 'error' | 'success' | 'info'; onClose: () => void }> = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const bgColors = {
    error: 'bg-red-600',
    success: 'bg-green-600',
    info: 'bg-stone-800'
  };

  return (
    <div className={`fixed top-4 right-4 ${bgColors[type]} text-white px-6 py-4 rounded-xl shadow-2xl z-[100] flex items-center gap-3 animate-in slide-in-from-right fade-in border border-white/10`}>
      {type === 'error' ? <AlertCircle size={20} /> : type === 'success' ? <CheckCircle size={20} /> : <Loader2 size={20} className="animate-spin" />}
      <p className="font-medium text-sm">{message}</p>
      <button onClick={onClose} className="ml-4 hover:bg-white/20 p-1 rounded-full"><X size={16} /></button>
    </div>
  );
};

const App: React.FC = () => {
  // App State
  const [isLanding, setIsLanding] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pages, setPages] = useState<PageData[]>([]);
  const [activePage, setActivePage] = useState<number | null>(null);
  const [toc, setToc] = useState<TOCItem[]>([]);
  
  // Toast State
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' | 'info' } | null>(null);
  
  // View Mode State (Scroll vs Flip)
  const [viewMode, setViewMode] = useState<ViewMode>('scroll');
  const [flipState, setFlipState] = useState<string>('idle');

  // TTS State
  const [isPlaying, setIsPlaying] = useState(false);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false); 
  const [isPaused, setIsPaused] = useState(false);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string | null>(null);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  
  // Voice Cloning State
  const [userVoiceSample, setUserVoiceSample] = useState<string | null>(null);

  // Cloud / Gemini State
  const [useCloudTTS, setUseCloudTTS] = useState(true);
  const [audioFormat, setAudioFormat] = useState<AudioFormat>(AudioFormat.MP3);
  
  // Audio Context Refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // Visual Accessibility State
  const [fontSize, setFontSize] = useState<number>(20);
  const [theme, setTheme] = useState<Theme>('light'); 
  const [showSettings, setShowSettings] = useState(false);
  const [showIndex, setShowIndex] = useState(false);
  const [indexTab, setIndexTab] = useState<'chapters' | 'grid'>('chapters'); 
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  
  // Swipe Gesture State
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  
  // Refs
  const activePageRef = useRef<number | null>(null);
  const pagesRef = useRef<PageData[]>([]);

  const showToast = (message: string, type: 'error' | 'success' | 'info') => {
    setToast({ message, type });
  };

  useEffect(() => {
    // Load History
    const storedHistory = localStorage.getItem('book_history');
    if (storedHistory) {
      try {
        setHistory(JSON.parse(storedHistory));
      } catch (e) {
        console.error("Failed to parse history", e);
      }
    }

    return () => {
      ttsService.cancel();
      stopCloudAudio();
      audioCtxRef.current?.close();
      abortControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    activePageRef.current = activePage;
  }, [activePage]);

  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  useEffect(() => {
    const body = document.body;
    body.className = ''; 
    if (theme === 'light') body.classList.add('bg-[#eceae4]'); 
    else if (theme === 'sepia') body.classList.add('bg-[#fdf6e3]');
    else if (theme === 'dark') body.classList.add('bg-[#121212]');
    else if (theme === 'high-contrast') body.classList.add('bg-black');
  }, [theme]);

  useEffect(() => {
    if (showIndex && toc.length === 0) {
      setIndexTab('grid');
    } else if (showIndex && toc.length > 0) {
      setIndexTab('chapters');
    }
  }, [showIndex, toc]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    try {
      if (file.type === 'application/pdf') {
        const { pages: extractedPages, toc: extractedToc } = await parsePDF(file);
        setPages(extractedPages);
        setToc(extractedToc);
        
        if (extractedPages.length > 0) {
          setActivePage(extractedPages[0].pageNumber);
          setIsLanding(false);
          showToast(extractedToc.length > 0 ? "Libro cargado correctamente" : "Libro cargado", "success");
        } else {
          showToast("No se encontró texto en este PDF.", "error");
        }
      } else {
        showToast("Por favor sube un archivo PDF válido.", "error");
      }
    } catch (error: any) {
      console.error(error);
      showToast(error.message || "Error al leer el archivo.", "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const loadDemoBook = () => {
    setIsProcessing(true);
    setTimeout(() => {
      const parsedPages = parseBookContent(RAW_BOOK_CONTENT);
      setPages(parsedPages);
      setToc(BOOK_INDEX);
      if (parsedPages.length > 0) {
        setActivePage(parsedPages[0].pageNumber);
        setIsLanding(false);
        showToast("Libro demo cargado", "success");
      }
      setIsProcessing(false);
    }, 500);
  };

  const addToHistory = (pageNumber: number) => {
    setHistory(prev => {
      const filtered = prev.filter(item => item.pageNumber !== pageNumber);
      const newEntry = { pageNumber, timestamp: Date.now() };
      const newHistory = [newEntry, ...filtered].slice(0, 10);
      localStorage.setItem('book_history', JSON.stringify(newHistory));
      return newHistory;
    });
  };

  const stopCloudAudio = () => {
    if (audioSourceRef.current) {
      try { audioSourceRef.current.stop(); } catch(e) {}
      audioSourceRef.current.disconnect();
      audioSourceRef.current = null;
    }
  };

  const playPageTurnSound = () => {
    const audio = new Audio('https://cdn.pixabay.com/audio/2022/03/10/audio_c8c8a73467.mp3'); 
    audio.volume = 0.3;
    audio.play().catch(() => {}); 
  };

  const playPage = async (page: PageData) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    addToHistory(page.pageNumber);
    ttsService.cancel();
    stopCloudAudio();
    
    setIsPaused(false);
    setActivePage(page.pageNumber);

    if (useCloudTTS) {
      setIsGeneratingAudio(true); 
      setIsPlaying(false); 

      try {
        if (!audioCtxRef.current) {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioContextClass) {
            audioCtxRef.current = new AudioContextClass();
          } else {
            throw new Error("Tu navegador no soporta Audio Web.");
          }
        }
        
        if (audioCtxRef.current.state === 'suspended') {
          await audioCtxRef.current.resume();
        }

        // Determine if we are using a custom voice
        const isCustomVoice = selectedVoiceURI === 'custom-voice';
        const voiceToUse = isCustomVoice ? 'custom-voice' : (selectedVoiceURI as VoiceName || VoiceName.Kore);

        const b64Data = await generateSpeech(
            page.content, 
            voiceToUse,
            audioFormat,
            abortController.signal,
            isCustomVoice ? userVoiceSample : null
        );

        if (!b64Data) throw new Error("No se generó audio");

        const audioBytes = base64ToUint8Array(b64Data);
        const audioBuffer = await decodeAudioData(audioBytes, audioCtxRef.current);

        if (abortController.signal.aborted) return;

        const source = audioCtxRef.current.createBufferSource();
        source.buffer = audioBuffer;
        source.playbackRate.value = playbackRate;
        source.connect(audioCtxRef.current.destination);
        
        source.onended = () => {
          if (!abortController.signal.aborted) {
            setIsPlaying(false);
            handleAutoAdvance();
          }
        };

        source.start(0);
        audioSourceRef.current = source;
        
        setIsPlaying(true);
        
      } catch (e: any) {
        if (e.name === 'AbortError' || e.message === 'Aborted') {
          return;
        }
        console.error("Cloud TTS Error:", e);
        setIsPlaying(false);
        showToast(e.message || "Error generando audio.", "error");
      } finally {
        if (abortControllerRef.current === abortController) {
          setIsGeneratingAudio(false);
        }
      }

    } else {
      setIsPlaying(true);
      ttsService.speak(
        page.content,
        selectedVoiceURI,
        playbackRate,
        () => {
          setIsPlaying(false);
          handleAutoAdvance();
        },
        (e) => {
          setIsPlaying(false);
          console.error("Playback error", e);
          showToast("Error en lector local", "error");
        }
      );
    }
  };

  const handleAutoAdvance = () => {
    const currentPageNum = activePageRef.current;
    const allPages = pagesRef.current;
    
    if (currentPageNum !== null) {
      const currentIndex = allPages.findIndex(p => p.pageNumber === currentPageNum);
      if (currentIndex !== -1 && currentIndex < allPages.length - 1) {
        const nextPage = allPages[currentIndex + 1];
        setTimeout(() => {
          if (viewMode === 'flip') {
            animatePageTurn('next', () => {
              playPage(nextPage);
            });
          } else {
            playPage(nextPage);
            scrollToPage(nextPage.pageNumber);
          }
        }, 500);
      }
    }
  };

  const scrollToPage = (pageNum: number) => {
    if (viewMode === 'scroll') {
      const element = document.getElementById(`page-${pageNum}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  };

  const handleTogglePlay = async () => {
    const currentPage = pages.find(p => p.pageNumber === activePage);
    
    if (isPlaying && !isPaused) {
      if (useCloudTTS && audioCtxRef.current) await audioCtxRef.current.suspend();
      else ttsService.pause();
      setIsPaused(true);
    } else if (isPlaying && isPaused) {
      if (useCloudTTS && audioCtxRef.current) await audioCtxRef.current.resume();
      else ttsService.resume();
      setIsPaused(false);
    } else if (currentPage) {
      playPage(currentPage);
    }
  };

  const handlePageSelect = (page: PageData) => {
    playPage(page);
    if (viewMode === 'scroll') scrollToPage(page.pageNumber);
  };

  const handleIndexJump = (pageNumber: number) => {
    const targetPage = pages.find(p => p.pageNumber === pageNumber);
    if (targetPage) {
      if (isPlaying) playPage(targetPage);
      else setActivePage(targetPage.pageNumber);
      scrollToPage(targetPage.pageNumber);
      setShowIndex(false);
    }
  };
  
  const handleHistoryJump = (pageNumber: number) => {
    handleIndexJump(pageNumber);
    setShowHistory(false);
  };

  const handleSpeedChange = (newRate: number) => {
    setPlaybackRate(newRate);
    if (useCloudTTS && audioSourceRef.current) {
      audioSourceRef.current.playbackRate.value = newRate;
    } else if (isPlaying && !isPaused && activePage) {
      const currentPage = pages.find(p => p.pageNumber === activePage);
      if (currentPage) playPage(currentPage);
    }
  };

  const handleToggleCloudMode = (useCloud: boolean) => {
    ttsService.cancel();
    stopCloudAudio();
    setIsPlaying(false);
    setIsGeneratingAudio(false);
    setIsPaused(false);
    setUseCloudTTS(useCloud);
    setSelectedVoiceURI(null); 
    showToast(useCloud ? "Modo IA activado" : "Modo Offline activado", "info");
  };

  // Handle user voice recording from AudioController
  const handleRecordVoice = (base64Audio: string | null) => {
    if (base64Audio) {
      setUserVoiceSample(base64Audio);
      setSelectedVoiceURI('custom-voice');
      showToast("Voz clonada guardada. Úsala para leer.", "success");
    } else {
      setUserVoiceSample(null);
      setSelectedVoiceURI(null);
      showToast("Voz clonada eliminada.", "info");
    }
  };

  const animatePageTurn = (direction: 'next' | 'prev', callback: () => void) => {
    playPageTurnSound();
    if (viewMode === 'scroll') {
      callback();
      return;
    }
    setFlipState(direction === 'next' ? 'flipping-out-left' : 'flipping-out-right');
    setTimeout(() => {
      callback();
      setFlipState(direction === 'next' ? 'flipping-in-right' : 'flipping-in-left');
      setTimeout(() => setFlipState('idle'), 400);
    }, 300);
  };

  const handleNext = () => {
    if (activePage === null) return;
    const currentIndex = pages.findIndex(p => p.pageNumber === activePage);
    if (currentIndex < pages.length - 1) {
      const nextPage = pages[currentIndex + 1];
      animatePageTurn('next', () => {
        if (isPlaying) playPage(nextPage);
        else setActivePage(nextPage.pageNumber);
        scrollToPage(nextPage.pageNumber);
      });
    }
  };

  const handlePrev = () => {
    if (activePage === null) return;
    const currentIndex = pages.findIndex(p => p.pageNumber === activePage);
    if (currentIndex > 0) {
      const prevPage = pages[currentIndex - 1];
      animatePageTurn('prev', () => {
        if (isPlaying) playPage(prevPage);
        else setActivePage(prevPage.pageNumber);
        scrollToPage(prevPage.pageNumber);
      });
    }
  };

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > 50;
    const isRightSwipe = distance < -50;

    if (isLeftSwipe) handleNext();
    if (isRightSwipe) handlePrev();
  };

  // LANDING PAGE VIEW
  if (isLanding) {
    return (
      <div className="min-h-screen bg-[#eceae4] flex items-center justify-center p-4 bg-[url('https://www.transparenttextures.com/patterns/cream-paper.png')]">
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
        <div className="max-w-2xl w-full bg-white rounded-2xl shadow-2xl overflow-hidden border border-stone-200 relative">
           {/* Decorative spine */}
          <div className="absolute left-0 top-0 bottom-0 w-2 bg-orange-600/80 z-10"></div>

          <div className="bg-orange-600 p-10 text-white text-center relative overflow-hidden">
             <div className="absolute top-0 left-0 w-full h-full opacity-20 bg-[url('https://www.transparenttextures.com/patterns/book-cover.png')]"></div>
             <div className="relative z-10">
                <div className="mx-auto bg-white/10 w-20 h-20 rounded-full flex items-center justify-center mb-4 backdrop-blur-sm border border-white/20">
                   <Headphones size={40} />
                </div>
                <h1 className="text-5xl font-serif font-bold mb-2 tracking-tight">LibroVoz</h1>
                <p className="text-orange-100 text-lg opacity-90">Tu biblioteca personal, narrada con IA</p>
             </div>
          </div>
          
          <div className="p-12 flex flex-col items-center gap-8">
            {isProcessing ? (
              <div className="flex flex-col items-center animate-pulse py-10">
                <Loader2 size={48} className="text-orange-500 animate-spin mb-4" />
                <p className="text-stone-500 font-medium">Procesando páginas y extrayendo texto...</p>
              </div>
            ) : (
              <>
                <div className="w-full group">
                  <label className="flex flex-col items-center justify-center w-full h-52 border-2 border-stone-300 border-dashed rounded-2xl cursor-pointer bg-stone-50 hover:bg-orange-50 hover:border-orange-400 transition-all duration-300">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6 transform group-hover:scale-105 transition-transform">
                      <Upload className="w-12 h-12 mb-4 text-stone-400 group-hover:text-orange-500 transition-colors" />
                      <p className="mb-2 text-base text-stone-600 font-medium">
                        Arrastra tu PDF o <span className="text-orange-600 font-bold underline">haz clic</span>
                      </p>
                      <p className="text-xs text-stone-400">Soporta archivos PDF hasta 10MB</p>
                    </div>
                    <input type="file" className="hidden" accept=".pdf" onChange={handleFileUpload} />
                  </label>
                </div>

                <div className="flex items-center gap-4 w-full px-8">
                  <div className="h-px bg-stone-200 flex-1"></div>
                  <span className="text-stone-400 text-xs font-bold tracking-widest uppercase">O prueba la demo</span>
                  <div className="h-px bg-stone-200 flex-1"></div>
                </div>

                <button 
                  onClick={loadDemoBook}
                  className="flex items-center gap-3 px-8 py-4 bg-stone-900 text-white rounded-xl hover:bg-black transition-all w-full justify-center font-bold shadow-lg hover:shadow-xl transform active:scale-[0.98]"
                >
                  <BookOpen size={20} />
                  Cargar "La Teoría Polivagal"
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  const headerBg = theme === 'high-contrast' ? 'bg-black border-yellow-900' : theme === 'dark' ? 'bg-[#121212] border-stone-800' : 'bg-[#fdfbf7]/90 border-[#e5e3dc]';
  const headerText = theme === 'high-contrast' ? 'text-yellow-500' : theme === 'dark' ? 'text-stone-200' : 'text-stone-800';
  const drawerBg = theme === 'high-contrast' ? 'bg-stone-950 border-r border-yellow-900' : theme === 'dark' ? 'bg-stone-900 border-r border-stone-700' : 'bg-[#f5f4f0] border-r border-[#e5e3dc]';
  const drawerText = theme === 'high-contrast' ? 'text-yellow-100' : theme === 'dark' ? 'text-stone-100' : 'text-stone-800';
  const activePageObj = pages.find(p => p.pageNumber === activePage) || pages[0];

  return (
    <div className={`min-h-screen pb-48 transition-colors duration-500 ${theme === 'light' ? 'bg-[#eceae4]' : ''} bg-[url('https://www.transparenttextures.com/patterns/cream-paper.png')] bg-fixed`}>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      
      {/* Header Elegante */}
      <header className={`${headerBg} border-b sticky top-0 z-40 backdrop-blur-md shadow-sm transition-all`}>
        <div className="max-w-5xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            {/* Left Controls */}
            <div className="flex items-center gap-2">
              <button onClick={() => setIsLanding(true)} className={`p-2 rounded-lg hover:bg-black/5 ${headerText}`} title="Salir">
                <Upload size={18} />
              </button>
              <div className="h-6 w-px bg-current opacity-10 mx-1"></div>
              <button onClick={() => setShowIndex(!showIndex)} className={`p-2 rounded-lg hover:bg-black/5 ${headerText}`} title="Índice">
                <List size={24} />
              </button>
              <button onClick={() => setShowHistory(!showHistory)} className={`p-2 rounded-lg hover:bg-black/5 relative ${headerText}`} title="Historial">
                <History size={24} />
              </button>
            </div>

            {/* Center Title */}
            <div className="hidden md:flex items-center gap-2 opacity-80">
               <BookOpen size={18} className={theme === 'high-contrast' ? 'text-yellow-600' : 'text-orange-600'} />
               <span className={`font-serif font-bold tracking-tight ${headerText}`}>LibroVoz</span>
            </div>

            {/* Right Controls */}
            <div className="flex items-center gap-3">
              <div className={`flex items-center p-1 rounded-full border ${theme === 'high-contrast' ? 'border-yellow-900 bg-black' : 'border-stone-300 bg-white'}`}>
                 <button 
                   onClick={() => setViewMode('scroll')}
                   className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1 transition-all ${viewMode === 'scroll' ? (theme === 'high-contrast' ? 'bg-yellow-900 text-yellow-300' : 'bg-stone-800 text-white shadow-md') : 'text-stone-400 hover:text-stone-600'}`}
                 >
                   <ScrollText size={14} /> Scroll
                 </button>
                 <button 
                   onClick={() => setViewMode('flip')}
                   className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1 transition-all ${viewMode === 'flip' ? (theme === 'high-contrast' ? 'bg-yellow-900 text-yellow-300' : 'bg-stone-800 text-white shadow-md') : 'text-stone-400 hover:text-stone-600'}`}
                 >
                   <Book size={14} /> Hoja
                 </button>
              </div>

              <button 
                 onClick={() => setShowSettings(!showSettings)}
                 className={`p-2 rounded-full transition-all ${theme === 'high-contrast' ? 'hover:bg-yellow-900 text-yellow-500' : 'hover:bg-black/5 text-stone-600'}`}
              >
                 <Settings size={24} />
              </button>
            </div>
          </div>

          {/* Settings Panel */}
          {showSettings && (
            <div className={`absolute top-full right-4 mt-2 w-80 p-5 rounded-xl border shadow-2xl z-50 ${theme === 'high-contrast' ? 'bg-stone-950 border-yellow-700' : 'bg-white border-stone-200'}`}>
                <div className="space-y-6">
                  <div>
                    <label className={`flex items-center gap-2 mb-3 text-xs font-bold uppercase tracking-wider ${theme === 'high-contrast' ? 'text-stone-400' : 'text-stone-400'}`}>
                      <ZoomIn size={14} /> Tamaño Texto
                    </label>
                    <div className="flex items-center justify-between bg-black/5 p-2 rounded-lg">
                      <button onClick={() => setFontSize(Math.max(16, fontSize - 2))} className="p-2 hover:bg-black/5 rounded"><ZoomOut size={20} className="opacity-50" /></button>
                      <span className={`font-serif font-bold text-xl ${headerText}`}>{fontSize}px</span>
                      <button onClick={() => setFontSize(Math.min(48, fontSize + 2))} className="p-2 hover:bg-black/5 rounded"><ZoomIn size={20} className="opacity-50" /></button>
                    </div>
                  </div>
                  
                  <div>
                   <label className={`flex items-center gap-2 mb-3 text-xs font-bold uppercase tracking-wider ${theme === 'high-contrast' ? 'text-stone-400' : 'text-stone-400'}`}>
                    <Eye size={14} /> Tema
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    <button onClick={() => setTheme('light')} className={`h-10 rounded-full border-2 transition-all bg-[#fdfbf7] ${theme === 'light' ? 'border-orange-500 ring-2 ring-orange-200' : 'border-stone-200'}`} title="Papel"></button>
                    <button onClick={() => setTheme('sepia')} className={`h-10 rounded-full border-2 transition-all bg-[#fdf6e3] ${theme === 'sepia' ? 'border-[#d6c4a1] ring-2 ring-[#d6c4a1]' : 'border-[#eee8d5]'}`} title="Sepia"></button>
                    <button onClick={() => setTheme('dark')} className={`h-10 rounded-full border-2 transition-all bg-[#1e1e1e] ${theme === 'dark' ? 'border-stone-500 ring-2 ring-stone-600' : 'border-stone-700'}`} title="Noche"></button>
                    <button onClick={() => setTheme('high-contrast')} className={`h-10 rounded-full border-2 transition-all bg-black ${theme === 'high-contrast' ? 'border-yellow-400 ring-2 ring-yellow-500' : 'border-stone-800'}`} title="Alto Contraste"></button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Drawers (Index/History) */}
      {(showIndex || showHistory) && (
        <>
          <div className="fixed inset-0 bg-black/20 z-40 backdrop-blur-sm" onClick={() => { setShowIndex(false); setShowHistory(false); }} />
          <div className={`fixed top-0 left-0 h-full w-[85%] max-w-xs z-50 shadow-2xl ${drawerBg} overflow-hidden flex flex-col animate-in slide-in-from-left duration-300`}>
            
            <div className="p-5 flex justify-between items-center border-b border-black/5">
              <h2 className={`text-base font-bold uppercase tracking-wider ${drawerText}`}>{showIndex ? 'Índice' : 'Historial'}</h2>
              <button onClick={() => { setShowIndex(false); setShowHistory(false); }} className="opacity-50 hover:opacity-100"><X size={20} /></button>
            </div>

            {showIndex && (
               <div className="flex p-2 gap-2 border-b border-black/5 shrink-0">
                 <button 
                    onClick={() => setIndexTab('chapters')}
                    className={`flex-1 py-2 text-xs font-bold uppercase tracking-wide rounded-md transition-all flex items-center justify-center gap-2 ${indexTab === 'chapters' ? 'bg-white shadow-sm text-black' : 'text-stone-400 hover:text-stone-600'}`}
                    disabled={toc.length === 0}
                  >
                    Capítulos
                 </button>
                 <button 
                    onClick={() => setIndexTab('grid')}
                    className={`flex-1 py-2 text-xs font-bold uppercase tracking-wide rounded-md transition-all flex items-center justify-center gap-2 ${indexTab === 'grid' ? 'bg-white shadow-sm text-black' : 'text-stone-400 hover:text-stone-600'}`}
                  >
                    Páginas
                 </button>
               </div>
            )}

            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {showIndex ? (
                 indexTab === 'chapters' ? (
                    toc.length > 0 ? (
                      <div className="divide-y divide-black/5">
                        {toc.map((item, i) => (
                          <div 
                            key={i} 
                            onClick={() => handleIndexJump(item.pageNumber)} 
                            className={`p-4 cursor-pointer hover:bg-black/5 transition-colors`}
                          >
                            <p className={`text-sm font-serif font-medium ${drawerText}`}>{item.title}</p>
                            <span className="text-xs text-stone-400 mt-1 block">Página {item.pageNumber}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-8 text-center opacity-50 italic text-sm">Sin capítulos detectados.</div>
                    )
                 ) : (
                    <div className="grid grid-cols-4 gap-2 p-3">
                      {pages.map((p) => (
                        <button 
                          key={p.pageNumber}
                          onClick={() => handleIndexJump(p.pageNumber)}
                          className={`aspect-square flex items-center justify-center rounded text-sm font-bold transition-all ${
                            activePage === p.pageNumber 
                              ? 'bg-stone-800 text-white shadow-md scale-110' 
                              : 'bg-white text-stone-400 hover:bg-stone-100 border border-stone-100'
                          }`}
                        >
                          {p.pageNumber}
                        </button>
                      ))}
                    </div>
                 )
              ) : (
                 history.length > 0 ? (
                   <div className="divide-y divide-black/5">
                     {history.map((h, i) => (
                        <div key={i} onClick={() => handleHistoryJump(h.pageNumber)} className={`p-4 cursor-pointer hover:bg-black/5 ${drawerText}`}>
                          <div className="flex justify-between items-center mb-1">
                            <span className="font-bold text-sm">Página {h.pageNumber}</span>
                            <span className="text-[10px] opacity-40">{new Date(h.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                          </div>
                          <div className="text-xs opacity-60 truncate font-serif italic">
                            "{pages.find(p => p.pageNumber === h.pageNumber)?.content.substring(0, 40)}..."
                          </div>
                        </div>
                     ))}
                   </div>
                 ) : (
                   <div className="p-8 text-center opacity-50 italic text-sm">Historial vacío.</div>
                 )
              )}
            </div>
          </div>
        </>
      )}

      <main 
        className="max-w-4xl mx-auto px-4 py-8 sm:px-6 touch-pan-y"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {viewMode === 'scroll' ? (
          <div className="space-y-8">
            {pages.map((page) => (
              <div key={page.pageNumber} id={`page-${page.pageNumber}`}>
                <BookPage 
                  page={page} 
                  isActive={activePage === page.pageNumber}
                  isPlaying={isPlaying && !isPaused && activePage === page.pageNumber}
                  isLoading={isGeneratingAudio && activePage === page.pageNumber}
                  onPlay={handlePageSelect}
                  fontSize={fontSize}
                  theme={theme}
                  viewMode="scroll"
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="perspective-container h-[calc(100vh-12rem)] flex items-center justify-center relative">
             <div className={`absolute inset-0 w-full h-full max-w-3xl mx-auto bg-white shadow-2xl rounded-r-xl transform translate-x-2 translate-y-2 -z-10 opacity-50 ${theme === 'dark' ? 'bg-stone-800' : ''}`}></div>

             {activePageObj && (
               <div className={`w-full max-w-3xl h-full flip-card ${flipState === 'flipping-out-left' ? 'flip-out-left' : ''} ${flipState === 'flipping-in-right' ? 'flip-in-right' : ''}`}>
                 <BookPage 
                    page={activePageObj}
                    isActive={true} 
                    isPlaying={isPlaying && !isPaused}
                    isLoading={isGeneratingAudio}
                    onPlay={handlePageSelect}
                    fontSize={fontSize}
                    theme={theme}
                    viewMode="flip"
                  />
               </div>
             )}
          </div>
        )}
      </main>

      {activePage !== null && (
        <AudioController
          isPlaying={isPlaying}
          isPaused={isPaused}
          pageNumber={activePage}
          selectedVoiceURI={selectedVoiceURI}
          playbackRate={playbackRate}
          useCloudTTS={useCloudTTS}
          audioFormat={audioFormat}
          userVoiceSample={userVoiceSample}
          onTogglePlay={handleTogglePlay}
          onVoiceChange={setSelectedVoiceURI}
          onPlaybackRateChange={handleSpeedChange}
          onNextPage={handleNext}
          onPrevPage={handlePrev}
          onToggleCloudMode={handleToggleCloudMode}
          onFormatChange={setAudioFormat}
          onRecordVoice={handleRecordVoice}
          canGoNext={pages.findIndex(p => p.pageNumber === activePage) < pages.length - 1}
          canGoPrev={pages.findIndex(p => p.pageNumber === activePage) > 0}
        />
      )}
    </div>
  );
};

export default App;