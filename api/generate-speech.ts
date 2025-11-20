import { GoogleGenAI, Modality } from "@google/genai";

export const config = {
  runtime: 'edge', // Use Edge runtime for speed
};

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const { text, voice } = await req.json();

    // 1. LIMITATION: Character limit to control costs/usage per request
    // 3000 caracteres es aproximadamente una página densa o dos páginas de diálogo.
    const MAX_CHARS = 3000; 
    
    if (!text || text.length > MAX_CHARS) {
      return new Response(
        JSON.stringify({ 
          error: `El texto es demasiado largo para el modo gratuito (${text.length}/${MAX_CHARS} caracteres). Para leer capítulos enteros, por favor introduce tu propia API Key en el menú de Configuración.` 
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 2. SECURITY: Use the environment variable securely on the server
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Configuración incompleta: El propietario no ha configurado la API_KEY del servidor." }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const ai = new GoogleGenAI({ apiKey });

    // 3. GENERATION
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: text }] }],
      config: {
        systemInstruction: "Eres una narradora de audiolibros profesional. Lee el texto en español con acento neutro o Rioplatense según el contexto, manteniendo un tono cálido y pausado.",
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: voice || 'Kore',
            },
          },
        },
      },
    });

    const audioPart = response.candidates?.[0]?.content?.parts?.[0];
    
    if (!audioPart?.inlineData?.data) {
      throw new Error("No se pudo generar el audio (Respuesta vacía de Gemini)");
    }

    // Return the raw base64 data
    return new Response(JSON.stringify({ audioData: audioPart.inlineData.data }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error("Server API Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Error interno del servidor al generar voz." }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}