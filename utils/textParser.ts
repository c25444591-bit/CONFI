import { PageData } from "../types";

export function parseBookContent(rawContent: string): PageData[] {
  const pages: PageData[] = [];
  
  // Regex to find blocks like: ==Start of OCR for page 1== [CONTENT] ==End of OCR for page 1==
  const regex = /==Start of OCR for page (\d+)==([\s\S]*?)==End of OCR for page \d+==/g;
  
  let match;
  while ((match = regex.exec(rawContent)) !== null) {
    const pageNumber = parseInt(match[1], 10);
    let content = match[2].trim();
    
    // --- CLEANING PROCESS ---
    
    // 1. Remove common bibliographic keywords lines
    const bibliographicKeywords = [
      'ISBN', 'Copyright', 'Derechos reservados', 'All rights reserved',
      'Impreso en', 'Printed in', 'Edición:', 'Editor:', 'Traducción:',
      'Diseño:', 'Maquetación:', 'www.', 'http:', 'https:', 'Depósito legal',
      'Título original', 'Publicado por', 'Editorial', 'email:', 'FICHAS', 'ÍNDICE'
    ];

    // Split into lines to filter out metadata lines
    content = content.split('\n').filter(line => {
      const trimmed = line.trim();
      // Remove empty lines
      if (!trimmed) return false;
      // Remove lines that are just numbers (page numbers at bottom/top)
      if (/^\d+$/.test(trimmed)) return false;
      // Remove lines containing bibliographic metadata
      if (bibliographicKeywords.some(keyword => trimmed.toLowerCase().includes(keyword.toLowerCase()))) return false;
      
      return true;
    }).join('\n');

    // 2. Remove multiple newlines to flow text better
    content = content.replace(/\n{3,}/g, '\n\n');

    // Only add page if there is content left after cleaning
    if (content.length > 0) {
      pages.push({
        pageNumber,
        content
      });
    }
  }
  
  return pages.sort((a, b) => a.pageNumber - b.pageNumber);
}