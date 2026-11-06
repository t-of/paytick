'use strict';

// localStorage はほかのアプリと共有される（同じ t-of.github.io のため）。
// キーは必ず 'paytick.' で始める。
const STORE = 'paytick.';

function load(key, fallback) {
  try {
    const v = localStorage.getItem(STORE + key);
    return v == null ? fallback : JSON.parse(v);
  } catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(STORE + key, JSON.stringify(value)); } catch { /* 保存できなくても使える */ }
}
function drop(key) {
  try { localStorage.removeItem(STORE + key); } catch { /* なにもしない */ }
}

WebAppKit.init({ title: 'PAYTICK', text: '時給を1秒ごとに数える秒給メーター' });

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js');
}

// ---- 音（Web Audio で作る。RULES.md §5「音」） ----
function setAudioSession(soundOn) {
  try { if (navigator.audioSession) navigator.audioSession.type = soundOn ? 'playback' : 'auto'; } catch { /* 対応していない */ }
}

let soundOn = load('sound', true) !== false;
let ctx = null;

function audio() {
  if (!soundOn) return null;
  setAudioSession(true);
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, start, dur, vol = 0.18, type = 'sine') {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + start;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

const sfx = {
  tap() { tone(660, 0, 0.06, 0.12, 'triangle'); },
  start() { tone(523, 0, 0.12); tone(784, 0.09, 0.18); },
  pause() { tone(440, 0, 0.1, 0.14, 'triangle'); },
  coin() { tone(1319, 0, 0.08, 0.12); tone(1760, 0.06, 0.22, 0.12); },
  done() { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.35)); },
  error() { tone(220, 0, 0.15, 0.14, 'square'); },
};

const soundBtn = document.getElementById('soundBtn');
function showSound() {
  soundBtn.textContent = soundOn ? '音 オン' : '音 オフ';
  soundBtn.setAttribute('aria-pressed', String(soundOn));
}
soundBtn.addEventListener('click', () => {
  soundOn = !soundOn;
  save('sound', soundOn);
  setAudioSession(soundOn);
  showSound();
  sfx.tap();
});
showSound();

// ---- メーター ----
const $ = (id) => document.getElementById(id);
const yenFmt = new Intl.NumberFormat('ja-JP');
const pad = (n) => String(n).padStart(2, '0');
const hms = (s) => `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s % 3600 / 60))}:${pad(s % 60)}`;

// いま動いているメーター。リロードしても続きから数えられるように保存する（{ v: 1, wage, totalSec, startedAt, pausedTotal, pausedAt }）。
let run = null;
let timer = null;
let lastSec = -1;
let wakeLock = null;
const COIN_STEP = 100; // 100 円ごとに音を鳴らす

function readInputs() {
  const w = Number($('wage').value);
  const h = Number($('hours').value || 0);
  const m = Number($('minutes').value || 0);
  return { w, sec: Math.round(h * 3600 + m * 60) };
}

function bold(text) {
  const b = document.createElement('b');
  b.textContent = text;
  return b;
}

function updatePreview() {
  const { w, sec } = readInputs();
  const box = $('preview');
  box.replaceChildren();
  if (w > 0 && sec > 0) {
    const l1 = document.createElement('span');
    l1.append('秒給 ', bold((w / 3600).toFixed(3)), ' 円 ・ 分給 ', bold((w / 60).toFixed(1)), ' 円');
    const l2 = document.createElement('span');
    l2.append('ゴールで ', bold(yenFmt.format(Math.floor(w * sec / 3600))), ' 円');
    box.append(l1, l2);
  } else {
    box.textContent = '時給と時間を入れると秒給が出ます';
  }
}

function saveInputs() {
  save('inputs', { v: 1, wage: $('wage').value, hours: $('hours').value, minutes: $('minutes').value });
}

const savedInputs = load('inputs', null);
if (savedInputs && savedInputs.v === 1) {
  $('wage').value = savedInputs.wage;
  $('hours').value = savedInputs.hours;
  $('minutes').value = savedInputs.minutes;
}
['wage', 'hours', 'minutes'].forEach((id) => $(id).addEventListener('input', () => { updatePreview(); saveInputs(); }));
updatePreview();

function elapsedSec() {
  const now = run.pausedAt || Date.now();
  return Math.max(0, Math.min(run.totalSec, Math.floor((now - run.startedAt - run.pausedTotal) / 1000)));
}

function render() {
  const s = elapsedSec();
  if (s === lastSec) return;
  const prev = lastSec;
  lastSec = s;
  const earned = run.wage * s / 3600;
  const [i, d] = earned.toFixed(2).split('.');
  $('moneyInt').textContent = yenFmt.format(Number(i));
  $('moneyDec').textContent = '.' + d;
  $('clock').textContent = hms(s);
  const pct = s / run.totalSec * 100;
  $('bar').style.width = pct + '%';
  $('rail').setAttribute('aria-valuenow', String(Math.floor(pct)));
  const money = $('money');
  money.classList.remove('tick'); void money.offsetWidth; money.classList.add('tick');
  if (s >= run.totalSec) {
    finish(prev >= 0);
  } else if (prev >= 0 && Math.floor(earned / COIN_STEP) > Math.floor(run.wage * prev / 3600 / COIN_STEP)) {
    sfx.coin();
  }
}

function finish(withSound) {
  clearInterval(timer); timer = null;
  $('done').hidden = false;
  $('pause').hidden = true;
  $('shareResult').hidden = false;
  releaseWake();
  if (withSound) sfx.done();
}

async function requestWake() {
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { wakeLock = null; }
}
function releaseWake() { try { wakeLock?.release(); } catch { /* なにもしない */ } wakeLock = null; }
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && timer) { if (!run.pausedAt) requestWake(); render(); }
});

function showMeter() {
  $('perSec').textContent = (run.wage / 3600).toFixed(3);
  $('perHour').textContent = yenFmt.format(run.wage);
  $('goal').textContent = yenFmt.format(Math.floor(run.wage * run.totalSec / 3600));
  $('clockOf').textContent = '/ ' + hms(run.totalSec);
  $('done').hidden = true;
  $('shareResult').hidden = true;
  $('pause').hidden = false;
  $('pause').textContent = run.pausedAt ? '再開' : '一時停止';
  $('setup').hidden = true;
  $('meter').hidden = false;
  lastSec = -1;
  render();
  if (elapsedSec() < run.totalSec) {
    timer = setInterval(render, 200);
    if (!run.pausedAt) requestWake();
  }
}

$('setup').addEventListener('submit', (e) => {
  e.preventDefault();
  const { w, sec } = readInputs();
  if (!(w > 0)) { showError('時給を1円以上で入れてください'); return; }
  if (!(sec > 0)) { showError('働く時間を1分以上で入れてください'); return; }
  $('error').hidden = true;
  run = { v: 1, wage: w, totalSec: sec, startedAt: Date.now(), pausedTotal: 0, pausedAt: 0 };
  save('run', run);
  sfx.start();
  showMeter();
});

function showError(msg) { $('error').textContent = msg; $('error').hidden = false; sfx.error(); }

$('pause').addEventListener('click', () => {
  if (run.pausedAt) {
    run.pausedTotal += Date.now() - run.pausedAt; run.pausedAt = 0;
    $('pause').textContent = '一時停止';
    requestWake();
    sfx.start();
  } else {
    run.pausedAt = Date.now();
    $('pause').textContent = '再開';
    releaseWake();
    sfx.pause();
  }
  save('run', run);
});

$('shareResult').addEventListener('click', () => {
  const earned = Math.floor(run.wage * run.totalSec / 3600);
  WebAppKit.share({ text: `${hms(run.totalSec)} 働いて ${yenFmt.format(earned)} 円 稼いだ（時給 ${yenFmt.format(run.wage)} 円）` });
});

$('back').addEventListener('click', () => {
  clearInterval(timer); timer = null; releaseWake();
  run = null;
  drop('run');
  sfx.tap();
  $('meter').hidden = true;
  $('setup').hidden = false;
});

// 前に動かしていたメーターがあれば続きから
const savedRun = load('run', null);
if (savedRun && savedRun.v === 1 && savedRun.wage > 0 && savedRun.totalSec > 0 && savedRun.startedAt > 0) {
  run = savedRun;
  showMeter();
}
