import { GoogleGenAI, Modality } from "@google/genai";
import { VoiceName, AudioFormat } from "../types";

export const generateSpeech = async (
  text: string, 
  voice: VoiceName | 'custom-voice',
  format: AudioFormat = AudioFormat.MP3,
  signal?: AbortSignal,
  voiceSampleBase64?: string | null
): Promise<string | undefined> => {
  
  try {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    // Limpieza agresiva
    const cleanText = text
      .replace(/\s+/g, ' ') 
      .replace(/\[.*?\]/g, '') 
      .trim();
    
    if (!cleanText) throw new Error("El texto está vacío");
    
    const MAX_CHARS = 600;
    const finalText = cleanText.length > MAX_CHARS 
      ? cleanText.substring(0, MAX_CHARS) + "... (continúa en el texto escrito)" 
      : cleanText;

    const apiKey = process.env.API_KEY;
    if (!apiKey) throw new Error("Falta la API Key.");

    const ai = new GoogleGenAI({ apiKey });
    
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    // LÓGICA DE CLONACIÓN DE VOZ (MULTIMODAL)
    // Si tenemos una muestra de voz y el usuario eligió 'custom-voice'
    if (voice === 'custom-voice' && voiceSampleBase64) {
       // Usamos el modelo general Flash porque maneja mejor Audio->Audio (contexto multimodal)
       // El modelo TTS específico ('preview-tts') suele ser solo Texto->Audio predefinido.
       const response = await ai.models.generateContent({
        model: "gemini-2.5-flash", 
        contents: [
          {
            role: "user",
            parts: [
              { 
                inlineData: { 
                  mimeType: "audio/wav", 
                  data: voiceSampleBase64 
                } 
              },
              { 
                text: `Por favor, actúa como un narrador de audiolibros profesional. 
                Tu tarea es leer el siguiente texto en voz alta. 
                
                IMPORTANTE: Debes imitar el tono, la velocidad, el género y el estilo de voz del archivo de audio proporcionado arriba lo mejor que puedas.
                
                Texto a leer: "${finalText}"` 
              }
            ]
          }
        ],
        config: {
          responseModalities: [Modality.AUDIO], // Forzamos salida de audio
          systemInstruction: "Eres una IA avanzada capaz de síntesis de voz y transferencia de estilo de audio.",
        },
      });

      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

      const audioPart = response.candidates?.[0]?.content?.parts?.[0];
      if (audioPart?.inlineData?.data) {
        return audioPart.inlineData.data;
      }
      throw new Error("No se pudo generar el audio clonado.");
    
    } else {
      // LÓGICA ESTÁNDAR (PREBUILT VOICES)
      // Usamos el modelo especializado en TTS para voces predefinidas (más rápido y estable para esto)
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: finalText }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: voice as VoiceName, // Cast as normal VoiceName
              },
            },
          },
        },
      });

      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

      const audioPart = response.candidates?.[0]?.content?.parts?.[0];
      if (audioPart?.inlineData?.data) {
        return audioPart.inlineData.data;
      }
    }

    throw new Error("La IA no devolvió audio.");

  } catch (clientError: any) {
    if (clientError.name === 'AbortError' || clientError.message === 'Aborted') {
      throw clientError;
    }

    console.error("❌ Error generando audio:", clientError);
    if (clientError.message?.includes("API Key")) throw clientError;
    if (clientError.status === 429) throw new Error("Cuota agotada.");
    
    throw new Error(clientError.message || "No se pudo generar el audio.");
  }
};