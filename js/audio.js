/* Tiny synthesised sound effects (no audio files needed). */
let ac = null, muted = false;
try { muted = localStorage.getItem('lrs.mute') === '1'; } catch { /* storage unavailable */ }
const ctx = () => {
  if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
  if (ac.state === 'suspended') ac.resume();
  return ac;
};
function tone(f, d, type = 'triangle', v = 0.18, delay = 0, slide = 0) {
  const a = ctx(); if (!a || muted) return;
  const o = a.createOscillator(), g = a.createGain(), t = a.currentTime + delay;
  o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + d);
  g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + d + 0.02);
}
function noise(d, v = 0.2, freq = 1500, delay = 0) {
  const a = ctx(); if (!a || muted) return;
  const n = Math.floor(a.sampleRate * d), b = a.createBuffer(1, n, a.sampleRate), c = b.getChannelData(0);
  for (let i = 0; i < n; i++) c[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
  const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(), t = a.currentTime + delay;
  f.type = 'lowpass'; f.frequency.value = freq; g.gain.value = v; s.buffer = b; s.connect(f).connect(g).connect(a.destination); s.start(t);
}
export const sfx = {
  dice() { [0, 0.06, 0.13, 0.2, 0.3, 0.42].forEach((t, i) => noise(0.05, 0.25 - i * 0.03, 2200 - i * 150, t)); },
  move() { tone(420, 0.08, 'triangle', 0.16); tone(300, 0.12, 'sine', 0.12, 0.05); },
  capture() { tone(520, 0.3, 'sawtooth', 0.12, 0, -380); noise(0.12, 0.25, 1200); },
  bomb() { noise(0.6, 0.5, 700); tone(110, 0.5, 'sine', 0.4, 0, -70); },
  haven() { [523, 659, 880].forEach((f, i) => tone(f, 0.3, 'sine', 0.14, i * 0.07)); },
  promote() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.16, i * 0.09)); },
  fall() { tone(300, 0.9, 'sawtooth', 0.14, 0, -250); noise(0.7, 0.3, 500); },
  win() { [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, 0.3, 'triangle', 0.2, i * 0.12)); },
  click() { tone(660, 0.05, 'square', 0.06); },
};
export const isMuted = () => muted;
export function setMuted(m) { muted = m; try { localStorage.setItem('lrs.mute', m ? '1' : '0'); } catch { /* ignore */ } }
document.addEventListener('pointerdown', () => ctx(), { once: true, passive: true });
