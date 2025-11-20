import React from 'react';
import { PageData, Theme, ViewMode } from '../types';
import { Play, BookOpen, Loader2 } from 'lucide-react';

interface BookPageProps {
  page: PageData;
  isActive: boolean;
  isPlaying: boolean;
  isLoading: boolean;
  onPlay: (page: PageData) => void;
  fontSize: number;
  theme: Theme;
  viewMode?: ViewMode;
}

export const BookPage: React.FC<BookPageProps> = ({ 
  page, 
  isActive, 
  isPlaying,
  isLoading, 
  onPlay,
  fontSize,
  theme,
  viewMode = 'scroll'
}) => {
  // Theme configuration maps
  const containerStyles = {
    light: isActive 
      ? 'bg-[#fdfbf7] text-stone-900' 
      : 'bg-white text-stone-500 opacity-60 hover:opacity-100',
    sepia: isActive 
      ? 'bg-[#f4ecd8] text-[#5b4636]' 
      : 'bg-[#fdf6e3] text-[#928274] opacity-70 hover:opacity-100',
    dark: isActive 
      ? 'bg-[#1e1e1e] text-[#e0e0e0]' 
      : 'bg-[#121212] text-[#888] opacity-60 hover:opacity-100',
    'high-contrast': isActive 
      ? 'bg-black text-yellow-400 border-2 border-yellow-400' 
      : 'bg-black text-stone-600 border border-stone-800',
  };

  // Efectos de papel y sombras
  const paperEffect = theme === 'high-contrast' 
    ? '' 
    : theme === 'dark' 
      ? 'shadow-[inset_20px_0_40px_rgba(0,0,0,0.5)]' // Sombra interna oscura
      : 'shadow-[inset_20px_0_40px_rgba(0,0,0,0.05),1px_1px_5px_rgba(0,0,0,0.1)]'; // Sombra sutil de libro físico

  const buttonStyles = {
    light: isActive && (isPlaying || isLoading) ? 'bg-orange-100 text-orange-700' : 'bg-stone-100 text-stone-600 hover:bg-stone-200',
    sepia: isActive && (isPlaying || isLoading) ? 'bg-[#e9ddc3] text-[#5b4636]' : 'bg-[#eee8d5] text-[#5b4636] hover:bg-[#e9ddc3]',
    dark: isActive && (isPlaying || isLoading) ? 'bg-stone-700 text-stone-200' : 'bg-stone-800 text-stone-400 hover:bg-stone-700',
    'high-contrast': isActive && (isPlaying || isLoading) ? 'bg-yellow-900 text-yellow-300 border border-yellow-400' : 'bg-black text-yellow-400 border border-yellow-600 hover:bg-yellow-900',
  };

  const iconColor = theme === 'high-contrast' ? '#FFD700' : 'currentColor';

  // Styling adjustments for Flip Mode (Full height card feeling) vs Scroll Mode (List item)
  const modeClasses = viewMode === 'flip' 
    ? 'min-h-[70vh] h-full flex flex-col rounded-r-xl border-l border-stone-300/20' // Borde izquierdo sutil para el lomo
    : 'mb-12 rounded-lg mx-auto shadow-sm border border-stone-100';

  // Gradiente lateral para simular la curvatura de la página hacia el centro del libro
  const spineGradient = viewMode === 'flip' && theme !== 'high-contrast' && theme !== 'dark'
    ? { background: `linear-gradient(to right, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0) 10%, rgba(0,0,0,0) 100%)` }
    : {};

  return (
    <div 
      className={`relative max-w-3xl p-8 sm:p-12 transition-all duration-500 ${containerStyles[theme]} ${modeClasses} ${paperEffect} ${viewMode === 'flip' ? 'shadow-2xl' : ''}`}
      style={{ ...spineGradient }}
    >
      {/* Header de la página */}
      <div className={`flex justify-between items-center mb-8 pb-4 border-b ${theme === 'high-contrast' ? 'border-yellow-800' : 'border-black/5'}`}>
        <div className={`flex items-center gap-2 text-sm font-bold uppercase tracking-widest opacity-70`}>
          <span>Página {page.pageNumber}</span>
        </div>
        
        <button
          onClick={() => !isLoading && onPlay(page)}
          disabled={isLoading}
          className={`flex items-center gap-3 px-6 py-2 rounded-full text-sm font-bold transition-all transform active:scale-95 shadow-sm ${buttonStyles[theme]} ${isLoading ? 'opacity-80 cursor-wait' : ''}`}
          aria-label={isActive && isLoading ? "Generando audio" : isPlaying && isActive ? "Reproduciendo" : `Leer página ${page.pageNumber}`}
        >
          {isActive && isLoading ? (
            <span className="flex items-center gap-2">
              <Loader2 size={16} className="animate-spin" />
              <span>Cargando...</span>
            </span>
          ) : isActive && isPlaying ? (
             <span className="flex items-center gap-2">
               <span className="relative flex h-3 w-3">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${theme === 'high-contrast' ? 'bg-yellow-400' : 'bg-orange-400'}`}></span>
                  <span className={`relative inline-flex rounded-full h-3 w-3 ${theme === 'high-contrast' ? 'bg-yellow-500' : 'bg-orange-500'}`}></span>
                </span>
               <span>Escuchando</span>
             </span>
          ) : (
            <>
              <Play size={16} className="fill-current" color={iconColor} />
              <span>Leer Voz</span>
            </>
          )}
        </button>
      </div>

      {/* Contenido del texto */}
      <div 
        className={`book-text leading-loose text-justify whitespace-pre-wrap ${viewMode === 'flip' ? 'flex-1 overflow-y-auto pr-2 custom-scrollbar' : ''}`}
        style={{ 
          fontSize: `${fontSize}px`, 
          lineHeight: '1.8',
          fontFamily: '"Merriweather", "Georgia", serif'
        }}
      >
        {page.content}
      </div>

      {/* Número de página footer decorativo */}
      <div className="mt-8 text-center opacity-30 font-serif italic text-sm">
        - {page.pageNumber} -
      </div>
    </div>
  );
};