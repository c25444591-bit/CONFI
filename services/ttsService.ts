export interface TTSVoice {
  name: string;
  lang: string;
  localService: boolean;
  voiceURI: string;
}

class TTSService {
  private synth: SpeechSynthesis;
  private currentUtterance: SpeechSynthesisUtterance | null = null;

  constructor() {
    this.synth = window.speechSynthesis;
  }

  private getVoiceScore(voice: SpeechSynthesisVoice): number {
    let score = 0;
    
    // 1. Regional Priority (Argentine Accent)
    if (voice.lang === 'es-AR') score += 1000;
    // Mexican/Latam often closer to intended rhythm than Spain for this request
    else if (voice.lang === 'es-MX' || voice.lang === 'es-419') score += 500; 
    else if (voice.lang === 'es-US') score += 400;
    else if (voice.lang.startsWith('es')) score += 100;
    else return 0; // Not Spanish

    // 2. Engine Quality Priority
    // Google voices on Android/Chrome are often neural/natural
    if (voice.name.includes('Google')) score += 50;
    // Apple/Microsoft "Premium" or "Enhanced" voices
    if (voice.name.toLowerCase().includes('premium')) score += 40;
    if (voice.name.toLowerCase().includes('enhanced')) score += 40;
    if (voice.name.toLowerCase().includes('natural')) score += 40;
    if (voice.name.toLowerCase().includes('online')) score += 30; // Often indicates cloud-based quality

    return score;
  }

  public getVoices(): SpeechSynthesisVoice[] {
    const allVoices = this.synth.getVoices();
    
    // Filter only Spanish and sort by quality score
    return allVoices
      .filter(v => v.lang.startsWith('es'))
      .sort((a, b) => {
        const scoreA = this.getVoiceScore(a);
        const scoreB = this.getVoiceScore(b);
        return scoreB - scoreA; // Descending order (best first)
    });
  }

  public previewVoice(voiceURI: string) {
    // Don't interrupt if actual book reading is happening, but if it's a preview or idle, go ahead
    if (this.synth.speaking && this.currentUtterance) {
       // If we are reading the book, don't interrupt for preview unless we pause? 
       // For simplicity, we just cancel to show preview.
       this.cancel();
    }

    const utterance = new SpeechSynthesisUtterance("Hola, así es como leo este libro.");
    const voices = this.synth.getVoices();
    const selectedVoice = voices.find(v => v.voiceURI === voiceURI);

    if (selectedVoice) {
      utterance.voice = selectedVoice;
      utterance.lang = selectedVoice.lang;
      utterance.rate = 1.0;
      this.synth.speak(utterance);
    }
  }

  public speak(text: string, voiceURI: string | null, rate: number = 1, onEnd: () => void, onError: (e: any) => void) {
    // Clean up previous utterance callbacks to avoid race conditions
    this.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    this.currentUtterance = utterance;
    
    // Select Voice Logic
    const voices = this.synth.getVoices();
    let selectedVoice: SpeechSynthesisVoice | undefined;

    // 1. Try to use the user-selected voice
    if (voiceURI) {
      selectedVoice = voices.find(v => v.voiceURI === voiceURI);
    }

    // 2. Auto-select best available if no selection or selection failed
    if (!selectedVoice) {
      const sortedVoices = this.getVoices();
      if (sortedVoices.length > 0) {
        selectedVoice = sortedVoices[0];
      }
    }

    if (selectedVoice) {
      utterance.voice = selectedVoice;
      // Ensure lang matches voice to help engine apply correct prosody
      utterance.lang = selectedVoice.lang;
    } else {
      // Fallback if absolutely no voice object found (rare)
      utterance.lang = 'es-AR'; 
    }

    utterance.rate = rate;
    // Slight pitch adjustment can sometimes reduce robotic resonance on default voices
    utterance.pitch = 1.0; 
    
    utterance.onend = () => {
      // Only execute if this is still the active utterance
      if (this.currentUtterance === utterance) {
        this.currentUtterance = null;
        onEnd();
      }
    };

    utterance.onerror = (event) => {
      // Filter out errors caused by normal cancellation (navigation/pause)
      if (event.error === 'interrupted' || event.error === 'canceled') {
        return;
      }

      console.error("TTS Error Event:", event.error);
      
      if (this.currentUtterance === utterance) {
        this.currentUtterance = null;
        // Fire callback with readable error
        onError(event.error);
      }
    };

    try {
      this.synth.speak(utterance);
    } catch (e) {
      console.error("Synth speak exception:", e);
      onError(e);
    }
  }

  public pause() {
    this.synth.pause();
  }

  public resume() {
    this.synth.resume();
  }

  public cancel() {
    if (this.currentUtterance) {
      // Remove listeners to prevent "ghost" callbacks from previous pages
      this.currentUtterance.onend = null;
      this.currentUtterance.onerror = null;
      this.currentUtterance = null;
    }
    this.synth.cancel();
  }

  public isSpeaking(): boolean {
    return this.synth.speaking;
  }

  public isPaused(): boolean {
    return this.synth.paused;
  }
}

export const ttsService = new TTSService();