/* Procedural textures (drawn once to offscreen canvases). */
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const mk = s => { const c = document.createElement('canvas'); c.width = c.height = s; return c; };
export const CELL_PX = 96;

function cellFrame(g, x, y, s, soft) {
  g.strokeStyle = 'rgba(0,0,0,.38)'; g.lineWidth = 3; g.strokeRect(x + 1.5, y + 1.5, s - 3, s - 3);
  g.strokeStyle = 'rgba(255,255,255,.22)'; g.lineWidth = 2; g.beginPath(); g.moveTo(x + 3, y + s - 3); g.lineTo(x + 3, y + 3); g.lineTo(x + s - 3, y + 3); g.stroke();
  if (soft) { g.strokeStyle = 'rgba(0,0,0,.18)'; g.beginPath(); g.moveTo(x + s - 3, y + 3); g.lineTo(x + s - 3, y + s - 3); g.lineTo(x + 3, y + s - 3); g.stroke(); }
}

export function terrain(kind, seed) {
  const S = CELL_PX * 6, cv = mk(S), g = cv.getContext('2d'), R = rng(seed);
  for (let cy = 0; cy < 6; cy++) for (let cx = 0; cx < 6; cx++) {
    const x = cx * CELL_PX, y = cy * CELL_PX, s = CELL_PX;
    g.save(); g.beginPath(); g.rect(x, y, s, s); g.clip();
    if (kind === 'water') {
      const gr = g.createLinearGradient(x, y, x + s, y + s); const v = (cx + cy) % 2;
      gr.addColorStop(0, v ? '#2f9be6' : '#2a8fd9'); gr.addColorStop(1, v ? '#1d74c4' : '#1a68b5'); g.fillStyle = gr; g.fillRect(x, y, s, s);
      for (let i = 0; i < 9; i++) {
        const wx = x + R() * s, wy = y + R() * s, w = 14 + R() * 22;
        g.strokeStyle = `rgba(255,255,255,${0.14 + R() * 0.22})`; g.lineWidth = 1.6; g.beginPath(); g.moveTo(wx - w, wy);
        g.quadraticCurveTo(wx - w / 2, wy - 6, wx, wy); g.quadraticCurveTo(wx + w / 2, wy + 6, wx + w, wy); g.stroke();
      }
      for (let i = 0; i < 4; i++) { g.fillStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.arc(x + R() * s, y + R() * s, 1 + R() * 1.6, 0, 7); g.fill(); }
    } else if (kind === 'forest') {
      g.fillStyle = (cx + cy) % 2 ? '#43a037' : '#3b932f'; g.fillRect(x, y, s, s);
      for (let i = 0; i < 7; i++) { const gr = g.createRadialGradient(0, 0, 0, 0, 0, 22); const l = R() > 0.5; gr.addColorStop(0, l ? 'rgba(150,220,90,.35)' : 'rgba(20,80,20,.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.save(); g.translate(x + R() * s, y + R() * s); g.fillStyle = gr; g.fillRect(-24, -24, 48, 48); g.restore(); }
      for (let i = 0; i < 40; i++) { const px = x + R() * s, py = y + R() * s; g.strokeStyle = R() > 0.5 ? 'rgba(190,255,120,.5)' : 'rgba(20,90,20,.5)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(px, py); g.lineTo(px + (R() - 0.5) * 4, py - 4 - R() * 5); g.stroke(); }
      for (let i = 0; i < 2; i++) { g.fillStyle = ['#ffe45e', '#fff', '#ff9ec4'][(R() * 3) | 0]; g.beginPath(); g.arc(x + R() * s, y + R() * s, 1.8, 0, 7); g.fill(); }
    } else if (kind === 'desert') {
      g.fillStyle = (cx + cy) % 2 ? '#ecbd55' : '#e3b04a'; g.fillRect(x, y, s, s);
      for (let i = 0; i < 4; i++) { const yy = y + 10 + R() * 76; g.strokeStyle = i % 2 ? 'rgba(130,80,10,.3)' : 'rgba(255,240,170,.45)'; g.lineWidth = 2; g.beginPath(); g.moveTo(x - 4, yy); g.bezierCurveTo(x + 28, yy - 14, x + 60, yy + 14, x + s + 4, yy - 4); g.stroke(); }
      for (let i = 0; i < 34; i++) { g.fillStyle = R() > 0.5 ? 'rgba(120,70,10,.35)' : 'rgba(255,245,190,.5)'; g.fillRect(x + R() * s, y + R() * s, 1.5, 1.5); }
    } else {
      g.fillStyle = (cx + cy) % 2 ? '#5b241a' : '#4d1d15'; g.fillRect(x, y, s, s);
      for (let i = 0; i < 5; i++) { g.fillStyle = `rgba(${20 + R() * 40},${5 + R() * 10},5,.4)`; g.beginPath(); g.ellipse(x + R() * s, y + R() * s, 10 + R() * 16, 6 + R() * 10, R() * 3, 0, 7); g.fill(); }
      for (let k = 0; k < 2; k++) {
        let px = x + R() * s, py = y + R() * s; g.strokeStyle = '#ff7a1e'; g.shadowColor = '#ff5a00'; g.shadowBlur = 8; g.lineWidth = 2; g.beginPath(); g.moveTo(px, py);
        for (let i = 0; i < 5; i++) { px += (R() - 0.5) * 34; py += (R() - 0.5) * 34; g.lineTo(px, py); } g.stroke(); g.shadowBlur = 0;
      }
      for (let i = 0; i < 18; i++) { g.fillStyle = 'rgba(255,170,60,.45)'; g.fillRect(x + R() * s, y + R() * s, 1.4, 1.4); }
    }
    g.restore(); cellFrame(g, x, y, s, kind === 'mountain');
  }
  return cv;
}
export const terrainFor = r => terrain(['water', 'forest', 'desert', 'mountain'][r], 101 + r * 17);

export function wood(seed = 7) {
  const S = 512, cv = mk(S), g = cv.getContext('2d'), R = rng(seed);
  const gr = g.createLinearGradient(0, 0, S, S); gr.addColorStop(0, '#6b4424'); gr.addColorStop(1, '#4e3018'); g.fillStyle = gr; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 120; i++) { const y = R() * S; g.strokeStyle = R() > 0.5 ? 'rgba(30,15,5,.22)' : 'rgba(255,200,130,.1)'; g.lineWidth = 0.6 + R() * 1.6; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(S * 0.3, y + (R() - 0.5) * 14, S * 0.6, y + (R() - 0.5) * 14, S, y + (R() - 0.5) * 8); g.stroke(); }
  for (let i = 0; i < 40; i++) { g.strokeStyle = 'rgba(20,10,0,.25)'; g.lineWidth = 1; g.beginPath(); g.ellipse(R() * S, R() * S, 4 + R() * 12, 1.5 + R() * 3, 0, 0, 7); g.stroke(); }
  return cv;
}
