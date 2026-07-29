/**
 * Genera un sonido de timbre agradable usando la Web Audio API nativa.
 * Esto evita la necesidad de descargar o alojar archivos de audio estáticos.
 */
export function playArrivalSound() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    // Primer tono: C5 (523.25 Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(523.25, now);
    
    gain1.gain.setValueAtTime(0.12, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);

    // Segundo tono: E5 (659.25 Hz) que inicia ligeramente desfasado
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(659.25, now + 0.12);

    gain2.gain.setValueAtTime(0, now);
    gain2.gain.setValueAtTime(0.12, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);

    // Iniciar y detener osciladores
    osc1.start(now);
    osc1.stop(now + 0.65);

    osc2.start(now + 0.12);
    osc2.stop(now + 0.85);
  } catch (error) {
    console.warn('No se pudo reproducir el sonido de llegada (bloqueo de autoplay u otra restricción del navegador):', error);
  }
}
