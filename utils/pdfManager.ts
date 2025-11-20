import { PageData, TOCItem, ParsedBook } from "../types";
import * as pdfjsLib from 'pdfjs-dist';

// Usamos unpkg que a veces maneja mejor CORS en entornos de prueba que jsdelivr
// Aseguramos que la versión coincida con package.json (4.4.168)
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs`;

export async function parsePDF(file: File): Promise<ParsedBook> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    
    // Cargar documento
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    
    // 1. Extraer Texto de Páginas
    const pages: PageData[] = [];
    
    for (let i = 1; i <= pdf.numPages; i++) {
      try {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        
        // Unir los items de texto con espacios
        const textItems = textContent.items.map((item: any) => item.str);
        let pageText = textItems.join(' ');
        
        // Limpieza básica
        pageText = pageText
          .replace(/\s+/g, ' ') // Eliminar espacios múltiples
          .trim();

        if (pageText.length > 0) {
          pages.push({
            pageNumber: i,
            content: pageText
          });
        }
      } catch (pageError) {
        console.warn(`Error al leer la página ${i}:`, pageError);
        // Continuamos con la siguiente página si una falla
      }
    }

    // 2. Extraer Tabla de Contenidos (Bookmarks/Outline)
    const toc: TOCItem[] = [];
    try {
      const outline = await pdf.getOutline();
      
      if (outline && outline.length > 0) {
        // Función recursiva para aplanar el árbol de navegación
        const processOutlineItem = async (item: any) => {
          let dest = item.dest;
          let pageNumber = 0;

          // Resolver destino a número de página
          if (typeof dest === 'string') {
            // Referencia nombrada
            const destRef = await pdf.getDestination(dest);
            if (destRef) {
              const pageIndex = await pdf.getPageIndex(destRef[0]);
              pageNumber = pageIndex + 1; // API es base 0, UI es base 1
            }
          } else if (Array.isArray(dest)) {
             // Referencia directa [Ref, {name: 'Fit'}, ...]
             const ref = dest[0];
             const pageIndex = await pdf.getPageIndex(ref);
             pageNumber = pageIndex + 1;
          }

          if (pageNumber > 0) {
            toc.push({
              title: item.title,
              pageNumber: pageNumber,
              section: 'Índice PDF'
            });
          }

          // Procesar hijos si existen (subcapítulos)
          if (item.items && item.items.length > 0) {
            for (const child of item.items) {
              await processOutlineItem(child);
            }
          }
        };

        for (const item of outline) {
          await processOutlineItem(item);
        }
      }
    } catch (tocError) {
      console.warn("No se pudo extraer el índice del PDF:", tocError);
      // No fallamos la carga completa si solo falla el índice
    }

    return { pages, toc };

  } catch (error) {
    console.error("Error crítico al parsear PDF:", error);
    throw new Error("No se pudo abrir el PDF. Es posible que el archivo esté dañado o protegido.");
  }
}