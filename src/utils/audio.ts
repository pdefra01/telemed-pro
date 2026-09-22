/**
 * Genera un sonido de timbre agradable usando la Web Audio API nativa.
 * Esto evita la necesidad de descargar o alojar archivos de audio estáticos.
 *
 * Se reproduce un patrón de 3 repeticiones (campanita doble + pausa) para que
 * la alerta de un nuevo turno confirmado sea difícil de pasar por alto,
 * incluso si el médico está distraído o con el volumen bajo.
 */
export function playArrivalSound() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();

    const REPETITIONS = 3;
    const GAP_BETWEEN_REPEATS = 0.55; // segundos entre cada repique
    const VOLUME = 0.45; // antes 0.12 → 0.22 → 0.45: bien audible sin distorsionar

    for (let i = 0; i < REPETITIONS; i++) {
      const start = ctx.currentTime + i * GAP_BETWEEN_REPEATS;

      // Primer tono: C5 (523.25 Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(523.25, start);

      gain1.gain.setValueAtTime(VOLUME, start);
      gain1.gain.exponentialRampToValueAtTime(0.001, start + 0.6);

      osc1.connect(gain1);
      gain1.connect(ctx.destination);

      // Segundo tono: E5 (659.25 Hz) que inicia ligeramente desfasado
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(659.25, start + 0.12);

      gain2.gain.setValueAtTime(0, start);
      gain2.gain.setValueAtTime(VOLUME, start + 0.12);
      gain2.gain.exponentialRampToValueAtTime(0.001, start + 0.8);

      osc2.connect(gain2);
      gain2.connect(ctx.destination);

      // Iniciar y detener osciladores
      osc1.start(start);
      osc1.stop(start + 0.65);

      osc2.start(start + 0.12);
      osc2.stop(start + 0.85);
    }
  } catch (error) {
    console.warn('No se pudo reproducir el sonido de llegada (bloqueo de autoplay u otra restricción del navegador):', error);
  }
}
