// Helpers shared by overlay and controller.
export const DEFAULTS = {
  homeName: 'HOME', awayName: 'AWAY', homeColor: '#1a6fc4', awayColor: '#c41a1a',
  homeLogo: '', awayLogo: '', homeLogoZoom: 1, awayLogoZoom: 1,
  homeLogoX: 0, awayLogoX: 0, homeLogoY: 0, awayLogoY: 0, homeLogoFlip: false, awayLogoFlip: false,
  homeScore: 0, awayScore: 0, homeFouls: 0, awayFouls: 0, bonusAt: 5,
  homeTO: 5, awayTO: 5, maxTO: 5, period: '1ST', periodLen: 480,
  clockMs: 480000, clockRunning: false, clockStartAt: 0, poss: '', sponsor: '', visible: true
};

export function withDefaults(d) { return Object.assign({}, DEFAULTS, d || {}); }

export function clockRemaining(d, now = Date.now()) {
  const ms = Number(d.clockMs) || 0;
  if (!d.clockRunning) return Math.max(0, ms);
  return Math.max(0, ms - (now - (Number(d.clockStartAt) || now)));
}

// 1:00 and up -> M:SS ; under a minute -> SS.t (tenths), like an arena clock
export function formatClock(ms) {
  if (ms >= 60000) {
    const s = Math.ceil(ms / 1000);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }
  const t = Math.ceil(ms / 100);
  return Math.floor(t / 10) + '.' + (t % 10);
}

// "#3 TROJANS" or "TROJANS #3" -> gold "3" (no #), rest white. Built with DOM nodes (no innerHTML).
export function setRankText(el, txt) {
  txt = String(txt || '');
  el.textContent = '';
  const addRank = n => { const s = document.createElement('span'); s.className = 'rank'; s.textContent = n; el.appendChild(s); };
  let m = txt.match(/^#(\d+)\s+(.*)$/);
  if (m) { addRank(m[1]); el.appendChild(document.createTextNode('\u00a0' + m[2])); return; }
  m = txt.match(/^(.*\S)\s+#(\d+)$/);
  if (m) { el.appendChild(document.createTextNode(m[1] + '\u00a0')); addRank(m[2]); return; }
  el.textContent = txt || '\u00a0';
}
