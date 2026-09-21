/**
 * Alerta sonoro de novo pedido (Web Audio — sem arquivo de áudio).
 * Por política de autoplay, o áudio só toca após uma interação do usuário;
 * como o admin faz login (clique), o contexto é liberado no primeiro gesto.
 */
let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    if (!ctx) ctx = new AC();
    return ctx;
  } catch {
    return null;
  }
}

/** Libera/retoma o áudio (chamar no primeiro clique do usuário). */
export function primeAudio(): void {
  const c = getCtx();
  if (c && c.state === 'suspended') void c.resume().catch(() => {});
}

/** Toca um "ding-dong" curto de alerta. */
export function playNewOrderChime(): void {
  const c = getCtx();
  if (!c) return;
  if (c.state === 'suspended') void c.resume().catch(() => {});
  const now = c.currentTime;
  const notes: Array<[number, number]> = [
    [880, 0],
    [1174.66, 0.16],
    [1567.98, 0.32],
  ];
  for (const [freq, t] of notes) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now + t);
    gain.gain.exponentialRampToValueAtTime(0.3, now + t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.2);
    osc.connect(gain).connect(c.destination);
    osc.start(now + t);
    osc.stop(now + t + 0.22);
  }
}
