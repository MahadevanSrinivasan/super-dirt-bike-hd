/*
 * EXCITEBIKE (Classic 1984 NES 8-Bit Pixel-Art Edition)
 * Authentic 320x240 8-bit recreation featuring:
 *  - Selection A (Solo Time Trial), Selection B (Race vs. 3 CPU Rivals), Design Mode (Track Editor)
 *  - Original NES Palette, Trapezoidal Striped Ramps (Obstacles A-I), Mud Pits, Cooling Arrows
 *  - A = Regular Gas, B = Turbo Gas with bottom TEMP bar & OVER HEAT stall
 *  - 5-angle discrete pixel bike sprites, Wheelies, Slope-Matched Landings
 *  - Classic Crash/Wipeout where your rider tumbles to the grass shoulder and runs back to the bike!
 */
(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const W = 320;
  const H = 240;

  // Authentic 1984 NES Palette
  const PAL = {
    sky: '#3cbcfc',
    bleacherBlue: '#0058f8',
    bleacherRed: '#d82800',
    turfGreen: '#00a800',
    turfDark: '#006800',
    dirt: '#f8b878',
    dirtDark: '#e49050',
    laneLine: '#ac5000',
    mud: '#503000',
    red: '#d82800',
    white: '#fcfcfc',
    black: '#000000',
    yellow: '#f8b800',
    blue: '#0078f8',
    cyan: '#3cbcfc',
    gray: '#7c7c7c',
    skin: '#fca044'
  };

  // 5x7 crisp bitmap font
  const FONT = {
    ' ': [0,0,0,0,0,0,0],
    '!': [4,4,4,4,4,0,4],
    '-': [0,0,0,31,0,0,0],
    '.': [0,0,0,0,0,0,4],
    '/': [1,1,2,4,8,16,16],
    ':': [0,4,4,0,4,4,0],
    '>': [8,4,2,1,2,4,8],
    '<': [2,4,8,16,8,4,2],
    '0': [14,17,19,21,25,17,14],
    '1': [4,12,4,4,4,4,14],
    '2': [14,17,1,6,8,16,31],
    '3': [31,2,4,6,1,17,14],
    '4': [2,6,10,18,31,2,2],
    '5': [31,16,30,1,1,17,14],
    '6': [6,8,16,30,17,17,14],
    '7': [31,1,2,4,8,8,8],
    '8': [14,17,17,14,17,17,14],
    '9': [14,17,17,15,1,2,12],
    'A': [14,17,17,31,17,17,17],
    'B': [30,17,17,30,17,17,30],
    'C': [14,17,16,16,16,17,14],
    'D': [28,18,17,17,17,18,28],
    'E': [31,16,16,30,16,16,31],
    'F': [31,16,16,30,16,16,16],
    'G': [14,17,16,23,17,17,15],
    'H': [17,17,17,31,17,17,17],
    'I': [14,4,4,4,4,4,14],
    'J': [7,2,2,2,2,18,12],
    'K': [17,18,20,24,20,18,17],
    'L': [16,16,16,16,16,16,31],
    'M': [17,27,21,21,17,17,17],
    'N': [17,17,25,21,19,17,17],
    'O': [14,17,17,17,17,17,14],
    'P': [30,17,17,30,16,16,16],
    'Q': [14,17,17,17,21,18,13],
    'R': [30,17,17,30,20,18,17],
    'S': [15,16,16,14,1,1,30],
    'T': [31,4,4,4,4,4,4],
    'U': [17,17,17,17,17,17,14],
    'V': [17,17,17,17,17,10,4],
    'W': [17,17,17,21,21,21,10],
    'X': [17,17,10,4,10,17,17],
    'Y': [17,17,17,10,4,4,4],
    'Z': [31,1,2,4,8,16,31]
  };

  function drawText(x, y, str, color = PAL.white, scale = 1) {
    ctx.fillStyle = color;
    let cx = Math.floor(x);
    const cy = Math.floor(y);
    const s = String(str).toUpperCase();
    for (let i = 0; i < s.length; i++) {
      const g = FONT[s[i]] || FONT[' '];
      for (let r = 0; r < 7; r++) {
        const row = g[r];
        for (let c = 0; c < 5; c++) {
          if (row & (1 << (4 - c))) {
            ctx.fillRect(cx + c * scale, cy + r * scale, scale, scale);
          }
        }
      }
      cx += 6 * scale;
    }
  }

  // 8-Bit NES Audio (Square-wave Engine + Countdown Beeps + Overheat Siren + Title Jingle)
  let audioCtx = null;
  let audioMuted = false;
  let engOsc = null;
  let engGain = null;

  function initAudio() {
    if (audioCtx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AC();
      engOsc = audioCtx.createOscillator();
      engGain = audioCtx.createGain();
      engOsc.type = 'square';
      engOsc.frequency.value = 60;
      engGain.gain.value = 0;
      engOsc.connect(engGain);
      engGain.connect(audioCtx.destination);
      engOsc.start();
    } catch (e) {}
  }

  function setEngineTone(freq, vol) {
    if (!audioCtx || !engGain || audioMuted) {
      if (engGain && audioCtx) engGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.02);
      return;
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    engOsc.frequency.setTargetAtTime(freq, audioCtx.currentTime, 0.02);
    engGain.gain.setTargetAtTime(vol, audioCtx.currentTime, 0.02);
  }

  function playBeep(freq, dur, type = 'square') {
    if (audioMuted) return;
    initAudio();
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, now);
    g.gain.setValueAtTime(0.09, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start(now);
    o.stop(now + dur);
  }

  function playJingle(notes) {
    if (audioMuted) return;
    initAudio();
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    let t = audioCtx.currentTime;
    notes.forEach(([f, d]) => {
      if (f > 0) {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = 'square';
        o.frequency.setValueAtTime(f, t);
        g.gain.setValueAtTime(0.08, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + d * 0.9);
        o.connect(g);
        g.connect(audioCtx.destination);
        o.start(t);
        o.stop(t + d);
      }
      t += d;
    });
  }

  // Discrete NES Excitebike Obstacles (A through I)
  // Each obstacle has a piecewise linear profile: ascent (w1), flat top (w2), descent (w3), height (h)
  const OBSTACLE_DEFS = {
    '.': { name: 'FLAT',       w1: 0,  w2: 90, w3: 0,  h: 0,  lanes: [0,1,2,3] },
    'A': { name: 'SMALL BUMP', w1: 18, w2: 4,  w3: 18, h: 16, lanes: [0,1,2,3], stripe: 0 },
    'B': { name: 'TABLETOP',   w1: 24, w2: 44, w3: 24, h: 24, lanes: [0,1,2,3], stripe: 1 },
    'C': { name: 'STEEP JUMP', w1: 26, w2: 6,  w3: 26, h: 36, lanes: [0,1,2,3], stripe: 0 },
    'D': { name: 'HIGH PLATEAU',w1:28, w2: 72, w3: 28, h: 32, lanes: [0,1,2,3], stripe: 1 },
    'E': { name: 'TOP LANES RAMP', w1: 20, w2: 8, w3: 20, h: 22, lanes: [0,1], stripe: 0 },
    'F': { name: 'SUPER JUMP', w1: 42, w2: 10, w3: 42, h: 58, lanes: [0,1,2,3], stripe: 1 },
    'G': { name: 'MUD PATCH',  w1: 0,  w2: 90, w3: 0,  h: 0,  mudLanes: [0, 2] },
    'H': { name: 'COOL ARROW', w1: 0,  w2: 80, w3: 0,  h: 0,  coolLanes: [1, 3] },
    'I': { name: 'BOT LANES RAMP', w1: 20, w2: 8, w3: 20, h: 22, lanes: [2,3], stripe: 0 }
  };

  const TRACKS = [
    { num: 1, best: 56.0, seq: '.AB.G.C.H.D.A.F.H.B.C.' },
    { num: 2, best: 58.0, seq: '.A.E.I.C.H.G.D.F.H.A.C.F.' },
    { num: 3, best: 62.0, seq: '.B.G.C.A.A.H.F.D.G.H.C.F.' },
    { num: 4, best: 64.0, seq: '.C.E.I.G.H.F.A.A.D.H.F.C.' },
    { num: 5, best: 68.0, seq: '.F.G.C.H.D.E.I.F.G.H.F.F.' }
  ];

  let customSeq = ['.', 'A', 'B', 'H', 'C', 'G', 'F', 'D', 'H', 'F', '.'];

  // Game State
  let mode = 0; // 0 = Selection A, 1 = Selection B (with Rivals), 2 = Design Mode
  let trackIdx = 0;
  let state = 'title'; // 'title', 'countdown', 'racing', 'finished'
  let tick = 0;
  let countdownTimer = 0;
  let countdownStage = 0;

  let obstacles = [];
  let lapLength = 2400;
  let cameraX = 0;

  // Player Bike (NES Excitebike physics)
  const player = {
    x: 48,
    z: 0,          // height off ground (>= 0)
    vx: 0,         // forward speed
    vz: 0,         // vertical velocity
    lane: 1,       // 0..3 (top to bottom)
    laneY: 1.0,    // smooth lane transition
    laneDir: 0,    // -1 switching up, +1 switching down
    angle: 0,      // discrete NES pitch angle: -3(loop wipeout), -2(high wheelie), -1(wheelie/up), 0(flat), +1(down), +2(steep down)
    angleFloat: 0,
    onGround: true,
    temp: 20,      // 0..100 engine temperature
    overheatTimer: 0,
    crashState: 0, // 0=ok, 1=tumbling to grass shoulder, 2=running back to bike
    crashTimer: 0,
    runnerX: 0,
    runnerY: 0,
    lap: 1,
    totalLaps: 2,
    raceTime: 0
  };

  let rivals = [];

  function buildTrack() {
    obstacles = [];
    const seq = mode === 2 ? customSeq.join('') : TRACKS[trackIdx].seq;
    let curX = 180;
    for (let i = 0; i < seq.length; i++) {
      const code = seq[i];
      const def = OBSTACLE_DEFS[code] || OBSTACLE_DEFS['.'];
      const totalW = def.w1 + def.w2 + def.w3;
      obstacles.push({
        code,
        def,
        x: curX,
        w: totalW
      });
      curX += totalW + 52;
    }
    // Add Finish / Lap Overpass Ramp at end of lap
    obstacles.push({
      code: 'FIN',
      def: { name: 'FINISH GATE', w1: 28, w2: 36, w3: 28, h: 26, lanes: [0,1,2,3], stripe: 1 },
      x: curX,
      w: 92
    });
    lapLength = curX + 140;
  }

  // Returns { h, slope } at world X and lane (0..3)
  // slope: -1 = going UP ramp, 0 = FLAT, +1 = going DOWN ramp
  function sampleTrack(wx, lane) {
    const wrappedX = ((wx % lapLength) + lapLength) % lapLength;
    for (let i = 0; i < obstacles.length; i++) {
      const ob = obstacles[i];
      if (wrappedX >= ob.x && wrappedX <= ob.x + ob.w) {
        const d = ob.def;
        if (d.h > 0 && d.lanes && d.lanes.includes(lane)) {
          const u = wrappedX - ob.x;
          if (u < d.w1) {
            return { h: (u / d.w1) * d.h, slope: -1 };
          } else if (u <= d.w1 + d.w2) {
            return { h: d.h, slope: 0 };
          } else {
            return { h: (1 - (u - d.w1 - d.w2) / d.w3) * d.h, slope: 1 };
          }
        }
        return {
          h: 0,
          slope: 0,
          inMud: d.mudLanes && d.mudLanes.includes(lane),
          inCool: d.coolLanes && d.coolLanes.includes(lane)
        };
      }
    }
    return { h: 0, slope: 0, inMud: false, inCool: false };
  }

  function startRace() {
    buildTrack();
    player.x = 44;
    player.z = 0;
    player.vx = 0;
    player.vz = 0;
    player.lane = 1;
    player.laneY = 1.0;
    player.laneDir = 0;
    player.angle = 0;
    player.angleFloat = 0;
    player.onGround = true;
    player.temp = 20;
    player.overheatTimer = 0;
    player.crashState = 0;
    player.crashTimer = 0;
    player.lap = 1;
    player.raceTime = 0;
    cameraX = 0;

    rivals = [];
    if (mode === 1) {
      const rColors = [
        { jersey: '#0078f8', bike: '#3cbcfc' },
        { jersey: '#f8b800', bike: '#fcfcfc' },
        { jersey: '#00a800', bike: '#b8f818' }
      ];
      for (let i = 0; i < 3; i++) {
        rivals.push({
          x: 44,
          z: 0,
          vx: 0,
          vz: 0,
          targetSpeed: 2.35 + i * 0.18,
          lane: (i === 1) ? 2 : (i === 0 ? 0 : 3),
          laneY: (i === 1) ? 2 : (i === 0 ? 0 : 3),
          angle: 0,
          crashed: 0,
          colors: rColors[i]
        });
      }
    }

    state = 'countdown';
    countdownTimer = 180;
    countdownStage = 3;
    playBeep(440, 0.18);
  }

  // Input Handling
  const keys = {};
  const prevKeys = {};
  let touchMode = 'screen';
  let tiltEnabled = false;
  let tiltGamma = 0;
  const touchState = { gas: false, turbo: false, left: false, right: false, up: false, down: false };

  window.addEventListener('keydown', (e) => {
    initAudio();
    keys[e.code] = true;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      e.preventDefault();
    }
    // Design mode obstacle keys A-I
    if (mode === 2) {
      const k = e.key.toUpperCase();
      if (OBSTACLE_DEFS[k] && customSeq.length < 24) {
        customSeq.splice(customSeq.length - 1, 0, k);
        buildTrack();
        playBeep(660, 0.08);
      } else if (e.code === 'Backspace' && customSeq.length > 3) {
        customSeq.splice(customSeq.length - 2, 1);
        buildTrack();
        playBeep(330, 0.08);
      }
    }
  });

  window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
  });

  // Direct Screen Touch & Design Palette Clicks
  const activePointers = new Map();
  canvas.addEventListener('pointerdown', (e) => {
    initAudio();
    const rect = canvas.getBoundingClientRect();
    const cx = ((e.clientX - rect.left) / rect.width) * W;
    const cy = ((e.clientY - rect.top) / rect.height) * H;

    if (state === 'title' || state === 'finished') {
      if (cy > 110 && cy < 165) {
        const sel = Math.floor((cy - 112) / 16);
        if (sel >= 0 && sel <= 2) setGameMode(sel);
      }
      startRace();
      return;
    }

    // Design Mode Top Bar Clicks
    if (mode === 2 && cy < 36) {
      const codes = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
      const idx = Math.floor((cx - 8) / 34);
      if (idx >= 0 && idx < codes.length && customSeq.length < 24) {
        customSeq.splice(customSeq.length - 1, 0, codes[idx]);
        buildTrack();
        playBeep(660, 0.08);
        return;
      }
    }

    activePointers.set(e.pointerId, { startX: cx, startY: cy, x: cx, y: cy });
    syncPointers();
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!activePointers.has(e.pointerId)) return;
    const rect = canvas.getBoundingClientRect();
    const p = activePointers.get(e.pointerId);
    p.x = ((e.clientX - rect.left) / rect.width) * W;
    p.y = ((e.clientY - rect.top) / rect.height) * H;
    syncPointers();
  });

  function removePointer(e) {
    activePointers.delete(e.pointerId);
    syncPointers();
  }
  canvas.addEventListener('pointerup', removePointer);
  canvas.addEventListener('pointercancel', removePointer);

  function syncPointers() {
    if (touchMode !== 'screen') return;
    touchState.gas = false;
    touchState.turbo = false;
    touchState.left = false;
    touchState.right = false;
    touchState.up = false;
    touchState.down = false;

    for (const p of activePointers.values()) {
      if (p.startX > W * 0.5) {
        if (p.y < H * 0.48) touchState.turbo = true;
        else touchState.gas = true;
      } else {
        const dx = p.x - p.startX;
        const dy = p.y - p.startY;
        if (dx < -10) touchState.left = true;
        else if (dx > 10) touchState.right = true;
        if (dy < -10) touchState.up = true;
        else if (dy > 10) touchState.down = true;
      }
    }
  }

  document.querySelectorAll('.tbtn').forEach((btn) => {
    const act = btn.getAttribute('data-act');
    const setV = (v) => {
      touchState[act] = v;
      btn.classList.toggle('pressed', v);
    };
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      initAudio();
      if (state === 'title' || state === 'finished') startRace();
      setV(true);
    });
    btn.addEventListener('pointerup', () => setV(false));
    btn.addEventListener('pointerleave', () => setV(false));
    btn.addEventListener('pointercancel', () => setV(false));
  });

  function setGameMode(m) {
    mode = m;
    document.getElementById('btn-sel-a').classList.toggle('active', m === 0);
    document.getElementById('btn-sel-b').classList.toggle('active', m === 1);
    document.getElementById('btn-design').classList.toggle('active', m === 2);
    startRace();
  }

  document.getElementById('btn-sel-a').addEventListener('click', () => setGameMode(0));
  document.getElementById('btn-sel-b').addEventListener('click', () => setGameMode(1));
  document.getElementById('btn-design').addEventListener('click', () => setGameMode(2));

  const btnTrack = document.getElementById('btn-track');
  btnTrack.addEventListener('click', () => {
    trackIdx = (trackIdx + 1) % TRACKS.length;
    btnTrack.textContent = `TRACK ${trackIdx + 1}`;
    startRace();
  });

  const btnTouch = document.getElementById('btn-touch');
  const touchOverlay = document.getElementById('touch-overlay');
  btnTouch.addEventListener('click', () => {
    touchMode = touchMode === 'screen' ? 'buttons' : 'screen';
    btnTouch.textContent = touchMode === 'screen' ? 'TOUCH: SCREEN' : 'TOUCH: BUTTONS';
    touchOverlay.classList.toggle('visible', touchMode === 'buttons');
  });

  const btnTilt = document.getElementById('btn-tilt');
  btnTilt.addEventListener('click', async () => {
    if (!tiltEnabled && typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
      try { await DeviceOrientationEvent.requestPermission(); } catch (e) {}
    }
    tiltEnabled = !tiltEnabled;
    btnTilt.textContent = tiltEnabled ? 'TILT: ON' : 'TILT: OFF';
    btnTilt.classList.toggle('active', tiltEnabled);
  });

  window.addEventListener('deviceorientation', (e) => {
    if (!tiltEnabled) return;
    const g = (window.innerWidth > window.innerHeight) ? (e.beta || 0) : (e.gamma || 0);
    tiltGamma = Math.max(-30, Math.min(30, g));
  });

  const btnMute = document.getElementById('btn-mute');
  btnMute.addEventListener('click', () => {
    audioMuted = !audioMuted;
    btnMute.textContent = audioMuted ? 'AUDIO: OFF' : 'AUDIO: ON';
  });

  document.getElementById('btn-fs').addEventListener('click', () => {
    const shell = document.getElementById('app-shell');
    if (!document.fullscreenElement) shell.requestFullscreen?.();
    else document.exitFullscreen?.();
  });

  function triggerCrash() {
    player.crashState = 1;
    player.crashTimer = 85;
    player.runnerX = player.x;
    player.runnerY = 172; // bottom grass shoulder
    player.angle = 0;
    player.angleFloat = 0;
    playBeep(110, 0.35, 'sawtooth');
  }

  function update() {
    tick++;

    const kGas   = keys['Space'] || keys['KeyX'] || keys['KeyK'] || touchState.gas;
    const kTurbo = keys['KeyZ'] || keys['ShiftLeft'] || keys['ShiftRight'] || keys['KeyJ'] || touchState.turbo;
    const kLeft  = keys['ArrowLeft'] || keys['KeyA'] || touchState.left || (tiltEnabled && tiltGamma < -6);
    const kRight = keys['ArrowRight'] || keys['KeyD'] || touchState.right || (tiltEnabled && tiltGamma > 6);
    const kUp    = keys['ArrowUp'] || keys['KeyW'] || touchState.up;
    const pUp    = prevKeys['ArrowUp'] || prevKeys['KeyW'];
    const kDown  = keys['ArrowDown'] || keys['KeyS'] || touchState.down;
    const pDown  = prevKeys['ArrowDown'] || prevKeys['KeyS'];

    if (state === 'title') {
      setEngineTone(0, 0);
      if (kUp && !pUp) mode = (mode + 2) % 3;
      if (kDown && !pDown) mode = (mode + 1) % 3;
      if ((keys['Enter'] && !prevKeys['Enter']) || (keys['Space'] && !prevKeys['Space'])) {
        setGameMode(mode);
      }
      return;
    }

    if (state === 'finished') {
      setEngineTone(0, 0);
      if ((keys['Enter'] && !prevKeys['Enter']) || (keys['Space'] && !prevKeys['Space'])) {
        startRace();
      }
      return;
    }

    if (state === 'countdown') {
      setEngineTone(kGas || kTurbo ? 95 : 55, 0.04);
      countdownTimer--;
      if (countdownTimer === 120 || countdownTimer === 60) {
        countdownStage--;
        playBeep(440, 0.18);
      } else if (countdownTimer <= 0) {
        state = 'racing';
        playBeep(880, 0.35);
      }
      return;
    }

    // Racing Clock
    player.raceTime += 1 / 60;

    // Handle Crash / Rider Running Back to Bike on Grass Shoulder!
    if (player.crashState > 0) {
      setEngineTone(0, 0);
      // Mash A or B to recover faster, just like NES Excitebike!
      if ((kGas && !prevKeys['Space']) || (kTurbo && !prevKeys['KeyZ'])) {
        player.crashTimer -= 5;
      }
      player.crashTimer--;
      if (player.crashTimer < 45) player.crashState = 2; // Rider running back up to lane
      if (player.crashTimer <= 0) {
        player.crashState = 0;
        player.vx = 0.8;
        player.z = 0;
        player.vz = 0;
        player.angle = 0;
        player.angleFloat = 0;
      }
      return;
    }

    // Handle Overheat Stall on Track Shoulder
    if (player.overheatTimer > 0) {
      player.vx *= 0.92;
      player.overheatTimer--;
      player.temp = Math.max(25, player.temp - 0.55);
      setEngineTone(tick % 16 < 8 ? 320 : 220, 0.05);
      if (player.overheatTimer === 0) {
        player.temp = 25;
      }
      player.x += player.vx;
      cameraX = player.x - 64;
      return;
    }

    // Sample current track under bike
    const curLane = Math.round(player.laneY);
    const trk = sampleTrack(player.x, curLane);

    // Cooling Arrow & Mud Check
    if (player.onGround && trk.inCool) {
      if (player.temp > 20) playBeep(980, 0.1);
      player.temp = 16;
    }

    // Engine Temperature Update (A = normal gas, B = turbo gas)
    const activeTurbo = kTurbo;
    const activeGas = kGas || kTurbo;
    if (activeTurbo) {
      player.temp = Math.min(100, player.temp + 0.28);
      if (player.temp >= 100) {
        player.overheatTimer = 180; // 3 seconds overheat stall
        playBeep(260, 0.4, 'sawtooth');
        return;
      }
    } else if (activeGas) {
      if (player.temp < 52) player.temp += 0.06;
      else player.temp -= 0.12;
    } else {
      player.temp = Math.max(18, player.temp - 0.24);
    }

    // Lane Changing (Up / Down when on ground)
    if (player.onGround) {
      if (kUp && player.laneY > 0) {
        player.laneY = Math.max(0, player.laneY - 0.065);
        player.laneDir = -1;
      } else if (kDown && player.laneY < 3) {
        player.laneY = Math.min(3, player.laneY + 0.065);
        player.laneDir = 1;
      } else {
        // Snap gently toward nearest lane center
        const nearest = Math.round(player.laneY);
        player.laneY += (nearest - player.laneY) * 0.2;
        player.laneDir = 0;
      }
    } else {
      player.laneDir = 0;
    }

    // Forward Speed & Acceleration
    let topSpeed = activeTurbo ? 3.55 : (activeGas ? 2.65 : 0);
    if (player.onGround && trk.inMud && player.angle >= 0) {
      topSpeed = Math.min(topSpeed, 1.15); // Mud bogs you down unless wheelieing!
    }
    if (player.onGround && trk.slope === -1) {
      topSpeed *= 0.85; // climbing steep ramp
    } else if (player.onGround && trk.slope === 1) {
      topSpeed *= 1.12; // riding down ramp
    }

    if (activeGas) {
      if (player.vx < topSpeed) player.vx = Math.min(topSpeed, player.vx + (activeTurbo ? 0.065 : 0.045));
      else player.vx = Math.max(topSpeed, player.vx - 0.04);
    } else {
      player.vx = Math.max(0, player.vx - 0.03);
    }

    // Previous track sample vs new X position
    const prevSlope = trk.slope;
    player.x += player.vx;
    const nextTrk = sampleTrack(player.x, Math.round(player.laneY));

    // Vertical & Ramp Launch / Landing Physics
    if (player.onGround) {
      // Did we just crest the top of a ramp (slope -1 -> 0 or -1 -> +1)?
      if (prevSlope === -1 && nextTrk.slope >= 0 && player.vx > 1.3) {
        player.onGround = false;
        player.vz = player.vx * 0.95;
        player.z = nextTrk.h + player.vz;
        player.angleFloat = -1.0;
        player.angle = -1;
        playBeep(320, 0.09);
      } else if (nextTrk.h < player.z - 2 && player.vx > 1.5) {
        // Dropped off a plateau edge
        player.onGround = false;
        player.vz = 0.2;
      } else {
        player.z = nextTrk.h;
        player.vz = 0;

        // Ground Wheelie Control (Left = pull wheelie up, Right = drop nose flat)
        if (kLeft) {
          player.angleFloat -= 0.085;
          if (player.angleFloat < -2.75) {
            // Tipped too far backward -> Loop-out Crash!
            triggerCrash();
            return;
          }
        } else if (kRight) {
          player.angleFloat = Math.min(0, player.angleFloat + 0.12);
        } else {
          // Follow ramp slope when on ramp
          const targetA = nextTrk.slope;
          player.angleFloat += (targetA - player.angleFloat) * 0.22;
        }
        player.angle = Math.max(-2, Math.min(2, Math.round(player.angleFloat)));
      }
    } else {
      // Mid-Air Flight!
      player.z += player.vz;
      player.vz -= 0.12; // NES gravity

      // Mid-Air Pitch Control (Left = nose UP, Right = nose DOWN)
      if (kLeft) player.angleFloat = Math.max(-2.3, player.angleFloat - 0.075);
      else if (kRight) player.angleFloat = Math.min(2.3, player.angleFloat + 0.075);
      player.angle = Math.max(-2, Math.min(2, Math.round(player.angleFloat)));

      // Check Landing on Ground / Ramp
      if (player.z <= nextTrk.h) {
        player.z = nextTrk.h;
        player.onGround = true;
        player.vz = 0;

        // Compare bike discrete angle (-2..+2) with landing slope (-1, 0, +1)
        const idealAngle = nextTrk.slope === 1 ? 1 : (nextTrk.slope === -1 ? -1 : 0);
        const diff = Math.abs(player.angle - idealAngle);
        if (diff === 0) {
          // Perfect slope-matched landing -> slight speed boost!
          player.vx = Math.min(3.8, player.vx + 0.25);
        } else if (diff === 1) {
          // Slight bounce -> small speed loss
          player.vx *= 0.78;
        } else {
          // Bad landing angle -> CRASH!
          triggerCrash();
          return;
        }
        player.angleFloat = nextTrk.slope;
        player.angle = nextTrk.slope;
      }
    }

    // Lap & Finish Check
    const currentLap = Math.floor(player.x / lapLength) + 1;
    if (currentLap > player.lap) {
      player.lap = currentLap;
      if (player.lap > player.totalLaps) {
        state = 'finished';
        playJingle([
          [523, 0.12], [659, 0.12], [784, 0.12], [1046, 0.28],
          [784, 0.12], [1046, 0.35]
        ]);
        return;
      } else {
        playBeep(784, 0.2);
      }
    }

    // Update CPU Rivals (Selection B)
    rivals.forEach((rv) => {
      if (rv.crashed > 0) {
        rv.crashed--;
        return;
      }
      rv.vx += (rv.targetSpeed - rv.vx) * 0.05;
      const rPrev = sampleTrack(rv.x, Math.round(rv.laneY));
      rv.x += rv.vx;
      const rNext = sampleTrack(rv.x, Math.round(rv.laneY));
      if (rv.z <= rNext.h) {
        if (rPrev.slope === -1 && rNext.slope >= 0 && rv.vx > 1.5) {
          rv.vz = rv.vx * 0.85;
          rv.z = rNext.h + rv.vz;
          rv.angle = -1;
        } else {
          rv.z = rNext.h;
          rv.vz = 0;
          rv.angle = rNext.slope;
        }
      } else {
        rv.z += rv.vz;
        rv.vz -= 0.12;
        rv.angle = rv.vz > 0 ? -1 : 1;
      }

      // Rival vs Player Collision (Rear-Wheel Clipping!)
      const dx = player.x - rv.x;
      const dLane = Math.abs(player.laneY - rv.laneY);
      const dz = Math.abs(player.z - rv.z);
      if (dLane < 0.55 && dz < 12 && Math.abs(dx) < 16) {
        if (dx >= 0) {
          // Player is slightly ahead -> Player's rear wheel clips Rival's front wheel!
          rv.crashed = 65;
          rv.vx = 0;
          playBeep(520, 0.12);
        } else {
          // Player rammed into the back of Rival -> Player crashes!
          triggerCrash();
        }
      }
    });

    cameraX = player.x - 64;

    // Continuous Square-Wave NES Engine Pitch
    const freq = 52 + player.vx * 36 + (activeTurbo ? 28 : 0) + (player.onGround ? 0 : 35);
    setEngineTone(freq, 0.045);
  }

  // Pixel-Art NES Excitebike Sprite Renderer
  // Draws the iconic 8-bit bike + rider at 5 discrete angles (-2, -1, 0, +1, +2)
  function drawPixelBike(sx, sy, angle, jerseyCol, bikeCol, wheelPhase, isCrashing) {
    ctx.save();
    ctx.translate(Math.floor(sx), Math.floor(sy));

    if (isCrashing) {
      // Tumbling bike on track
      ctx.rotate((tick * 0.4) % (Math.PI * 2));
    } else {
      ctx.rotate(angle * 0.34);
    }

    // Rear & Front 8-bit Wheels
    const drawPixelWheel = (wx, wy) => {
      ctx.fillStyle = PAL.black;
      ctx.fillRect(wx - 4, wy - 4, 8, 8);
      ctx.fillStyle = PAL.white;
      ctx.fillRect(wx - 2, wy - 2, 4, 4);
      // Spoke flicker
      ctx.fillStyle = PAL.gray;
      if (wheelPhase & 1) {
        ctx.fillRect(wx - 3, wy, 6, 1);
      } else {
        ctx.fillRect(wx, wy - 3, 1, 6);
      }
    };

    drawPixelWheel(-8, -4);
    drawPixelWheel(8, -4);

    // Engine & Swingarm
    ctx.fillStyle = PAL.gray;
    ctx.fillRect(-6, -8, 10, 4);

    // Bike Chassis & Fenders
    ctx.fillStyle = bikeCol;
    ctx.fillRect(-10, -10, 18, 3);
    ctx.fillRect(4, -13, 5, 6); // front fairing/forks

    if (!isCrashing) {
      // Rider Boots & Blue Pants
      ctx.fillStyle = PAL.white;
      ctx.fillRect(-5, -12, 4, 4);
      // Rider Jersey
      ctx.fillStyle = jerseyCol;
      ctx.fillRect(-6, -18, 6, 6);
      // Rider Arm reaching handlebars
      ctx.fillStyle = PAL.skin;
      ctx.fillRect(0, -16, 5, 2);
      // Rider White/Red Helmet + Visor
      ctx.fillStyle = PAL.white;
      ctx.fillRect(-4, -24, 7, 6);
      ctx.fillStyle = jerseyCol;
      ctx.fillRect(-4, -21, 7, 2);
      ctx.fillStyle = PAL.black;
      ctx.fillRect(1, -23, 2, 2);
    }

    ctx.restore();
  }

  function render() {
    // 1. Top Stadium Grandstands & Infield (Y = 0..88)
    ctx.fillStyle = PAL.bleacherBlue;
    ctx.fillRect(0, 0, W, 32);

    // Stadium Crowd Dots (scrolling slowly)
    const crowdScroll = Math.floor(cameraX * 0.25) % 16;
    for (let y = 4; y < 28; y += 6) {
      for (let x = -crowdScroll; x < W; x += 8) {
        ctx.fillStyle = ((x + y) & 8) ? PAL.white : PAL.red;
        ctx.fillRect(x, y, 3, 3);
        ctx.fillStyle = PAL.yellow;
        ctx.fillRect(x + 4, y + 2, 3, 3);
      }
    }

    // Stadium Wall
    ctx.fillStyle = PAL.white;
    ctx.fillRect(0, 32, W, 6);
    ctx.fillStyle = PAL.red;
    ctx.fillRect(0, 34, W, 2);

    // Green Infield Turf (Y = 38..88)
    ctx.fillStyle = PAL.turfGreen;
    ctx.fillRect(0, 38, W, 50);

    // Infield Hurdles, Track Number Signs & Trophy Podium
    const propOffset = Math.floor(cameraX) % 320;
    for (let k = -1; k <= 1; k++) {
      const px = k * 320 - propOffset;
      // Red/White Hurdles
      ctx.fillStyle = PAL.white;
      ctx.fillRect(px + 60, 64, 24, 10);
      ctx.fillStyle = PAL.red;
      ctx.fillRect(px + 64, 64, 6, 4);
      ctx.fillRect(px + 76, 64, 6, 4);

      // Track Number Sign
      ctx.fillStyle = PAL.blue;
      ctx.fillRect(px + 170, 52, 22, 20);
      ctx.strokeStyle = PAL.white;
      ctx.strokeRect(px + 170, 52, 22, 20);
      drawText(px + 178, 58, String(trackIdx + 1), PAL.white, 1);

      // Winner Podium in Infield
      ctx.fillStyle = PAL.white;
      ctx.fillRect(px + 250, 56, 44, 18);
      ctx.fillStyle = PAL.red;
      ctx.fillRect(px + 264, 48, 16, 8);
      drawText(px + 254, 62, '0:58:0', PAL.black, 1);
    }

    // 2. Top Curb Border (Red & White Alternating Blocks at Y = 88..94)
    const curbOff = Math.floor(cameraX) % 16;
    for (let x = -curbOff; x < W; x += 16) {
      ctx.fillStyle = PAL.red;
      ctx.fillRect(x, 88, 8, 6);
      ctx.fillStyle = PAL.white;
      ctx.fillRect(x + 8, 88, 8, 6);
    }

    // 3. The 4-Lane Tan Dirt Track (Y = 94..166, 18px per lane)
    ctx.fillStyle = PAL.dirt;
    ctx.fillRect(0, 94, W, 72);

    // Dashed Lane Dividers
    ctx.fillStyle = PAL.laneLine;
    const dashOff = Math.floor(cameraX) % 12;
    for (let l = 1; l <= 3; l++) {
      const ly = 94 + l * 18;
      for (let x = -dashOff; x < W; x += 12) {
        ctx.fillRect(x, ly, 6, 1);
      }
    }

    // Bottom Curb & Green Grass Shoulder (Y = 166..184)
    for (let x = -curbOff; x < W; x += 16) {
      ctx.fillStyle = PAL.white;
      ctx.fillRect(x, 166, 8, 5);
      ctx.fillStyle = PAL.red;
      ctx.fillRect(x + 8, 166, 8, 5);
    }
    ctx.fillStyle = PAL.turfGreen;
    ctx.fillRect(0, 171, W, 13);

    // Starting Line Gate Stalls (at X = 44)
    const startSx = Math.floor(44 - cameraX);
    if (startSx > -30 && startSx < W) {
      for (let l = 0; l < 4; l++) {
        const ly = 94 + l * 18;
        ctx.fillStyle = PAL.white;
        ctx.fillRect(startSx + 10, ly + 2, 4, 15);
        ctx.fillStyle = state === 'countdown' ? PAL.red : PAL.turfGreen;
        ctx.fillRect(startSx + 14, ly + 2, 3, 15);
      }
    }

    // 4. Render Discrete NES Obstacles (Trapezoidal Ramps with Striped Sides, Mud Pits, Cool Arrows)
    for (let lap = 0; lap <= 2; lap++) {
      const lapBaseX = lap * lapLength;
      for (let i = 0; i < obstacles.length; i++) {
        const ob = obstacles[i];
        const sx = Math.floor(lapBaseX + ob.x - cameraX);
        if (sx + ob.w < -20 || sx > W + 20) continue;
        const d = ob.def;

        // Mud Pits
        if (d.mudLanes) {
          d.mudLanes.forEach((ln) => {
            const my = 96 + ln * 18;
            ctx.fillStyle = PAL.mud;
            ctx.fillRect(sx, my, ob.w, 14);
            ctx.fillStyle = PAL.dirtDark;
            ctx.fillRect(sx + 6, my + 4, ob.w - 12, 3);
            ctx.fillRect(sx + 14, my + 9, ob.w - 28, 2);
          });
        }

        // Cooling Boost Arrows (>>)
        if (d.coolLanes) {
          d.coolLanes.forEach((ln) => {
            const cy = 97 + ln * 18;
            ctx.fillStyle = PAL.yellow;
            ctx.fillRect(sx + 16, cy, 28, 12);
            drawText(sx + 20, cy + 3, '>>', PAL.red, 1);
          });
        }

        // Trapezoidal 3D NES Ramps
        if (d.h > 0 && d.lanes) {
          const topLane = d.lanes[0];
          const botLane = d.lanes[d.lanes.length - 1];
          const yTop = 94 + topLane * 18;
          const yBot = 94 + (botLane + 1) * 18;

          // Ramp Surface Polygon (shifted up by d.h at peak)
          ctx.fillStyle = ob.code === 'FIN' ? PAL.white : PAL.dirtDark;
          ctx.beginPath();
          ctx.moveTo(sx, yTop);
          ctx.lineTo(sx + d.w1, yTop - d.h);
          ctx.lineTo(sx + d.w1 + d.w2, yTop - d.h);
          ctx.lineTo(sx + ob.w, yTop);
          ctx.lineTo(sx + ob.w, yBot);
          ctx.lineTo(sx + d.w1 + d.w2, yBot - d.h);
          ctx.lineTo(sx + d.w1, yBot - d.h);
          ctx.lineTo(sx, yBot);
          ctx.closePath();
          ctx.fill();

          // Crisp Black Outlines on Ramp Edges
          ctx.strokeStyle = PAL.black;
          ctx.lineWidth = 1;
          ctx.stroke();

          // Iconic Red/White or Blue/Yellow Striped Front Skirt at yBot!
          const c1 = d.stripe ? PAL.blue : PAL.red;
          const c2 = d.stripe ? PAL.yellow : PAL.white;
          for (let rx = 0; rx < ob.w; rx += 4) {
            let rh = d.h;
            if (rx < d.w1) rh = (rx / d.w1) * d.h;
            else if (rx > d.w1 + d.w2) rh = (1 - (rx - d.w1 - d.w2) / d.w3) * d.h;
            ctx.fillStyle = ((rx >> 2) & 1) ? c1 : c2;
            ctx.fillRect(sx + rx, Math.floor(yBot - rh), 4, Math.ceil(rh));
          }

          if (ob.code === 'FIN') {
            drawText(sx + d.w1 + 4, yTop - d.h + 8, 'FINISH', PAL.red, 1);
          }
        }
      }
    }

    // 5. Render Rivals & Player Bike (sorted by lane Y so lower lanes overlap higher lanes)
    const entities = [];
    rivals.forEach((rv) => {
      entities.push({
        isPlayer: false,
        x: rv.x,
        laneY: rv.laneY,
        z: rv.z,
        angle: rv.angle,
        crashed: rv.crashed > 0,
        jersey: rv.colors.jersey,
        bike: rv.colors.bike,
        wheelPhase: Math.floor(rv.x * 0.5)
      });
    });
    entities.push({
      isPlayer: true,
      x: player.x,
      laneY: player.laneY,
      z: player.z,
      angle: player.angle,
      crashed: player.crashState === 1,
      jersey: PAL.red,
      bike: PAL.white,
      wheelPhase: Math.floor(player.x * 0.5)
    });

    entities.sort((a, b) => a.laneY - b.laneY);

    entities.forEach((ent) => {
      const sx = ent.x - cameraX;
      const groundY = 106 + ent.laneY * 18;
      // Black Ground Shadow when airborne
      if (ent.z > 2) {
        ctx.fillStyle = PAL.black;
        ctx.fillRect(Math.floor(sx - 9), Math.floor(groundY - 2), 18, 3);
      }
      drawPixelBike(
        sx,
        groundY - ent.z,
        ent.angle,
        ent.jersey,
        ent.bike,
        ent.wheelPhase,
        ent.crashed
      );
    });

    // If Player Crashed -> Draw Little Pixel Rider Running on Bottom Grass Shoulder!
    if (player.crashState > 0) {
      const rx = Math.floor(player.x - cameraX - (player.crashTimer * 0.35));
      const ry = player.crashState === 1 ? 176 : 106 + Math.floor(player.laneY * 18);
      const leg = (tick >> 2) & 1;
      ctx.fillStyle = PAL.white;
      ctx.fillRect(rx - 2, ry - 14, 5, 5); // helmet
      ctx.fillStyle = PAL.red;
      ctx.fillRect(rx - 2, ry - 9, 5, 5);  // jersey
      ctx.fillStyle = PAL.blue;
      ctx.fillRect(rx - 2 + (leg ? -2 : 1), ry - 4, 2, 4);
      ctx.fillRect(rx + (leg ? 2 : -1), ry - 4, 2, 4);
      drawText(W / 2 - 54, 72, 'MASH A/B TO RECOVER!', PAL.white, 1);
    }

    // Countdown Traffic Light Box
    if (state === 'countdown') {
      ctx.fillStyle = PAL.black;
      ctx.fillRect(136, 44, 48, 22);
      ctx.strokeStyle = PAL.white;
      ctx.strokeRect(136, 44, 48, 22);
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = (3 - countdownStage >= i) ? PAL.red : PAL.gray;
        ctx.fillRect(142 + i * 14, 50, 8, 10);
      }
    }

    // Classic NES "OVER HEAT" Flashing Box on Track
    if (player.overheatTimer > 0 && (tick & 8)) {
      ctx.fillStyle = PAL.black;
      ctx.fillRect(118, 118, 84, 20);
      ctx.strokeStyle = PAL.red;
      ctx.strokeRect(118, 118, 84, 20);
      drawText(132, 125, 'OVER HEAT', PAL.white, 1);
    }

    // Design Mode Palette Overlay at Top
    if (mode === 2) {
      ctx.fillStyle = 'rgba(0,0,0,0.85)';
      ctx.fillRect(0, 0, W, 34);
      const codes = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
      codes.forEach((c, idx) => {
        const bx = 8 + idx * 34;
        ctx.fillStyle = PAL.bleacherBlue;
        ctx.fillRect(bx, 4, 30, 16);
        drawText(bx + 4, 8, `${c}:${OBSTACLE_DEFS[c].name.slice(0,3)}`, PAL.white, 1);
      });
      drawText(8, 24, 'TAP A-I OR PRESS KEYS A-I TO ADD OBSTACLE (BKSP=DEL)', PAL.yellow, 1);
    }

    // 6. Authentic NES Bottom Black & Blue Dashboard (Y = 184..240)
    ctx.fillStyle = PAL.black;
    ctx.fillRect(0, 184, W, 56);

    // Left Box: TEMP Gauge
    ctx.fillStyle = PAL.bleacherBlue;
    ctx.fillRect(10, 192, 96, 40);
    ctx.strokeStyle = PAL.white;
    ctx.strokeRect(10, 192, 96, 40);
    drawText(38, 198, 'TEMP', PAL.white, 1);
    ctx.fillStyle = PAL.black;
    ctx.fillRect(18, 212, 80, 12);
    const tempW = Math.floor((player.temp / 100) * 76);
    ctx.fillStyle = (player.temp > 78 && (tick & 4)) ? PAL.red : (player.temp > 60 ? PAL.yellow : PAL.white);
    ctx.fillRect(20, 214, tempW, 8);

    // Center Box: TIME & LAP
    ctx.fillStyle = PAL.bleacherBlue;
    ctx.fillRect(114, 192, 96, 40);
    ctx.strokeStyle = PAL.white;
    ctx.strokeRect(114, 192, 96, 40);
    const mins = Math.floor(player.raceTime / 60);
    const secs = Math.floor(player.raceTime % 60);
    const hund = Math.floor((player.raceTime * 100) % 100);
    const timeStr = `${mins}:${String(secs).padStart(2, '0')}:${String(hund).padStart(2, '0')}`;
    drawText(122, 198, `TIME ${timeStr}`, PAL.white, 1);
    drawText(122, 214, `LAP  ${Math.min(player.lap, player.totalLaps)}/${player.totalLaps}`, PAL.yellow, 1);

    // Right Box: BEST TIME & CONTROLS HINT
    ctx.fillStyle = PAL.bleacherBlue;
    ctx.fillRect(218, 192, 92, 40);
    ctx.strokeStyle = PAL.white;
    ctx.strokeRect(218, 192, 92, 40);
    drawText(226, 198, `BEST 0:${TRACKS[trackIdx].best.toFixed(0)}:00`, PAL.white, 1);
    drawText(226, 214, 'A:GAS B:TURBO', PAL.cyan, 1);

    // 7. Classic 1984 NES Title Screen / Finish Screen
    if (state === 'title' || state === 'finished') {
      ctx.fillStyle = PAL.black;
      ctx.fillRect(24, 18, W - 48, 162);
      ctx.strokeStyle = PAL.red;
      ctx.lineWidth = 2;
      ctx.strokeRect(24, 18, W - 48, 162);

      // Brick-Red EXCITEBIKE Logo Banner
      ctx.fillStyle = PAL.red;
      ctx.fillRect(52, 28, 216, 30);
      drawText(72, 36, 'EXCITEBIKE', PAL.white, 3);
      drawText(64, 66, state === 'finished' ? `FINISH TIME: ${timeStr}!` : '1984 NINTENDO 8-BIT EDITION', PAL.yellow, 1);

      const opts = [
        '1. SELECTION A (SOLO TIME TRIAL)',
        '2. SELECTION B (RACE VS RIVALS)',
        '3. DESIGN      (BUILD TRACK A-I)'
      ];
      opts.forEach((txt, idx) => {
        if (mode === idx) {
          drawText(46, 92 + idx * 16, '>', PAL.red, 1);
        }
        drawText(58, 92 + idx * 16, txt, mode === idx ? PAL.white : PAL.gray, 1);
      });

      drawText(44, 146, 'SPACE/X = A (GAS)   Z/SHIFT = B (TURBO)', PAL.cyan, 1);
      drawText(44, 160, 'PRESS ENTER, SPACE, OR TAP TO START!', PAL.turfGreen, 1);
    }
  }

  function loop() {
    update();
    render();
    Object.assign(prevKeys, keys);
    requestAnimationFrame(loop);
  }

  buildTrack();
  requestAnimationFrame(loop);
})();
