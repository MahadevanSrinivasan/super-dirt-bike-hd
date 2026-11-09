/*
 * Super Dirt Bike HD: Motocross & Trials (1080p 60FPS Web Edition)
 * Combines:
 *  1. Physics Trials & Stunt Obstacle Mode (Miniclip Dirt Bike / Elasto Mania / Trials feel)
 *  2. Excitebike-Style 4-Lane Stadium Turbo Motocross (Turbo Overheat Gauge, Cooling Arrows, Mud, Rivals)
 *  3. Custom Track Builder (Design & test-ride your own obstacle/stadium course)
 */
(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = 1920;
  const H = 1080;

  // Game Modes: 0 = Trials Physics, 1 = Stadium GP (Excitebike 4-Lane), 2 = Track Builder
  let gameMode = 0;
  let currentTrackIdx = 0;
  let gameState = 'title'; // 'title', 'playing', 'crashed', 'finished'
  let globalTick = 0;

  // Audio System (Continuous Engine RPM Synth + SFX)
  let audioCtx = null;
  let audioMuted = false;
  let engineOsc = null;
  let engineGain = null;

  function initAudio() {
    if (audioCtx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AC();
      engineOsc = audioCtx.createOscillator();
      const filter = audioCtx.createBiquadFilter();
      engineGain = audioCtx.createGain();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      engineGain.gain.value = 0.0;
      engineOsc.connect(filter);
      filter.connect(engineGain);
      engineGain.connect(audioCtx.destination);
      engineOsc.start();
    } catch (e) {}
  }

  function updateEngineSound(rpmRatio, turbo, active) {
    if (!audioCtx || !engineGain || audioMuted || !active) {
      if (engineGain && audioCtx) engineGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.05);
      return;
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const baseFreq = 48 + rpmRatio * (turbo ? 165 : 115) + Math.sin(globalTick * 0.6) * 4;
    engineOsc.frequency.setTargetAtTime(baseFreq, audioCtx.currentTime, 0.03);
    engineGain.gain.setTargetAtTime(turbo ? 0.08 : 0.05, audioCtx.currentTime, 0.04);
  }

  function playSfx(type) {
    if (audioMuted) return;
    initAudio();
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.connect(g);
    g.connect(audioCtx.destination);

    if (type === 'stunt') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.18);
      g.gain.setValueAtTime(0.14, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.start(now);
      osc.stop(now + 0.22);
    } else if (type === 'cool') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587, now);
      osc.frequency.exponentialRampToValueAtTime(1174, now + 0.16);
      g.gain.setValueAtTime(0.15, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.start(now);
      osc.stop(now + 0.18);
    } else if (type === 'crash') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.exponentialRampToValueAtTime(42, now + 0.35);
      g.gain.setValueAtTime(0.18, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
      osc.start(now);
      osc.stop(now + 0.36);
    } else if (type === 'finish') {
      const notes = [523, 659, 784, 1046];
      notes.forEach((n, idx) => {
        const o = audioCtx.createOscillator();
        const gn = audioCtx.createGain();
        o.type = 'triangle';
        o.frequency.setValueAtTime(n, now + idx * 0.09);
        gn.gain.setValueAtTime(0.14, now + idx * 0.09);
        gn.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.09 + 0.22);
        o.connect(gn);
        gn.connect(audioCtx.destination);
        o.start(now + idx * 0.09);
        o.stop(now + idx * 0.09 + 0.22);
      });
    }
  }

  // Track Definitions (4 Trials Courses + 4 Stadium GP Tracks + 1 Custom Builder Track)
  // Obstacle piece types:
  // 'flat', 'ramp', 'mega_ramp', 'tabletop', 'whoops', 'boulders', 'logs', 'bridge', 'mud', 'cool', 'loop_arch'
  const TRIALS_TRACKS = [
    {
      code: 'T-1',
      name: 'BOULDER CREEK CANYON',
      skyTop: '#0284c7',
      skyBot: '#bae6fd',
      hillFar: '#0f766e',
      hillNear: '#15803d',
      groundTop: '#22c55e',
      groundBody: '#78350f',
      bikeColor: '#f97316',
      pieces: [
        'flat', 'ramp', 'boulders', 'logs', 'tabletop', 'bridge',
        'whoops', 'mega_ramp', 'boulders', 'logs', 'ramp', 'mega_ramp', 'flat'
      ]
    },
    {
      code: 'T-2',
      name: 'RED ROCK MESA TRIALS',
      skyTop: '#c2410c',
      skyBot: '#fde047',
      hillFar: '#9a3412',
      hillNear: '#b45309',
      groundTop: '#f59e0b',
      groundBody: '#7c2d12',
      bikeColor: '#ef4444',
      pieces: [
        'flat', 'boulders', 'mega_ramp', 'tabletop', 'logs', 'boulders',
        'bridge', 'mega_ramp', 'whoops', 'boulders', 'mega_ramp', 'flat'
      ]
    },
    {
      code: 'T-3',
      name: 'TIMBERYARD INDUSTRIAL PARK',
      skyTop: '#1e293b',
      skyBot: '#64748b',
      hillFar: '#334155',
      hillNear: '#475569',
      groundTop: '#94a3b8',
      groundBody: '#334155',
      bikeColor: '#eab308',
      pieces: [
        'flat', 'logs', 'tabletop', 'boulders', 'mega_ramp', 'bridge',
        'logs', 'whoops', 'tabletop', 'mega_ramp', 'logs', 'flat'
      ]
    },
    {
      code: 'T-4',
      name: 'VOLCANO RIM EXTREME',
      skyTop: '#18181b',
      skyBot: '#7f1d1d',
      hillFar: '#450a0a',
      hillNear: '#991b1b',
      groundTop: '#f87171',
      groundBody: '#27272a',
      bikeColor: '#38bdf8',
      pieces: [
        'flat', 'mega_ramp', 'boulders', 'bridge', 'mega_ramp', 'whoops',
        'boulders', 'logs', 'tabletop', 'mega_ramp', 'mega_ramp', 'flat'
      ]
    }
  ];

  const STADIUM_TRACKS = [
    {
      code: 'M-1',
      name: 'EMERALD STADIUM GP',
      skyTop: '#1d4ed8',
      skyBot: '#93c5fd',
      hillFar: '#1e3a8a',
      hillNear: '#15803d',
      groundTop: '#16a34a',
      groundBody: '#92400e',
      bikeColor: '#ef4444',
      pieces: [
        'flat', 'ramp', 'cool', 'mud', 'tabletop', 'whoops',
        'cool', 'mega_ramp', 'mud', 'ramp', 'cool', 'mega_ramp', 'flat'
      ]
    },
    {
      code: 'M-2',
      name: 'SUNSET DUNES SUPERCROSS',
      skyTop: '#7c2d12',
      skyBot: '#fdba74',
      hillFar: '#9a3412',
      hillNear: '#d97706',
      groundTop: '#f59e0b',
      groundBody: '#78350f',
      bikeColor: '#10b981',
      pieces: [
        'flat', 'whoops', 'cool', 'mega_ramp', 'mud', 'tabletop',
        'cool', 'whoops', 'mega_ramp', 'mud', 'cool', 'mega_ramp', 'flat'
      ]
    },
    {
      code: 'M-3',
      name: 'NEON NIGHT ARENA',
      skyTop: '#090d16',
      skyBot: '#3b0764',
      hillFar: '#312e81',
      hillNear: '#581c87',
      groundTop: '#c084fc',
      groundBody: '#1e1b4b',
      bikeColor: '#38bdf8',
      pieces: [
        'flat', 'mega_ramp', 'cool', 'whoops', 'mud', 'tabletop',
        'mega_ramp', 'cool', 'mud', 'whoops', 'mega_ramp', 'flat'
      ]
    },
    {
      code: 'M-4',
      name: 'WORLD CHAMPIONSHIP FINALE',
      skyTop: '#0f172a',
      skyBot: '#1e40af',
      hillFar: '#1e293b',
      hillNear: '#047857',
      groundTop: '#facc15',
      groundBody: '#7c2d12',
      bikeColor: '#f97316',
      pieces: [
        'flat', 'mega_ramp', 'whoops', 'cool', 'mud', 'mega_ramp',
        'tabletop', 'cool', 'whoops', 'mega_ramp', 'cool', 'mega_ramp', 'flat'
      ]
    }
  ];

  const CUSTOM_TRACK = {
    code: 'C-1',
    name: 'CUSTOM BUILDER TRACK',
    skyTop: '#0f172a',
    skyBot: '#0284c7',
    hillFar: '#0f766e',
    hillNear: '#15803d',
    groundTop: '#4ade80',
    groundBody: '#78350f',
    bikeColor: '#f97316',
    pieces: [
      'flat', 'ramp', 'cool', 'boulders', 'mega_ramp', 'tabletop',
      'logs', 'whoops', 'cool', 'mega_ramp', 'flat'
    ]
  };

  const BUILDER_PALETTE = [
    { id: 'flat',      label: '1: Flat Run' },
    { id: 'ramp',      label: '2: Med Jump' },
    { id: 'mega_ramp', label: '3: Mega Ramp' },
    { id: 'tabletop',  label: '4: Tabletop' },
    { id: 'whoops',    label: '5: Whoops' },
    { id: 'boulders',  label: '6: Rock Pile' },
    { id: 'logs',      label: '7: Giant Logs' },
    { id: 'bridge',    label: '8: High Bridge' },
    { id: 'mud',       label: '9: Mud Patch' },
    { id: 'cool',      label: '0: Turbo Cool' }
  ];

  // Generated Terrain & Special Zones
  const SEG_LEN = 540; // length of each track piece in world pixels
  let trackLength = 8000;
  let obstacles = [];    // physical bumps: boulders, logs, mud patches, cooling arrows, star rings
  let checkpoints = [];
  let rivals = [];
  let particles = [];
  let popups = [];

  // Bike State
  const bike = {
    x: 240,
    y: 680,
    vx: 0,
    vy: 0,
    pitch: 0,      // radians, negative = nose up (wheelie/backflip), positive = nose down
    omega: 0,      // angular velocity
    lane: 1,       // 0..3 for Stadium mode
    laneY: 1.0,    // smooth visual lane interpolation
    onGround: false,
    frontContact: false,
    rearContact: false,
    frontComp: 0,
    rearComp: 0,
    wheelRot: 0,
    temp: 25,      // 0..100 engine heat
    overheated: 0, // cooldown timer when overheated
    crashed: 0,
    airTime: 0,
    airRotAccum: 0,
    wheelieTicks: 0,
    score: 0,
    flips: 0,
    raceTime: 0,
    checkpointX: 240,
    checkpointY: 640
  };

  let cameraX = 0;
  let cameraY = 0;
  let bannerText = '';
  let bannerTimer = 0;

  function showBanner(msg, dur = 110) {
    bannerText = msg;
    bannerTimer = dur;
  }

  function addPopup(x, y, text, color = '#facc15') {
    popups.push({ x, y, text, color, life: 65, maxLife: 65 });
  }

  function activeTrackDef() {
    if (gameMode === 2) return CUSTOM_TRACK;
    const list = gameMode === 1 ? STADIUM_TRACKS : TRIALS_TRACKS;
    return list[((currentTrackIdx % list.length) + list.length) % list.length];
  }

  // Heightmap function for any world X coordinate
  function baseTerrainHeight(x) {
    const tr = activeTrackDef();
    const baseY = 760;
    if (x < 420) return baseY;
    const idx = Math.floor((x - 420) / SEG_LEN);
    if (idx < 0 || idx >= tr.pieces.length) return baseY;
    const u = ((x - 420) - idx * SEG_LEN) / SEG_LEN; // 0..1 within piece
    const type = tr.pieces[idx];

    if (type === 'ramp') {
      if (u > 0.25 && u < 0.72) {
        const t = (u - 0.25) / 0.47;
        return baseY - Math.sin(t * Math.PI) * 145;
      }
    } else if (type === 'mega_ramp') {
      if (u > 0.15 && u < 0.55) {
        const t = (u - 0.15) / 0.40;
        return baseY - Math.pow(Math.sin(t * Math.PI * 0.5), 1.4) * 255;
      } else if (u >= 0.55 && u < 0.75) {
        return baseY + 55; // gap dip between launch and landing
      } else if (u >= 0.75 && u < 0.96) {
        const t = 1 - (u - 0.75) / 0.21;
        return baseY - Math.sin(t * Math.PI * 0.5) * 190;
      }
    } else if (type === 'tabletop') {
      if (u > 0.15 && u < 0.35) {
        return baseY - ((u - 0.15) / 0.20) * 185;
      } else if (u >= 0.35 && u <= 0.68) {
        return baseY - 185;
      } else if (u > 0.68 && u < 0.88) {
        return baseY - (1 - (u - 0.68) / 0.20) * 185;
      }
    } else if (type === 'whoops') {
      if (u > 0.1 && u < 0.9) {
        const t = (u - 0.1) / 0.8;
        return baseY - Math.abs(Math.sin(t * Math.PI * 5)) * 68;
      }
    } else if (type === 'bridge') {
      if (u > 0.12 && u < 0.88) {
        const t = (u - 0.12) / 0.76;
        return baseY - Math.sin(t * Math.PI) * 160 + Math.sin(t * Math.PI * 3) * 18;
      }
    }
    return baseY;
  }

  // Includes physical boulders & logs on top of the terrain
  function getGroundY(x) {
    let y = baseTerrainHeight(x);
    for (let i = 0; i < obstacles.length; i++) {
      const ob = obstacles[i];
      if (ob.kind === 'boulder' || ob.kind === 'log') {
        const dx = x - ob.x;
        if (Math.abs(dx) < ob.r) {
          const bump = Math.sqrt(Math.max(0, ob.r * ob.r - dx * dx));
          y = Math.min(y, ob.y - bump * 0.92);
        }
      }
    }
    return y;
  }

  function getSlopeAngle(x) {
    const h1 = getGroundY(x - 10);
    const h2 = getGroundY(x + 10);
    return Math.atan2(h2 - h1, 20);
  }

  function buildTrack() {
    const tr = activeTrackDef();
    obstacles = [];
    checkpoints = [];
    rivals = [];
    particles = [];
    popups = [];

    trackLength = 420 + tr.pieces.length * SEG_LEN + 600;

    tr.pieces.forEach((p, idx) => {
      const sx = 420 + idx * SEG_LEN;
      if (idx > 0 && idx % 3 === 0) {
        checkpoints.push({ x: sx + 40, reached: false });
      }
      if (p === 'boulders') {
        const radii = [36, 48, 42, 34];
        radii.forEach((r, k) => {
          const bx = sx + 140 + k * 66;
          obstacles.push({ kind: 'boulder', x: bx, y: baseTerrainHeight(bx), r });
        });
      } else if (p === 'logs') {
        [0, 1, 2].forEach((k) => {
          const lx = sx + 175 + k * 78;
          obstacles.push({ kind: 'log', x: lx, y: baseTerrainHeight(lx), r: 38 });
        });
      } else if (p === 'mud') {
        obstacles.push({ kind: 'mud', x: sx + 160, w: 220, lane: idx % 4 });
        obstacles.push({ kind: 'mud', x: sx + 310, w: 180, lane: (idx + 2) % 4 });
      } else if (p === 'cool') {
        obstacles.push({ kind: 'cool', x: sx + 220, lane: (idx * 2) % 4 });
        obstacles.push({ kind: 'cool', x: sx + 380, lane: (idx * 2 + 1) % 4 });
      }
      if (p === 'mega_ramp' || p === 'ramp' || p === 'tabletop') {
        obstacles.push({
          kind: 'star',
          x: sx + SEG_LEN * 0.5,
          y: baseTerrainHeight(sx + SEG_LEN * 0.5) - 190,
          collected: false
        });
      }
    });

    // Spawn AI Motocross Rivals in Stadium GP mode
    if (gameMode === 1) {
      const colors = ['#38bdf8', '#facc15', '#a855f7', '#22c55e'];
      for (let i = 0; i < 4; i++) {
        rivals.push({
          x: 320 + i * 95,
          y: 740,
          vx: 8.2 + i * 0.45,
          vy: 0,
          pitch: 0,
          lane: i,
          color: colors[i],
          crashed: 0
        });
      }
    }

    resetBike(false);
    showBanner(`${tr.code}: ${tr.name}`, 130);
  }

  function resetBike(fromCheckpoint) {
    bike.x = fromCheckpoint ? bike.checkpointX : 220;
    bike.y = getGroundY(bike.x) - 42;
    bike.vx = 0;
    bike.vy = 0;
    bike.pitch = 0;
    bike.omega = 0;
    bike.lane = 1;
    bike.laneY = 1.0;
    bike.onGround = true;
    bike.frontComp = 0;
    bike.rearComp = 0;
    bike.temp = 25;
    bike.overheated = 0;
    bike.crashed = 0;
    bike.airTime = 0;
    bike.airRotAccum = 0;
    bike.wheelieTicks = 0;
    if (!fromCheckpoint) {
      bike.score = 0;
      bike.flips = 0;
      bike.raceTime = 0;
      bike.checkpointX = 220;
    }
    cameraX = Math.max(0, bike.x - 420);
    cameraY = 0;
  }

  // Input Handling (Keyboard + Screen Gestures + Virtual Buttons + Gyro Tilt)
  const keys = {};
  const prevKeys = {};
  let touchMode = 'screen'; // 'screen' or 'buttons'
  let tiltEnabled = false;
  let tiltGamma = 0;

  const touchState = {
    gas: false,
    turbo: false,
    brake: false,
    left: false,
    right: false,
    up: false,
    down: false
  };

  window.addEventListener('keydown', (e) => {
    initAudio();
    keys[e.code] = true;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      e.preventDefault();
    }
    if (gameMode === 2) {
      // Builder hotkeys 1..0
      const numIdx = ['Digit1','Digit2','Digit3','Digit4','Digit5','Digit6','Digit7','Digit8','Digit9','Digit0'].indexOf(e.code);
      if (numIdx >= 0 && CUSTOM_TRACK.pieces.length < 18) {
        CUSTOM_TRACK.pieces.splice(CUSTOM_TRACK.pieces.length - 1, 0, BUILDER_PALETTE[numIdx].id);
        buildTrack();
        playSfx('cool');
      } else if (e.code === 'Backspace' && CUSTOM_TRACK.pieces.length > 3) {
        CUSTOM_TRACK.pieces.splice(CUSTOM_TRACK.pieces.length - 2, 1);
        buildTrack();
      }
    }
  });

  window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
  });

  // Direct Screen Touch Gestures & Canvas Clicks
  const activeTouches = new Map();
  canvas.addEventListener('pointerdown', (e) => {
    initAudio();
    const rect = canvas.getBoundingClientRect();
    const cx = ((e.clientX - rect.left) / rect.width) * W;
    const cy = ((e.clientY - rect.top) / rect.height) * H;

    // If on Title or Finished screen, start immediately
    if (gameState === 'title' || gameState === 'finished') {
      gameState = 'playing';
      resetBike(false);
      return;
    }

    // Track Builder Palette Clicks
    if (gameMode === 2 && cy > 115 && cy < 210) {
      const bIdx = Math.floor((cx - 120) / 168);
      if (bIdx >= 0 && bIdx < BUILDER_PALETTE.length && CUSTOM_TRACK.pieces.length < 18) {
        CUSTOM_TRACK.pieces.splice(CUSTOM_TRACK.pieces.length - 1, 0, BUILDER_PALETTE[bIdx].id);
        buildTrack();
        playSfx('cool');
        return;
      }
    }

    activeTouches.set(e.pointerId, { startX: cx, startY: cy, x: cx, y: cy });
    syncScreenGestures();
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!activeTouches.has(e.pointerId)) return;
    const rect = canvas.getBoundingClientRect();
    const t = activeTouches.get(e.pointerId);
    t.x = ((e.clientX - rect.left) / rect.width) * W;
    t.y = ((e.clientY - rect.top) / rect.height) * H;
    syncScreenGestures();
  });

  function endPointer(e) {
    activeTouches.delete(e.pointerId);
    syncScreenGestures();
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);

  function syncScreenGestures() {
    if (touchMode !== 'screen') return;
    touchState.gas = false;
    touchState.turbo = false;
    touchState.brake = false;
    touchState.left = false;
    touchState.right = false;
    touchState.up = false;
    touchState.down = false;

    for (const t of activeTouches.values()) {
      if (t.startX > W * 0.52) {
        // Right side: Gas / Turbo
        touchState.gas = true;
        if (t.y < H * 0.48) touchState.turbo = true;
      } else {
        // Left side thumbstick: Lean Left/Right & Lane Up/Down
        const dx = t.x - t.startX;
        const dy = t.y - t.startY;
        if (dx < -24) touchState.left = true;
        else if (dx > 24) touchState.right = true;
        if (dy < -28) touchState.up = true;
        else if (dy > 28) touchState.down = true;
      }
    }
  }

  // Virtual Arcade Buttons
  document.querySelectorAll('.tbtn').forEach((btn) => {
    const act = btn.getAttribute('data-act');
    const setAct = (v) => {
      touchState[act] = v;
      btn.classList.toggle('pressed', v);
    };
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      initAudio();
      if (gameState !== 'playing') gameState = 'playing';
      setAct(true);
    });
    btn.addEventListener('pointerup', () => setAct(false));
    btn.addEventListener('pointerleave', () => setAct(false));
    btn.addEventListener('pointercancel', () => setAct(false));
  });

  // Topbar UI Buttons
  function setMode(m) {
    gameMode = m;
    currentTrackIdx = 0;
    document.getElementById('btn-mode-trials').classList.toggle('active', m === 0);
    document.getElementById('btn-mode-stadium').classList.toggle('active', m === 1);
    document.getElementById('btn-mode-editor').classList.toggle('active', m === 2);
    gameState = 'playing';
    buildTrack();
  }

  document.getElementById('btn-mode-trials').addEventListener('click', () => setMode(0));
  document.getElementById('btn-mode-stadium').addEventListener('click', () => setMode(1));
  document.getElementById('btn-mode-editor').addEventListener('click', () => setMode(2));

  document.getElementById('btn-prev-track').addEventListener('click', () => {
    currentTrackIdx = (currentTrackIdx + 3) % 4;
    buildTrack();
  });
  document.getElementById('btn-next-track').addEventListener('click', () => {
    currentTrackIdx = (currentTrackIdx + 1) % 4;
    buildTrack();
  });

  const touchOverlay = document.getElementById('touch-overlay');
  const btnTouchMode = document.getElementById('btn-touch-mode');
  btnTouchMode.addEventListener('click', () => {
    touchMode = touchMode === 'screen' ? 'buttons' : 'screen';
    btnTouchMode.textContent = touchMode === 'screen' ? '📱 Touch: SCREEN' : '🕹️ Touch: BUTTONS';
    touchOverlay.classList.toggle('visible', touchMode === 'buttons');
  });

  const btnTilt = document.getElementById('btn-tilt');
  btnTilt.addEventListener('click', async () => {
    if (!tiltEnabled && typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const res = await DeviceOrientationEvent.requestPermission();
        if (res !== 'granted') return;
      } catch (e) {}
    }
    tiltEnabled = !tiltEnabled;
    btnTilt.textContent = tiltEnabled ? '📐 Tilt: ON' : '📐 Tilt: OFF';
    btnTilt.classList.toggle('active', tiltEnabled);
  });

  window.addEventListener('deviceorientation', (e) => {
    if (!tiltEnabled) return;
    const g = (window.innerWidth > window.innerHeight) ? (e.beta || 0) : (e.gamma || 0);
    tiltGamma = Math.max(-35, Math.min(35, g));
  });

  const btnMute = document.getElementById('btn-mute');
  btnMute.addEventListener('click', () => {
    audioMuted = !audioMuted;
    btnMute.textContent = audioMuted ? '🔇 Audio: OFF' : '🔊 Audio: ON';
  });

  document.getElementById('btn-fullscreen').addEventListener('click', () => {
    const wrap = document.getElementById('app-shell');
    if (!document.fullscreenElement) wrap.requestFullscreen?.();
    else document.exitFullscreen?.();
  });

  // Physics & Game Update
  function spawnDirtRoost(x, y, vx, color) {
    for (let i = 0; i < 2; i++) {
      particles.push({
        x,
        y,
        vx: vx - 2 - Math.random() * 4,
        vy: -2 - Math.random() * 4,
        r: 3 + Math.random() * 4,
        color,
        life: 24 + Math.random() * 14
      });
    }
  }

  function update() {
    globalTick++;
    if (bannerTimer > 0) bannerTimer--;

    const kGas   = keys['ArrowRight'] || keys['KeyD'] || keys['Space'] || touchState.gas;
    const kTurbo = keys['KeyZ'] || keys['ShiftLeft'] || keys['ShiftRight'] || keys['KeyX'] || touchState.turbo;
    const kBrake = keys['ArrowLeft'] || keys['KeyA'] || touchState.brake;
    const kLeanL = keys['ArrowUp'] || keys['KeyW'] || keys['KeyQ'] || touchState.left || (tiltEnabled && tiltGamma < -7);
    const kLeanR = keys['ArrowDown'] || keys['KeyS'] || keys['KeyE'] || touchState.right || (tiltEnabled && tiltGamma > 7);
    const kLaneUp   = (keys['ArrowUp'] && !prevKeys['ArrowUp']) || (keys['KeyW'] && !prevKeys['KeyW']) || touchState.up;
    const kLaneDown = (keys['ArrowDown'] && !prevKeys['ArrowDown']) || (keys['KeyS'] && !prevKeys['KeyS']) || touchState.down;

    if (keys['KeyR'] && !prevKeys['KeyR']) {
      gameState = 'playing';
      resetBike(true);
    }

    if (gameState === 'title' || gameState === 'finished') {
      updateEngineSound(0, false, false);
      if ((keys['Enter'] && !prevKeys['Enter']) || (keys['Space'] && !prevKeys['Space'])) {
        gameState = 'playing';
        resetBike(false);
      }
      return;
    }

    if (bike.crashed > 0) {
      updateEngineSound(0, false, false);
      bike.crashed--;
      if (bike.crashed === 0) {
        resetBike(true);
      }
      return;
    }

    bike.raceTime += 1 / 60;

    // Lane switching in Stadium Mode (or hybrid when on ground)
    if (gameMode === 1 && bike.onGround) {
      if (kLaneUp && bike.lane > 0) {
        bike.lane--;
        touchState.up = false;
      } else if (kLaneDown && bike.lane < 3) {
        bike.lane++;
        touchState.down = false;
      }
    }
    bike.laneY += (bike.lane - bike.laneY) * 0.18;

    // Engine Temperature & Turbo Boost
    let usingTurbo = kTurbo && bike.overheated === 0;
    if (bike.overheated > 0) {
      bike.overheated--;
      bike.temp = Math.max(30, bike.temp - 0.55);
    } else if (usingTurbo) {
      bike.temp = Math.min(100, bike.temp + 0.34);
      if (bike.temp >= 100) {
        bike.overheated = 135;
        showBanner('ENGINE OVERHEATED! HIT COOLING ARROWS!', 95);
        playSfx('crash');
      }
    } else {
      bike.temp = Math.max(22, bike.temp - 0.22);
    }

    // Two-Wheel Positions
    const wheelbase = 48;
    const cosP = Math.cos(bike.pitch);
    const sinP = Math.sin(bike.pitch);
    const rx = bike.x - cosP * wheelbase;
    const ry = bike.y - sinP * wheelbase;
    const fx = bike.x + cosP * wheelbase;
    const fy = bike.y + sinP * wheelbase;

    const gRear = getGroundY(rx) - 22;
    const gFront = getGroundY(fx) - 22;

    bike.rearContact = ry >= gRear - 6;
    bike.frontContact = fy >= gFront - 6;
    bike.onGround = bike.rearContact || bike.frontContact;

    // Suspension Spring Compression
    bike.rearComp = bike.rearContact ? Math.min(14, Math.max(0, ry - gRear + 6)) : bike.rearComp * 0.8;
    bike.frontComp = bike.frontContact ? Math.min(14, Math.max(0, fy - gFront + 6)) : bike.frontComp * 0.8;

    const slope = getSlopeAngle(bike.x);

    // Check Mud & Cooling Boost Arrows
    let inMud = false;
    for (let i = 0; i < obstacles.length; i++) {
      const ob = obstacles[i];
      if (ob.kind === 'mud' && Math.abs(bike.x - (ob.x + ob.w * 0.5)) < ob.w * 0.5) {
        if (gameMode !== 1 || ob.lane === bike.lane) {
          if (bike.onGround) inMud = true;
        }
      } else if (ob.kind === 'cool' && Math.abs(bike.x - ob.x) < 42) {
        if (gameMode !== 1 || ob.lane === bike.lane) {
          if (bike.temp > 25 || bike.overheated > 0) {
            bike.temp = 20;
            bike.overheated = 0;
            bike.vx = Math.max(bike.vx, 14.5);
            playSfx('cool');
            addPopup(bike.x, bike.y - 60, 'COOL BOOST!', '#38bdf8');
          }
        }
      } else if (ob.kind === 'star' && !ob.collected) {
        if (Math.hypot(bike.x - ob.x, bike.y - ob.y) < 62) {
          ob.collected = true;
          bike.score += 500;
          playSfx('stunt');
          addPopup(ob.x, ob.y, '+500 STAR RING!', '#facc15');
        }
      }
    }

    // Checkpoints
    checkpoints.forEach((cp) => {
      if (!cp.reached && bike.x >= cp.x) {
        cp.reached = true;
        bike.checkpointX = cp.x;
        playSfx('cool');
        addPopup(cp.x, bike.y - 70, 'CHECKPOINT!', '#4ade80');
      }
    });

    // Throttle, Brake, and Angular Torque
    const maxSpeed = bike.overheated > 0 ? 3.5 : (inMud ? 5.5 : (usingTurbo ? 16.5 : 12.2));
    const accel = usingTurbo ? 0.46 : 0.31;

    if (bike.onGround) {
      // Landing check
      if (bike.airTime > 18) {
        const diff = Math.abs(Math.atan2(Math.sin(bike.pitch - slope), Math.cos(bike.pitch - slope)));
        if (diff < 0.36) {
          bike.score += 500;
          bike.vx = Math.min(maxSpeed + 2.5, bike.vx + 1.6);
          addPopup(bike.x, bike.y - 65, '+500 PERFECT LANDING!', '#4ade80');
          playSfx('stunt');
        } else if (diff > 1.45) {
          // Rider landed upside down -> Crash!
          bike.crashed = 55;
          playSfx('crash');
          showBanner('WIPEOUT! PRESS R OR WAIT TO RESPAWN', 55);
          spawnDirtRoost(bike.x, bike.y, 0, '#ef4444');
          return;
        }
      }
      bike.airTime = 0;
      bike.airRotAccum = 0;

      if (kGas && bike.overheated === 0) {
        bike.vx += accel * Math.cos(slope);
        if (bike.vx > maxSpeed) bike.vx = maxSpeed;
        // Natural wheelie torque when gunning throttle
        if (usingTurbo && gameMode !== 1) bike.omega -= 0.0045;
        if (globalTick % 2 === 0) {
          spawnDirtRoost(rx - 14, ry + 16, bike.vx * 0.2, inMud ? '#451a03' : '#92400e');
        }
      } else if (kBrake) {
        bike.vx -= 0.35;
        if (bike.vx < -3.5) bike.vx = -3.5;
      } else {
        bike.vx *= inMud ? 0.88 : 0.975;
      }

      // Gravity along slope
      bike.vx += Math.sin(slope) * 0.22;

      // Align bike pitch toward terrain slope unless pulling a wheelie
      const targetPitch = slope;
      if (kLeanL) {
        bike.omega -= 0.014;
      } else if (kLeanR) {
        bike.omega += 0.014;
      } else {
        bike.omega += (targetPitch - bike.pitch) * 0.16;
      }
      bike.omega *= 0.80;
      bike.pitch += bike.omega;

      // Wheelie detection & bonus
      if (bike.rearContact && !bike.frontContact && bike.pitch < slope - 0.22 && bike.vx > 3) {
        bike.wheelieTicks++;
        if (bike.wheelieTicks % 45 === 0) {
          bike.score += 250;
          addPopup(bike.x, bike.y - 55, '+250 WHEELIE!', '#fb923c');
        }
      } else {
        bike.wheelieTicks = 0;
      }

      // Keep bike supported above terrain
      const gCenter = (gRear + gFront) * 0.5;
      if (bike.y > gCenter) {
        const launchSlope = getSlopeAngle(bike.x - 8);
        bike.y = gCenter;
        // Launch velocity if riding up a ramp
        if (launchSlope < -0.14 && bike.vx > 5.0) {
          bike.vy = Math.sin(launchSlope) * bike.vx * 1.18;
        } else {
          bike.vy = 0;
        }
      }
    } else {
      // Mid-Air Physics & Backflip / Frontflip Rotation
      bike.airTime++;
      bike.vy += 0.42; // gravity
      if (kLeanL) bike.omega -= 0.016;
      else if (kLeanR) bike.omega += 0.016;
      bike.omega *= 0.95;
      bike.pitch += bike.omega;
      bike.airRotAccum += bike.omega;

      // Full 360 Flip Detection!
      if (Math.abs(bike.airRotAccum) >= Math.PI * 1.85) {
        const isBackflip = bike.airRotAccum < 0;
        bike.flips++;
        bike.score += 1000;
        bike.airRotAccum = 0;
        playSfx('stunt');
        addPopup(bike.x, bike.y - 75, isBackflip ? '+1000 BACKFLIP!' : '+1000 FRONTFLIP!', '#facc15');
      }
    }

    bike.x += bike.vx;
    bike.y += bike.vy;
    bike.wheelRot += bike.vx * 0.08;

    // Rider Helmet Crash check if upside down on ground
    const headX = bike.x + Math.sin(bike.pitch) * 44;
    const headY = bike.y - Math.cos(bike.pitch) * 44;
    if (headY >= getGroundY(headX) - 6) {
      bike.crashed = 55;
      playSfx('crash');
      showBanner('RIDER DOWN! RESPAWNING AT CHECKPOINT...', 55);
      return;
    }

    // Update AI Rivals in Stadium Mode
    rivals.forEach((rv) => {
      if (rv.crashed > 0) {
        rv.crashed--;
        return;
      }
      rv.x += rv.vx;
      const gy = getGroundY(rv.x) - 22;
      if (rv.y < gy) {
        rv.vy += 0.40;
        rv.y += rv.vy;
      } else {
        rv.y = gy;
        rv.vy = 0;
        rv.pitch = getSlopeAngle(rv.x);
      }
      // Bike-to-Rival Collision in same lane
      if (Math.abs(bike.laneY - rv.lane) < 0.55 && Math.abs(bike.x - rv.x) < 58 && Math.abs(bike.y - rv.y) < 48) {
        if (bike.x >= rv.x) {
          // Player clipped rival with rear wheel!
          rv.crashed = 65;
          bike.score += 400;
          addPopup(rv.x, rv.y - 50, '+400 RIVAL TAKEDOWN!', '#f97316');
          playSfx('stunt');
        } else {
          bike.vx *= 0.55;
        }
      }
    });

    // Finish Gate check
    if (bike.x >= trackLength - 320) {
      gameState = 'finished';
      bike.score += 2500;
      playSfx('finish');
      showBanner('FINISH LINE CROSSED! TRACK COMPLETE!', 180);
    }

    // Smooth Look-Ahead Camera
    const targetCamX = Math.max(0, bike.x - 460 + bike.vx * 14);
    cameraX += (targetCamX - cameraX) * 0.14;
    const targetCamY = Math.min(0, (bike.y - 680) * 0.45);
    cameraY += (targetCamY - cameraY) * 0.12;

    // Particles & Popups
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.25;
      if (--p.life <= 0) particles.splice(i, 1);
    }
    for (let i = popups.length - 1; i >= 0; i--) {
      const pp = popups[i];
      pp.y -= 1.2;
      if (--pp.life <= 0) popups.splice(i, 1);
    }

    updateEngineSound(Math.min(1, Math.abs(bike.vx) / 14), usingTurbo, true);
  }

  // Drawing Helpers
  function drawBike(x, y, pitch, color, wheelRot, frontComp, rearComp, isTurbo, crashed) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(pitch + (crashed ? Math.sin(globalTick * 0.5) * 0.4 : 0));

    const wheelbase = 48;
    // Turbo Exhaust Flame
    if (isTurbo && !crashed) {
      const fl = 28 + Math.random() * 24;
      const grad = ctx.createLinearGradient(-34, -8, -34 - fl, -8);
      grad.addColorStop(0, '#38bdf8');
      grad.addColorStop(0.45, '#f97316');
      grad.addColorStop(1, 'rgba(239,68,68,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(-30, -14);
      ctx.lineTo(-34 - fl, -6);
      ctx.lineTo(-30, 0);
      ctx.closePath();
      ctx.fill();
    }

    // Wheels (with suspension compression offset)
    const drawWheel = (wx, wy) => {
      ctx.save();
      ctx.translate(wx, wy);
      ctx.rotate(wheelRot);
      // Knobby Tire
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(0, 0, 23, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#334155';
      ctx.stroke();
      // Rim & Spokes
      ctx.fillStyle = '#e2e8f0';
      ctx.beginPath();
      ctx.arc(0, 0, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 2;
      for (let s = 0; s < 4; s++) {
        const a = (s * Math.PI) / 4;
        ctx.beginPath();
        ctx.moveTo(-Math.cos(a) * 12, -Math.sin(a) * 12);
        ctx.lineTo(Math.cos(a) * 12, Math.sin(a) * 12);
        ctx.stroke();
      }
      ctx.restore();
    };

    const rWy = 12 - rearComp;
    const fWy = 12 - frontComp;
    drawWheel(-wheelbase, rWy);
    drawWheel(wheelbase, fWy);

    // Rear Swingarm & Golden Coil Spring
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(-10, -4);
    ctx.lineTo(-wheelbase, rWy);
    ctx.stroke();

    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-16, -18);
    ctx.lineTo(-30, rWy - 4);
    ctx.stroke();

    // Front Inverted Telescopic Forks
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(18, -28);
    ctx.lineTo(wheelbase, fWy);
    ctx.stroke();

    // Engine Block & Chrome Exhaust Pipe
    ctx.fillStyle = '#475569';
    ctx.beginPath();
    ctx.roundRect(-14, -18, 26, 20, 5);
    ctx.fill();
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(4, -8);
    ctx.lineTo(-34, -10);
    ctx.stroke();

    // Motocross Frame, Tank & Fenders
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-42, -22);
    ctx.lineTo(-8, -24);
    ctx.lineTo(22, -32);
    ctx.lineTo(44, -22);
    ctx.lineTo(14, -12);
    ctx.lineTo(-22, -12);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#0f172a';
    ctx.stroke();

    // Rider (Articulated Legs, Jersey, Arms, Helmet & Goggles)
    ctx.fillStyle = '#1e293b'; // Boots/Pants
    ctx.beginPath();
    ctx.roundRect(-18, -32, 12, 22, 5);
    ctx.fill();

    ctx.fillStyle = color; // Jersey
    ctx.beginPath();
    ctx.roundRect(-18, -54, 20, 25, 7);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Rider Arm reaching handlebars
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(-4, -46);
    ctx.lineTo(18, -30);
    ctx.stroke();

    // Motocross Helmet + Visor + Cyan Goggles
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.arc(-4, -66, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.roundRect(2, -70, 9, 7, 2);
    ctx.fill();

    ctx.restore();
  }

  function render() {
    const tr = activeTrackDef();

    // 1. Sky Gradient
    const skyGrad = ctx.createLinearGradient(0, 0, 0, H);
    skyGrad.addColorStop(0, tr.skyTop);
    skyGrad.addColorStop(1, tr.skyBot);
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, H);

    // Sun / Stadium Floodlights
    ctx.fillStyle = 'rgba(254, 240, 138, 0.22)';
    ctx.beginPath();
    ctx.arc(1540, 170, 130, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.arc(1540, 170, 58, 0, Math.PI * 2);
    ctx.fill();

    // 2. Parallax Mountains & Stadium Grandstands
    ctx.fillStyle = tr.hillFar;
    for (let i = -1; i < 6; i++) {
      const mx = i * 480 - ((cameraX * 0.18) % 480);
      ctx.beginPath();
      ctx.moveTo(mx, H);
      ctx.lineTo(mx + 240, 440);
      ctx.lineTo(mx + 480, H);
      ctx.closePath();
      ctx.fill();
    }

    ctx.fillStyle = tr.hillNear;
    for (let i = -1; i < 7; i++) {
      const nx = i * 380 - ((cameraX * 0.35) % 380);
      ctx.beginPath();
      ctx.arc(nx + 190, H - 140, 220, Math.PI, 0);
      ctx.fill();
    }

    ctx.save();
    ctx.translate(0, -cameraY);

    // 3. Terrain Heightmap Polygon + 4-Lane Stadium Lines
    ctx.fillStyle = tr.groundBody;
    ctx.beginPath();
    ctx.moveTo(0, H + 300);
    for (let sx = 0; sx <= W + 24; sx += 16) {
      const wx = sx + cameraX;
      ctx.lineTo(sx, baseTerrainHeight(wx));
    }
    ctx.lineTo(W, H + 300);
    ctx.closePath();
    ctx.fill();

    // Stadium 4-Lane Stripes
    if (gameMode === 1) {
      for (let l = 0; l < 4; l++) {
        ctx.strokeStyle = l % 2 === 0 ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.18)';
        ctx.lineWidth = 22;
        ctx.beginPath();
        for (let sx = 0; sx <= W + 24; sx += 24) {
          const wx = sx + cameraX;
          const gy = baseTerrainHeight(wx) + 12 + l * 28;
          if (sx === 0) ctx.moveTo(sx, gy);
          else ctx.lineTo(sx, gy);
        }
        ctx.stroke();
      }
    }

    // Lush Top Grass / Track Rim Crust
    ctx.strokeStyle = tr.groundTop;
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let sx = 0; sx <= W + 24; sx += 16) {
      const wx = sx + cameraX;
      const gy = baseTerrainHeight(wx);
      if (sx === 0) ctx.moveTo(sx, gy);
      else ctx.lineTo(sx, gy);
    }
    ctx.stroke();

    // 4. Obstacles: Boulders, Logs, Mud Puddles, Cooling Chevrons, Star Rings
    obstacles.forEach((ob) => {
      const sx = ob.x - cameraX;
      if (sx < -300 || sx > W + 300) return;

      if (ob.kind === 'boulder') {
        const grad = ctx.createRadialGradient(sx - ob.r * 0.3, ob.y - ob.r * 0.5, 4, sx, ob.y, ob.r);
        grad.addColorStop(0, '#94a3b8');
        grad.addColorStop(1, '#334155');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(sx, ob.y - ob.r * 0.15, ob.r, Math.PI, 0);
        ctx.closePath();
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#0f172a';
        ctx.stroke();
      } else if (ob.kind === 'log') {
        const ly = ob.y - ob.r * 0.45;
        ctx.fillStyle = '#78350f';
        ctx.beginPath();
        ctx.arc(sx, ly, ob.r * 0.85, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fde68a';
        ctx.beginPath();
        ctx.arc(sx, ly, ob.r * 0.62, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#92400e';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(sx, ly, ob.r * 0.35, 0, Math.PI * 2);
        ctx.stroke();
      } else if (ob.kind === 'mud') {
        const laneOff = gameMode === 1 ? ob.lane * 28 : 0;
        const my = baseTerrainHeight(ob.x) + laneOff;
        ctx.fillStyle = '#451a03';
        ctx.beginPath();
        ctx.roundRect(sx, my - 6, ob.w, 20, 8);
        ctx.fill();
      } else if (ob.kind === 'cool') {
        const laneOff = gameMode === 1 ? ob.lane * 28 : 0;
        const cy = baseTerrainHeight(ob.x) + laneOff;
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.roundRect(sx - 30, cy - 10, 60, 18, 6);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText('>>>', sx - 16, cy + 4);
      } else if (ob.kind === 'star' && !ob.collected) {
        const pulse = Math.sin(globalTick * 0.1) * 4;
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(sx, ob.y + pulse, 26, 0, Math.PI * 2);
        ctx.stroke();
      }
    });

    // Checkpoints & Finish Banner
    checkpoints.forEach((cp) => {
      const sx = cp.x - cameraX;
      const gy = baseTerrainHeight(cp.x);
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(sx, gy - 110, 6, 110);
      ctx.fillStyle = cp.reached ? '#22c55e' : '#f97316';
      ctx.beginPath();
      ctx.moveTo(sx + 6, gy - 110);
      ctx.lineTo(sx + 56, gy - 92);
      ctx.lineTo(sx + 6, gy - 74);
      ctx.closePath();
      ctx.fill();
    });

    const finX = trackLength - 320 - cameraX;
    if (finX > -200 && finX < W + 200) {
      const fgy = baseTerrainHeight(trackLength - 320);
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(finX, fgy - 180, 10, 180);
      ctx.fillStyle = '#facc15';
      ctx.fillRect(finX - 60, fgy - 180, 130, 36);
      ctx.fillStyle = '#0f172a';
      ctx.font = '900 20px sans-serif';
      ctx.fillText('FINISH', finX - 32, fgy - 155);
    }

    // 5. AI Rival Riders (Stadium Mode)
    rivals.forEach((rv) => {
      const sx = rv.x - cameraX;
      if (sx < -150 || sx > W + 150) return;
      const laneOff = rv.lane * 28;
      drawBike(sx, rv.y + laneOff, rv.pitch, rv.color, globalTick * 0.4, 2, 2, false, rv.crashed > 0);
    });

    // 6. Player Bike
    const pLaneOff = gameMode === 1 ? bike.laneY * 28 : 0;
    const isTurbo = (keys['KeyZ'] || keys['ShiftLeft'] || keys['ShiftRight'] || touchState.turbo) && bike.overheated === 0;
    drawBike(
      bike.x - cameraX,
      bike.y + pLaneOff,
      bike.pitch,
      tr.bikeColor,
      bike.wheelRot,
      bike.frontComp,
      bike.rearComp,
      isTurbo,
      bike.crashed > 0
    );

    // 7. Particles & Score Popups
    particles.forEach((p) => {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x - cameraX, p.y + pLaneOff, p.r, 0, Math.PI * 2);
      ctx.fill();
    });

    popups.forEach((pp) => {
      ctx.fillStyle = pp.color;
      ctx.font = '900 26px sans-serif';
      ctx.shadowColor = '#000';
      ctx.shadowBlur = 6;
      ctx.fillText(pp.text, pp.x - cameraX - 60, pp.y);
      ctx.shadowBlur = 0;
    });

    ctx.restore();

    // 8. Top HUD Bar (Speedometer, Engine Temp/Overheat Bar, Score, Flips, Time)
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.beginPath();
    ctx.roundRect(28, 18, W - 56, 76, 16);
    ctx.fill();
    ctx.strokeStyle = 'rgba(249, 115, 22, 0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();

    const mph = Math.round(Math.abs(bike.vx) * 6.5);
    ctx.fillStyle = '#facc15';
    ctx.font = '900 26px sans-serif';
    ctx.fillText(`${tr.code}: ${tr.name}`, 52, 54);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '700 16px sans-serif';
    ctx.fillText(
      gameMode === 0 ? 'MODE: TRIALS & STUNT OBSTACLES' : gameMode === 1 ? 'MODE: 4-LANE STADIUM MOTOCROSS' : 'MODE: CUSTOM TRACK BUILDER',
      52,
      78
    );

    ctx.fillStyle = '#f8fafc';
    ctx.font = '900 26px sans-serif';
    ctx.fillText(`SPEED: ${mph} MPH`, 610, 62);
    ctx.fillText(`SCORE: ${String(bike.score).padStart(6, '0')}`, 900, 62);
    ctx.fillStyle = '#4ade80';
    ctx.fillText(`FLIPS: ${bike.flips}`, 1210, 62);
    ctx.fillStyle = '#38bdf8';
    ctx.fillText(`TIME: ${bike.raceTime.toFixed(1)}s`, 1390, 62);

    // Engine Temp / Turbo Bar
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '800 15px sans-serif';
    ctx.fillText(bike.overheated > 0 ? '🔥 OVERHEATED!' : 'ENGINE TEMP (Z=TURBO)', 1610, 44);
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.roundRect(1610, 52, 245, 22, 8);
    ctx.fill();
    const tempCol = bike.temp > 80 ? '#ef4444' : bike.temp > 55 ? '#f97316' : '#22c55e';
    ctx.fillStyle = tempCol;
    ctx.beginPath();
    ctx.roundRect(1612, 54, Math.max(8, (bike.temp / 100) * 241), 18, 6);
    ctx.fill();

    // Track Builder Palette Bar (Mode 2)
    if (gameMode === 2) {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.beginPath();
      ctx.roundRect(96, 110, W - 192, 92, 14);
      ctx.fill();
      BUILDER_PALETTE.forEach((item, idx) => {
        const bx = 115 + idx * 168;
        ctx.fillStyle = '#1e293b';
        ctx.beginPath();
        ctx.roundRect(bx, 122, 156, 48, 8);
        ctx.fill();
        ctx.strokeStyle = '#f97316';
        ctx.stroke();
        ctx.fillStyle = '#f8fafc';
        ctx.font = '700 15px sans-serif';
        ctx.fillText(item.label, bx + 12, 151);
      });
      ctx.fillStyle = '#94a3b8';
      ctx.font = '700 15px sans-serif';
      ctx.fillText(
        `CLICK OR PRESS KEYS 1-0 TO ADD TRACK PIECE (${CUSTOM_TRACK.pieces.length} SEGMENTS)  |  BACKSPACE = REMOVE LAST  |  RIDE IMMEDIATELY BELOW!`,
        125,
        192
      );
    }

    // Banner Popup
    if (bannerTimer > 0) {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
      ctx.beginPath();
      ctx.roundRect(W * 0.5 - 380, 215, 760, 54, 14);
      ctx.fill();
      ctx.fillStyle = '#facc15';
      ctx.font = '900 26px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(bannerText, W * 0.5, 250);
      ctx.textAlign = 'left';
    }

    // Title / Finish Modal Card
    if (gameState === 'title' || gameState === 'finished') {
      ctx.fillStyle = 'rgba(9, 13, 22, 0.86)';
      ctx.beginPath();
      ctx.roundRect(W * 0.5 - 500, H * 0.5 - 230, 1000, 460, 24);
      ctx.fill();
      ctx.strokeStyle = '#f97316';
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.fillStyle = '#facc15';
      ctx.font = '900 54px sans-serif';
      ctx.fillText(
        gameState === 'finished' ? '🏆 TRACK COMPLETE! 🏆' : '🏍️ SUPER DIRT BIKE HD',
        W * 0.5,
        H * 0.5 - 140
      );

      ctx.fillStyle = '#38bdf8';
      ctx.font = '800 26px sans-serif';
      ctx.fillText(
        'PHYSICS TRIALS STUNT COURSES  +  4-LANE EXCITEBIKE STADIUM GP  +  TRACK BUILDER',
        W * 0.5,
        H * 0.5 - 82
      );

      ctx.fillStyle = '#e2e8f0';
      ctx.font = '700 22px sans-serif';
      ctx.fillText('GAS: Right Arrow / D / Space   |   TURBO BOOST: Z / Shift   |   BRAKE: Left / A', W * 0.5, H * 0.5 - 15);
      ctx.fillText('LEAN / BACKFLIP (Air) & LANE SWITCH (Stadium): Up / Down / W / S / Tilt', W * 0.5, H * 0.5 + 28);
      ctx.fillText('PULL BACKFLIPS (+1000), WHEELIES (+250) & SLOPE-MATCHED LANDINGS (+500)!', W * 0.5, H * 0.5 + 72);

      ctx.fillStyle = '#4ade80';
      ctx.font = '900 32px sans-serif';
      ctx.fillText('PRESS ENTER, SPACE, OR TAP SCREEN TO RIDE!', W * 0.5, H * 0.5 + 155);
      ctx.textAlign = 'left';
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
