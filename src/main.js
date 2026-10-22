import './style.css';
import { receiveSensorMessage } from './scoring.js';
import { connectBridge } from './bridge-client.js';

const modes = {
  short: {name:'30 second game', label:'30 SEC', seconds:30, description:'A quick run. Make every shot count.'},
  long: {name:'60 second game', label:'60 SEC', seconds:60, description:'Find your rhythm. Chase a new high.'},
  versus: {name:'Two player game', label:'1 VS 1', seconds:30, description:'Take turns. Settle it on the court.'},
  practice: {name:'Free practice', label:'FREE', seconds:null, description:'No clock. Just you and the hoop.'},
};
let mode = 'short', phase = 'ready', names = ['',''], scores = [0,0], player = 0;
let deadline = 0, remaining = 30, started = 0, elapsed = 0, result = null;
let remainingMs = 30000;
let turnElapsedMs = 0;
let history = [], storageStatus = 'Loading scores…';
const app = document.querySelector('#app');
const localHost = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
const bridgeUrl = import.meta.env.VITE_BRIDGE_URL || (localHost ? 'ws://127.0.0.1:8787' : '');
let bridgeStatus = bridgeUrl ? 'connecting' : 'simulation';
const connectionLabels = {
  simulation: 'Simulation mode',
  simulated: 'Simulator connected · No hardware',
  'simulated-offline': 'Simulator · Arduino disconnected',
  connecting: 'Connecting to bridge…',
  offline: 'Bridge offline · Test mode',
  waiting: 'Bridge ready · Arduino offline',
  connected: 'Arduino connected',
};
function updateConnection(status) {
  bridgeStatus = status;
  const badge = document.querySelector('.connection');
  if (!badge) return;
  badge.dataset.status = status;
  badge.querySelector('.connection-label').textContent = connectionLabels[status];
}

const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const clock = seconds => `${String(Math.floor(seconds / 60)).padStart(2,'0')}:${String(seconds % 60).padStart(2,'0')}`;
const ball = '<svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><circle cx="20" cy="20" r="17"/><path d="M3 20h34M20 3v34M8 8c16 7 16 17 0 24M32 8c-16 7-16 17 0 24"/></svg>';

function render() {
  const current = modes[mode];
  app.innerHTML = `
  <header class="header"><a class="brand" href="./" aria-label="Baseline home">${ball}<span>baseline<span class="brand-dot">.</span></span></a><div class="header-right"><span class="connection" data-status="${bridgeStatus}" role="status"><i></i><span class="connection-label">${connectionLabels[bridgeStatus]}</span></span><span class="club">THE HOME COURT</span></div></header>
  <main><div class="intro"><div><p class="eyebrow">STEP UP. SHOOT YOUR SHOT.</p><h1>Your court. Your high score.</h1><p class="subtext">Pick a game, find your rhythm, and put a number on the board.</p></div><div class="court-mark">${ball}<span>BUILT FOR<br>ONE MORE SHOT.</span></div></div>
  <div class="layout"><aside class="setup"><div class="section-label"><span>01</span> SET UP YOUR GAME</div><h2>Pick your pace.</h2><div class="mode-options">${Object.entries(modes).map(([key,m]) => `<button class="mode-option ${key===mode?'selected':''}" data-mode="${key}" ${phase==='playing'||phase==='between'?'disabled':''}><span class="mode-badge">${m.label}</span><span><strong>${m.name}</strong><small>${m.description}</small></span><span class="radio"></span></button>`).join('')}</div><form id="setup-form"><label for="player1">${mode==='versus'?'PLAYER 1':'PLAYER NAME'}</label><input id="player1" name="player1" placeholder="Enter your name" maxlength="24" required value="${escape(names[0])}" ${phase!=='ready'?'disabled':''}>${mode==='versus'?`<label for="player2">PLAYER 2</label><input id="player2" name="player2" placeholder="Your challenger’s name" maxlength="24" required value="${escape(names[1])}" ${phase!=='ready'?'disabled':''}><p class="form-note">30 seconds each · Player 1 shoots first</p>`:''}<button class="start-button" type="submit" ${phase!=='ready'?'disabled':''}>Let’s play <span>↗</span></button></form><p class="setup-note">${mode==='practice'?'Practice at your own pace. End the session whenever you’re ready.':'Your score is saved when the game ends.'}</p></aside>
  <section class="game-area" aria-label="Game scoreboard"><div class="board ${phase==='playing'?'live':''}"><div class="board-top"><span>${current.name.toUpperCase()}</span><span class="board-status"><i></i>${phase==='playing'?'LIVE':phase==='finished'?'FINAL':phase==='between'?'NEXT TURN':'READY WHEN YOU ARE'}</span></div><div class="board-center"><p class="player-heading">${phase==='ready'?'THE COURT IS YOURS':escape(names[player])}${mode==='versus' && phase!=='ready'?` <span>PLAYER ${player+1}</span>`:''}</p><div id="score" class="score">${scores[player]}</div><p class="score-label">${phase==='finished'?'FINAL SCORE':'POINTS ON THE BOARD'}</p>${current.seconds?`<div class="timer-wrap"><span>TIME LEFT</span><strong id="timer" class="timer ${remaining<=5 && phase==='playing'?'urgent':''}">${clock(remaining)}</strong></div>`:`<div class="practice-indicator"><span>∞</span> NO CLOCK. NO LIMITS.</div>`}</div>${mode==='versus'?`<div class="versus-strip"><span class="${player===0?'active':''}">${escape(names[0]||'Player 1')} <b>${scores[0]}</b></span><span class="versus-divider">VS</span><span class="${player===1?'active':''}">${escape(names[1]||'Player 2')} <b>${scores[1]}</b></span></div>`:''}<div class="board-bottom"><span>${phase==='playing'?'Stay in the zone.':phase==='finished'?'Good run. Ready for another?':phase==='between'?'Pass the ball. The challenger is up.':'Every great run starts with one shot.'}</span><span class="court-lines" aria-hidden="true">⌒</span></div></div>
  
<div class="game-controls">
  <button id="basket" class="basket-button"
    ${phase !== 'playing' ? 'disabled' : ''}>
    ${ball} Add basket <kbd>SPACE</kbd>
  </button>

  ${(mode === 'short' || mode === 'long') ? `
    <button id="pause" class="quiet-button"
      ${phase !== 'playing' ? 'disabled' : ''}>
      Stop
    </button>

    <button id="resume" class="quiet-button"
      ${phase !== 'paused' ? 'disabled' : ''}>
      Resume
    </button>
  ` : ''}

  <button id="end" class="quiet-button"
    ${phase !== 'playing' && phase !== 'paused' ? 'disabled' : ''}>
    ${mode === 'versus' ? 'End turn' : 'End game'}
  </button>

  <button id="reset" class="quiet-button">
    ↺ Reset
  </button>
</div>

  ${phase==='between'?`<div class="notice"><div><strong>${escape(names[1])}, you’re up.</strong><p>${escape(names[0])} set the score to beat: ${scores[0]}.</p></div><button id="next" class="small-button">Start turn ↗</button></div>`:phase==='finished'?`<div class="notice result"><div><span class="eyebrow">${mode==='versus'?'THE RESULT':'SESSION COMPLETE'}</span><strong>${mode==='versus'?scores[0]===scores[1]?'It’s a tie. Run it back.':`${escape(names[scores[0]>scores[1]?0:1])} takes the win.`:`${scores[0]} ${scores[0]===1?'basket':'baskets'}. Well played, ${escape(names[0])}.`}</strong><p>${mode==='practice'?`${clock(elapsed)} of practice.`:'Game complete.'}</p></div><button id="again" class="small-button">Play again ↗</button></div>`:`<p class="input-hint"><span class="hint-dot"></span> Press <kbd>Space</kbd> or tap Add basket to simulate a shot.</p>`}</section></div>
  <section class="leaderboard"><div class="leaderboard-heading"><div><div class="section-label"><span>02</span> ${mode==='practice'?'YOUR REPS':'THE SCOREBOARD'}</div><h2>${mode==='practice'?'Practice history.':'A little friendly competition.'}</h2></div><span class="table-mode">${current.name} <span>↙</span></span></div><div class="table-scroll">${renderTable()}</div><div class="table-footer"><span>${mode==='practice'?'Keep showing up. Every session counts.':'Go on. Give the next player something to chase.'}</span><span>${escape(storageStatus)}</span></div></section>
  <footer><span>BASELINE © ${new Date().getFullYear()}</span><span>LESS SCROLLING. MORE SHOOTING.</span><span>Made for the love of the game.</span></footer></main>`;
  bind();
}
function renderTable() {
  const rows = history.filter(r=>r.mode===mode).sort((a,b)=>mode==='practice'?b.date-a.date: Math.max(...b.scores)-Math.max(...a.scores) || a.date-b.date);
  const headings = mode==='versus'?['Rank','Player 1','Score','Player 2','Score','Winner','Date']:mode==='practice'?['Player','Baskets','Session length','Date']:['Rank','Player name','Score','Mode','Date'];
  return `<table><thead><tr>${headings.map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map((r,i)=>{
    const date=new Date(r.date).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
    const rank=`<td><span class="rank ${i===0?'first':''}">${String(i+1).padStart(2,'0')}</span></td>`;
    return `<tr>${mode==='practice'?`<td class="table-name">${escape(r.names[0])}</td><td class="table-score">${r.scores[0]}</td><td>${clock(r.elapsed)}</td><td>${date}</td>`:mode==='versus'?`${rank}<td class="table-name">${escape(r.names[0])}</td><td class="table-score">${r.scores[0]}</td><td class="table-name">${escape(r.names[1])}</td><td class="table-score">${r.scores[1]}</td><td>${r.outcome==='tie'||(!r.outcome&&r.scores[0]===r.scores[1])?'Tie':escape(r.names[r.outcome ? (r.outcome==='player1'?0:1) : (r.scores[0]>r.scores[1]?0:1)])}</td><td>${date}</td>`:`${rank}<td class="table-name">${escape(r.names[0])}</td><td class="table-score">${r.scores[0]}</td><td><span class="mode-chip">${modes[r.mode].label}</span></td><td>${date}</td>`}</tr>`;
  }).join(''):`<tr><td colspan="${headings.length}" class="empty"><span>—</span><strong>${mode==='practice'?'Your next session starts here.':'The top spot is waiting.'}</strong><p>${mode==='practice'?'Finish a practice session to see it here.':'Finish a game to put your name on the board.'}</p></td></tr>`}</tbody></table>`;
}
function bind() {
  document.querySelectorAll('[data-mode]').forEach(button=>button.onclick=()=>{readNames();mode=button.dataset.mode;reset();});
  document.querySelector('#setup-form').onsubmit=e=>{e.preventDefault();if(phase!=='ready')return;readNames();names=names.map(n=>n.trim());if(!names[0]||(mode==='versus'&&!names[1]))return;startTurn();};
  document.querySelector('#basket').onclick=()=>receiveSensorMessage('SCORE');
  document.querySelector('#end').onclick=finishTurn;
  document.querySelector('#pause')?.addEventListener('click', pauseGame);
  document.querySelector('#resume')?.addEventListener('click', resumeGame); 
  document.querySelector('#reset').onclick=()=>{readNames();reset();};
  document.querySelector('#next')?.addEventListener('click',()=>{player=1;startTurn();});
  document.querySelector('#again')?.addEventListener('click',reset);
}
function readNames(){names[0]=document.querySelector('#player1')?.value||names[0];names[1]=document.querySelector('#player2')?.value||names[1];}

function reset() {
  phase = 'ready';
  scores = [0, 0];
  player = 0;

  deadline = 0;
  started = 0;
  elapsed = 0;
  turnElapsedMs = 0;

  remainingMs = (modes[mode].seconds || 0) * 1000;
  remaining = modes[mode].seconds || 0;
  result = null;

  render();
}

function startTurn() {
  phase = 'playing';

  remainingMs = (modes[mode].seconds || 0) * 1000;
  remaining = modes[mode].seconds || 0;

  turnElapsedMs = 0;
  started = performance.now();
  deadline = started + remainingMs;

  render();
}

function pauseGame() {
  if (phase !== 'playing' || !modes[mode].seconds) return;

  const now = performance.now();

  remainingMs = Math.max(0, deadline - now);
  turnElapsedMs += now - started;

  if (remainingMs === 0) {
    finishTurn();
    return;
  }

  remaining = Math.ceil(remainingMs / 1000);
  phase = 'paused';

  render();
}

function resumeGame() {
  if (phase !== 'paused') return;

  started = performance.now();
  deadline = started + remainingMs;

  phase = 'playing';
  render();
}


function finishTurn() {
  if (phase !== 'playing' && phase !== 'paused') return;

  const wasPlaying = phase === 'playing';
  const now = performance.now();

  if (wasPlaying) {
    const segment = modes[mode].seconds
      ? Math.min(now - started, remainingMs)
      : now - started;

    turnElapsedMs += Math.max(0, segment);

    if (modes[mode].seconds) {
      remainingMs = Math.max(0, deadline - now);
    }
  }

  elapsed = Math.floor(turnElapsedMs / 1000);

  if (mode === 'versus' && player === 0) {
    phase = 'between';
    remaining = 0;
    render();
    return;
  }

  phase = 'finished';

  if (modes[mode].seconds) {
    remaining = Math.ceil(remainingMs / 1000);
  }

  result = {
    id: crypto.randomUUID(),
    mode,
    names: [...names],
    scores: [...scores],
    date: Date.now(),
    elapsed
  };

  result.pending = true;
  history.push(result);

  queueResult(result);
  render();
  void syncHistory();
}

function updateTime() {
  if (phase !== 'playing' || !modes[mode].seconds) return;

  remaining = Math.max(
    0,
    Math.ceil((deadline - performance.now()) / 1000)
  );

  if (remaining === 0) {
    finishTurn();
    return;
  }

  const timer = document.querySelector('#timer');

  if (timer) {
    timer.textContent = clock(remaining);
    timer.classList.toggle('urgent', remaining <= 5);
  }
}

window.addEventListener('hoop:score',()=>{if(phase!=='playing')return;if(modes[mode].seconds&&performance.now()>=deadline){finishTurn();return;}scores[player]++;const node=document.querySelector('#score');node.textContent=scores[player];node.classList.remove('bump');void node.offsetWidth;node.classList.add('bump');document.querySelectorAll('.versus-strip b').forEach((node,i)=>node.textContent=scores[i]);});
window.addEventListener('keydown',e=>{if(e.code!=='Space'||e.repeat||/INPUT|TEXTAREA|SELECT|BUTTON/.test(e.target.tagName)||e.target.isContentEditable)return;if(phase==='playing'){e.preventDefault();receiveSensorMessage('SCORE');}});
setInterval(updateTime,100);
document.addEventListener('visibilitychange',updateTime);
render();

if (bridgeUrl) {
  const disconnectBridge = connectBridge({
    url: bridgeUrl,
    onScore: () => receiveSensorMessage('SCORE'),
    onStatus: updateConnection,
  });
  window.addEventListener('pagehide', disconnectBridge, { once: true });
  window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
  if (import.meta.hot) import.meta.hot.dispose(disconnectBridge);
}

// Pending results keep their IDs so retries cannot create duplicate games.
let syncing = false;
function pendingResults() {
  const rows = JSON.parse(localStorage.getItem('baseline-history') || '[]');
  if (!Array.isArray(rows)) throw new Error('Invalid local history');
  return rows;
}
function queueResult(record) {
  try {
    const pending = pendingResults();
    pending.push(record);
    localStorage.setItem('baseline-history', JSON.stringify(pending));
  } catch { storageStatus = 'Browser backup unavailable; keep this page open until saved.'; }
}
async function syncHistory() {
  if (syncing) return;
  syncing = true;
  try {
    let pending = pendingResults().map(r => ({...r, id:r.id || crypto.randomUUID()}));
    // Persist migration IDs before uploading, including across interrupted imports.
    localStorage.setItem('baseline-history', JSON.stringify(pending));
    pending = [...new Map([...pending, ...history.filter(r => r.pending)].map(r => [r.id,r])).values()];
    for (const record of pending) {
      const response = await fetch('/api/games', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(record), signal:AbortSignal.timeout(10000)});
      if (!response.ok) throw new Error('Save failed');
      localStorage.setItem('baseline-history', JSON.stringify(pendingResults().filter(r => r.id !== record.id)));
      const local = history.find(r => r.id === record.id);
      if (local) delete local.pending;
    }
    const feeds = await Promise.all(['/api/leaderboard?mode=short', '/api/leaderboard?mode=long', '/api/leaderboard?mode=versus', '/api/practice'].map(async path => {
      const response = await fetch(path, {signal:AbortSignal.timeout(10000)});
      if (!response.ok) throw new Error('Load failed');
      return response.json();
    }));
    const saved = feeds.flat();
    history = [...saved, ...history.filter(r => r.pending && !saved.some(s => s.id === r.id))];
    storageStatus = 'Scores saved to database';
  } catch {
    storageStatus = 'Scores unavailable or waiting to save. Retrying…';
  } finally {
    syncing = false;
    // Avoid replacing inputs while a player is typing.
    if (!document.querySelector('#setup-form')?.contains(document.activeElement)) { readNames(); render(); }
    else { document.querySelector('.table-footer span:last-child').textContent = storageStatus; document.querySelector('.table-scroll').innerHTML = renderTable(); }
  }
}
void syncHistory();
window.addEventListener('online', syncHistory);
setInterval(syncHistory, 15000);
