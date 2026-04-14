// ============================================================
// THE EFFORT BARRIER — ROLLER COASTER GAME
// ============================================================

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// --- Screens ---
const startScreen = document.getElementById('start-screen');
const pushPrompt = document.getElementById('push-prompt');
const obstaclePopup = document.getElementById('obstacle-popup');
const obstacleLabel = document.getElementById('obstacle-label');
const finishScreen = document.getElementById('finish-screen');
const pushMeter = document.getElementById('push-meter');
const yAxisLabel = document.getElementById('y-axis-label');
const xAxisLabel = document.getElementById('x-axis-label');

// --- Constants ---
const TRACK_COLOR = '#3b82f6';
const TRACK_GLOW = 'rgba(59,130,246,0.35)';
const CART_COLOR = '#f0c040';
const GRID_COLOR = 'rgba(255,255,255,0.03)';
const BG_COLOR = '#0d1117';

const OBSTACLES = [
  'Complex Human Judgment',
  'Consensus',
  'Politics',
  'Regulation',
  'Interpersonal Relationships'
];

// --- State ---
let W, H;
let trackPoints = [];
let cartPos = 0;           // 0..1 along track
let cartSpeed = 0;
let phase = 'start';       // start | auto | stopped | pushing | summit | descent | finish
let pushProgress = 0;      // 0..1 for pushing phase
let currentObstacle = -1;
let obstacleTimer = 0;

let pushEnergy = 0;
let particles = [];
let shakeAmount = 0;
let time = 0;
let labelAnnotations = [];

// Track segment boundaries (as fraction of total track)
const HUMP1_START = 0.08;
const HUMP1_PEAK = 0.18;
const HUMP1_VALLEY = 0.32;
const FLAT_ZONE = 0.42;
const HUMP2_START = 0.44;
const HUMP2_PEAK = 0.65;
const DESCENT_START = 0.72;
const FINISH_LINE = 0.92;

// The stop point is right at the base of hump 2
const STOP_POINT = 0.44;
// Each obstacle push advances from STOP_POINT to HUMP2_PEAK
const PUSH_SEGMENT_START = STOP_POINT;
const PUSH_SEGMENT_END = HUMP2_PEAK;

// --- Audio context ---
let audioCtx = null;
function ensureAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

function playTone(freq, dur, type = 'sine', vol = 0.15) {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(vol, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + dur);
}

function playPushSound() {
  playTone(200 + pushProgress * 400, 0.12, 'triangle', 0.1);
}

function playObstacleSound() {
  playTone(150, 0.3, 'sawtooth', 0.08);
  setTimeout(() => playTone(120, 0.2, 'sawtooth', 0.06), 100);
}

function playSummitSound() {
  playTone(523, 0.15, 'sine', 0.12);
  setTimeout(() => playTone(659, 0.15, 'sine', 0.12), 120);
  setTimeout(() => playTone(784, 0.3, 'sine', 0.15), 240);
}

function playRumble() {
  playTone(60 + Math.random() * 40, 0.08, 'triangle', 0.04);
}

// --- Resize ---
function resize() {
  W = canvas.width = window.innerWidth * window.devicePixelRatio;
  H = canvas.height = window.innerHeight * window.devicePixelRatio;
  canvas.style.width = window.innerWidth + 'px';
  canvas.style.height = window.innerHeight + 'px';
  buildTrack();
}

// --- Build track as a series of points ---
function buildTrack() {
  trackPoints = [];
  labelAnnotations = [];
  const margin = W * 0.06;
  const trackW = W - margin * 2;
  const baseY = H * 0.82;
  const hump1H = H * 0.28;
  const hump2H = H * 0.48;
  const steps = 500;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = margin + t * trackW;
    let y = baseY;

    // Gentle initial rise
    if (t < HUMP1_START) {
      const lt = t / HUMP1_START;
      y = baseY - lt * hump1H * 0.08;
    }
    // Hump 1 rise
    else if (t < HUMP1_PEAK) {
      const lt = (t - HUMP1_START) / (HUMP1_PEAK - HUMP1_START);
      const smoothLt = lt * lt * (3 - 2 * lt); // smoothstep
      y = baseY - hump1H * 0.08 - smoothLt * hump1H * 0.92;
    }
    // Hump 1 descent
    else if (t < HUMP1_VALLEY) {
      const lt = (t - HUMP1_PEAK) / (HUMP1_VALLEY - HUMP1_PEAK);
      const smoothLt = lt * lt * (3 - 2 * lt);
      y = baseY - hump1H + smoothLt * hump1H * 0.85;
    }
    // Flat-ish valley (dotted zone 1)
    else if (t < FLAT_ZONE) {
      const lt = (t - HUMP1_VALLEY) / (FLAT_ZONE - HUMP1_VALLEY);
      y = baseY - hump1H * 0.15 + Math.sin(lt * Math.PI) * H * 0.02;
    }
    // Hump 2 ramp-up start
    else if (t < HUMP2_START) {
      const lt = (t - FLAT_ZONE) / (HUMP2_START - FLAT_ZONE);
      y = baseY - hump1H * 0.15 + lt * hump1H * 0.02;
    }
    // Hump 2 rise (the big one)
    else if (t < HUMP2_PEAK) {
      const lt = (t - HUMP2_START) / (HUMP2_PEAK - HUMP2_START);
      const smoothLt = lt * lt * (3 - 2 * lt);
      const startY = baseY - hump1H * 0.13;
      y = startY - smoothLt * hump2H;
    }
    // Peak plateau
    else if (t < DESCENT_START) {
      const lt = (t - HUMP2_PEAK) / (DESCENT_START - HUMP2_PEAK);
      const peakY = baseY - hump1H * 0.13 - hump2H;
      y = peakY + lt * hump2H * 0.05;
    }
    // Steep descent
    else if (t < FINISH_LINE) {
      const lt = (t - DESCENT_START) / (FINISH_LINE - DESCENT_START);
      const smoothLt = lt * lt * (3 - 2 * lt);
      const descentStartY = baseY - hump1H * 0.13 - hump2H * 0.95;
      y = descentStartY + smoothLt * (baseY - descentStartY + hump1H * 0.05);
    }
    // Finish flat
    else {
      const lt = (t - FINISH_LINE) / (1 - FINISH_LINE);
      y = baseY + hump1H * 0.05 - lt * hump1H * 0.02;
    }

    trackPoints.push({ x, y, t });
  }

  // Build label annotations
  const hump1PeakPt = getTrackPoint(HUMP1_PEAK);
  const hump2PeakPt = getTrackPoint(HUMP2_PEAK);
  const valleyPt = getTrackPoint(HUMP1_VALLEY + 0.03);
  const valley2Pt = getTrackPoint(FLAT_ZONE + 0.05);

  labelAnnotations = [
    {
      text: 'AI-Automated\nData Integration',
      x: (hump1PeakPt.x + valleyPt.x) / 2,
      y: hump1PeakPt.y - H * 0.08,
      size: Math.max(14, W * 0.012),
      color: '#e6edf3',
      bold: true
    },
    {
      text: 'AI efficiency\nbarrier',
      x: hump1PeakPt.x - W * 0.03,
      y: (hump1PeakPt.y + baseY) / 2 + H * 0.04,
      size: Math.max(12, W * 0.009),
      color: '#8b949e',
      bold: false,
      arrow: { from: { x: hump1PeakPt.x, y: hump1PeakPt.y + 8 }, to: { x: hump1PeakPt.x, y: baseY - hump1H * 0.15 } }
    },
    {
      text: 'Rate-Determining Step\n(Humans)',
      x: hump2PeakPt.x,
      y: hump2PeakPt.y - H * 0.07,
      size: Math.max(16, W * 0.015),
      color: '#ff6b6b',
      bold: true
    }
  ];
}

function getTrackPoint(t) {
  t = Math.max(0, Math.min(1, t));
  const idx = Math.round(t * (trackPoints.length - 1));
  return trackPoints[idx];
}

function getTrackSlope(t) {
  const i = Math.round(t * (trackPoints.length - 1));
  const a = trackPoints[Math.max(0, i - 2)];
  const b = trackPoints[Math.min(trackPoints.length - 1, i + 2)];
  return Math.atan2(b.y - a.y, b.x - a.x);
}

// --- Particles ---
function spawnParticles(x, y, count, color, spread = 3) {
  for (let i = 0; i < count; i++) {
    particles.push({
      x, y,
      vx: (Math.random() - 0.5) * spread,
      vy: (Math.random() - 1) * spread,
      life: 1,
      decay: 0.015 + Math.random() * 0.02,
      size: 2 + Math.random() * 3,
      color
    });
  }
}

function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.05;
    p.life -= p.decay;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = p.life * 0.8;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// --- Drawing ---
function drawBackground() {
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, W, H);

  // Subtle grid
  ctx.strokeStyle = GRID_COLOR;
  ctx.lineWidth = 1;
  const gridSize = W * 0.04;
  for (let x = 0; x < W; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 0; y < H; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
}

function drawTrack() {
  if (trackPoints.length < 2) return;

  // Track glow
  ctx.save();
  ctx.strokeStyle = TRACK_GLOW;
  ctx.lineWidth = 12;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(59,130,246,0.4)';
  ctx.shadowBlur = 20;
  ctx.beginPath();
  ctx.moveTo(trackPoints[0].x, trackPoints[0].y);
  for (let i = 1; i < trackPoints.length; i++) {
    ctx.lineTo(trackPoints[i].x, trackPoints[i].y);
  }
  ctx.stroke();
  ctx.restore();

  // Main track
  ctx.strokeStyle = TRACK_COLOR;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(trackPoints[0].x, trackPoints[0].y);
  for (let i = 1; i < trackPoints.length; i++) {
    ctx.lineTo(trackPoints[i].x, trackPoints[i].y);
  }
  ctx.stroke();

}

function drawAnnotations(alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  
  for (const lbl of labelAnnotations) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const fontWeight = lbl.bold ? '700' : '500';
    ctx.font = `${fontWeight} ${lbl.size}px Satoshi, sans-serif`;
    ctx.fillStyle = lbl.color;
    
    const lines = lbl.text.split('\n');
    const lineH = lbl.size * 1.3;
    const startY = lbl.y - (lines.length - 1) * lineH / 2;
    lines.forEach((line, i) => {
      ctx.fillText(line, lbl.x, startY + i * lineH);
    });

    // Draw arrow if present
    if (lbl.arrow) {
      const a = lbl.arrow;
      ctx.strokeStyle = lbl.color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(a.from.x, a.from.y);
      ctx.lineTo(a.to.x, a.to.y);
      ctx.stroke();
      ctx.setLineDash([]);
      // Arrowheads
      drawArrowhead(a.from.x, a.from.y, -1, lbl.color);
      drawArrowhead(a.to.x, a.to.y, 1, lbl.color);
    }
  }
  ctx.restore();
}

function drawArrowhead(x, y, dir, color) {
  const size = 6;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - size, y + dir * size);
  ctx.lineTo(x + size, y + dir * size);
  ctx.closePath();
  ctx.fill();
}

function drawCart(t) {
  const pt = getTrackPoint(t);
  const angle = getTrackSlope(t);

  ctx.save();
  ctx.translate(pt.x, pt.y);
  ctx.rotate(angle);

  // Cart body
  const cw = W * 0.035;
  const ch = cw * 0.55;

  // Shadow
  ctx.fillStyle = 'rgba(240,192,64,0.3)';
  ctx.shadowColor = 'rgba(240,192,64,0.5)';
  ctx.shadowBlur = 15;
  ctx.beginPath();
  ctx.roundRect(-cw/2, -ch - 4, cw, ch, 4);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Main body
  ctx.fillStyle = CART_COLOR;
  ctx.beginPath();
  ctx.roundRect(-cw/2, -ch - 4, cw, ch, 4);
  ctx.fill();

  // Wheels
  const wheelR = cw * 0.12;
  ctx.fillStyle = '#1a1a2e';
  ctx.strokeStyle = '#666';
  ctx.lineWidth = 1.5;
  [-cw * 0.3, cw * 0.3].forEach(wx => {
    ctx.beginPath();
    ctx.arc(wx, -2, wheelR, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });

  ctx.restore();

  // Sparks when moving fast
  if (Math.abs(cartSpeed) > 0.001) {
    if (Math.random() < Math.min(Math.abs(cartSpeed) * 80, 0.5)) {
      spawnParticles(pt.x, pt.y, 1, CART_COLOR, 2);
    }
  }
}

// Finish flag
function drawFinishFlag() {
  const pt = getTrackPoint(FINISH_LINE);
  const flagH = H * 0.08;
  const flagW = flagH * 0.7;

  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(pt.x, pt.y);
  ctx.lineTo(pt.x, pt.y - flagH - 20);
  ctx.stroke();

  // Checkered flag
  const rows = 4, cols = 3;
  const cellW = flagW / cols;
  const cellH = flagH / rows * 0.5;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      ctx.fillStyle = (r + c) % 2 === 0 ? '#fff' : '#333';
      ctx.fillRect(pt.x + 2 + c * cellW, pt.y - flagH - 18 + r * cellH, cellW, cellH);
    }
  }
}

// --- Game phases ---
function showScreen(el) {
  [startScreen, pushPrompt, obstaclePopup, finishScreen].forEach(s => s.classList.remove('active'));
  if (el) el.classList.add('active');
}

function startGame() {
  ensureAudio();
  phase = 'auto';
  cartPos = 0;
  cartSpeed = 0;
  pushProgress = 0;
  currentObstacle = -1;
  particles = [];
  showScreen(null);
  yAxisLabel.classList.add('visible');
  xAxisLabel.classList.add('visible');
}

function stopAtHump2() {
  phase = 'stopped';
  cartSpeed = 0;
  showScreen(pushPrompt);
  pushProgress = 0;
  currentObstacle = 0;
  showObstacle(0);
}

function showObstacle(idx) {
  if (idx >= OBSTACLES.length) {
    // All obstacles cleared — summit!
    phase = 'summit';
    showScreen(null);
    playSummitSound();
    const pt = getTrackPoint(HUMP2_PEAK);
    spawnParticles(pt.x, pt.y, 40, '#ff6b6b', 6);
    spawnParticles(pt.x, pt.y, 40, CART_COLOR, 6);
    setTimeout(() => {
      phase = 'descent';
    }, 800);
    return;
  }
  currentObstacle = idx;
  obstacleLabel.textContent = OBSTACLES[idx];
  obstacleLabel.classList.remove('visible');
  obstaclePopup.classList.add('active');
  playObstacleSound();
  
  // Animate in
  requestAnimationFrame(() => {
    obstacleLabel.classList.add('visible');
  });
  
  // Shake
  shakeAmount = 8;
}

function advancePush(amount) {
  if (phase !== 'stopped') return;

  pushEnergy += amount;
  const threshold = 0.22; // energy needed per obstacle
  const segmentFraction = 1 / OBSTACLES.length;
  const obstacleProgress = Math.min(pushEnergy / threshold, 1);
  
  // Update meter
  pushMeter.style.width = (obstacleProgress * 100) + '%';

  // Move cart gradually within this obstacle's segment
  const baseProgress = currentObstacle / OBSTACLES.length;
  pushProgress = baseProgress + obstacleProgress * segmentFraction;
  cartPos = PUSH_SEGMENT_START + pushProgress * (PUSH_SEGMENT_END - PUSH_SEGMENT_START);

  // Particles on push
  const pt = getTrackPoint(cartPos);
  if (Math.random() < 0.3) {
    spawnParticles(pt.x, pt.y - 10, 2, CART_COLOR, 2);
  }
  playPushSound();

  // Check if this obstacle is cleared
  if (obstacleProgress >= 1) {
    pushEnergy = 0;
    pushMeter.style.width = '0%';
    obstacleLabel.classList.remove('visible');
    
    setTimeout(() => {
      showObstacle(currentObstacle + 1);
    }, 400);
  }
}

// --- Input ---
document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('replay-btn').addEventListener('click', () => {
  showScreen(null);
  finishScreen.classList.remove('active');
  startGame();
});

// Click to push
window.addEventListener('click', (e) => {
  if (phase === 'stopped') {
    advancePush(0.045);
  }
});

// Touch support — tap to push
window.addEventListener('touchstart', (e) => {
  if (phase === 'stopped') {
    advancePush(0.045);
  }
});

window.addEventListener('resize', resize);

// --- Main loop ---
function update() {
  time += 0.016;

  if (phase === 'auto') {
    // Accelerate, ride over hump 1, then decelerate approaching hump 2
    const slope = getTrackSlope(cartPos);
    // Gravity effect — steeper uphill = slower
    const gravityEffect = -Math.sin(slope) * 0.000012;
    
    // Engine force that drives the cart initially
    const engineForce = cartPos < STOP_POINT ? 0.0018 : 0;
    
    cartSpeed += gravityEffect + engineForce * 0.016;
    cartSpeed *= 0.995; // friction
    cartSpeed = Math.max(cartSpeed, 0.0002); // minimum speed during auto
    cartPos += cartSpeed;

    // Rumble sound
    if (Math.random() < 0.1) playRumble();

    if (cartPos >= STOP_POINT) {
      cartPos = STOP_POINT;
      stopAtHump2();
    }
  }

  if (phase === 'summit') {
    // Brief pause at summit
  }

  if (phase === 'descent') {
    const slope = getTrackSlope(cartPos);
    const gravityEffect = -Math.sin(slope) * 0.00003;
    cartSpeed += gravityEffect;
    cartSpeed *= 0.998;
    cartSpeed = Math.max(cartSpeed, 0.0015);
    cartPos += cartSpeed;

    if (Math.random() < 0.2) playRumble();

    // Sparks on fast descent
    if (cartSpeed > 0.003) {
      const pt = getTrackPoint(cartPos);
      spawnParticles(pt.x, pt.y, 1, '#fff', 3);
    }

    if (cartPos >= FINISH_LINE) {
      phase = 'finish';
      showScreen(finishScreen);
      yAxisLabel.classList.remove('visible');
      xAxisLabel.classList.remove('visible');
      const pt = getTrackPoint(FINISH_LINE);
      spawnParticles(pt.x, pt.y, 60, CART_COLOR, 8);
      spawnParticles(pt.x, pt.y, 40, '#fff', 6);
    }
  }

  // Shake decay
  shakeAmount *= 0.9;
  if (shakeAmount < 0.5) shakeAmount = 0;

  updateParticles();
}

function draw() {
  ctx.save();

  // Apply shake
  if (shakeAmount > 0) {
    ctx.translate(
      (Math.random() - 0.5) * shakeAmount,
      (Math.random() - 0.5) * shakeAmount
    );
  }

  drawBackground();

  // Annotation visibility
  const annotAlpha = phase === 'start' || phase === 'finish' ? 0 : 1;
  
  drawTrack();
  drawAnnotations(annotAlpha);
  drawFinishFlag();
  drawCart(cartPos);
  drawParticles();

  ctx.restore();
}

function gameLoop() {
  update();
  draw();
  requestAnimationFrame(gameLoop);
}

// --- Init ---
resize();
requestAnimationFrame(gameLoop);
