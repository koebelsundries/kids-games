import * as THREE from "./vendor/three.module.min.js";

(function () {
  "use strict";

  const STORAGE = {
    easy: "goalburst-v1-easy",
    normal: "goalburst-v1-normal",
    hard: "goalburst-v1-hard",
    keeper: "goalburst-v1-keeper",
    muted: "goalburst-v1-muted",
    team: "goalburst-v1-team"
  };

  const TEAMS = [
    { id: "sparks", name: "Suncrest Sparks", short: "Sparks", primary: "#f4a015", secondary: "#fff4d0", accent: "#c45c08" },
    { id: "racers", name: "Riverwind Racers", short: "Racers", primary: "#2a6dff", secondary: "#e8f1ff", accent: "#0a2e8c" },
    { id: "foxes", name: "Meadow Foxes", short: "Foxes", primary: "#2f9a58", secondary: "#ffe1b0", accent: "#e07a20" },
    { id: "comets", name: "Cloudcap Comets", short: "Comets", primary: "#1aa7a1", secondary: "#f2f7ff", accent: "#0b4d59" },
    { id: "bears", name: "Berryhill Bears", short: "Bears", primary: "#9b2335", secondary: "#ffd56a", accent: "#5a0f1c" },
    { id: "dragons", name: "Dawnlight Dragons", short: "Dragons", primary: "#6b3fa0", secondary: "#ffd76a", accent: "#2a1048" }
  ];

  const KEEPER_KITS = [
    { primary: "#ff7ad9", secondary: "#fff0fa", accent: "#9b1a6a" },
    { primary: "#7CFF6B", secondary: "#f3ffe8", accent: "#1d6b18" },
    { primary: "#ffb347", secondary: "#fff3d0", accent: "#9a4b00" }
  ];

  const MODES = {
    easy: {
      id: "easy", name: "Little Kicker", role: "shoot",
      kicks: 5, goalScale: 1.28, reaction: 0.72, diveSpeed: 2.4,
      reach: 0.22, saveSkill: 0.05, wrongWay: 0.95, aimAssist: true,
      showPath: true, wind: false, sleepy: true, celebrate: true
    },
    normal: {
      id: "normal", name: "Normal Kick", role: "shoot",
      kicks: 5, goalScale: 1, reaction: 0.30, diveSpeed: 4.6,
      reach: 0.72, saveSkill: 0.55, wrongWay: 0.12, aimAssist: false,
      showPath: true, wind: false, sleepy: false, celebrate: false
    },
    hard: {
      id: "hard", name: "Hard Kick", role: "shoot",
      kicks: 5, goalScale: 1, reaction: 0.16, diveSpeed: 6.2,
      reach: 0.88, saveSkill: 0.82, wrongWay: 0.04, aimAssist: false,
      showPath: false, wind: true, sleepy: false, celebrate: false
    },
    keeper: {
      id: "keeper", name: "Be the Keeper", role: "keep",
      kicks: 5, goalScale: 1, reaction: 0, diveSpeed: 6.4,
      reach: 0.95, saveSkill: 1, wrongWay: 0, aimAssist: false,
      showPath: false, wind: false, sleepy: false, celebrate: false
    },
    two: {
      id: "two", name: "2-Player", role: "shoot",
      kicks: 5, goalScale: 1, reaction: 0.28, diveSpeed: 4.8,
      reach: 0.74, saveSkill: 0.52, wrongWay: 0.12, aimAssist: false,
      showPath: true, wind: false, sleepy: false, celebrate: false
    }
  };

  function storeGet(k, d) {
    try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; }
  }
  function storeSet(k, v) {
    try { localStorage.setItem(k, v); } catch (e) {}
  }
  function getHS(mode) { return parseInt(storeGet(STORAGE[mode], "0"), 10) || 0; }
  function setHS(mode, n) { storeSet(STORAGE[mode], String(n)); }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }

  const $ = (id) => document.getElementById(id);
  const canvas = $("c");
  const fxCanvas = $("fx");
  const fx = fxCanvas.getContext("2d");
  const menuEl = $("menu");
  const teamsEl = $("teams");
  const endEl = $("end");
  const passEl = $("pass");
  const pauseEl = $("pause");
  const hudEl = $("hud");
  const hintEl = $("hint");
  const toastEl = $("toast");
  const touchEl = $("touch");
  const powerWrap = $("powerWrap");
  const powerFill = $("powerFill");
  const muteBtns = [$("menuMute"), $("teamMute"), $("muteBtn")].filter(Boolean);

  let W = 0, H = 0, dpr = 1;
  let state = "menu";
  let prevState = "menu";
  let mode = MODES.normal;
  let teamA = TEAMS[0];
  let teamB = TEAMS[1];
  let pickSlot = "A";
  let kicksTaken = 0;
  let kicksMax = 5;
  let scoreA = 0;
  let scoreB = 0;
  let sudden = false;
  let turn = 0;
  let lastResult = "";
  let lastResultAt = 0;
  let resultHold = 0;
  let toastTimer = 0;
  let windX = 0;
  let paused = false;
  let fps = 0;
  let fpsAccum = 0;
  let fpsFrames = 0;
  let lastT = 0;
  let camMode = "kick";
  let shotId = 0;
  let pendingShot = null;

  const GOAL_W = 7.32, GOAL_H = 2.44, GOAL_D = 2.0;
  const SPOT_Z = 11;
  const KICKER_FACING = Math.PI; // face -z, toward the goal
  const KEEPER_FACING = 0;       // face +z, toward the field
  const BALL_R = 0.15;
  let goalW = GOAL_W, goalH = GOAL_H;

  const SFX = {
    ctx: null,
    master: null,
    musicTimer: null,
    muted: storeGet(STORAGE.muted, "0") === "1",
    step: 0,
    init: function () {
      if (this.ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.42;
      this.master.connect(this.ctx.destination);
    },
    unlock: function () {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === "suspended") this.ctx.resume();
    },
    setMuted: function (m) {
      this.muted = m;
      storeSet(STORAGE.muted, m ? "1" : "0");
      if (this.master) this.master.gain.value = m ? 0 : 0.42;
      updateMuteUI();
      if (!m) this.unlock();
    },
    envOsc: function (freq, dur, type, vol, startAt, slideTo) {
      if (!this.ctx || this.muted) return;
      const t = this.ctx.currentTime + (startAt || 0);
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type || "sine";
      o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + dur + 0.02);
    },
    noise: function (dur, vol, freq, type) {
      if (!this.ctx || this.muted) return;
      const t = this.ctx.currentTime;
      const n = this.ctx.createBuffer(1, Math.max(1, this.ctx.sampleRate * dur), this.ctx.sampleRate);
      const d = n.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const src = this.ctx.createBufferSource();
      src.buffer = n;
      const f = this.ctx.createBiquadFilter();
      f.type = type || "bandpass";
      f.frequency.value = freq || 800;
      f.Q.value = type === "lowpass" ? 0.7 : 0.6;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f); f.connect(g); g.connect(this.master);
      src.start(t); src.stop(t + dur + 0.02);
    },
    kick: function () {
      this.noise(0.12, 0.3, 220, "lowpass");
      this.envOsc(90, 0.12, "sine", 0.2, 0, 60);
    },
    whistle: function () {
      this.envOsc(1680, 0.18, "square", 0.07);
      this.envOsc(1760, 0.22, "sine", 0.08, 0.02);
    },
    goal: function () {
      this.cheer();
      this.crowd(1.4, 0.28);
      this.envOsc(523, 0.12, "triangle", 0.16);
      this.envOsc(659, 0.12, "triangle", 0.16, 0.1);
      this.envOsc(784, 0.12, "triangle", 0.18, 0.2);
      this.envOsc(1046, 0.28, "triangle", 0.2, 0.32);
    },
    save: function () {
      this.noise(0.16, 0.25, 400);
      this.envOsc(240, 0.16, "square", 0.12, 0, 110);
    },
    post: function () {
      this.envOsc(520, 0.08, "square", 0.14, 0, 280);
      this.noise(0.1, 0.16, 900);
    },
    miss: function () {
      this.envOsc(330, 0.16, "triangle", 0.12);
      this.envOsc(247, 0.22, "sine", 0.12, 0.12);
    },
    cheer: function () {
      this.envOsc(659, 0.1, "triangle", 0.14);
      this.envOsc(784, 0.1, "triangle", 0.14, 0.08);
      this.envOsc(988, 0.2, "triangle", 0.16, 0.16);
    },
    crowd: function (dur, vol) {
      this.noise(dur || 0.8, vol || 0.16, 500, "lowpass");
    },
    dive: function () {
      this.noise(0.14, 0.16, 180, "lowpass");
    },
    start: function () {
      this.whistle();
      this.envOsc(392, 0.1, "triangle", 0.12, 0.2);
      this.envOsc(523, 0.16, "triangle", 0.14, 0.3);
    },
    tickMusic: function () {
      if (!this.ctx || this.muted) return;
      if (state !== "ready" && state !== "kicking" && state !== "flight" && state !== "result") return;
      const scale = [392, 493.88, 587.33, 523.25, 392, 329.63, 493.88, 523.25];
      const f = scale[this.step % scale.length];
      this.step++;
      this.envOsc(f, 0.32, "sine", 0.035);
      this.envOsc(f / 2, 0.4, "triangle", 0.025);
    }
  };

  function updateMuteUI() {
    const label = SFX.muted ? "🔇" : "🔊";
    muteBtns.forEach(function (b) {
      b.textContent = label;
      b.setAttribute("aria-label", SFX.muted ? "Unmute" : "Mute");
    });
  }

  function startMusic() {
    stopMusic();
    SFX.step = 0;
    SFX.musicTimer = setInterval(function () { SFX.tickMusic(); }, 480);
  }
  function stopMusic() {
    if (SFX.musicTimer) { clearInterval(SFX.musicTimer); SFX.musicTimer = null; }
  }


  let renderer, scene, camera, dirLight;
  let fieldMat, crowdMat, netMat;
  let ballMesh, kicker, goalie, stadium;
  let goalGroup, posts = [];
  let flags = [];
  let pathLine, pathGeom;
  let blobBall, blobKick, blobKeep;
  let webglOk = false;

  const ball = {
    x: 0, y: BALL_R, z: SPOT_Z,
    vx: 0, vy: 0, vz: 0,
    wx: 0, wy: 0, wz: 0,
    flying: false, settled: true
  };

  const kickerAnim = { t: 0, kicking: false, side: 1, walk: 0 };
  const goalieAnim = {
    x: 0, y: 0, z: 0.55,
    tx: 0, ty: 0,
    dive: 0, side: 0, height: 0,
    decided: false, decideIn: 0,
    pose: "idle", t: 0, sleepy: 0, center: false
  };

  const aim = {
    down: false, id: null,
    sx: 0, sy: 0, st: 0,
    x: 0, y: 0,
    pts: [],
    power: 0, curve: 0, dirX: 0, dirY: 0, dove: false
  };

  let confetti = [];
  const clockDummy = { t: 0 };

  function colorMat(color, opts) {
    const o = Object.assign({ color: color }, opts || {});
    delete o.castShadow;
    delete o.receiveShadow;
    return new THREE.MeshLambertMaterial(o);
  }

  function makeCanvas(w, h, draw) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const g = c.getContext("2d");
    draw(g, w, h);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return tex;
  }

  function fieldTexture() {
    return makeCanvas(1024, 1024, function (g, w, h) {
      g.fillStyle = "#3fa84a";
      g.fillRect(0, 0, w, h);
      const stripes = 14;
      for (let i = 0; i < stripes; i++) {
        if (i % 2 === 0) {
          g.fillStyle = "#4bb856";
          g.fillRect(0, (i / stripes) * h, w, h / stripes);
        }
      }
    });
  }

  function ballTexture() {
    return makeCanvas(256, 256, function (g, w, h) {
      g.fillStyle = "#f6f6f6";
      g.fillRect(0, 0, w, h);
      g.strokeStyle = "#1a1a1a";
      g.lineWidth = 7;
      g.fillStyle = "#1a1a1a";
      g.beginPath();
      g.arc(w / 2, h / 2, 28, 0, Math.PI * 2);
      g.fill();
      const pts = 5;
      for (let i = 0; i < pts; i++) {
        const a = (i / pts) * Math.PI * 2 - Math.PI / 2;
        const x = w / 2 + Math.cos(a) * 78;
        const y = h / 2 + Math.sin(a) * 78;
        g.beginPath();
        g.arc(x, y, 22, 0, Math.PI * 2);
        g.fill();
        g.beginPath();
        g.moveTo(w / 2 + Math.cos(a) * 28, h / 2 + Math.sin(a) * 28);
        g.lineTo(x, y);
        g.stroke();
      }
    });
  }

  function crowdTexture() {
    return makeCanvas(512, 256, function (g, w, h) {
      g.fillStyle = "#3a3a46";
      g.fillRect(0, 0, w, h);
      const colors = ["#f4a015", "#2a6dff", "#2f9a58", "#9b2335", "#6b3fa0", "#1aa7a1", "#fff4d0", "#ff7ad9", "#1d3557"];
      for (let i = 0; i < 1800; i++) {
        const x = Math.random() * w;
        const y = Math.random() * h;
        const s = 2 + Math.random() * 3;
        g.fillStyle = colors[(Math.random() * colors.length) | 0];
        g.fillRect(x, y, s, s + 1);
      }
    });
  }

  function netTexture() {
    return makeCanvas(256, 256, function (g, w, h) {
      g.clearRect(0, 0, w, h);
      g.strokeStyle = "rgba(255,255,255,0.72)";
      g.lineWidth = 2;
      const step = 16;
      for (let x = 0; x <= w; x += step) {
        g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke();
      }
      for (let y = 0; y <= h; y += step) {
        g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
      }
    });
  }

  function skyTexture() {
    return makeCanvas(8, 64, function (g, w, h) {
      const grd = g.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, "#4aa4e8");
      grd.addColorStop(0.55, "#9ad4ff");
      grd.addColorStop(1, "#fff1c4");
      g.fillStyle = grd;
      g.fillRect(0, 0, w, h);
    });
  }

  function bannerTexture(text, bg, fg) {
    return makeCanvas(512, 64, function (g, w, h) {
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      g.fillStyle = fg;
      g.font = "700 28px Trebuchet MS, sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      const t = (text + "    ·    ").repeat(4);
      g.fillText(t, w / 2, h / 2 + 1);
    });
  }

  function addBox(parent, w, h, d, color, x, y, z, opts) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), colorMat(color, opts));
    mesh.position.set(x, y, z);
    mesh.castShadow = !opts || opts.castShadow !== false;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  function addBallBlob() {
    const mat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false });
    const m = new THREE.Mesh(new THREE.CircleGeometry(1, 20), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.02;
    scene.add(m);
    return m;
  }

  function makePerson(kit, kind) {
    const root = new THREE.Group();
    const hip = new THREE.Group();
    hip.position.y = 0.62;
    root.add(hip);
    root.userData.hip = hip;

    const torso = addBox(hip, 0.38, 0.48, 0.24, kit.primary, 0, 0.34, 0);
    torso.userData.part = "torso";
    addBox(hip, 0.4, 0.1, 0.26, kit.secondary, 0, 0.14, 0);
    if (kind !== "keeper") {
      addBox(hip, 0.12, 0.28, 0.02, kit.secondary, 0, 0.34, 0.12);
    }

    const head = new THREE.Group();
    head.position.set(0, 0.68, 0);
    hip.add(head);
    root.userData.head = head;
    const skin = "#f0c7a0";
    const hd = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), colorMat(skin));
    hd.castShadow = true;
    head.add(hd);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.165, 12, 10), colorMat(kit.accent));
    hair.scale.set(1.05, 0.7, 1.05);
    hair.position.y = 0.07;
    hair.castShadow = true;
    head.add(hair);
    const eyeM = colorMat("#1a1a1a");
    const eL = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), eyeM);
    const eR = eL.clone();
    eL.position.set(-0.05, 0.02, 0.14);
    eR.position.set(0.05, 0.02, 0.14);
    head.add(eL); head.add(eR);
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.01, 6, 10, Math.PI), colorMat("#c25a4a"));
    smile.position.set(0, -0.05, 0.14);
    smile.rotation.set(0, 0, Math.PI);
    head.add(smile);

    function makeArm(side) {
      const arm = new THREE.Group();
      arm.position.set(side * 0.24, 0.48, 0);
      hip.add(arm);
      const col = kind === "keeper" ? kit.secondary : skin;
      addBox(arm, 0.1, 0.28, 0.1, col, 0, -0.14, 0);
      const low = new THREE.Group();
      low.position.set(0, -0.28, 0);
      arm.add(low);
      addBox(low, 0.09, 0.26, 0.09, col, 0, -0.13, 0);
      addBox(low, 0.12, 0.1, 0.12, kind === "keeper" ? "#f4f4f4" : skin, 0, -0.28, 0);
      return { arm, low };
    }
    const arms = { L: makeArm(-1), R: makeArm(1) };
    root.userData.arms = arms;

    function makeLeg(side) {
      const leg = new THREE.Group();
      leg.position.set(side * 0.11, 0, 0);
      hip.add(leg);
      addBox(leg, 0.14, 0.32, 0.16, kit.accent, 0, -0.16, 0);
      const shin = new THREE.Group();
      shin.position.set(0, -0.32, 0);
      leg.add(shin);
      addBox(shin, 0.13, 0.3, 0.14, kit.secondary, 0, -0.15, 0);
      addBox(shin, 0.14, 0.08, 0.24, "#222", 0, -0.34, 0.04);
      return { leg, shin };
    }
    root.userData.legs = { L: makeLeg(-1), R: makeLeg(1) };

    if (kind === "keeper") {
      arms.L.low.children[arms.L.low.children.length - 1].scale.set(1.4, 1.2, 1.3);
      arms.R.low.children[arms.R.low.children.length - 1].scale.set(1.4, 1.2, 1.3);
    }
    root.castShadow = true;
    return root;
  }


  function setGoalSize(scale) {
    goalW = GOAL_W * scale;
    goalH = GOAL_H * Math.min(1.18, scale);
    rebuildGoal();
  }

  function rebuildGoal() {
    if (goalGroup) scene.remove(goalGroup);
    goalGroup = new THREE.Group();
    const postMat = colorMat("#f4f4f4");
    posts = [];
    function post(x, y, z, w, h, d) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), postMat);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      goalGroup.add(m);
      posts.push(m);
      return m;
    }
    const postR = 0.07;
    post(-goalW / 2, goalH / 2, 0, postR * 2, goalH, postR * 2);
    post(goalW / 2, goalH / 2, 0, postR * 2, goalH, postR * 2);
    post(0, goalH, 0, goalW + postR * 2, postR * 2, postR * 2);
    post(-goalW / 2, goalH / 2, -GOAL_D, postR * 1.4, goalH, postR * 1.4);
    post(goalW / 2, goalH / 2, -GOAL_D, postR * 1.4, goalH, postR * 1.4);
    post(0, goalH, -GOAL_D, goalW, postR * 1.4, postR * 1.4);
    post(-goalW / 2, postR, -GOAL_D / 2, postR * 1.4, postR * 1.4, GOAL_D);
    post(goalW / 2, postR, -GOAL_D / 2, postR * 1.4, postR * 1.4, GOAL_D);

    netMat = new THREE.MeshBasicMaterial({
      map: netTexture(),
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    netMat.map.wrapS = netMat.map.wrapT = THREE.RepeatWrapping;
    netMat.map.repeat.set(goalW * 1.6, goalH * 1.6);

    const back = new THREE.Mesh(new THREE.PlaneGeometry(goalW, goalH), netMat);
    back.position.set(0, goalH / 2, -GOAL_D);
    goalGroup.add(back);
    const sideL = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_D, goalH), netMat);
    sideL.position.set(-goalW / 2, goalH / 2, -GOAL_D / 2);
    sideL.rotation.y = Math.PI / 2;
    goalGroup.add(sideL);
    const sideR = sideL.clone();
    sideR.position.x = goalW / 2;
    goalGroup.add(sideR);
    const top = new THREE.Mesh(new THREE.PlaneGeometry(goalW, GOAL_D), netMat);
    top.position.set(0, goalH, -GOAL_D / 2);
    top.rotation.x = Math.PI / 2;
    goalGroup.add(top);

    const stringMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 });
    for (let i = -3; i <= 3; i++) {
      const x = (i / 3) * (goalW / 2 - 0.05);
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x, goalH, 0),
        new THREE.Vector3(x * 0.95, goalH * 0.55, -GOAL_D * 0.55),
        new THREE.Vector3(x, 0.05, -GOAL_D)
      ]);
      goalGroup.add(new THREE.Line(geo, stringMat));
    }
    scene.add(goalGroup);
  }

  function makeLineRect(x, z, w, d, y) {
    const g = new THREE.Group();
    const mat = colorMat("#f5f5f5", { castShadow: false });
    const t = 0.08;
    const a = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, t), mat);
    a.position.set(x, y, z - d / 2);
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, t), mat);
    b.position.set(x, y, z + d / 2);
    const c = new THREE.Mesh(new THREE.BoxGeometry(t, 0.02, d), mat);
    c.position.set(x - w / 2, y, z);
    const e = new THREE.Mesh(new THREE.BoxGeometry(t, 0.02, d), mat);
    e.position.set(x + w / 2, y, z);
    g.add(a, b, c, e);
    return g;
  }

  function buildStadium() {
    stadium = new THREE.Group();
    const tex = fieldTexture();
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(8, 10);
    fieldMat = new THREE.MeshLambertMaterial({ map: tex });
    const field = new THREE.Mesh(new THREE.PlaneGeometry(70, 90), fieldMat);
    field.rotation.x = -Math.PI / 2;
    field.position.set(0, 0, 18);
    field.receiveShadow = true;
    stadium.add(field);

    const rim = new THREE.Mesh(new THREE.PlaneGeometry(80, 100), colorMat("#5a9a4a"));
    rim.rotation.x = -Math.PI / 2;
    rim.position.set(0, -0.02, 18);
    rim.receiveShadow = true;
    stadium.add(rim);

    const lines = new THREE.Group();
    lines.position.y = 0.015;
    lines.add(makeLineRect(0, 16.5 / 2, 40.32, 16.5, 0));
    lines.add(makeLineRect(0, 5.5 / 2, 18.32, 5.5, 0));
    const gl = new THREE.Mesh(new THREE.BoxGeometry(54, 0.02, 0.08), colorMat("#f5f5f5"));
    gl.position.set(0, 0, 0);
    lines.add(gl);
    const sl = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 70), colorMat("#f5f5f5"));
    const sl2 = sl.clone();
    sl.position.set(-27, 0, 20);
    sl2.position.set(27, 0, 20);
    lines.add(sl, sl2);
    const spot = new THREE.Mesh(new THREE.CircleGeometry(0.15, 16), colorMat("#f5f5f5"));
    spot.rotation.x = -Math.PI / 2;
    spot.position.set(0, 0.01, SPOT_Z);
    lines.add(spot);
    const arc = new THREE.Mesh(new THREE.TorusGeometry(9.15, 0.04, 8, 32, Math.PI * 0.7), colorMat("#f5f5f5"));
    arc.rotation.x = Math.PI / 2;
    arc.rotation.z = Math.PI + Math.PI * 0.15;
    arc.position.set(0, 0.01, SPOT_Z);
    lines.add(arc);
    stadium.add(lines);

    crowdMat = new THREE.MeshLambertMaterial({ map: crowdTexture() });
    function stand(x, z, w, d, h, rotY) {
      const g = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), colorMat("#c9c4b8"));
      base.position.y = h / 2;
      base.castShadow = true;
      base.receiveShadow = true;
      g.add(base);
      const seats = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.96, h * 0.82), crowdMat);
      seats.position.set(0, h * 0.55, d / 2 + 0.02);
      g.add(seats);
      g.position.set(x, 0, z);
      g.rotation.y = rotY || 0;
      stadium.add(g);
    }
    stand(0, -10.5, 48, 8, 10, 0);
    stand(-32, 16, 52, 8, 9, Math.PI / 2);
    stand(32, 16, 52, 8, 9, -Math.PI / 2);

    function banner(x, y, z, rotY, text, bg, fg) {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(16, 1.1),
        new THREE.MeshLambertMaterial({ map: bannerTexture(text, bg, fg) })
      );
      m.position.set(x, y, z);
      m.rotation.y = rotY;
      stadium.add(m);
    }
    banner(0, 7.2, -6.4, 0, "GOALBURST", "#1d6b3a", "#fff4c8");
    banner(-27.8, 6.4, 12, Math.PI / 2, "SUNCREST VALE", "#1d3557", "#fff4c8");
    banner(27.8, 6.4, 12, -Math.PI / 2, "KOEBEL KIDS GAMES", "#7c3aed", "#fff4c8");

    function lightPost(x, z) {
      const p = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 12, 8), colorMat("#eeeeee"));
      pole.position.y = 6;
      pole.castShadow = true;
      p.add(pole);
      addBox(p, 2.2, 0.4, 0.8, "#f0f0e0", 0, 12.1, 0);
      p.position.set(x, 0, z);
      stadium.add(p);
    }
    lightPost(-24, -6);
    lightPost(24, -6);
    lightPost(-24, 28);
    lightPost(24, 28);

    function flagAt(x, z, color) {
      const g = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.5, 6), colorMat("#f4f4f4"));
      pole.position.y = 0.75;
      g.add(pole);
      const fl = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.32), colorMat(color, { side: THREE.DoubleSide }));
      fl.position.set(0.25, 1.32, 0);
      g.add(fl);
      g.position.set(x, 0, z);
      stadium.add(g);
      flags.push(fl);
    }
    flagAt(-27, 0, "#f4a015");
    flagAt(27, 0, "#2a6dff");

    const cloudMat = new THREE.MeshLambertMaterial({ color: "#ffffff" });
    for (let i = 0; i < 6; i++) {
      const c = new THREE.Mesh(new THREE.SphereGeometry(2.2 + Math.random(), 8, 6), cloudMat);
      c.scale.set(1.6, 0.45, 1);
      c.position.set(rand(-40, 40), rand(16, 22), rand(-30, 40));
      stadium.add(c);
    }
    scene.add(stadium);
  }

  function placeBlob(blob, x, z, scale) {
    if (!blob) return;
    blob.position.x = x;
    blob.position.z = z;
    blob.scale.setScalar(scale);
  }

  function initThree() {
    try {
      renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        antialias: false,
        alpha: false,
        preserveDrawingBuffer: true,
        powerPreference: "high-performance"
      });
    } catch (err) {
      webglOk = false;
      $("nowebgl").style.display = "flex";
      return false;
    }
    if (!renderer.getContext()) {
      webglOk = false;
      $("nowebgl").style.display = "flex";
      return false;
    }
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.setClearColor(0x8fd3ff, 1);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x8fd3ff);
    scene.fog = new THREE.Fog(0xbfe6ff, 45, 95);

    camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
    camera.position.set(0, 1.9, 15.4);
    camera.lookAt(0, 1.15, 2.8);

    scene.add(new THREE.HemisphereLight(0xcfeaff, 0x4d7a3a, 0.72));
    scene.add(new THREE.AmbientLight(0xfff2d8, 0.22));
    dirLight = new THREE.DirectionalLight(0xfff0d0, 1.15);
    dirLight.position.set(-14, 22, 10);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(1024, 1024);
    dirLight.shadow.camera.near = 2;
    dirLight.shadow.camera.far = 60;
    dirLight.shadow.camera.left = -22;
    dirLight.shadow.camera.right = 22;
    dirLight.shadow.camera.top = 22;
    dirLight.shadow.camera.bottom = -10;
    dirLight.shadow.bias = -0.0008;
    scene.add(dirLight);
    scene.add(dirLight.target);
    dirLight.target.position.set(0, 0, 6);

    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(120, 16, 12),
      new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false, depthWrite: false })
    );
    scene.add(sky);

    buildStadium();
    rebuildGoal();

    ballMesh = new THREE.Mesh(
      new THREE.SphereGeometry(BALL_R, 16, 12),
      new THREE.MeshPhongMaterial({ map: ballTexture(), shininess: 40, specular: 0x444444 })
    );
    ballMesh.castShadow = true;
    scene.add(ballMesh);

    blobBall = addBallBlob();
    blobKick = addBallBlob();
    blobKeep = addBallBlob();

    kicker = makePerson(TEAMS[0], "kicker");
    scene.add(kicker);
    goalie = makePerson(KEEPER_KITS[0], "keeper");
    scene.add(goalie);

    const pathMat = new THREE.LineDashedMaterial({
      color: 0xfff2a0, dashSize: 0.28, gapSize: 0.16, transparent: true, opacity: 0.85
    });
    pathGeom = new THREE.BufferGeometry();
    pathLine = new THREE.Line(pathGeom, pathMat);
    pathLine.visible = false;
    scene.add(pathLine);

    webglOk = true;
    resize();
    resetPlayers();
    return true;
  }

  let keepKit = KEEPER_KITS[0];
  function setPeopleKits() {
    if (kicker) scene.remove(kicker);
    if (goalie) scene.remove(goalie);
    const shooter = mode.role === "keep"
      ? teamB
      : (mode.id === "two" ? (turn === 0 ? teamA : teamB) : teamA);
    kicker = makePerson(shooter, "kicker");
    goalie = makePerson(keepKit, "keeper");
    scene.add(kicker);
    scene.add(goalie);
    resetPlayers();
  }

  function resetPlayers() {
    kicker.position.set(-1.15, 0, SPOT_Z + 1.55);
    // Models are built with the face on local +z. The goal sits at z=0 and the
    // spot at z=+11, so the kicker turns around (PI) to face the goal and the
    // keeper keeps rotation 0 to face out toward the field and the kicker.
    kicker.rotation.set(0, KICKER_FACING, 0);
    kicker.scale.setScalar(1);
    const sleepySide = mode.sleepy ? pick([-1, 1]) * rand(1.6, 2.4) : 0;
    goalie.position.set(sleepySide, 0, 0.62);
    goalie.rotation.set(0, KEEPER_FACING, 0);
    goalie.scale.setScalar(1.05);
    goalieAnim.x = sleepySide;
    kickerAnim.t = 0;
    kickerAnim.kicking = false;
    goalieAnim.y = 0;
    goalieAnim.z = 0.62;
    goalieAnim.tx = 0;
    goalieAnim.ty = 0;
    goalieAnim.dive = 0;
    goalieAnim.side = 0;
    goalieAnim.center = false;
    goalieAnim.height = 0;
    if (diveMarker) diveMarker.visible = false;
    goalieAnim.decided = false;
    goalieAnim.decideIn = 0;
    goalieAnim.pose = "idle";
    goalieAnim.t = 0;
    resetBall();
    poseIdle(kicker, 0, false);
    poseIdle(goalie, 0, mode.sleepy);
  }

  function resetBall() {
    ball.x = 0;
    ball.y = BALL_R;
    ball.z = SPOT_Z;
    ball.vx = ball.vy = ball.vz = 0;
    ball.wx = ball.wy = ball.wz = 0;
    ball.flying = false;
    ball.settled = true;
    syncBallMesh();
  }

  function syncBallMesh() {
    if (!ballMesh) return;
    ballMesh.position.set(ball.x, ball.y, ball.z);
    if (ball.flying) {
      ballMesh.rotation.x += ball.wx * 0.016;
      ballMesh.rotation.y += ball.wy * 0.016;
      ballMesh.rotation.z += ball.wz * 0.016;
    }
    placeBlob(blobBall, ball.x, ball.z, clamp(0.32 + ball.y * 0.35, 0.28, 0.8));
    if (kicker) placeBlob(blobKick, kicker.position.x, kicker.position.z, 0.55);
    if (goalie) placeBlob(blobKeep, goalie.position.x, goalie.position.z, 0.6 + goalieAnim.dive * 0.35);
  }


  function poseIdle(person, t, sleepy) {
    const ud = person.userData;
    const breath = Math.sin(t * 2.2) * 0.015;
    ud.hip.position.y = 0.62 + breath;
    ud.hip.rotation.y = 0;
    ud.head.rotation.x = sleepy ? 0.35 + Math.sin(t * 1.1) * 0.08 : Math.sin(t * 1.4) * 0.04;
    ud.head.rotation.z = sleepy ? Math.sin(t * 0.7) * 0.1 : 0;
    ud.arms.L.arm.rotation.x = sleepy ? 0.4 : 0.15 + Math.sin(t * 2.2) * 0.05;
    ud.arms.R.arm.rotation.x = sleepy ? 0.4 : 0.15 + Math.sin(t * 2.2 + 1) * 0.05;
    ud.arms.L.arm.rotation.z = sleepy ? -0.08 : -0.18;
    ud.arms.R.arm.rotation.z = sleepy ? 0.08 : 0.18;
    ud.arms.L.low.rotation.x = sleepy ? 0.3 : 0.25;
    ud.arms.R.low.rotation.x = sleepy ? 0.3 : 0.25;
    ud.legs.L.leg.rotation.x = 0;
    ud.legs.R.leg.rotation.x = 0;
    ud.legs.L.shin.rotation.x = 0;
    ud.legs.R.shin.rotation.x = 0;
    person.rotation.x = 0;
    person.rotation.z = 0;
  }

  function poseKick(person, k) {
    const ud = person.userData;
    const plant = k < 0.55 ? k / 0.55 : 1;
    const swing = k < 0.55 ? lerp(0.6, -0.15, k / 0.55) : lerp(-0.15, -1.35, (k - 0.55) / 0.45);
    ud.hip.position.y = 0.62;
    ud.hip.rotation.y = -0.15;
    ud.head.rotation.x = -0.1;
    // Facing the goal, the model's "L" limbs (local -x) sit on the ball side,
    // so "L" is the kicking leg and the opposite ("R") arm swings forward.
    ud.arms.R.arm.rotation.x = -0.4;
    ud.arms.L.arm.rotation.x = 0.5;
    ud.arms.R.arm.rotation.z = 0.6;
    ud.arms.L.arm.rotation.z = -0.7;
    ud.legs.R.leg.rotation.x = 0.15;
    ud.legs.R.shin.rotation.x = 0;
    ud.legs.L.leg.rotation.x = swing;
    ud.legs.L.shin.rotation.x = k < 0.55 ? 0.8 : lerp(0.8, 0.1, (k - 0.55) / 0.45);
    person.position.z = SPOT_Z + 1.55 - plant * 1.25;
    person.position.x = -1.15 + plant * 0.95;
  }

  function poseDive(person, anim) {
    const ud = person.userData;
    const k = clamp(anim.dive, 0, 1);
    const side = anim.side === 0 && anim.center ? 0 : (anim.side || Math.sign(anim.tx) || 1);
    person.position.x = anim.x;
    person.position.y = anim.y;
    person.position.z = anim.z;
    person.rotation.x = 0;
    person.rotation.y = KEEPER_FACING;
    person.rotation.z = -side * k * 1.05;
    ud.hip.position.y = 0.62;
    ud.head.rotation.x = -0.15;
    ud.head.rotation.z = 0;
    ud.arms.L.arm.rotation.z = side === 0 ? -0.5 - k * 0.6 : -1.2 * (side < 0 ? 1.9 : 0.6);
    ud.arms.R.arm.rotation.z = side === 0 ? 0.5 + k * 0.6 : 1.2 * (side > 0 ? 1.9 : 0.6);
    ud.arms.L.arm.rotation.x = -0.3 - k * 0.3;
    ud.arms.R.arm.rotation.x = -0.3 - k * 0.3;
    ud.arms.L.low.rotation.x = 0.1;
    ud.arms.R.low.rotation.x = 0.1;
    ud.legs.L.leg.rotation.x = 0.4;
    ud.legs.R.leg.rotation.x = 0.2;
  }

  function poseKeeperReady(person, t) {
    const ud = person.userData;
    ud.hip.position.y = 0.55 + Math.sin(t * 3) * 0.02;
    ud.head.rotation.x = -0.05;
    ud.head.rotation.z = 0;
    ud.arms.L.arm.rotation.x = -0.35;
    ud.arms.R.arm.rotation.x = -0.35;
    ud.arms.L.arm.rotation.z = -0.75;
    ud.arms.R.arm.rotation.z = 0.75;
    ud.legs.L.leg.rotation.x = 0.35;
    ud.legs.R.leg.rotation.x = 0.35;
    ud.legs.L.shin.rotation.x = 0.5;
    ud.legs.R.shin.rotation.x = 0.5;
    person.rotation.z = 0;
    person.rotation.x = 0;
  }

  const cam = { x: 0, y: 1.9, z: 15.4, lx: 0, ly: 1.15, lz: 2.8, fov: 38 };

  function desiredCamera() {
    const aspect = W / Math.max(1, H);
    const portrait = aspect < 0.85;
    if (camMode === "keep") {
      // Raised view from behind the net that shows BOTH posts, the keeper and
      // the striker, so kids can see every shot and tap anywhere in the goal.
      return portrait
        ? { x: 0, y: 8.5, z: -6.3, lx: 0, ly: 0.5, lz: 4.2, fov: 84 }
        : { x: 0, y: 4.2, z: -6.2, lx: 0, ly: 0.8, lz: 6, fov: 50 };
    }
    if (portrait) return { x: 0.2, y: 2.45, z: 16.8, lx: 0, ly: 1.15, lz: 2.5, fov: 72 };
    return { x: 0.2, y: 2.05, z: 16.0, lx: 0, ly: 1.25, lz: 2.2, fov: 34 };
  }

  function snapCamera() {
    Object.assign(cam, desiredCamera());
    applyCam();
  }

  let freezeCam = null;
  function applyCam() {
    if (!camera) return;
    const c = freezeCam || cam;
    camera.position.set(c.x, c.y, c.z);
    camera.lookAt(c.lx, c.ly, c.lz);
    camera.fov = c.fov;
    camera.updateProjectionMatrix();
  }

  function updateCamera(dt) {
    const d = desiredCamera();
    if (state === "flight" && camMode !== "keep") {
      d.lx = lerp(d.lx, ball.x, 0.45);
      d.ly = lerp(d.ly, clamp(ball.y, 0.6, 2.4), 0.4);
      d.lz = lerp(d.lz, clamp(ball.z, 0.5, 9), 0.35);
    }
    const k = 1 - Math.pow(0.001, dt);
    cam.x = lerp(cam.x, d.x, k);
    cam.y = lerp(cam.y, d.y, k);
    cam.z = lerp(cam.z, d.z, k);
    cam.lx = lerp(cam.lx, d.lx, k);
    cam.ly = lerp(cam.ly, d.ly, k);
    cam.lz = lerp(cam.lz, d.lz, k);
    cam.fov = lerp(cam.fov, d.fov, k);
    applyCam();
  }

  function predictPath(vx, vy, vz, wx, wy, wz, wind) {
    const pts = [];
    let x = 0, y = BALL_R, z = SPOT_Z;
    let vxx = vx, vyy = vy, vzz = vz;
    pts.push(new THREE.Vector3(x, y, z));
    for (let i = 0; i < 90; i++) {
      const h = 0.02;
      const mag = 0.085;
      vxx += (wy * vzz - wz * vyy) * mag * h;
      vyy += (wz * vxx - wx * vzz) * mag * h;
      vzz += (wx * vyy - wy * vxx) * mag * h;
      vxx += wind * 0.7 * h;
      vyy -= 9.8 * h;
      x += vxx * h; y += vyy * h; z += vzz * h;
      if (y < BALL_R) { y = BALL_R; vyy *= -0.35; vxx *= 0.8; vzz *= 0.8; }
      pts.push(new THREE.Vector3(x, y, z));
      if (z < -4 || y > 8) break;
    }
    return pts;
  }

  function showPath(vx, vy, vz, wx, wy, wz) {
    if (!mode.showPath) { pathLine.visible = false; return; }
    const pts = predictPath(vx, vy, vz, wx, wy, wz, 0);
    pathGeom.setFromPoints(pts);
    if (pathLine.computeLineDistances) pathLine.computeLineDistances();
    pathLine.visible = true;
  }

  function shotFromSwipe(power, dirX, dirY, curve) {
    let aimX = clamp(dirX, -1.35, 1.35);
    let aimY = clamp(dirY, -0.1, 1.3);
    let pwr = clamp(power, 0.12, 1);
    let crv = clamp(curve, -1, 1);
    if (mode.aimAssist) {
      aimX = clamp(aimX, -0.78, 0.78);
      if (Math.abs(aimX) < 0.18) aimX = pick([-1, 1]) * rand(0.28, 0.62);
      aimY = clamp(aimY, 0.22, 0.72);
      pwr = Math.max(pwr, 0.68);
      crv *= 0.3;
    }
    const top = mode.aimAssist ? goalH * 0.78 : goalH + 1.15;
    const targetX = aimX * (goalW / 2 + (mode.aimAssist ? -0.25 : 0.55));
    const targetY = lerp(0.28, top, clamp(aimY, 0, 1));
    const dx = targetX;
    const dy = targetY - BALL_R;
    const dz = 0 - SPOT_Z;
    const dist = Math.hypot(dx, dy, dz);
    const speed = lerp(14, 30.5, pwr);
    const vx = (dx / dist) * speed;
    const vy = (dy / dist) * speed + lerp(0.6, 2.4, pwr);
    const vz = (dz / dist) * speed;
    const wy = crv * 28;
    const wx = -lerp(6, 14, pwr);
    const wz = crv * -6;
    return { vx, vy, vz, wx, wy, wz, power: pwr, curve: crv };
  }

  function launchBall(shot) {
    ball.vx = shot.vx; ball.vy = shot.vy; ball.vz = shot.vz;
    ball.wx = shot.wx; ball.wy = shot.wy; ball.wz = shot.wz;
    ball.flying = true;
    ball.settled = false;
    ball.x = 0; ball.y = BALL_R; ball.z = SPOT_Z;
    pathLine.visible = false;
    SFX.kick();
    shotId++;
  }

  function keeperBlocks(hx, hy) {
    const diving = goalieAnim.dive > 0.15;
    const kx = goalie.position.x;
    const ky = 0.7 + goalie.position.y + (diving ? goalieAnim.height * 0.6 : 0.15);
    const dx = hx - kx;
    const dy = hy - ky;
    if (mode.id === "easy") {
      const reach = diving ? 0.38 : 0.22;
      return Math.hypot(dx, dy * 1.15) < reach && (diving || Math.abs(dx) < 0.2);
    }
    const reachX = (diving ? mode.reach * 1.55 : mode.reach * 0.85) + 0.25;
    const reachY = (diving ? 0.7 + goalieAnim.height * 0.5 : 0.85) + 0.2;
    const rx = reachX + (diving ? 0.45 : 0);
    const ry = reachY;
    return (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1;
  }

  function stepBall(dt) {
    if (!ball.flying) return null;
    const steps = Math.max(1, Math.ceil(dt / 0.008));
    const h = dt / steps;
    let event = null;
    for (let i = 0; i < steps; i++) {
      const px = ball.x, py = ball.y, pz = ball.z;
      const mag = 0.085;
      ball.vx += (ball.wy * ball.vz - ball.wz * ball.vy) * mag * h;
      ball.vy += (ball.wz * ball.vx - ball.wx * ball.vz) * mag * h;
      ball.vz += (ball.wx * ball.vy - ball.wy * ball.vx) * mag * h;
      if (mode.wind) ball.vx += windX * 0.7 * h;
      ball.vy -= 9.8 * h;
      ball.x += ball.vx * h;
      ball.y += ball.vy * h;
      ball.z += ball.vz * h;

      if (ball.y < BALL_R) {
        ball.y = BALL_R;
        if (Math.abs(ball.vy) > 0.6) {
          ball.vy *= -0.38;
          ball.vx *= 0.78;
          ball.vz *= 0.78;
        } else {
          ball.vy = 0;
          ball.vx *= 0.9;
          ball.vz *= 0.9;
        }
      }

      const half = goalW / 2;
      const pr = 0.09 + BALL_R;
      if (ball.z <= pr && ball.z >= -0.2 && pz > pr) {
        if (Math.abs(ball.x - (-half)) < pr && ball.y <= goalH + pr) {
          ball.x = -half - pr * Math.sign(ball.x + half || -1);
          ball.vx *= -0.45;
          SFX.post();
          event = event || "post";
        } else if (Math.abs(ball.x - half) < pr && ball.y <= goalH + pr) {
          ball.x = half + pr;
          ball.vx *= -0.45;
          SFX.post();
          event = event || "post";
        } else if (ball.y >= goalH - pr && ball.y <= goalH + pr && Math.abs(ball.x) <= half + pr) {
          ball.y = goalH + pr;
          ball.vy = Math.abs(ball.vy) * 0.4;
          SFX.post();
          event = event || "post";
        }
      }

      if (pz > 0 && ball.z <= 0 && !event) {
        const t = pz / (pz - ball.z);
        const hx = lerp(px, ball.x, t);
        const hy = lerp(py, ball.y, t);
        const inX = Math.abs(hx) <= half - BALL_R * 0.15;
        const inY = hy >= BALL_R * 0.5 && hy <= goalH - BALL_R * 0.1;
        if (inX && inY) {
          if (keeperBlocks(hx, hy)) {
            event = "save";
            ball.vz = Math.abs(ball.vz) * 0.35;
            ball.vx += (hx - goalie.position.x) * 2;
            ball.vy = Math.abs(ball.vy) * 0.25 + 1.2;
            SFX.save();
          } else {
            event = "goal";
          }
        } else if (hy > goalH + 0.05) {
          event = "over";
        } else {
          event = "wide";
        }
      }

      if (event === "goal" && ball.z < -0.05) {
        ball.z = clamp(ball.z, -GOAL_D + BALL_R, -0.05);
        ball.x = clamp(ball.x, -half + BALL_R, half - BALL_R);
        ball.y = clamp(ball.y, BALL_R, goalH - BALL_R);
        ball.vx *= 0.7; ball.vy *= 0.6; ball.vz *= -0.15;
      }

      if (ball.z < -8 || Math.abs(ball.x) > 30 || (ball.y <= BALL_R + 0.01 && Math.hypot(ball.vx, ball.vz) < 0.4 && (event || Math.abs(ball.vy) < 0.05))) {
        ball.flying = false;
      }
    }
    return event;
  }

  function decideGoalie(shot) {
    if (mode.role === "keep") return;
    goalieAnim.decided = true;
    const pts = predictPath(shot.vx, shot.vy, shot.vz, shot.wx, shot.wy, shot.wz, mode.wind ? windX : 0);
    let hit = pts[pts.length - 1];
    for (let i = 0; i < pts.length; i++) {
      if (pts[i].z <= 0) { hit = pts[i]; break; }
    }
    let tx = hit.x, ty = hit.y;
    if (Math.random() < mode.wrongWay) {
      tx = -Math.sign(tx || 1) * rand(1.2, goalW / 2);
      ty = rand(0.3, 1.2);
    } else {
      const err = (1 - mode.saveSkill) * rand(0.4, 1.6);
      tx += rand(-err, err);
      ty += rand(-err * 0.4, err * 0.4);
      if (mode.id === "easy") { tx = pick([-1, 1]) * rand(1.8, goalW / 2 + 0.2); ty = rand(0.1, 0.5); }
    }
    tx = clamp(tx, -goalW / 2 - 0.4, goalW / 2 + 0.4);
    ty = clamp(ty, 0, goalH + 0.2);
    goalieAnim.tx = tx;
    goalieAnim.ty = ty;
    goalieAnim.side = Math.sign(tx) || pick([-1, 1]);
    goalieAnim.height = clamp(ty / goalH, 0, 1);
  }

  function moveDive(dt) {
    const speed = mode.diveSpeed;
    const tx = goalieAnim.tx;
    const ty = Math.max(0, goalieAnim.ty - 0.7);
    const k = 1 - Math.pow(0.02, dt * (speed / 4));
    goalieAnim.x = lerp(goalieAnim.x, tx, k);
    goalieAnim.y = lerp(goalieAnim.y, ty * 0.55, k);
    goalieAnim.dive = clamp(goalieAnim.dive + dt * 3.2, 0, 1);
    goalieAnim.pose = "dive";
  }

  function updateGoalie(dt) {
    goalieAnim.t += dt;
    if (mode.role === "keep") {
      if (goalieAnim.dive > 0 || goalieAnim.pose === "dive") {
        moveDive(dt);
        poseDive(goalie, goalieAnim);
      } else {
        poseKeeperReady(goalie, goalieAnim.t);
        goalie.position.set(goalieAnim.x, 0, goalieAnim.z);
      }
      return;
    }
    if (state === "flight" && !goalieAnim.decided) {
      goalieAnim.decideIn -= dt;
      if (goalieAnim.decideIn <= 0 && pendingShot) decideGoalie(pendingShot);
    }
    if (goalieAnim.decided) {
      goalieAnim.pose = "dive";
      moveDive(dt);
      poseDive(goalie, goalieAnim);
    } else {
      if (mode.sleepy) poseIdle(goalie, goalieAnim.t, true);
      else poseKeeperReady(goalie, goalieAnim.t);
      goalie.position.set(goalieAnim.x, 0, goalieAnim.z);
    }
  }

  function updateKicker(dt) {
    if (kickerAnim.kicking) {
      kickerAnim.t += dt / (mode.id === "easy" ? 0.28 : mode.role === "keep" ? 0.9 : 0.36);
      poseKick(kicker, clamp(kickerAnim.t, 0, 1));
      if (kickerAnim.t >= 0.55 && pendingShot && !ball.flying && state === "kicking") {
        launchBall(pendingShot);
        if (mode.role !== "keep") {
          goalieAnim.decideIn = mode.reaction;
          goalieAnim.decided = false;
        }
        state = "flight";
        setHint("");
      }
      if (kickerAnim.t >= 1) kickerAnim.kicking = false;
    } else if (state === "ready" || state === "result") {
      if (kicker.userData.hip) kicker.userData.hip.rotation.y = 0;
      poseIdle(kicker, clockDummy.t, false);
    }
  }


  function pathBow(pts) {
    if (pts.length < 3) return 0;
    const a = pts[0], b = pts[pts.length - 1];
    const vx = b.x - a.x, vy = b.y - a.y;
    const len = Math.hypot(vx, vy) || 1;
    let acc = 0, n = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const pt = pts[i];
      const signed = (vx * (pt.y - a.y) - vy * (pt.x - a.x)) / len;
      acc += signed;
      n++;
    }
    if (!n) return 0;
    return clamp(acc / n / 70, -1, 1);
  }

  function computeAim() {
    const dx = aim.x - aim.sx;
    const dy = aim.y - aim.sy;
    const dist = Math.hypot(dx, dy);
    const dt = Math.max(0.05, (performance.now() - aim.st) / 1000);
    const spd = dist / dt;
    const power = clamp(dist / (0.42 * Math.min(W, H)) * 0.58 + clamp(spd / 2400, 0, 1) * 0.42, 0, 1);
    const dirX = dx / (W * 0.32);
    const dirY = -dy / (H * 0.38);
    const curve = pathBow(aim.pts);
    aim.power = power; aim.curve = curve; aim.dirX = dirX; aim.dirY = dirY;
    return { power, dirX, dirY, curve, dist };
  }

  function onPointerDown(e) {
    if (paused || (state !== "ready" && !(state === "kicking" && mode.role === "keep") && !(state === "flight" && mode.role === "keep"))) return;
    if (aim.down) return;
    if (e.button !== undefined && e.button !== 0) return;
    SFX.unlock();
    aim.down = true;
    aim.id = e.pointerId;
    aim.sx = aim.x = e.clientX;
    aim.sy = aim.y = e.clientY;
    aim.st = performance.now();
    aim.pts = [{ x: e.clientX, y: e.clientY }];
    aim.dove = false;
    try { touchEl.setPointerCapture(e.pointerId); } catch (err) {}
    if (mode.role === "keep") {
      // React right away: the keeper heads for the spot you touched.
      keeperTap(e.clientX, e.clientY);
      return;
    }
    if (mode.role === "shoot" && state === "ready") {
      powerWrap.classList.add("show");
      powerFill.style.height = "0%";
    }
  }

  function onPointerMove(e) {
    if (!aim.down || (aim.id != null && e.pointerId !== aim.id)) return;
    aim.x = e.clientX; aim.y = e.clientY;
    const last = aim.pts[aim.pts.length - 1];
    if (!last || Math.hypot(e.clientX - last.x, e.clientY - last.y) > 6) {
      aim.pts.push({ x: e.clientX, y: e.clientY });
      if (aim.pts.length > 48) aim.pts.splice(0, aim.pts.length - 48);
    }
    if (mode.role === "keep") {
      if (Math.hypot(aim.x - aim.sx, aim.y - aim.sy) > 28) keeperSwipe();
      return;
    }
    if (mode.role === "shoot" && state === "ready") {
      const a = computeAim();
      powerFill.style.height = Math.round(a.power * 100) + "%";
      const shot = shotFromSwipe(a.power, a.dirX, a.dirY, a.curve);
      showPath(shot.vx, shot.vy, shot.vz, shot.wx, shot.wy, shot.wz);
    }
  }

  function onPointerUp(e) {
    if (!aim.down || (aim.id != null && e.pointerId !== aim.id)) return;
    aim.x = e.clientX; aim.y = e.clientY;
    aim.pts.push({ x: e.clientX, y: e.clientY });
    const a = computeAim();
    aim.down = false;
    aim.id = null;
    powerWrap.classList.remove("show");
    if (mode.role === "keep") {
      pathLine.visible = false;
      if (Math.hypot(aim.x - aim.sx, aim.y - aim.sy) > 28) keeperSwipe();
      return;
    }
    if (state !== "ready") { pathLine.visible = false; return; }
    if (a.dist < 28 && a.power < 0.12) {
      pathLine.visible = false;
      return;
    }
    beginKick(shotFromSwipe(a.power, a.dirX, a.dirY, a.curve));
  }

  // ---- Be the Keeper controls ----
  // Tap anywhere: the keeper dives to that spot in the goal.
  // Swipe: the keeper dives the way you swipe (left/right, up for high).
  // You can change your mind until the ball reaches the goal line.
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const tmpV = new THREE.Vector3();
  const keeperPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

  function canKeeperMove() {
    if (mode.role !== "keep") return false;
    if (state === "ready" || state === "kicking") return true;
    return state === "flight" && ball.z > 0.15;
  }

  function screenToGoal(sx, sy) {
    if (!camera) return null;
    ndc.set((sx / W) * 2 - 1, -(sy / H) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    keeperPlane.constant = 0; // the goal line, where the ball crosses
    const hit = raycaster.ray.intersectPlane(keeperPlane, tmpV);
    if (!hit) return null;
    return { x: hit.x, y: hit.y };
  }

  // +1 if moving right on screen means +x in the world, -1 if it is flipped
  // (it is flipped in the keeper camera, which looks out from behind the net).
  function screenRightSign() {
    if (!camera) return 1;
    const e = camera.matrixWorld.elements;
    return e[0] >= 0 ? 1 : -1;
  }

  function keeperDiveTo(x, y) {
    const maxX = goalW / 2 + 0.3;
    const tx = clamp(x, -maxX, maxX);
    const ty = clamp(y, 0.3, goalH + 0.1);
    const center = Math.abs(tx) < 0.55;
    goalieAnim.tx = center ? tx * 0.5 : tx;
    goalieAnim.ty = ty;
    goalieAnim.center = center;
    goalieAnim.side = center ? 0 : Math.sign(tx);
    goalieAnim.height = clamp(ty / goalH, 0, 1);
    goalieAnim.decided = true;
    if (goalieAnim.pose !== "dive") SFX.dive();
    goalieAnim.pose = "dive";
    showDiveMarker(goalieAnim.tx, ty);
  }

  function keeperTap(sx, sy) {
    if (!canKeeperMove()) return;
    const g = screenToGoal(sx, sy);
    if (!g) return;
    keeperDiveTo(g.x, g.y);
    aim.dove = true;
  }

  function keeperSwipe(a) {
    if (!canKeeperMove()) return;
    const dx = aim.x - aim.sx;
    const dy = aim.y - aim.sy;
    const horiz = Math.abs(dx) / Math.max(1, Math.abs(dx) + Math.abs(dy));
    const up = clamp(-dy / (H * 0.25), 0, 1);
    let x;
    if (horiz < 0.3) x = 0;
    else x = Math.sign(dx) * screenRightSign() * lerp(1.6, goalW / 2 + 0.2, clamp(Math.abs(dx) / (W * 0.3), 0, 1));
    const y = lerp(0.5, goalH, up);
    keeperDiveTo(x, y);
    aim.dove = true;
  }

  let diveMarker = null;
  let diveMarkerT = 0;
  function showDiveMarker(x, y) {
    if (!scene) return;
    if (!diveMarker) {
      diveMarker = new THREE.Mesh(
        new THREE.RingGeometry(0.22, 0.32, 24),
        new THREE.MeshBasicMaterial({ color: 0xfff27a, transparent: true, opacity: 0.9, depthTest: false, side: THREE.DoubleSide })
      );
      diveMarker.renderOrder = 10;
      scene.add(diveMarker);
    }
    diveMarker.position.set(x, clamp(y, 0.3, goalH), 0.05);
    diveMarker.visible = true;
    diveMarkerT = 0.9;
  }
  function updateDiveMarker(dt) {
    if (!diveMarker || !diveMarker.visible) return;
    diveMarkerT -= dt;
    diveMarker.material.opacity = clamp(diveMarkerT / 0.9, 0, 1) * 0.9;
    diveMarker.scale.setScalar(1 + (0.9 - diveMarkerT) * 0.6);
    if (diveMarkerT <= 0 || mode.role !== "keep") diveMarker.visible = false;
  }

  let keeperKickIn = 0;
  let keeperKickFor = -1;
  function updateKeeperKickoff(dt) {
    if (mode.role !== "keep" || state !== "ready" || keeperKickFor !== kicksTaken || keeperKickIn <= 0) return;
    keeperKickIn -= dt;
    if (keeperKickIn <= 0) {
      pendingShot = computerShot();
      kickerAnim.kicking = true;
      kickerAnim.t = 0;
      state = "kicking";
      setHint("Here it comes!");
    }
  }

  function beginKick(shot) {
    pendingShot = shot;
    kickerAnim.kicking = true;
    kickerAnim.t = 0;
    state = "kicking";
    if (pathLine) pathLine.visible = false;
    setHint("");
  }

  // The striker in Be the Keeper always aims at a real spot inside the goal
  // (low/mid/high, left/centre/right) at a kid-friendly speed that ramps up a
  // little each shot. The velocity is solved against the same flight model the
  // ball uses, so it really arrives where it was aimed.
  let lastShotSides = [];
  function computerShot() {
    const cols = [-0.78, -0.5, 0, 0.5, 0.78];
    const rows = [0.18, 0.45, 0.72];
    let col = pick(cols);
    const recent = lastShotSides.slice(-2);
    if (recent.length === 2 && recent[0] === recent[1] && Math.sign(col) === recent[0]) col = -col;
    lastShotSides.push(Math.sign(col));
    const row = pick(rows);
    const tx = col * (goalW / 2) + rand(-0.15, 0.15);
    const ty = lerp(0.35, goalH - 0.35, row) + rand(-0.1, 0.1);
    const ramp = Math.min(kicksTaken, 6) * 0.9;
    const speed = rand(15.5, 18) + ramp;
    const crv = rand(-0.25, 0.25);
    const wx = -3, wy = crv * 28, wz = crv * -6;
    const dz = 0 - SPOT_Z;
    const dist = Math.hypot(tx, ty - BALL_R, dz);
    const vz = (dz / dist) * speed;
    const tGuess = SPOT_Z / Math.abs(vz);
    let vx = tx / tGuess;
    let vy = (ty - BALL_R + 0.5 * 9.8 * tGuess * tGuess) / tGuess;
    // Same integrator as stepBall (minus ground bounces) to land on target.
    function crossAt(vx0, vy0) {
      let x = 0, y = BALL_R, z = SPOT_Z, a = vx0, b = vy0, c = vz;
      const h = 0.008;
      for (let i = 0; i < 600; i++) {
        const pz = z, px = x, py = y;
        a += (wy * c - wz * b) * 0.085 * h;
        b += (wz * a - wx * c) * 0.085 * h;
        c += (wx * b - wy * a) * 0.085 * h;
        b -= 9.8 * h;
        x += a * h; y += b * h; z += c * h;
        if (z <= 0) { const t = pz / (pz - z); return { x: lerp(px, x, t), y: lerp(py, y, t) }; }
      }
      return null;
    }
    for (let it = 0; it < 8; it++) {
      const hit = crossAt(vx, vy);
      if (!hit) break;
      vx += (tx - hit.x) / tGuess;
      vy += (ty - hit.y) / tGuess;
    }
    return { vx, vy, vz, wx, wy, wz, power: 0.5, curve: crv, aimX: tx, aimY: ty };
  }

  function updateHSLabels() {
    $("hs-easy").textContent = "Best " + getHS("easy") + "/5";
    $("hs-normal").textContent = "Best " + getHS("normal") + "/5";
    $("hs-hard").textContent = "Best " + getHS("hard") + "/5";
    $("hs-keeper").textContent = "Best " + getHS("keeper") + "/5";
  }

  function showOnly(el) {
    menuEl.style.display = "none";
    teamsEl.style.display = "none";
    endEl.style.display = "none";
    passEl.style.display = "none";
    pauseEl.style.display = "none";
    hudEl.style.display = "none";
    if (el === hudEl) hudEl.style.display = "flex";
    else if (el) el.style.display = "flex";
  }

  function showMenu() {
    state = "menu";
    paused = false;
    stopMusic();
    showOnly(menuEl);
    touchEl.classList.remove("active");
    setHint("");
    toastEl.classList.remove("show");
    if (pathLine) pathLine.visible = false;
    updateHSLabels();
    camMode = "kick";
    if (webglOk) { resetPlayers(); snapCamera(); }
  }

  function openTeams(modeId) {
    mode = MODES[modeId];
    pickSlot = "A";
    const saved = storeGet(STORAGE.team, "sparks");
    teamA = TEAMS.find(function (t) { return t.id === saved; }) || TEAMS[0];
    teamB = TEAMS.find(function (t) { return t.id !== teamA.id; }) || TEAMS[1];
    $("teamTitle").textContent = mode.id === "two" ? "Player 1, pick a team" : (mode.role === "keep" ? "Pick your keeper team" : "Pick your team");
    $("teamTag").textContent = mode.id === "two" ? "Then your sibling will pick theirs" : "Choose your colors";
    $("btn-start").textContent = mode.id === "two" ? "Next" : "Let's kick!";
    renderTeams();
    showOnly(teamsEl);
    state = "teams";
  }

  function renderTeams() {
    const grid = $("teamGrid");
    grid.innerHTML = "";
    const current = pickSlot === "A" ? teamA : teamB;
    TEAMS.forEach(function (t) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "team-btn" + (current.id === t.id ? " picked" : "");
      b.style.background = "linear-gradient(180deg, " + t.primary + ", " + t.accent + ")";
      b.innerHTML = '<span class="swatch" style="background:linear-gradient(90deg,' + t.primary + " 50%," + t.secondary + ' 50%)"></span><span class="tn">' + t.name + "</span>";
      b.addEventListener("click", function () {
        SFX.unlock();
        if (pickSlot === "A") { teamA = t; storeSet(STORAGE.team, t.id); }
        else teamB = t;
        renderTeams();
      });
      grid.appendChild(b);
    });
  }

  function confirmTeams() {
    if (mode.id === "two" && pickSlot === "A") {
      pickSlot = "B";
      if (teamB.id === teamA.id) teamB = TEAMS.find(function (t) { return t.id !== teamA.id; }) || TEAMS[1];
      $("teamTitle").textContent = "Player 2, pick a team";
      $("teamTag").textContent = "Pass the phone if you need to";
      $("btn-start").textContent = "Let's kick!";
      renderTeams();
      return;
    }
    startMatch();
  }

  function startMatch() {
    kicksTaken = 0;
    lastShotSides = [];
    kicksMax = mode.kicks;
    scoreA = 0;
    scoreB = 0;
    sudden = false;
    turn = 0;
    lastResult = "";
    paused = false;
    setGoalSize(mode.goalScale);
    camMode = mode.role === "keep" ? "keep" : "kick";
    keepKit = pick(KEEPER_KITS);
    setPeopleKits();
    rollWind();
    showOnly(hudEl);
    touchEl.classList.add("active");
    updateBoard();
    SFX.start();
    startMusic();
    snapCamera();
    if (mode.id === "two") showPass(true);
    else beginReady();
  }

  function currentShooter() {
    if (mode.id === "two") return turn === 0 ? teamA : teamB;
    return teamA;
  }

  function updateBoard() {
    if (mode.id === "two") {
      $("nameA").textContent = teamA.short;
      $("nameB").textContent = teamB.short;
      $("scoreA").textContent = String(scoreA);
      $("scoreB").textContent = String(scoreB);
      $("hudHs").textContent = sudden ? "Sudden death" : "";
    } else if (mode.role === "keep") {
      $("nameA").textContent = teamA.short;
      $("nameB").textContent = "Striker";
      $("scoreA").textContent = String(scoreA);
      $("scoreB").textContent = String(scoreB);
      $("hudHs").textContent = "Best " + getHS("keeper") + "/5";
    } else {
      $("nameA").textContent = teamA.short;
      $("nameB").textContent = "Goalie";
      $("scoreA").textContent = String(scoreA);
      $("scoreB").textContent = String(scoreB);
      $("hudHs").textContent = "Best " + getHS(mode.id) + "/5";
    }
    const k = Math.min(kicksTaken + 1, sudden ? 99 : kicksMax);
    $("kicksEl").textContent = sudden ? "Sudden death" : ((mode.role === "keep" ? "Shot " : "Kick ") + k + "/" + kicksMax);
    if (mode.wind) {
      $("windChip").classList.add("show");
      const arrows = windX > 3 ? "→→" : windX > 1 ? "→" : windX < -3 ? "←←" : windX < -1 ? "←" : "·";
      $("windArrow").textContent = arrows;
      $("windLabel").textContent = "Wind " + Math.abs(windX).toFixed(0);
    } else {
      $("windChip").classList.remove("show");
    }
  }

  function rollWind() {
    if (!mode.wind) { windX = 0; return; }
    windX = rand(-6.2, 6.2);
    if (Math.abs(windX) < 1.2) windX = pick([-1, 1]) * rand(2, 4);
  }

  function setHint(text) {
    if (!text) { hintEl.classList.remove("show"); hintEl.textContent = ""; return; }
    hintEl.textContent = text;
    hintEl.classList.add("show");
  }

  function showToast(text, kind, dur) {
    toastEl.textContent = text;
    toastEl.className = "show " + (kind || "");
    toastTimer = dur || 1.6;
  }

  function beginReady() {
    state = "ready";
    pendingShot = null;
    resetPlayers();
    setPeopleKits();
    rollWind();
    updateBoard();
    if (mode.role === "keep") {
      setHint(kicksTaken === 0 ? "Tap where to dive — or swipe left or right!" : "Get ready… tap or swipe to dive!");
      const myShot = kicksTaken;
      keeperKickIn = kicksTaken === 0 ? 2.4 : 1.6;
      keeperKickFor = myShot;
    } else {
      const who = mode.id === "two"
        ? currentShooter().short + ": swipe to shoot!"
        : (mode.id === "easy" ? "Swipe up to shoot! You can do it!" : "Swipe to shoot!");
      setHint(who);
    }
  }

  function resolveEvent(ev) {
    if (state !== "flight") return;
    if (!ev || ev === "post") return;
    lastResult = ev;
    lastResultAt = performance.now();
    state = "result";
    resultHold = ev === "goal" ? (mode.celebrate ? 2.6 : 2.0) : 1.7;
    const scored = ev === "goal";
    if (mode.role === "keep") {
      if (ev === "save") {
        scoreA += 1;
        showToast("SAVED!", "save", 1.7);
        SFX.cheer();
      } else if (scored) {
        scoreB += 1;
        showToast("Goal…", "miss", 1.5);
        SFX.miss();
      } else {
        scoreA += 1;
        showToast(ev === "over" ? "OVER the bar!" : "WIDE!", "save", 1.6);
        SFX.cheer();
      }
    } else {
      if (scored) {
        if (mode.id === "two") {
          if (turn === 0) scoreA += 1; else scoreB += 1;
        } else scoreA += 1;
        showToast(mode.id === "easy" ? "GOOOOOAL!\nYAY!" : "GOOOOOAL!", "goal", 2.1);
        SFX.goal();
        burstConfetti();
      } else if (ev === "save") {
        showToast("Saved!", "save", 1.6);
        SFX.miss();
      } else {
        showToast(ev === "over" ? "Over the bar!" : ev === "short" ? "A little short!" : "Just wide!", "miss", 1.6);
        SFX.miss();
      }
    }
    updateBoard();
    kicksTaken += 1;
    if (mode.id === "two") turn = 1 - turn;
  }

  function afterResult() {
    toastEl.classList.remove("show");
    const doneFive = !sudden && (mode.id === "two" ? (kicksTaken >= kicksMax * 2) : (kicksTaken >= kicksMax));
    if (mode.id === "two") {
      if (!sudden && kicksTaken >= kicksMax * 2) {
        if (scoreA === scoreB) {
          sudden = true;
          showToast("Sudden death!", "goal", 1.5);
          showPass(false);
          return;
        }
        endMatch();
        return;
      }
      if (sudden && kicksTaken % 2 === 0 && kicksTaken > 0) {
        if (scoreA !== scoreB) { endMatch(); return; }
      }
      showPass(false);
      return;
    }
    if (doneFive) endMatch();
    else beginReady();
  }

  function showPass(first) {
    state = "pass";
    touchEl.classList.remove("active");
    const who = currentShooter();
    $("passTitle").textContent = first ? "Pass the phone?" : "Pass the phone!";
    $("passSub").textContent = who.name + " are up";
    $("passHow").textContent = first
      ? (teamA.short + " kick first. Pass the phone if that's not you.")
      : (sudden ? "Sudden death — score, and hope they miss!" : "Hand it to " + who.name + ".");
    passEl.style.display = "flex";
    hudEl.style.display = "flex";
  }

  function dismissPass() {
    passEl.style.display = "none";
    touchEl.classList.add("active");
    beginReady();
  }

  function endMatch() {
    state = "end";
    stopMusic();
    touchEl.classList.remove("active");
    if (pathLine) pathLine.visible = false;
    showOnly(endEl);
    let title, detail, scoreLine;
    if (mode.id === "two") {
      if (scoreA > scoreB) title = teamA.short + " win!";
      else if (scoreB > scoreA) title = teamB.short + " win!";
      else title = "It's a tie!";
      scoreLine = scoreA + " – " + scoreB;
      detail = teamA.name + " " + scoreA + ", " + teamB.name + " " + scoreB + (sudden ? " in sudden death." : ".");
      $("endBestLine").style.display = "none";
    } else if (mode.role === "keep") {
      const n = scoreA;
      title = n >= 5 ? "Shutout hero!" : n >= 3 ? "What a keeper!" : n >= 1 ? "Nice dives!" : "Tough ones!";
      scoreLine = n + "/5 saves";
      const prev = getHS("keeper");
      if (n > prev) setHS("keeper", n);
      $("endBestLine").style.display = "";
      $("endBest").textContent = getHS("keeper") + "/5";
      detail = n > prev ? "New best! The crowd is roaring!" : (n >= 3 ? "The striker had a hard day." : "Try diving a little earlier next time.");
    } else {
      const n = scoreA;
      title = n >= 5 ? (mode.id === "easy" ? "SUPERSTAR!!" : "Perfect five!") : n >= 3 ? "Great kicking!" : n >= 1 ? "Nice shots!" : "So close!";
      scoreLine = n + "/5";
      const prev = getHS(mode.id);
      if (n > prev) setHS(mode.id, n);
      $("endBestLine").style.display = "";
      $("endBest").textContent = getHS(mode.id) + "/5";
      detail = n > prev ? "New high score! High fives all around!" : (mode.id === "easy" ? "Want to kick again?" : "Bend it, aim for the corners, and watch the keeper.");
    }
    $("endTitle").textContent = title;
    $("endScore").textContent = scoreLine;
    $("endDetail").textContent = detail;
    updateHSLabels();
  }

  function pauseGame() {
    if (state === "menu" || state === "teams" || state === "end" || state === "pass") return;
    if (paused) return;
    paused = true;
    prevState = state;
    state = "paused";
    pauseEl.style.display = "flex";
    $("pauseBtn").textContent = "▶";
  }

  function resumeGame() {
    if (!paused) return;
    paused = false;
    state = prevState;
    pauseEl.style.display = "none";
    $("pauseBtn").textContent = "❚❚";
  }


  function burstConfetti() {
    const colors = [teamA.primary, teamA.secondary, "#ffe08a", "#fff", "#ff6b6b", "#7ad0ff", teamA.accent];
    const n = mode.celebrate ? 140 : 90;
    for (let i = 0; i < n; i++) {
      confetti.push({
        x: rand(0, W),
        y: rand(-40, H * 0.2),
        vx: rand(-80, 80),
        vy: rand(80, 280),
        rot: rand(0, 6),
        vr: rand(-8, 8),
        w: rand(6, 12),
        h: rand(8, 16),
        color: pick(colors),
        life: rand(1.2, 2.4)
      });
    }
  }

  function stepConfetti(dt) {
    if (fxCanvas.width !== Math.round(W * dpr) || fxCanvas.height !== Math.round(H * dpr)) {
      fxCanvas.width = Math.round(W * dpr);
      fxCanvas.height = Math.round(H * dpr);
    }
    fx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fx.clearRect(0, 0, W, H);
    if (aim.down && aim.pts.length > 1 && (state === "ready" || (mode.role === "keep" && (state === "ready" || state === "kicking" || state === "flight")))) {
      fx.lineWidth = 5;
      fx.strokeStyle = "rgba(255,242,160,0.8)";
      fx.lineCap = "round";
      fx.beginPath();
      fx.moveTo(aim.pts[0].x, aim.pts[0].y);
      for (let i = 1; i < aim.pts.length; i++) fx.lineTo(aim.pts[i].x, aim.pts[i].y);
      fx.stroke();
    }
    for (let i = confetti.length - 1; i >= 0; i--) {
      const p = confetti[i];
      p.vy += 420 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      p.life -= dt;
      if (p.life <= 0 || p.y > H + 20) { confetti.splice(i, 1); continue; }
      fx.save();
      fx.translate(p.x, p.y);
      fx.rotate(p.rot);
      fx.globalAlpha = clamp(p.life * 1.2, 0, 1);
      fx.fillStyle = p.color;
      fx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      fx.restore();
    }
  }

  function bakeIcon() {
    const s = 192;
    const ic = document.createElement("canvas");
    ic.width = s; ic.height = s;
    const g = ic.getContext("2d");
    const grd = g.createLinearGradient(0, 0, 0, s);
    grd.addColorStop(0, "#4aa4e0");
    grd.addColorStop(1, "#2f9a58");
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
    g.fillStyle = "#3fa84a";
    g.fillRect(0, s * 0.58, s, s * 0.42);
    g.fillStyle = "#f6f6f6";
    g.beginPath(); g.arc(s / 2, s * 0.46, 46, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "#1a1a1a"; g.lineWidth = 5;
    g.beginPath(); g.arc(s / 2, s * 0.46, 46, 0, Math.PI * 2); g.stroke();
    g.fillStyle = "#1a1a1a";
    g.beginPath(); g.arc(s / 2, s * 0.46, 14, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "#fff"; g.lineWidth = 4;
    g.strokeRect(s / 2 - 34, s * 0.72, 68, 28);
    const url = ic.toDataURL("image/png");
    $("appleIcon").href = url;
    const fav = $("favicon");
    if (fav) fav.href = url;
    const manifest = {
      name: "Goalburst",
      short_name: "Goalburst",
      display: "standalone",
      orientation: "any",
      start_url: ".",
      scope: ".",
      background_color: "#1d6b3a",
      theme_color: "#1d6b3a",
      icons: [{ src: url, sizes: "192x192", type: "image/png", purpose: "any" }]
    };
    const blob = new Blob([JSON.stringify(manifest)], { type: "application/json" });
    $("manifestLink").href = URL.createObjectURL(blob);
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    W = Math.max(1, window.innerWidth);
    H = Math.max(1, window.innerHeight);
    if (!renderer) return;
    renderer.setPixelRatio(dpr);
    renderer.setSize(W, H, true);
    fxCanvas.width = Math.round(W * dpr);
    fxCanvas.height = Math.round(H * dpr);
    camera.aspect = W / H;
    if (dirLight && dirLight.shadow.mapSize.x !== 512) {
      dirLight.shadow.mapSize.set(512, 512);
      if (dirLight.shadow.map) {
        dirLight.shadow.map.dispose();
        dirLight.shadow.map = null;
      }
    }
    applyCam();
  }

  function frame(t) {
    requestAnimationFrame(frame);
    if (!lastT) lastT = t;
    let dt = (t - lastT) / 1000;
    lastT = t;
    if (dt > 0.08) dt = 0.08;
    clockDummy.t += dt;
    fpsAccum += dt;
    fpsFrames++;
    if (fpsAccum >= 0.5) {
      fps = fpsFrames / fpsAccum;
      fpsAccum = 0;
      fpsFrames = 0;
      if (renderer && renderer.shadowMap.enabled && fps > 0 && fps < 22 && clockDummy.t > 2) {
        renderer.shadowMap.enabled = false;
        if (dirLight) dirLight.castShadow = false;
      }
    }

    if (!webglOk) return;
    if (toastTimer > 0) {
      toastTimer -= dt;
      if (toastTimer <= 0) toastEl.classList.remove("show");
    }

    if (!paused && state !== "menu" && state !== "teams" && state !== "end" && state !== "pass" && state !== "paused") {
      flags.forEach(function (fl, i) {
        fl.rotation.y = Math.sin(clockDummy.t * 2.5 + i + windX) * (0.4 + Math.abs(windX) * 0.08);
      });
      updateKeeperKickoff(dt);
      updateKicker(dt);
      updateGoalie(dt);
      updateDiveMarker(dt);
      const ev = stepBall(dt);
      if (ev) resolveEvent(ev);
      if (state === "flight" && !ball.flying) {
        if (ball.z > 0.05) resolveEvent(Math.abs(ball.x) > goalW / 2 ? "wide" : "short");
        else resolveEvent("wide");
      }
      if (state === "result") {
        resultHold -= dt;
        if (resultHold <= 0) afterResult();
      }
      syncBallMesh();
      updateCamera(dt);
    } else if (webglOk && kicker && goalie) {
      poseIdle(kicker, clockDummy.t, false);
      if (mode.sleepy) poseIdle(goalie, clockDummy.t, true);
      else poseKeeperReady(goalie, clockDummy.t);
      flags.forEach(function (fl, i) {
        fl.rotation.y = Math.sin(clockDummy.t * 1.6 + i) * 0.35;
      });
      syncBallMesh();
      updateCamera(dt);
    }

    if (renderer && scene && camera) renderer.render(scene, camera);
    stepConfetti(dt);
  }

  function bind() {
    document.querySelectorAll("[data-mode]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        SFX.unlock();
        openTeams(btn.getAttribute("data-mode"));
      });
    });
    muteBtns.forEach(function (b) {
      b.addEventListener("click", function (e) {
        e.stopPropagation();
        SFX.unlock();
        SFX.setMuted(!SFX.muted);
      });
    });
    $("pauseBtn").addEventListener("click", function (e) {
      e.stopPropagation();
      if (paused) resumeGame(); else pauseGame();
    });
    $("btn-resume").addEventListener("click", resumeGame);
    $("btn-quit").addEventListener("click", function () { paused = false; pauseEl.style.display = "none"; showMenu(); });
    $("btn-again").addEventListener("click", function () { SFX.unlock(); startMatch(); });
    $("btn-menu").addEventListener("click", showMenu);
    $("btn-start").addEventListener("click", function () { SFX.unlock(); confirmTeams(); });
    $("btn-back").addEventListener("click", showMenu);
    $("btn-ready").addEventListener("click", function () { SFX.unlock(); dismissPass(); });

    touchEl.addEventListener("pointerdown", onPointerDown);
    touchEl.addEventListener("pointermove", onPointerMove);
    touchEl.addEventListener("pointerup", onPointerUp);
    touchEl.addEventListener("pointercancel", onPointerUp);
    touchEl.addEventListener("pointerdown", function (e) { e.preventDefault(); }, { passive: false });
    document.addEventListener("touchmove", function (e) { e.preventDefault(); }, { passive: false });
    document.addEventListener("gesturestart", function (e) { e.preventDefault(); });
    document.addEventListener("gesturechange", function (e) { e.preventDefault(); });
    document.addEventListener("dblclick", function (e) { e.preventDefault(); }, { passive: false });
    document.addEventListener("contextmenu", function (e) {
      if (state === "ready" || state === "kicking" || state === "flight") e.preventDefault();
    });
    let lastTouchEnd = 0;
    document.addEventListener("touchend", function (e) {
      const now = Date.now();
      if (now - lastTouchEnd < 300) e.preventDefault();
      lastTouchEnd = now;
    }, { passive: false });

    window.addEventListener("keydown", function (e) {
      if (e.code === "KeyM") SFX.setMuted(!SFX.muted);
      if (e.code === "Escape") {
        if (paused) resumeGame();
        else if (state !== "menu" && state !== "teams" && state !== "end") pauseGame();
      }
      if (e.code === "Space" && state === "ready" && mode.role === "shoot") {
        e.preventDefault();
        beginKick(shotFromSwipe(0.7, 0, 0.45, 0));
      }
    });

    document.addEventListener("visibilitychange", function () {
      if (document.hidden && state !== "menu" && state !== "teams" && state !== "end") pauseGame();
    });
    window.addEventListener("resize", resize);
    window.addEventListener("orientationchange", function () { setTimeout(resize, 120); });
  }

  function exportHooks() {
    window.__GOALBURST__ = {
      get state() { return state; },
      get mode() { return mode && mode.id; },
      get lastResult() { return lastResult; },
      get scoreA() { return scoreA; },
      get scoreB() { return scoreB; },
      get kicksTaken() { return kicksTaken; },
      get fps() { return fps; },
      get webgl() { return webglOk; },
      get windX() { return windX; },
      get team() { return teamA && teamA.id; },
      get flying() { return ball.flying; },
      get paused() { return paused; },
      get keeperX() { return goalie ? goalie.position.x : 0; },
      get keeperDive() { return goalieAnim.dive; },
      get keeperTarget() { return { x: goalieAnim.tx, y: goalieAnim.ty, decided: goalieAnim.decided }; },
      get ballPos() { return { x: ball.x, y: ball.y, z: ball.z }; },
      get shotAim() { return pendingShot ? { x: pendingShot.aimX, y: pendingShot.aimY } : null; },
      get hint() { return hintEl.textContent; },
      _debug: { THREE: THREE, get kicker() { return kicker; }, get goalie() { return goalie; }, get camera() { return camera; }, get cam() { return cam; }, setCamFreeze: function (c) { freezeCam = c; } }
    };
  }

  updateMuteUI();
  updateHSLabels();
  bakeIcon();
  bind();
  exportHooks();
  const ok = initThree();
  if (ok) {
    snapCamera();
    requestAnimationFrame(frame);
  }
})();
