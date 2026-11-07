// Dev-only test console served at GET /dev (never in production).
// Lets you play through the socket API from several browser tabs before the real client exists.
// Each tab keeps its own seat in sessionStorage, so two tabs = two players.

export const DEV_CONSOLE_HTML = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Teen Patti — dev console</title>
<style>
  :root { color-scheme: dark; --bg:#07160f; --panel:#0e2a1d; --line:#1f4a35; --gold:#ecc66a; --text:#eee; --muted:#9fb3a8; --bad:#ff8a80; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); font: 14px/1.4 system-ui, sans-serif; }
  header { padding: 10px 14px; border-bottom: 1px solid var(--line); display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
  h1 { font-size: 16px; margin: 0; color: var(--gold); }
  main { display: grid; grid-template-columns: minmax(280px, 360px) 1fr; gap: 12px; padding: 12px; }
  @media (max-width: 800px) { main { grid-template-columns: 1fr; } }
  section { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 10px; margin-bottom: 12px; }
  h2 { font-size: 13px; margin: 0 0 8px; color: var(--gold); text-transform: uppercase; letter-spacing: .04em; }
  input, select, textarea, button { font: inherit; color: var(--text); background: #0a2016; border: 1px solid var(--line); border-radius: 6px; padding: 6px 8px; }
  button { cursor: pointer; background: #17402c; min-height: 34px; }
  button:hover { border-color: var(--gold); }
  .row { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 6px; align-items: center; }
  .muted { color: var(--muted); }
  .bad { color: var(--bad); }
  table { width: 100%; border-collapse: collapse; }
  td, th { text-align: left; padding: 3px 6px; border-bottom: 1px solid var(--line); }
  tr.turn td { background: #2b3d12; }
  .badge { font-size: 11px; padding: 1px 6px; border-radius: 10px; background: #333; }
  .badge.off { background: #6b2b2b; }
  .cards { font-size: 22px; letter-spacing: 4px; }
  pre { white-space: pre-wrap; word-break: break-word; max-height: 320px; overflow: auto; margin: 0; font-size: 12px; }
  #log div { border-bottom: 1px solid var(--line); padding: 2px 0; font-size: 12px; }
</style>
</head>
<body>
<header>
  <h1>Teen Patti dev console</h1>
  <span id="conn" class="badge">connecting…</span>
  <span id="who" class="muted"></span>
  <span class="muted">Each tab is a separate player. Open a second tab to join.</span>
</header>
<main>
  <div>
    <section>
      <h2>Seat</h2>
      <div class="row"><input id="name" placeholder="Your name" size="12" /><input id="avatar" value="🙂" size="3" /></div>
      <div class="row">
        <select id="mode"><option value="digital">Digital</option><option value="physical">Physical</option></select>
        <button data-do="create">Create game</button>
      </div>
      <div class="row"><input id="code" placeholder="CODE" size="8" /><button data-do="join">Join</button><button data-do="reconnect">Reconnect</button></div>
      <div class="row"><button data-do="forget">Forget this tab's seat</button></div>
    </section>
    <section>
      <h2>Play</h2>
      <div class="row muted" id="hint"></div>
      <div class="row">
        <button data-ev="action:see">See cards</button>
        <button data-do="chaalMin">Chaal (min)</button>
        <button data-do="chaalMax">Double (max)</button>
        <button data-ev="action:pack">Pack</button>
      </div>
      <div class="row">
        <button data-ev="action:sideshowRequest">Side show</button>
        <button data-do="accept">Accept</button>
        <button data-do="deny">Deny</button>
        <button data-ev="action:show">Show</button>
      </div>
      <div class="row">
        <input id="actAs" placeholder="actAs playerId (host only)" size="22" />
      </div>
    </section>
    <section>
      <h2>Host</h2>
      <div class="row">
        <button data-ev="game:start">Start game</button>
        <button data-ev="round:start">Next round</button>
        <button data-ev="round:cardsDealt">Cards dealt</button>
      </div>
      <div class="row">
        <button data-do="pause">Pause</button><button data-do="resume">Resume</button>
        <button data-ev="undo:approve">Approve undo</button><button data-ev="undo:reject">Reject undo</button>
      </div>
      <div class="row">
        <button data-ev="game:end">End game</button>
        <button data-ev="undo:request">Request undo</button>
        <button data-ev="host:claim">Claim host</button>
      </div>
    </section>
    <section>
      <h2>Any event</h2>
      <div class="row"><select id="evName"></select></div>
      <textarea id="evPayload" rows="3" style="width:100%">{}</textarea>
      <div class="row"><button data-do="sendRaw">Send</button></div>
      <div id="ack" class="muted"></div>
    </section>
  </div>
  <div>
    <section>
      <h2>Table</h2>
      <div id="summary" class="muted">Not in a game.</div>
      <table id="players"></table>
    </section>
    <section>
      <h2>My cards</h2>
      <div id="hand" class="cards muted">—</div>
      <div id="visible" class="muted"></div>
    </section>
    <section><h2>Events</h2><div id="log"></div></section>
    <section><h2>Raw public state</h2><pre id="raw"></pre></section>
  </div>
</main>
<script src="/socket.io/socket.io.js"></script>
<script>
const $ = (id) => document.getElementById(id);
const SUIT = { s: '♠', h: '♥', d: '♦', c: '♣' };
const label = (c) => (c[0] === 'T' ? '10' : c[0]) + SUIT[c[1]];
const store = {
  get: () => { try { return JSON.parse(sessionStorage.getItem('tp-seat') || 'null'); } catch { return null; } },
  set: (v) => { try { sessionStorage.setItem('tp-seat', JSON.stringify(v)); } catch {} },
  clear: () => { try { sessionStorage.removeItem('tp-seat'); } catch {} },
};
let pub = null, priv = null, legal = null;
const socket = io({ transports: ['websocket'] });

const EVENTS = ${JSON.stringify([
  'game:updateSettings',
  'game:start',
  'game:leave',
  'game:end',
  'round:start',
  'round:cardsDealt',
  'action:see',
  'action:chaal',
  'action:pack',
  'action:sideshowRequest',
  'action:sideshowRespond',
  'action:show',
  'result:tapWinner',
  'result:confirm',
  'result:dispute',
  'result:enterCards',
  'undo:request',
  'undo:approve',
  'undo:reject',
  'host:adjustChips',
  'host:rebuy',
  'host:kick',
  'host:transfer',
  'host:claim',
  'host:addOfflineSeat',
  'host:pause',
])};
for (const e of EVENTS) $('evName').append(new Option(e, e));

function send(name, payload = {}) {
  const actAs = $('actAs').value.trim();
  if (actAs && /^(action|result):/.test(name)) payload = { ...payload, actAs };
  return new Promise((resolve) => socket.emit(name, payload, (ack) => {
    $('ack').textContent = name + ' → ' + (ack.ok ? 'ok' : ack.error.code + ': ' + ack.error.message);
    $('ack').className = ack.ok ? 'muted' : 'bad';
    resolve(ack);
  }));
}

function remember(data) { store.set({ code: data.code, playerToken: data.playerToken, playerId: data.playerId }); }
function seat() { return store.get(); }

socket.on('connect', () => {
  $('conn').textContent = 'connected'; $('conn').className = 'badge';
  const s = seat();
  if (s) send('game:reconnect', { code: s.code, playerToken: s.playerToken });
});
socket.on('disconnect', () => { $('conn').textContent = 'disconnected — retrying'; $('conn').className = 'badge off'; });
socket.on('state:public', (s) => { pub = s; render(); });
socket.on('state:private', (s) => { priv = s; render(); });
socket.on('event', (b) => {
  for (const e of b.entries) {
    const div = document.createElement('div');
    div.textContent = new Date(e.at).toLocaleTimeString() + '  ' + describe(e.event);
    $('log').prepend(div);
  }
});

const nameOf = (id) => pub?.players.find((p) => p.id === id)?.name ?? id;
function describe(ev) {
  const who = ev.playerId ? nameOf(ev.playerId) + ' ' : '';
  switch (ev.type) {
    case 'BET': return who + (ev.blind ? 'bet blind ' : 'bet ') + ev.amount + ' (stake ' + ev.stake + ', pot ' + ev.pot + ')';
    case 'ROUND_ENDED': return 'Round won by ' + ev.result.winnerIds.map(nameOf).join(', ') + ' — pot ' + ev.result.pot + (ev.result.winningHand ? ' with ' + ev.result.winningHand : '') + (ev.result.explanation ? ' (' + ev.result.explanation + ')' : '');
    case 'SIDESHOW_RESULT': return 'Side show: ' + nameOf(ev.winnerId) + ' beat ' + nameOf(ev.loserId) + (ev.tie ? ' (tie, asker packs)' : '');
    default: return who + ev.type + (ev.amount ? ' ' + ev.amount : '');
  }
}

function legalFor() {
  // Mirrors the engine's UI hints well enough for testing; the server is the judge.
  const r = pub?.table.round; const me = r?.players.find((p) => p.id === (priv?.playerId));
  if (!r || !me || r.phase !== 'BETTING' || r.turnId !== me.id) return null;
  const cap = r.rules.maxChaal;
  let min, max;
  if (me.seen) { min = 2 * r.stake; max = 4 * r.stake; if (cap !== null) max = Math.min(max, 2 * cap); }
  else { min = r.stake; max = 2 * r.stake; if (cap !== null) max = Math.min(max, cap); }
  if (r.rules.chipMode === 'buyIn') { max = Math.min(max, me.balance); if (me.seen && max % 2) max -= 1; }
  return { min, max };
}

function render() {
  if (!pub) return;
  const s = seat();
  $('who').textContent = s ? 'You: ' + nameOf(s.playerId) + (priv?.isHost ? ' (host)' : '') + ' · code ' + pub.code : '';
  $('code').value ||= pub.code;
  const r = pub.table.round;
  const timer = pub.timer ? ' · ' + (pub.timer.kind === 'grace' ? 'GRACE ' : 'timer ') + nameOf(pub.timer.playerId) + ' ' + Math.max(0, Math.round((pub.timer.deadline - pub.serverNow) / 1000)) + 's' : '';
  $('summary').textContent = 'Game ' + pub.code + ' · ' + pub.status + (pub.paused ? ' · PAUSED' : '') +
    (r ? ' · round ' + r.roundNumber + ' · ' + r.phase + ' · pot ' + r.pot + ' · stake ' + r.stake : '') + timer +
    (pub.pendingUndo ? ' · undo requested by ' + nameOf(pub.pendingUndo.requestedBy) : '') +
    (pub.hostTransferOffer ? ' · host role offered to ' + nameOf(pub.hostTransferOffer.candidateId) : '');
  const rows = ['<tr><th>Player</th><th>Seat</th><th>Balance</th><th>Status</th><th>Conn</th><th>Id</th></tr>'];
  for (const p of pub.players) {
    const rp = r?.players.find((x) => x.id === p.id);
    const status = rp ? rp.status + (pub.table.dealerSeat === p.seat ? ' · dealer' : '') : (p.present ? 'next round' : 'left');
    const conn = p.isOffline ? '<span class="badge">offline seat</span>' : p.connected ? '' : '<span class="badge off">reconnecting…</span>';
    rows.push('<tr class="' + (r?.turnId === p.id ? 'turn' : '') + '"><td>' + p.avatar + ' ' + p.name + (pub.hostPlayerId === p.id ? ' ★' : '') + '</td><td>' + p.seat + '</td><td>' + p.balance + '</td><td>' + status + '</td><td>' + conn + '</td><td class="muted">' + p.id + '</td></tr>');
  }
  $('players').innerHTML = rows.join('');
  $('hand').textContent = priv?.hand ? priv.hand.map(label).join(' ') : (r ? 'face down (tap See cards)' : '—');
  const vis = Object.entries(priv?.visibleHands ?? {}).map(([id, h]) => nameOf(id) + ': ' + h.map(label).join(' '));
  const revealed = Object.entries(r?.result?.revealedHands ?? {}).map(([id, h]) => nameOf(id) + ': ' + h.map(label).join(' '));
  $('visible').textContent = [vis.length ? 'Side show: ' + vis.join(' | ') : '', revealed.length ? 'Shown: ' + revealed.join(' | ') : ''].filter(Boolean).join('  ·  ');
  legal = legalFor();
  $('hint').textContent = legal ? 'Your turn — you can bet ' + legal.min + '–' + legal.max : '';
  $('raw').textContent = JSON.stringify(pub, null, 2);
}
setInterval(() => pub && render(), 1000);

const actions = {
  async create() {
    const ack = await send('game:create', { name: $('name').value || 'Host', avatar: $('avatar').value || '🙂', settings: defaults($('mode').value) });
    if (ack.ok) { remember(ack.data); $('code').value = ack.data.code; }
  },
  async join() {
    const ack = await send('game:join', { code: $('code').value.trim().toUpperCase(), name: $('name').value || 'Player', avatar: $('avatar').value || '🙂' });
    if (ack.ok) remember(ack.data);
  },
  reconnect() { const s = seat(); if (s) send('game:reconnect', { code: s.code, playerToken: s.playerToken }); },
  forget() { store.clear(); location.reload(); },
  chaalMin() { if (legal) send('action:chaal', { amount: legal.min }); else send('action:chaal', { amount: 1 }); },
  chaalMax() { if (legal) send('action:chaal', { amount: legal.max }); else send('action:chaal', { amount: 1 }); },
  accept() { send('action:sideshowRespond', { accept: true }); },
  deny() { send('action:sideshowRespond', { accept: false }); },
  pause() { send('host:pause', { paused: true }); },
  resume() { send('host:pause', { paused: false }); },
  sendRaw() { let p; try { p = JSON.parse($('evPayload').value || '{}'); } catch { $('ack').textContent = 'Payload is not valid JSON'; return; } send($('evName').value, p); },
};
function defaults(mode) {
  return { mode, chipMode: 'openTab', startingChips: 0, boot: 10, maxChaal: 1280, potLimit: 10240, maxBlinds: 4,
    a23Rank: 'second', blindCanShow: true, turnTimerSec: mode === 'digital' ? 45 : null, physicalResolution: 'hybrid', chipRate: null };
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.do) actions[b.dataset.do]();
  else if (b.dataset.ev) send(b.dataset.ev);
});
</script>
</body>
</html>`;
