/* Inline SVG icons: realm emblems and piece silhouettes. */
import { REALM_HEX } from './models.js';

export const emblem = (r, size = 26) => {
  const c = REALM_HEX[r];
  const shapes = [
    `<path d="M12 2C12 2 5 10 5 15a7 7 0 0014 0c0-5-7-13-7-13z" fill="#fff"/>`,
    `<path d="M20 4C10 4 4 10 4 17c0 1 .2 2 .5 3C6 15 9 12 14 10c-4 3-6 6-7 10 8 0 13-6 13-16z" fill="#fff"/>`,
    `<circle cx="12" cy="12" r="4.5" fill="#fff"/>` + Array.from({ length: 8 }, (_, i) => `<line x1="12" y1="12" x2="${12 + Math.cos(i * 0.785) * 9.5}" y2="${12 + Math.sin(i * 0.785) * 9.5}" stroke="#fff" stroke-width="2" stroke-linecap="round"/>`).join('').replace(/x1="12" y1="12"/g, (m, o, s) => m),
    `<path d="M2 20L9 7l4 6 3-4 6 11z" fill="#fff"/>`,
  ];
  return `<svg class="emb" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.5l9 3v7.5c0 5-4 9-9 10.5C7 21 3 17 3 12V4.5z" fill="${c}" stroke="#2a1708" stroke-width="1.2"/><g transform="translate(5.5 5.5) scale(.55)">${shapes[r]}</g></svg>`;
};

const SIL = {
  P: '<circle cx="20" cy="15" r="6.5"/><ellipse cx="20" cy="23" rx="9" ry="2.8"/><path d="M13 43Q15 33 17.5 25.5L22.5 25.5Q25 33 27 43Z"/>',
  R: '<path d="M11 12h4v3.5h3.5V12h3v3.5H25V12h4v9l-3 2.5 1.5 18h-15L14 23.5 11 21z"/><path d="M10.5 43l2-4h15l2 4z"/>',
  B: '<path d="M20 5C28 11 30 20 26.5 25.5L24.5 28H15.5L13.5 25.5C10 20 12 11 20 5Z"/><rect x="11.5" y="27.5" width="17" height="3.5" rx="1.7"/><path d="M14.5 31h11Q26 38 29 43H11Q14 38 14.5 31Z"/><circle cx="20" cy="4.5" r="2.6"/>',
  N: '<path d="M11.5 43C11.5 35 15 30 19 26.5C14 25.5 10.5 21.5 10.5 17.5L16 8 18 10.5 22 5.5 24 9C30.5 13 30.5 22 29.5 28 28.5 34 28.5 39 28.5 43Z"/>',
  Q: '<path d="M13 43Q14 34 16.5 27L9.5 13.5 16 19 20 8 24 19 30.5 13.5 23.5 27Q26 34 27 43Z"/><ellipse cx="20" cy="26.5" rx="8" ry="2.6"/>',
  K: '<rect x="18" y="1" width="4" height="12" rx="1.4"/><rect x="14" y="4.5" width="12" height="4" rx="1.4"/><path d="M13 43Q14 34 16 27Q12.5 24 14 20Q17 16.5 20 16.5Q23 16.5 26 20Q27.5 24 24 27Q26 34 27 43Z"/><ellipse cx="20" cy="26.5" rx="8" ry="2.6"/>',
};
export const pieceIcon = (k, color = '#3b2410', w = 30) =>
  `<svg class="pic" width="${w}" height="${w * 1.2}" viewBox="0 0 40 48" aria-hidden="true"><g fill="${color}" stroke="#1a0e05" stroke-width="1.2" stroke-linejoin="round">${SIL[k]}</g></svg>`;

/* a die face: pips for 1-4, symbols for the special faces */
export function dieFace(v, cls = '') {
  const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8] };
  if (v <= 4) return `<div class="df ${cls}">${Array.from({ length: 9 }, (_, i) => `<i${PIPS[v].includes(i) ? ' class="on"' : ''}></i>`).join('')}</div>`;
  return `<div class="df sp ${cls}"><span>${v === 5 ? '💣' : '🛡️'}</span></div>`;
}
