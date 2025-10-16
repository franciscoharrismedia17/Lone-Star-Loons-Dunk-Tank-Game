// ==================== BILL BALL GAME — Build manual con controles independientes ====================
// Integración de AUDIO con p5.sound (sin cambiar lógica ni visuals).
// Requisitos cubiertos:
// ✅ Volúmenes y per-clip (AUDIO.master/music/sfx/per).
// ✅ Gate autoplay mobile (getAudioContext().resume() en primer input).
// ✅ MAINMUSIC loop en menú/juego; LEVELCOMPLETE con crossfade.
// ✅ Wind loop con fade-in/out según WIND_ACTIVE (y sin loops duplicados).
// ✅ SFX: BallThrow, SUCCESS, FAIL, ALMOST, SPLASH, Button (con antispam).
// ✅ Triggers insertados en puntos pedidos (comentados con // AUDIO: ...).

/* IMPORTANTE (HTML): asegurate de cargar p5.sound
<script src="https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.9.4/p5.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.9.4/addons/p5.sound.min.js"></script>
*/

// ============= AUDIO CONFIG (Editar aquí para ajustar volúmenes globalmente) =============
const AUDIO = {
  master: 0.9,   // multiplicador global
  music:  0.7,   // música (MAINMUSIC, LEVELCOMPLETE)
  sfx:    0.9,   // efectos (throw, wind, hits, botones)
  per: {         // overrides por clip (opcional)
    BallThrow: 1.0,
    Wind: 0.5,
    MAINMUSIC: 0.8,
    LEVELCOMPLETE: 1.0,
    FAIL: 0.9,
    ALMOST: 0.9,
    SPLASH: 1.0,
    Button: 0.8,
    SUCCESS: 1.0
  },
  fade: {
    windInMs: 300,
    windOutMs: 300,
    crossfadeMs: 600
  },
  muteOnStart: false // si true, arranca todo mute (útil para mobile)
};

// ------------- p5.sound objects -------------
let SND_BallThrow, SND_Wind, SND_MAINMUSIC, SND_LEVELCOMPLETE, SND_FAIL, SND_ALMOST, SND_SPLASH, SND_Button, SND_SUCCESS;
// Mapa de conveniencia:
const CLIPS = {};
// Estado de música actual (para crossfades)
let _currentMusic = null;
// Gate para autoplay
let _audioUnlocked = false;
// Antispam por SFX
const _lastSfxAt = new Map();
// Wind audio seguimiento de flag
let _windAudioLast = false;

// ------------- Helpers de audio -------------
function setClipVolume(name, baseCategory){ // aplica fórmula: master * AUDIO[baseCategory] * (AUDIO.per[name] ?? 1)
  const base = (baseCategory === 'music') ? AUDIO.music : AUDIO.sfx;
  const per = (AUDIO.per && typeof AUDIO.per[name] === 'number') ? AUDIO.per[name] : 1.0;
  const master = AUDIO.master;
  const mutedFactor = AUDIO.muteOnStart && !_audioUnlocked ? 0 : 1;
  return constrain(master * base * per * mutedFactor, 0, 1);
}
function _getClip(name){
  return CLIPS[name];
}
function applyAudioVolumes(){
  // Re-aplica los volúmenes actuales (útil si cambiás AUDIO en runtime)
  const names = Object.keys(CLIPS);
  for (const n of names){
    const s = CLIPS[n];
    if (!s) continue;
    // Detectar categoría base:
    const cat = (n === 'MAINMUSIC' || n === 'LEVELCOMPLETE') ? 'music' : 'sfx';
    const vol = setClipVolume(n, cat);
    s.setVolume(vol, 0.05); // suave
  }
}

function playSfx(name){
  const s = _getClip(name);
  if (!s) return;

  // Antispam: throttle por nombre
  const now = millis ? millis() : performance.now();
  const throttleMs = (name === 'Button') ? 120 : 60;
  const last = _lastSfxAt.get(name) || -1e9;
  if (now - last < throttleMs) return;
  _lastSfxAt.set(name, now);

  const vol = setClipVolume(name, 'sfx');
  s.stop(); // asegurar arranque limpio
  s.setVolume(vol, 0);
  s.play();
}

function playLoop(name, fadeInMs = AUDIO.fade.windInMs){
  const s = _getClip(name);
  if (!s) return;
  const target = setClipVolume(name, 'sfx');
  if (!s.isPlaying()){
    s.setLoop(true);
    s.setVolume(0, 0);
    s.play();
  }
  s.setVolume(target, (fadeInMs||0)/1000);
}
function stopLoop(name, fadeOutMs = AUDIO.fade.windOutMs){
  const s = _getClip(name);
  if (!s) return;
  const stopDelay = (fadeOutMs||0);
  s.setVolume(0, stopDelay/1000);
  // Detener tras el fade
  setTimeout(()=>{ if (s && s.isPlaying()) s.stop(); }, stopDelay + 10);
}

function playMusic(name){
  // Inicia música (loop para MAINMUSIC, one-shot para LEVELCOMPLETE) sin crossfade (si nada sonando)
  const s = _getClip(name);
  if (!s) return;
  const vol = setClipVolume(name, 'music');

  if (_currentMusic === name && s.isPlaying()) {
    // evitar duplicados
    s.setVolume(vol, 0.2);
    return;
  }
  if (_currentMusic && _currentMusic !== name){
    // Si había otra, usar crossfade
    crossfadeTo(name);
    return;
  }
  // Arranque directo
  s.stop();
  s.setLoop(name === 'MAINMUSIC');
  s.setVolume(vol, 0);
  s.play();
  _currentMusic = name;
}

function crossfadeTo(name){
  const to = _getClip(name);
  if (!to) return;
  const fromName = _currentMusic;
  const from = fromName ? _getClip(fromName) : null;
  const ms = AUDIO.fade.crossfadeMs || 600;

  // Config destino:
  const toVol = setClipVolume(name, 'music');
  to.setLoop(name === 'MAINMUSIC'); // MAINMUSIC loop; LEVELCOMPLETE no
  if (!to.isPlaying()){
    to.setVolume(0, 0);
    to.play();
  }
  to.setVolume(toVol, ms/1000);

  if (from && from.isPlaying()){
    from.setVolume(0, ms/1000);
    setTimeout(()=>{ if (from.isPlaying()) from.stop(); }, ms + 20);
  }
  _currentMusic = name;
}

function resumeAudioIfNeeded(){
  try{
    const ac = getAudioContext();
    if (ac && ac.state !== 'running') {
      ac.resume();
    }
    _audioUnlocked = true;
    applyAudioVolumes();
  }catch(e){}
}

function ensureWindLoopFromFlag(){
  if (_windAudioLast !== (!!WIND_ACTIVE)){
    if (WIND_ACTIVE){
      playLoop('Wind', AUDIO.fade.windInMs);
    } else {
      stopLoop('Wind', AUDIO.fade.windOutMs);
    }
    _windAudioLast = !!WIND_ACTIVE;
  }
}

function _uiClickSound(){
  playSfx('Button');
}

// ================== (FIN AUDIO) ==================


// ================== CONFIGURACIÓN MANUAL ==================
const BASE_W = 1920, BASE_H = 1080;
const CFG = {
  // --- HITBOX del objetivo (independiente del TANK) ---
  HITBOX: { x:1466, y:600, radius:50, shrink:1.50, debug:false },

  // --- BARRA DE ENERGÍA ---
  POWERBAR: { x:1400, y:800, w:24, h:180, fadeMs:240, gamma:1.0 },

  // --- VIENTO (físico) ---
  WIND: {
    enabled:true, power:2.5, bias:-0.8, gain:1.0,
    scaleT:0.005, scaleY:0.002,
    gustsOn:true, gustOnMs:[1400,3000], gustOffMs:[1500,2000]
  },

  // --- VIENTO (visual) ---
  WIND_VIS: {
    enabled:true, scale:0.90, baseAlpha:150,
    rows:[0.32,0.50,0.68], speedFactors:[0.7,1.0,1.3], blendAdditive:true,
    offsetX:0, offsetY:70
  },

  // --- POTENCIA MÍNIMA PARA ACERTAR ---
  IMPACT: { byLevel:[68,71,72], fixed:null },

  // --- TIMER ---
  TIMER: {
    x:700, y:22, scale:0.60, textOffsetX:20, textOffsetY:-15,
    textSize:50, textColor:[255,255,255], textAlignH:'center', textAlignV:'center'
  },

  // --- BOLA ---
  BALL: { spriteScale:0.70, drawOffsetX:210, drawOffsetY:70, colliderOffsetX:0, colliderOffsetY:0 },

  // --- ENEMY global ---
  ENEMY: { scale:0.70, x:1200, marginBottom:40 },

  // --- TANK (solo visual) ---
  TANK: { scale:0.72, marginRight:54, marginBottom:30 },

  // --- SCORE ---
  SCORE: {
    hud:{ level2:{x:45,y:35,scale:0.70,visible:true}, level3:{x:27,y:35,scale:0.70,visible:true} },
    overlay:{
      level2:{ x:BASE_W/2-440, y:BASE_H/2-180, scale:2.25, visible:true },
      level3:{ x:BASE_W/2-480, y:BASE_H/2-180, scale:2.25, visible:true },
      final:{ x:BASE_W/2-460, y:BASE_H/2-160, scale:2.00, visible:true }
    }
  },

  // --- TUTORIAL ---
  TUTORIAL: {
    enabled:true, showOnLevels:[0], dimAlpha:200,
    panel:{ cx:BASE_W/2, cy:BASE_H*0.28, w:900, h:140, radius:18, bg:[25,22,30,230],
      title:'HOLD TO GRAB THE BALL', subtitle:'FASTER SWIPE = STRONGER THROW',
      titleSize:48, subtitleSize:28, titleColor:[255,255,255], subtitleColor:[235,235,235] },
    swipe:{ x0:BASE_W*0.28, y0:BASE_H*0.56, x1:BASE_W*0.72, y1:BASE_H*0.56, period:1.6 },
    hint:{ text:'Tap or Hold to continue', size:24, color:[255,255,255], y:BASE_H*0.78,
      pillBg:[0,0,0,160], padX:22, padY:12, radius:14, outlineColor:[0,0,0], outlineWeight:6 }
  },

  // --- LEADGEN (overlay gate) ---
  LEADGEN: {
    enabled: true,
    showOnStart: true,
    drawInputs: true,
    drawCursor: true,

    // Header visual (tu PNG) — se recorta arriba para usar solo el título
    header: { y: BASE_H * 0.05, scale: 1.0 },

    // Campos de texto
    fields: [
      { key: 'first',  placeholder: 'First Name' },
      { key: 'last',   placeholder: 'Last Name' },
      { key: 'email',  placeholder: 'Email Address' }
    ],

    panel: { cx: BASE_W/2, cy: BASE_H*0.58, w: 720, rowH: 68, gap: 22 },

    input: {
      bg: [245,245,245,255],
      fg: [0,0,0,255],
      ph: [120,120,120,180],
      stroke: [0,0,0,255],
      strokeFocus: [40,200,255,255],
      strokeError: [255,80,80,255],
      strokeW: 3, strokeWFocus: 4,
      radius: 10, padX: 18
    },

    submit: { useImageSize: true, scale: 1.3, dy: 5 },

    msgError: { color:[235,70,70,255], size:22, dy:76 },
    msgOk:    { color:[120,220,120,255], size:22, dy:76 }
  },
};
// =========================================================

// Toggle debug
let DEBUG_ON = false;

// ---------- Utilidades viewport ----------
function getViewport(){
  const s=Math.min(windowWidth/BASE_W,windowHeight/BASE_H);
  const w=BASE_W*s,h=BASE_H*s;
  const x=(windowWidth-w)/2,y=(windowHeight-h)/2;
  return {x,y,w,h,s};
}
function beginViewport(){ const v=getViewport(); push(); translate(v.x,v.y); scale(v.s,v.s); return v; }
function endViewport(){ pop(); }
function screenToWorld(pt){ const v=getViewport(); return { x:(pt.x-v.x)/v.s, y:(pt.y-v.y)/v.s }; }
function fitToScreenNow(){ let w=window.innerWidth,h=window.innerHeight; if (window.visualViewport){ w=Math.floor(window.visualViewport.width); h=Math.floor(window.visualViewport.height);} resizeCanvas(w,h); }

// ---------- Assets (IMÁGENES / FUENTE) ----------
let IMG_BG, IMG_TANK;
let IMG_ENEMY_L1, IMG_ENEMY_L2, IMG_ENEMY_L3;
let IMG_BILL_REST, IMG_BILL_RISE, IMG_BILL_THROW;
let IMG_BALL, IMG_SCOREBOARD, IMG_TIMER, IMG_COVER, IMG_BTN_START;
let IMG_SCORE_L2, IMG_SCORE_L3, IMG_SCORE_FINAL;
let IMG_WIND;              // overlay de viento
let IMG_LEADGEN_HDR;       // LEADGEN.png (título)
let IMG_LEADGEN_SUBMIT;    // LEADGEN_SUBMIT.png (botón)
let FONT_MAIN = null;

// ---------- Personaje ----------
const POSE = { REST:'REST', RISE:'RISE', THROW:'THROW' };
const POSE_SCALE = { REST:1.00, RISE:1.15, THROW:1.00 };
let currentPose = POSE.REST;
let groundY = BASE_H - 150;
let billX = 250;
let desiredBillHeight = 400;
let HAND_X = 0.72, HAND_Y = 0.08;

// ---------- Input / Gesto ----------
const THROW_HOLD_MS = 120, THROW_COOLDOWN_MS = 160;
let lastThrowAt = -9999, isHolding = false, throwEndAt = 0;
const GESTURE_WINDOW_MS = 140;
const GESTURE_VPS_MIN = 300, GESTURE_VPS_MAX = 2600;
const THROW_SPEED_MIN = 18, THROW_SPEED_MAX = 72;
let _inputHist = [], _lastThrowSpeed = 34;

// ---------- Game State ----------
const GAME = { MENU:'MENU', LEADGEN:'LEADGEN', PLAY:'PLAY', LEVEL_END:'LEVEL_END' };
let gameState = GAME.MENU;
let LEVEL_TIME_MS = 60000;
let levelStartAt = 0, levelEndReason = '';
let currentLevelIndex = 0;
let lastCompletedLevel = -1;

// ---------- Sistema de aciertos por nivel ----------
const HITS_REQUIRED_BY_LEVEL = [3, 2, 1]; // L1→3, L2→2, L3→1
let hitsThisLevel = 0;
function getRequiredHits(){ return HITS_REQUIRED_BY_LEVEL[currentLevelIndex] || 1; }

// ---------- Niveles ----------
const LEVELS = [
  { name:'Level 1', durationSec:60, enemyDrop:180, windPower:1.7, windBias:-0.9, windGain:1.0 },
  { name:'Level 2', durationSec:30, enemyDrop:180, windPower:1.9, windBias:-1.5, windGain:1.1 },
  { name:'Level 3', durationSec:10, enemyDrop:180, windPower:2.5, windBias:-1.9, windGain:1.2 }
];

// ---------- Loop / Timing ----------
let paused = false, lastTime = 0, time = 0;
const MAX_DT = 1/30;

// ---------- Física / Viento ----------
let GRAVITY_ON = true, GRAVITY = 0.50;
let WIND_ACTIVE = false, WIND_VIS_T = 0, WIND_VIS_FADE_S = 20;
let noiseT = 0.0;
let gust = { next:0, durOn:[1400,3000], durOff:[1500,2000] };

// ---------- Target Visual (TANK) ----------
let TANK_DRAW_W = 0, TANK_DRAW_H = 0;
const TARGET_VIS = { x: 1500, y: 540 };

// ---------- Hitbox (MANUAL) ----------
let TARGET = { x: CFG.HITBOX.x, y: CFG.HITBOX.y };
let TARGET_RADIUS = CFG.HITBOX.radius;
let COLLISION_SHRINK = CFG.HITBOX.shrink;

// ---------- Power Bar ----------
let powerBar = { active:false, value:0, t:0, dur:1200 };

// ---------- Enemy (con FSM de bajada/subida por golpe) ----------
/*
Estados:
- 'idle'        : arriba, listo para recibir golpe.
- 'stepDown'    : baja unos píxeles tras un golpe (intermedio).
- 'rise'        : vuelve a subir hasta arriba; durante rise no cuenta golpes.
- 'finalDown'   : bajada final hasta el fondo en el último golpe.
- 'down'        : queda abajo (se mostrará el Level Complete).
*/
let enemy = {
  img:null, drawW:0, drawH:0,
  baseX:CFG.ENEMY.x, baseY:BASE_H-CFG.ENEMY.marginBottom,
  yOffset:0, dropPixels:160,
  state:'idle',
  targetOffset:0,
  downSpeed:420, // px/s
  upSpeed:520,   // px/s
  // compat con código previo (no usados ahora para animar):
  falling:false, fallen:false, fallSpeed:360
};

// ---------- Pelota ----------
let balls = [];
function newBall(){ return { active:true, stuck:false, x:0, y:0, vx:0, vy:0, angle:0, impactSpeed:0, stickStart:0 }; }

// ---------- FX ----------
let hitFx = { active:false, x:0, y:0, t:0, dur:600 };

// ---------- Menú ----------
let menu = { btn:{x:0,y:0,w:0,h:0,pressed:false} };

// ---------- Tutorial ----------
let tutorial = { active:false, t:0, shown:{}, startMs:0 };

// ---------- Viento visual ----------
let windSpr = { x:0 };

// ---------- Leadgen ----------
let leadgen = {
  active:false,           // ⬅️ importante: comienza apagado (no bloquea el menú)
  idx:0,                  // campo con foco (0..2)
  data:{ first:'', last:'', email:'' },
  errors:{ first:false, last:false, email:false },
  submitted:false,
  message:'',
  _inputRects:null,
  _submitRect:null
};

// ---------- Preload (IMAGEN + SONIDO) ----------
function preload(){
  // ---- imágenes
  IMG_BG   = loadImage('ALL LEVELS_BACKGROUND.png');
  IMG_TANK = loadImage('TANK.png');

  IMG_ENEMY_L1 = loadImage('ENEMY_JAMES.png');
  IMG_ENEMY_L2 = loadImage('ENEMY2_ALLRED.png');
  IMG_ENEMY_L3 = loadImage('ENEMY3_OROUKE.png');

  IMG_BILL_REST  = loadImage('BILL_REST.png');
  IMG_BILL_RISE  = loadImage('BILL_RISE.png');
  IMG_BILL_THROW = loadImage('BILL_THROW.png');

  IMG_BALL = loadImage('BALL.png');

  IMG_SCOREBOARD = loadImage('SCOREBOARD.png');
  IMG_TIMER      = loadImage('TIMER.png');

  IMG_COVER      = loadImage('COVER.png');
  IMG_BTN_START  = loadImage('START_BUTTON.png');

  IMG_SCORE_L2   = loadImage('SCORE_LEVEL2.png');
  IMG_SCORE_L3   = loadImage('SCORE_LEVEL3.png');
  IMG_SCORE_FINAL= loadImage('SCORE_LEVELFINAL.png');

  IMG_WIND = loadImage('WIND.png');

  IMG_LEADGEN_HDR    = loadImage('LEADGEN.png');        // título/encabezado
  IMG_LEADGEN_SUBMIT = loadImage('LEADGEN_SUBMIT.png'); // botón enviar

  FONT_MAIN = loadFont('TheThreeStoogesFont.ttf');

  // ---- audio
  if (typeof soundFormats === 'function') soundFormats('mp3', 'wav');
  SND_BallThrow     = loadSound('BallThrow.mp3');
  SND_Wind          = loadSound('Wind.wav');
  SND_MAINMUSIC     = loadSound('MAINMUSIC.mp3');
  SND_LEVELCOMPLETE = loadSound('LEVELCOMPLETE.mp3');
  SND_FAIL          = loadSound('FAIL.wav');
  SND_ALMOST        = loadSound('ALMOST.wav');
  SND_SPLASH        = loadSound('SPLASH.wav');
  SND_Button        = loadSound('Button.wav');
  SND_SUCCESS       = loadSound('SUCCESS.wav');

  // Mapa
  CLIPS.BallThrow     = SND_BallThrow;
  CLIPS.Wind          = SND_Wind;
  CLIPS.MAINMUSIC     = SND_MAINMUSIC;
  CLIPS.LEVELCOMPLETE = SND_LEVELCOMPLETE;
  CLIPS.FAIL          = SND_FAIL;
  CLIPS.ALMOST        = SND_ALMOST;
  CLIPS.SPLASH        = SND_SPLASH;
  CLIPS.Button        = SND_Button;
  CLIPS.SUCCESS       = SND_SUCCESS;
}

// ---------- Setup ----------
let BILL_REST=null, BILL_RISE=null, BILL_THROW=null;
function setup(){
  createCanvas(windowWidth, windowHeight);
  imageMode(CORNER);

  BILL_REST  = cropTransparent(IMG_BILL_REST, 1);
  BILL_RISE  = cropTransparent(IMG_BILL_RISE, 1);
  BILL_THROW = cropTransparent(IMG_BILL_THROW, 1);

  noiseSeed(Math.floor(Math.random()*100000));
  lastTime = millis();
  setTimeout(fitToScreenNow, 60);

  const onRotateFix = ()=>{ fitToScreenNow(); setTimeout(fitToScreenNow,120); setTimeout(fitToScreenNow,400); setTimeout(fitToScreenNow,1000); };
  window.addEventListener('orientationchange', onRotateFix, {passive:true});
  window.addEventListener('resize', fitToScreenNow, {passive:true});
  if (window.visualViewport) window.visualViewport.addEventListener('resize', fitToScreenNow, {passive:true});

  // Carga previa de Leadgen desde localStorage (si existe)
  if (CFG.LEADGEN.saveToLocalStorage && window.localStorage){
    leadgen.data.first = localStorage.getItem('leadgen_first') || '';
    leadgen.data.last  = localStorage.getItem('leadgen_last')  || '';
    leadgen.data.email = localStorage.getItem('leadgen_email') || '';
  }

  // Inicializar volúmenes (mute si corresponde)
  applyAudioVolumes();

  goToMenu(); // AUDIO: play MAINMUSIC en menú dentro de goToMenu()
}
function windowResized(){ fitToScreenNow(); }

// ---------- Flow ----------
function goToMenu(){
  gameState = GAME.MENU;
  menu.btn = {x:0,y:0,w:0,h:0,pressed:false};
  currentLevelIndex = 0;
  lastCompletedLevel = -1;

  // AUDIO: música principal en loop en el menú (evita duplicados)
  playMusic('MAINMUSIC');
}

function renderMenu(){
  clear();
  const v = getViewport();
  if (IMG_COVER) image(IMG_COVER, v.x, v.y, v.w, v.h); else background(10,9,14);

  const baseW = IMG_BTN_START ? IMG_BTN_START.width : 420;
  const baseH = IMG_BTN_START ? IMG_BTN_START.height: 140;
  const ar = baseH/baseW;
  const bwByW = v.w*0.40, bhByH = v.h*0.60;
  const bhFromW = bwByW*ar, bwFromH= bhByH/ar;
  let bw=bwFromH, bh=bhByH; if (bwByW>bwFromH){ bw=bwByW; bh=bhFromW; }
  bw=Math.max(420, Math.min(bw, Math.min(v.w*0.70, 960)));
  bh=Math.max(150, bw*ar);
  const bx = v.x + v.w/2 - bw/2;
  const by = v.y + v.h - bh - Math.max(24, v.h*0.04);
  menu.btn = {x:bx,y:by,w:bw,h:bh,pressed:menu.btn.pressed};
  const sprite = IMG_BTN_START;
  if (sprite) image(sprite, bx, by, bw, bh);
  else { noStroke(); fill(150,40,20,230); rect(bx,by,bw,bh,16); fill(255); textAlign(CENTER,CENTER); textSize(Math.max(32, Math.min(56, bh*0.32))); text('START', bx+bw/2, by+bh/2); }
}

let impactThreshold = 50;

function applyLevelConfig(idx){
  const L = LEVELS[idx];
  LEVEL_TIME_MS = Math.max(5, L.durationSec) * 1000;
  impactThreshold = (CFG.IMPACT.fixed != null) ? CFG.IMPACT.fixed : (CFG.IMPACT.byLevel[idx] ?? 50);
  GRAVITY = 0.50;

  CFG.WIND.power = L.windPower;
  CFG.WIND.bias  = L.windBias;
  CFG.WIND.gain  = L.windGain;

  gust.durOn  = CFG.WIND.gustOnMs.slice();
  gust.durOff = CFG.WIND.gustOffMs.slice();

  enemy.img = (idx===0?IMG_ENEMY_L1:idx===1?IMG_ENEMY_L2:IMG_ENEMY_L3);
  enemy.drawW = enemy.img ? enemy.img.width  * CFG.ENEMY.scale : 120;
  enemy.drawH = enemy.img ? enemy.img.height * CFG.ENEMY.scale : 200;
  enemy.baseX = CFG.ENEMY.x;
  enemy.baseY = BASE_H - CFG.ENEMY.marginBottom;
  enemy.dropPixels = L.enemyDrop;

  // Reset FSM
  enemy.yOffset = 0;
  enemy.state = 'idle';
  enemy.targetOffset = 0;
  enemy.falling = false; enemy.fallen = false;

  if (IMG_TANK) {
    TANK_DRAW_W = IMG_TANK.width  * CFG.TANK.scale;
    TANK_DRAW_H = IMG_TANK.height * CFG.TANK.scale;
    TARGET_VIS.x = BASE_W - CFG.TANK.marginRight - (TANK_DRAW_W/2);
    TARGET_VIS.y = BASE_H - CFG.TANK.marginBottom - (TANK_DRAW_H/2);
  }

  TARGET.x = CFG.HITBOX.x;
  TARGET.y = CFG.HITBOX.y;
  TARGET_RADIUS = CFG.HITBOX.radius;
  COLLISION_SHRINK = CFG.HITBOX.shrink;
}

function startLevel(){
  applyLevelConfig(currentLevelIndex);

  // Tutorial por nivel
  tutorial.active = CFG.TUTORIAL.enabled &&
                    CFG.TUTORIAL.showOnLevels.includes(currentLevelIndex) &&
                    !tutorial.shown[currentLevelIndex];
  tutorial.t = 0;
  tutorial.startMs = tutorial.active ? millis() : 0;

  // Reset de contadores de aciertos
  hitsThisLevel = 0;

  levelStartAt = millis();          // se corrige si hay tutorial
  levelEndReason = '';
  overlay = { active:false, t:0, dur:600 };
  gameState = GAME.PLAY;

  if (typeof hardReset === 'function'){ hardReset(true); } // protección si no existe

  // AUDIO: asegurar que si veníamos de LEVELCOMPLETE, vuelva la MAINMUSIC (crossfade si aplica)
  playMusic('MAINMUSIC');
}

function endLevel(reason){
  // Evita doble finalización
  if (gameState === GAME.LEVEL_END) return;

  if (reason && /complete/i.test(reason)) lastCompletedLevel = currentLevelIndex;
  gameState = GAME.LEVEL_END;
  overlay.active = true; overlay.t = 0;
  levelEndReason = reason || 'Level complete!';

  // AUDIO: crossfade a LEVELCOMPLETE si reason=complete
  if (reason && /complete/i.test(reason)){
    crossfadeTo('LEVELCOMPLETE'); // no loop
  }

  // Desactivar bolas activas para que no se registren nuevos golpes durante el overlay
  for (const b of balls){ b.active = false; }
}

function goToNextScreen(){
  // AUDIO: al pasar a siguiente, volver a MAINMUSIC
  crossfadeTo('MAINMUSIC');

  if (currentLevelIndex < LEVELS.length - 1){
    currentLevelIndex++;
    startLevel(); // reinicia y resetea aciertos
  } else {
    goToMenu();
  }
}
function restartLevel(){
  // AUDIO: al reiniciar, asegurar MAINMUSIC
  crossfadeTo('MAINMUSIC');
  startLevel();
}

// ---------- Draw loop ----------
let overlay = { active:false, t:0, dur:600 };
let overlayButtons = { next:{x:0,y:0,w:0,h:0}, restart:{x:0,y:0,w:0,h:0} };

function draw(){
  const now = millis();
  let dt = (now - lastTime)/1000; lastTime = now;
  if (dt > MAX_DT) dt = MAX_DT;

  if (!paused){
    time += dt*1000;
    if (gameState === GAME.PLAY) update(dt);
    else if (gameState === GAME.LEADGEN) { /* sin update de física */ }
    else if (gameState === GAME.LEVEL_END) updateOverlay(dt);
  }
  render();

  // AUDIO: sync del loop de viento con el flag (cubre toggles por tecla y gusts)
  ensureWindLoopFromFlag();
}

function update(dt){
  recordInputSample(millis());

  const now = millis();
  if (currentPose === POSE.THROW && now >= throwEndAt) currentPose = POSE.REST;

  updateWindGusts(now, dt);
  updateBalls(dt);
  updateEnemyFSM(dt);
  updateFx(dt);
  updateTimerAndCheckEnd();

  if (powerBar.active){ powerBar.t += dt*1000; if (powerBar.t >= powerBar.dur) powerBar.active = false; }

  noiseT += CFG.WIND.scaleT * (dt*60);

  // Viento visual: scroll (invertido para acompañar dirección)
  let windNow = 0;
  if (CFG.WIND.enabled){
    const raw = fbm(noiseT, (BASE_H*0.5) * CFG.WIND.scaleY, 4)*2 - 1;
    windNow = (raw + CFG.WIND.bias) * CFG.WIND.power * CFG.WIND.gain;
  }
  const visSpeed = windNow * 1.2;
  windSpr.x -= visSpeed * (dt*60);
  if (windSpr.x > 50000 || windSpr.x < -50000) windSpr.x = windSpr.x % 5000;

  if (tutorial.active) tutorial.t += dt;
}

// ===================== ENEMY: lógica de bajar/subir por golpe =====================
function canRegisterHit(){
  // Solo cuenta golpes cuando el enemigo está listo (arriba y quieto)
  return gameState === GAME.PLAY && enemy.state === 'idle';
}
function perHitStepPixels(){
  const req = Math.max(1, getRequiredHits());
  return enemy.dropPixels / req;
}
function onSuccessfulHit(){
  // Si el enemigo está moviéndose, ignoramos el golpe (hay que esperar a que suba)
  if (!canRegisterHit()) return;

  const req = getRequiredHits();
  const nextHits = hitsThisLevel + 1;

  if (nextHits < req){
    // Golpe intermedio: baja un paso y luego sube
    hitsThisLevel = nextHits;
    enemy.targetOffset = Math.min(perHitStepPixels() * hitsThisLevel, enemy.dropPixels - 1);
    enemy.state = 'stepDown';

    // AUDIO: enemigo baja parcialmente (ALMOST)
    playSfx('ALMOST');
  } else {
    // Último golpe: baja hasta el fondo y se queda
    hitsThisLevel = nextHits;
    enemy.targetOffset = enemy.dropPixels;
    enemy.state = 'finalDown';

    // AUDIO: bajada definitiva (SPLASH) — corto, antes del crossfade a LEVELCOMPLETE
    playSfx('SPLASH');
  }

  // Limpiamos bolas activas para evitar doble registro durante la animación
  for (const b of balls){ b.active = false; }
}
function updateEnemyFSM(dt){
  switch (enemy.state){
    case 'idle':
      // arriba, nada que hacer
      break;

    case 'stepDown': {
      const dir = Math.sign(enemy.targetOffset - enemy.yOffset);
      enemy.yOffset += dir * enemy.downSpeed * dt;
      if ((dir >= 0 && enemy.yOffset >= enemy.targetOffset) ||
          (dir <= 0 && enemy.yOffset <= enemy.targetOffset)) {
        enemy.yOffset = enemy.targetOffset;
        enemy.state = 'rise';
      }
      break;
    }

    case 'rise': {
      const dir = Math.sign(0 - enemy.yOffset);
      enemy.yOffset += dir * enemy.upSpeed * dt;
      if ((dir >= 0 && enemy.yOffset >= 0) ||
          (dir <= 0 && enemy.yOffset <= 0)) {
        enemy.yOffset = 0;
        enemy.state = 'idle'; // ahora vuelve a contar golpes
      }
      break;
    }

    case 'finalDown': {
      const dir = Math.sign(enemy.targetOffset - enemy.yOffset);
      enemy.yOffset += dir * enemy.downSpeed * dt;
      if ((dir >= 0 && enemy.yOffset >= enemy.targetOffset) ||
          (dir <= 0 && enemy.yOffset <= enemy.targetOffset)) {
        enemy.yOffset = enemy.targetOffset;
        enemy.state = 'down';
        // Termina el nivel cuando llegó abajo (mantiene compatibilidad con overlay/sonidos)
        endLevel('complete');
      }
      break;
    }

    case 'down':
      // Quieto abajo hasta que aparezca el overlay
      break;
  }
}

function updateFx(dt){
  // Animación mínima del efecto de impacto (matching con drawHitFx)
  if (hitFx.active){
    hitFx.t += dt * 1000;              // t en ms
    if (hitFx.t >= hitFx.dur){
      hitFx.active = false;
      hitFx.t = 0;
    }
  }
}
function updateOverlay(dt){ if (!overlay.active) return; overlay.t += dt*1000; if (overlay.t > overlay.dur) overlay.t = overlay.dur; }

function updateWindGusts(now, dt){
  if (CFG.WIND.gustsOn && now >= gust.next){
    const was = WIND_ACTIVE; WIND_ACTIVE = !WIND_ACTIVE;
    const range = WIND_ACTIVE ? gust.durOn : gust.durOff;
    const dur = random(range[0], range[1]); gust.next = now + dur;

    // AUDIO: el loop/stop del viento se gestiona en ensureWindLoopFromFlag(), llamado cada frame.
  }
  const target = (CFG.WIND.enabled && WIND_ACTIVE) ? 1 : 0;
  const k = WIND_VIS_FADE_S * dt;
  WIND_VIS_T += (target - WIND_VIS_T) * constrain(k, 0, 1);
}

function updateTimerAndCheckEnd(){
  const remain = Math.max(0, LEVEL_TIME_MS - (millis() - levelStartAt));
  // Si se terminó el tiempo, SIEMPRE terminamos nivel (sin depender de caída)
  if (gameState === GAME.PLAY && remain === 0){
    endLevel("Time's up");
  }
}

// ---------- Render ----------
function render(){
  if (gameState === GAME.MENU){ renderMenu(); return; }
  if (windowHeight > windowWidth){
    clear(); if (IMG_BG){ const vbg = getViewport(); image(IMG_BG, vbg.x, vbg.y, vbg.w, vbg.h); }
    noStroke(); fill(0,0,0,220); rect(0,0,width,height);
    fill(255); textAlign(CENTER,CENTER); textSize(32); text('Rotate to landscape', width/2, height/2);
    return;
  }

  clear();
  beginViewport();

  if (IMG_BG) image(IMG_BG, 0, 0, BASE_W, BASE_H);

  if (gameState === GAME.LEADGEN){
    drawLeadgenOverlay();  // overlay on top
    endViewport();
    return;
  }

  // --- Capa viento debajo ---
  drawWindOverlay();

  drawEnemy();
  drawTank();
  drawBalls();

  // Personaje
  const r = getBillRect(currentPose);
  const sprite = (currentPose===POSE.THROW)?BILL_THROW:((currentPose===POSE.RISE)?BILL_RISE:BILL_REST);
  image(sprite.img, r.drawX, r.drawY, r.drawW, r.drawH);

  drawHUD();
  drawPowerBar();

  if (hitFx.active) drawHitFx();
  if (gameState === GAME.LEVEL_END) drawLevelEndOverlay();

  if (tutorial.active) drawTutorialOverlay();

  if (DEBUG_ON){
    if (CFG.HITBOX.debug){
      noFill(); stroke(255,255,0,180); circle(TARGET.x, TARGET.y, TARGET_RADIUS * 2);
    }
    drawWindDebugHud();
  }

  endViewport();
}

function drawTank(){ if (!IMG_TANK) return; imageMode(CENTER); image(IMG_TANK, TARGET_VIS.x, TARGET_VIS.y, TANK_DRAW_W, TANK_DRAW_H); imageMode(CORNER); }

// ---------- Input ----------
function keyPressed(){
  resumeAudioIfNeeded(); // AUDIO: gate en primer input

  // Leadgen captura todas las teclas
  if (gameState === GAME.LEADGEN){ handleLeadgenKeyPressed(); return; }

  if (tutorial.active){ tutorialDismiss(); return; }

  if (key==='p'||key==='P') paused = !paused;
  if (key==='r'||key==='R') restartLevel();
  if (key==='v'||key==='V'){ const was=WIND_ACTIVE; WIND_ACTIVE=!WIND_ACTIVE; gust.next=millis()+999999; }
  if (key==='d'||key==='D'){ DEBUG_ON = !DEBUG_ON; }
  if (gameState===GAME.LEVEL_END && (key==='n'||key==='N')) goToNextScreen();

  // Viento en vivo
  if (keyCode === LEFT_ARROW)  { CFG.WIND.bias -= 0.1; }
  if (keyCode === RIGHT_ARROW) { CFG.WIND.bias += 0.1; }
  if (keyCode === UP_ARROW)    { CFG.WIND.power = Math.min(CFG.WIND.power + 0.1, 5.0); }
  if (keyCode === DOWN_ARROW)  { CFG.WIND.power = Math.max(CFG.WIND.power - 0.1, 0.0); }
  if (key === '[')             { CFG.WIND.gain = Math.max(CFG.WIND.gain - 0.05, 0.0); }
  if (key === ']')             { CFG.WIND.gain = Math.min(CFG.WIND.gain + 0.05, 3.0); }
  if (key === '0')             { CFG.WIND_VIS.enabled = !CFG.WIND_VIS.enabled; }
  if (key === '9')             { CFG.WIND.enabled = !CFG.WIND.enabled; }
}
function keyTyped(){ if (gameState === GAME.LEADGEN){ handleLeadgenKeyTyped(); return; } }

function mousePressed(){
  resumeAudioIfNeeded(); // AUDIO: gate en primer input

  if (gameState===GAME.MENU){
    const b=menu.btn;
    if (mouseX>=b.x && mouseX<=b.x+b.w && mouseY>=b.y&&mouseY<=b.y+b.h) b.pressed = true;
    return;
  }
  if (gameState===GAME.LEVEL_END){ if (handleOverlayTapAt(mouseX, mouseY)) return; }

  // Leadgen clicks
  if (gameState === GAME.LEADGEN){ handleLeadgenMouse(); return; }

  if (tutorial.active){ tutorialDismiss(); return; }
  beginHold();
}
function mouseReleased(){
  resumeAudioIfNeeded(); // AUDIO: gate en primer input

  if (gameState===GAME.MENU){
    const b=menu.btn;
    const inside = mouseX>=b.x && mouseX<=b.x+b.w && mouseY>=b.y&&mouseY<=b.y+b.h;
    const wasPressed=b.pressed; b.pressed=false;
    if (wasPressed && inside){
      _uiClickSound(); // AUDIO: Button en menú start

      if (CFG.LEADGEN.enabled){
        // En lugar de arrancar nivel → abrir Leadgen
        leadgen.active = true;
        gameState = GAME.LEADGEN;
      } else {
        startLevel();
      }
    }
    return;
  }
  if (gameState === GAME.LEADGEN){ return; } // no usamos mouseReleased en leadgen
  endHold();
}
function touchStarted(){
  resumeAudioIfNeeded(); // AUDIO: gate en primer input

  if (gameState === GAME.LEADGEN){ handleLeadgenMouse(); return false; }
  if (tutorial.active){ tutorialDismiss(); return false; }
  beginHold();
  return false;
}
function touchEnded(){ if (gameState !== GAME.LEADGEN) endHold(); return false; }

// ---------- Tutorial helpers ----------
function tutorialDismiss(){
  if (tutorial.startMs){ const delay = millis() - tutorial.startMs; levelStartAt += delay; tutorial.startMs = 0; }
  tutorial.active = false; tutorial.shown[currentLevelIndex] = true;
}
function drawTutorialOverlay(){
  noStroke(); fill(0, 0, 0, CFG.TUTORIAL.dimAlpha); rect(0, 0, BASE_W, BASE_H);
  const P = CFG.TUTORIAL.panel;
  push(); if (FONT_MAIN) textFont(FONT_MAIN);
  noStroke(); fill(...P.bg); rect(P.cx - P.w/2, P.cy - P.h/2, P.w, P.h, P.radius);
  fill(...P.titleColor); textAlign(CENTER, CENTER); textSize(P.titleSize); text(P.title, P.cx, P.cy - 22);
  fill(...P.subtitleColor); textSize(P.subtitleSize); text(P.subtitle, P.cx, P.cy + 26);
  pop();
  const S = CFG.TUTORIAL.swipe;
  stroke(255, 255, 255, 180); strokeWeight(4); line(S.x0, S.y0, S.x1, S.y1);
  const tau = TWO_PI, phase = (sin((tutorial.t / S.period) * tau) * 0.5 + 0.5);
  const ax = lerp(S.x0, S.x1, phase), ay = lerp(S.y0, S.y1, phase);
  stroke(255,255,255,230); line(lerp(S.x0,ax,0.25), lerp(S.y0,ay,0.25), ax, ay);
  push(); translate(ax,ay); const ang = atan2(S.y1-S.y0, S.x1-S.x0); rotate(ang);
  noStroke(); fill(255); const size=14; triangle(0,0,-size,size*0.6,-size,-size*0.6); pop();
}

// ---------- Leadgen overlay ----------
function drawLeadgenOverlay(){
  // Fondo oscuro
  noStroke(); fill(0,0,0,220); rect(0,0,BASE_W,BASE_H);

  // Header — usamos solo la franja superior del PNG original
  if (IMG_LEADGEN_HDR){
    const H = CFG.LEADGEN.header;
    const w = IMG_LEADGEN_HDR.width * (H.scale || 1);
    const h = IMG_LEADGEN_HDR.height * (H.scale || 1);
    const cropH = h * 0.42; // ajustable 0.3–0.45 según look
    image(IMG_LEADGEN_HDR.get(0, 0, IMG_LEADGEN_HDR.width, cropH),
          BASE_W/2 - w/2, H.y - cropH/2, w, cropH);
  }

  // Campos
  const P = CFG.LEADGEN.panel;
  const F = CFG.LEADGEN.fields;
  const I = CFG.LEADGEN.input;
  const cx = P.cx, w = P.w, rowH = P.rowH, gap = P.gap;
  const startY = P.cy - (rowH*F.length + gap*(F.length-1))/2;

  if (FONT_MAIN) textFont(FONT_MAIN);
  textAlign(LEFT, CENTER);
  textSize(28);

  leadgen._inputRects = [];
  for (let i=0; i<F.length; i++){
    const y = startY + i*(rowH + gap);
    const r = { x: cx - w/2, y: y - rowH/2, w, h: rowH };
    leadgen._inputRects.push(r);

    const isFocus = (leadgen.idx === i);
    const hasErr = leadgen.errors[F[i].key];
    const val = leadgen.data[F[i].key] || '';

    // Caja
    noStroke(); fill(I.bg); rect(r.x, r.y, r.w, r.h, I.radius);
    stroke(...(hasErr ? I.strokeError : (isFocus ? I.strokeFocus : I.stroke)));
    strokeWeight(isFocus?I.strokeWFocus:I.strokeW); noFill(); rect(r.x, r.y, r.w, r.h, I.radius);

    // Texto o placeholder
    noStroke();
    const padX = I.padX || 16;
    if (val.length===0){ fill(...I.ph); text(F[i].placeholder, r.x + padX, r.y + r.h/2); }
    else { fill(...I.fg); text(val, r.x + padX, r.y + r.h/2); }

    // Cursor
    if (CFG.LEADGEN.drawCursor && isFocus && (frameCount % 60) < 30){
      const tw = textWidth(val);
      fill(40); rect(r.x + padX + tw + 3, r.y + 10, 2, r.h - 20);
    }
  }

  // Botón SUBMIT (con tu PNG)
  const S = CFG.LEADGEN.submit;
  const lastRect = leadgen._inputRects[leadgen._inputRects.length-1];
  const submitX = BASE_W/2;
  const submitY = (lastRect.y + lastRect.h/2) + (S.dy || 80);

  let submitW=520, submitH=92;
  if (IMG_LEADGEN_SUBMIT && S.useImageSize){
    const sc = S.scale || 1.0;
    submitW = IMG_LEADGEN_SUBMIT.width * sc;
    submitH = IMG_LEADGEN_SUBMIT.height * sc;
    image(IMG_LEADGEN_SUBMIT, submitX - submitW/2, submitY - submitH/2, submitW, submitH);
  }

  // Mensajes
  if (leadgen.message){
    const ok = (leadgen.submitted === true);
    const M = ok ? CFG.LEADGEN.msgOk : CFG.LEADGEN.msgError;
    fill(...M.color);
    if (FONT_MAIN) textFont(FONT_MAIN);
    textAlign(CENTER,TOP); textSize(M.size || 22);
    text(leadgen.message, BASE_W/2, submitY + (M.dy || 72));
  }

  // Hitbox botón
  leadgen._submitRect = { x: submitX - submitW/2, y: submitY - submitH/2, w: submitW, h: submitH };
}

// Utilidad: mouse en coords "world" (1920x1080)
function _leadgenWorldMouse(){ return screenToWorld({ x: mouseX, y: mouseY }); }

// Detecta clics dentro de inputs o en el botón (Leadgen)
function handleLeadgenMouse(){
  if (!leadgen.active) return;
  const m = _leadgenWorldMouse();

  // Inputs
  if (leadgen._inputRects) {
    for (let i = 0; i < leadgen._inputRects.length; i++) {
      const r = leadgen._inputRects[i];
      if (m.x >= r.x && m.x <= r.x + r.w && m.y >= r.y && m.y <= r.y + r.h) {
        leadgen.idx = i;
        leadgen.message = '';
        _uiClickSound(); // AUDIO: Button al enfocar input
        return;
      }
    }
  }
  // Submit
  if (leadgen._submitRect) {
    const r = leadgen._submitRect;
    if (m.x >= r.x && m.x <= r.x + r.w && m.y >= r.y && m.y <= r.y + r.h) {
      _uiClickSound(); // AUDIO: Button submit
      leadgenSubmit();
      return;
    }
  }
}

// Navegación con teclas especiales (Leadgen)
function handleLeadgenKeyPressed(){
  if (!leadgen.active) return;

  if (keyCode === TAB){
    _uiClickSound(); // AUDIO: Button (navegación de inputs)
    leadgen.idx = (leadgen.idx + 1) % CFG.LEADGEN.fields.length;
    leadgen.message = '';
    return;
  }
  if (keyCode === ENTER){
    _uiClickSound(); // AUDIO: Button (submit via teclado)
    leadgenSubmit();
    return;
  }
  if (keyCode === BACKSPACE){
    const f = CFG.LEADGEN.fields[leadgen.idx];
    let v = leadgen.data[f.key] || '';
    v = v.slice(0, -1);
    leadgen.data[f.key] = v;
    leadgen.errors[f.key] = false;
    leadgen.message = '';
    return;
  }
  if (keyCode === ESCAPE){
    // Solo debug: cerrar leadgen
    // leadgen.active = false; gameState = GAME.MENU;
  }
}

// Escribir texto (Leadgen)
function handleLeadgenKeyTyped(){
  if (!leadgen.active) return;

  const ch = key;
  // Acepta letras, números, espacio, guion, punto, arroba, subrayado y algunos signos
  if (!/[\w\s@.\-_,!#$%^&*()']/i.test(ch)) return;

  const f = CFG.LEADGEN.fields[leadgen.idx];
  let v = leadgen.data[f.key] || '';
  if (v.length >= (f.maxLen || 64)) return;
  v += ch;
  leadgen.data[f.key] = v;
  leadgen.errors[f.key] = false;
  leadgen.message = '';
}

// Enviar formulario (Leadgen)
function leadgenSubmit(){
  const d = leadgen.data;
  leadgen.errors = {};

  // Validaciones
  if (!d.first || d.first.trim() === '') leadgen.errors.first = true;
  if (!d.last  || d.last.trim()  === '') leadgen.errors.last  = true;
  if (!d.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim())) leadgen.errors.email = true;

  if (leadgen.errors.first || leadgen.errors.last || leadgen.errors.email){
    leadgen.submitted = false;
    leadgen.message = 'Please complete all fields (valid email required).';
    // foco al primero con error
    const order = ['first','last','email'];
    for (let i=0;i<order.length;i++){ if (leadgen.errors[order[i]]){ leadgen.idx = i; break; } }
    return;
  }

  // Éxito
  leadgen.submitted = true;
  leadgen.message = 'Thanks! Loading…';

  // Persistencia opcional
  if (CFG.LEADGEN.saveToLocalStorage && window.localStorage){
    localStorage.setItem('leadgen_first', d.first);
    localStorage.setItem('leadgen_last',  d.last);
    localStorage.setItem('leadgen_email', d.email);
  }

  // Cerrar leadgen y arrancar nivel 1
  leadgen.active = false;
  currentLevelIndex = 0;
  startLevel();
}

// ---------- Viento visual (overlay) ----------
function drawWindOverlay(){
  if (!IMG_WIND) return;
  if (!CFG.WIND_VIS.enabled) return;
  if (WIND_VIS_T <= 0.01) return;

  const S = CFG.WIND_VIS.scale || 1.0;
  const tileW = IMG_WIND.width  * S;
  const tileH = IMG_WIND.height * S;

  // Alpha según presencia y fuerza actual
  let windNow = 0;
  if (CFG.WIND.enabled){
    const raw = fbm(noiseT, (BASE_H*0.5) * CFG.WIND.scaleY, 4)*2 - 1;
    windNow = (raw + CFG.WIND.bias) * CFG.WIND.power * CFG.WIND.gain;
  }
  const strength = constrain(Math.abs(windNow) / 3.0, 0, 1);
  const baseAlpha = CFG.WIND_VIS.baseAlpha ?? 150;
  const alpha = constrain(baseAlpha * (0.4 + 0.6*WIND_VIS_T) * (0.5 + 0.5*strength), 0, 255);

  const rows = CFG.WIND_VIS.rows || [0.25, 0.45, 0.65];
  const speedFactors = CFG.WIND_VIS.speedFactors || [0.7, 1.0, 1.3];

  push();
  if (CFG.WIND_VIS.blendAdditive) blendMode(ADD);
  tint(255, alpha);

  for (let i=0; i<rows.length; i++){
    const y = BASE_H * rows[i] + (CFG.WIND_VIS.offsetY||0);
    const rowShift = windSpr.x * speedFactors[i];

    const startX = -((rowShift % tileW) + tileW) + (CFG.WIND_VIS.offsetX||0);
    for (let x = startX; x < BASE_W + tileW; x += tileW){
      image(IMG_WIND, x, y - tileH/2, tileW, tileH);
    }
  }

  pop();
}

// Mini HUD debug de viento
function drawWindDebugHud(){
  const pad = 10, w = 320, h = 110;
  noStroke(); fill(0,0,0,140); rect(BASE_W - w - pad, pad, w, h, 10);
  fill(255); textAlign(LEFT, TOP); textSize(16);
  const lines = [
    `WIND enabled: ${CFG.WIND.enabled ? 'yes' : 'no'}`,
    `bias (←/→): ${CFG.WIND.bias.toFixed(2)}`,
    `power (↑/↓): ${CFG.WIND.power.toFixed(2)}`,
    `gain  ([/]): ${CFG.WIND.gain.toFixed(2)}`,
    `gust active: ${WIND_ACTIVE ? 'yes' : 'no'}`,
    `overlay (0): ${CFG.WIND_VIS.enabled ? 'on' : 'off'}`
  ];
  let y = pad + 8;
  for (const s of lines){ text(s, BASE_W - w - pad + 10, y); y += 18; }
}

// ---------- Enemy / Balls / HUD ----------
function drawEnemy(){
  const xFeet = enemy.baseX, yFeet = enemy.baseY + enemy.yOffset;
  if (enemy.img && enemy.img.width > 1 && enemy.img.height > 1){
    image(enemy.img, xFeet - enemy.drawW/2, yFeet - enemy.drawH, enemy.drawW, enemy.drawH);
  } else if (DEBUG_ON){
    noStroke(); fill(255,60,60,140); rect(xFeet-60, yFeet-180, 120, 180, 10);
    fill(255); textAlign(CENTER, BOTTOM); text('ENEMY?', xFeet, yFeet-190);
  }
}

const SCOREBOARD_X = 36, SCOREBOARD_Y = 34, SCOREBOARD_SCALE = 0.70;
function drawHUD(){
  if (IMG_SCOREBOARD){
    const sbW = IMG_SCOREBOARD.width * SCOREBOARD_SCALE;
    const sbH = IMG_SCOREBOARD.height* SCOREBOARD_SCALE;
    image(IMG_SCOREBOARD, SCOREBOARD_X, SCOREBOARD_Y, sbW, sbH);
  }
  if (IMG_TIMER){
    const tw = IMG_TIMER.width * CFG.TIMER.scale;
    const th = IMG_TIMER.height* CFG.TIMER.scale;
    const tx = CFG.TIMER.x, ty = CFG.TIMER.y;
    image(IMG_TIMER, tx, ty, tw, th);
    const remain = Math.max(0, LEVEL_TIME_MS - (millis() - levelStartAt));
    const secs = Math.ceil(remain/1000);
    push();
    noStroke(); fill(...CFG.TIMER.textColor);
    if (FONT_MAIN) textFont(FONT_MAIN);
    const hAlign = CFG.TIMER.textAlignH.toUpperCase();
    const vAlign = CFG.TIMER.textAlignV.toUpperCase();
    textAlign(hAlign==='LEFT'?LEFT:hAlign==='RIGHT'?RIGHT:CENTER, vAlign==='TOP'?TOP:vAlign==='BOTTOM'?BOTTOM:CENTER);
    textSize(CFG.TIMER.textSize);
    const txText = tx + tw*0.90 + CFG.TIMER.textOffsetX;
    const tyText = ty + th*0.10 + CFG.TIMER.textOffsetY;
    text(String(secs).padStart(2,'0'), txText, tyText);
    pop();
  }
  if (currentLevelIndex === 1 && IMG_SCORE_L2 && CFG.SCORE.hud.level2.visible) {
    const cfg = CFG.SCORE.hud.level2; const w = IMG_SCORE_L2.width * cfg.scale, h = IMG_SCORE_L2.height * cfg.scale; image(IMG_SCORE_L2, cfg.x, cfg.y, w, h);
  }
  if (currentLevelIndex === 2 && IMG_SCORE_L3 && CFG.SCORE.hud.level3.visible) {
    const cfg = CFG.SCORE.hud.level3; const w = IMG_SCORE_L3.width * cfg.scale, h = IMG_SCORE_L3.height * cfg.scale; image(IMG_SCORE_L3, cfg.x, cfg.y, w, h);
  }

  // (Opcional) — Si querés visualizar aciertos: descomenta
  // push(); fill(255); textAlign(LEFT, TOP); textSize(24);
  // text(`Hits: ${hitsThisLevel}/${getRequiredHits()}`, SCOREBOARD_X, SCOREBOARD_Y + 120);
  // pop();
}

// Barra de energía
function drawPowerBar(){
  if (!powerBar.active) return;
  const w = CFG.POWERBAR.w, h = CFG.POWERBAR.h, sideX = CFG.POWERBAR.x, sideY = CFG.POWERBAR.y;
  const raw = constrain(powerBar.value, 0, 1);
  const fading = (powerBar.dur - powerBar.t < CFG.POWERBAR.fadeMs) ? (powerBar.dur - powerBar.t)/CFG.POWERBAR.fadeMs : 1;
  const alpha = 200 * constrain(fading, 0, 1);
  push(); translate(sideX, sideY); rectMode(CENTER); noStroke();
  fill(20,20,30, alpha); rect(0,0, w+8, h+8, 8);
  fill(40,40,60, alpha); rect(0,0, w, h, 6);
  const fy = h * raw;
  fill(60, 220, 120, alpha); rect(0, (h/2 - fy/2), w, fy, 6);
  const goalY = map(1, 0, 1, h/2, -h/2);
  stroke(235, 90, 90, alpha); strokeWeight(3); line(-w/2 - 4, goalY, w/2 + 4, goalY);
  if (DEBUG_ON){ noFill(); stroke(0,180,255,160); rect(0,0,w,h,6); }
  pop();
}

// ---------- Input: gesto ----------
function beginHold(){
  if (windowHeight > windowWidth) return;
  if (gameState !== GAME.PLAY) return;
  isHolding = true; currentPose = POSE.RISE;
  _inputHist.length = 0; recordInputSample(millis());
}
function endHold(){
  if (!isHolding) return; isHolding = false;
  const now = millis();
  if (now - lastThrowAt < THROW_COOLDOWN_MS){ currentPose = POSE.REST; return; }
  currentPose = POSE.THROW; lastThrowAt = now;

  // AUDIO: BallThrow al pasar a POSE.THROW
  playSfx('BallThrow');

  const aimScreen = getPointerScreen(); const aimBase = screenToWorld(aimScreen); spawnBall(aimBase);
  throwEndAt = now + THROW_HOLD_MS;
}

// ---------- Overlay ----------
function drawLevelEndOverlay(){
  const p = overlay.t/overlay.dur, ease = easeOutCubic(p);
  const panelW = 640, panelH = 340, x = BASE_W/2 - panelW/2, yStart = -panelH - 40, yEnd = BASE_H/2 - panelH/2, y = lerp(yStart, yEnd, ease);
  noStroke(); fill(0,0,0, 140*ease); rect(0,0,BASE_W,BASE_H);
  push(); translate(0, y - yEnd);
  noStroke(); fill(25,22,30,230); rect(x, yEnd, panelW, panelH, 18);
  // Título segun motivo
  const title = /time/i.test(levelEndReason) ? 'Time\'s Up' : 'Level Complete';
  fill(255); textAlign(CENTER,TOP); if (FONT_MAIN) textFont(FONT_MAIN); textSize(44); text(title, x+panelW/2, yEnd+28);
  const isMobile = windowWidth < 900; const bw = isMobile ? 320 : 240; const bh = isMobile ? 90 : 60; const gap = isMobile ? 40 : 24; const btnY = yEnd + panelH - 86;
  const rx = x + panelW/2 - bw - gap/2; drawButton(rx, btnY, bw, bh, (currentLevelIndex===0?'Restart':'Retry')); overlayButtons.restart = {x:rx, y:btnY, w:bw, h:bh};
  const nx = x + panelW/2 + gap/2; drawButton(nx, btnY, bw, bh, (currentLevelIndex<LEVELS.length-1?'Next':'Menu')); overlayButtons.next = {x:nx, y:btnY, w:bw, h:bh};
  let nextImg=null, cfg=null;
  if (lastCompletedLevel===0 && IMG_SCORE_L2 && CFG.SCORE.overlay.level2.visible){ nextImg=IMG_SCORE_L2; cfg=CFG.SCORE.overlay.level2; }
  else if (lastCompletedLevel===1 && IMG_SCORE_L3 && CFG.SCORE.overlay.level3.visible){ nextImg=IMG_SCORE_L3; cfg=CFG.SCORE.overlay.level3; }
  else if (lastCompletedLevel===2 && IMG_SCORE_FINAL && CFG.SCORE.overlay.final.visible){ nextImg=IMG_SCORE_FINAL; cfg=CFG.SCORE.overlay.final; }
  if (nextImg && cfg){ const w = nextImg.width * cfg.scale, h = nextImg.height * cfg.scale; image(nextImg, cfg.x, cfg.y, w, h); }
  pop();
}
function drawButton(x,y,w,h,label){ noStroke(); fill(60,60,70,240); rect(x,y,w,h,10); fill(235); textAlign(CENTER,CENTER); textSize(22); text(label, x+w/2, y+h/2); }
function handleOverlayTapAt(screenX, screenY){
  const m=screenToWorld({x:screenX,y:screenY});
  const inside=(b)=> m.x>=b.x&&m.x<=b.x+b.w&&m.y>=b.y&&m.y<=b.y+b.h;
  if (inside(overlayButtons.next)){
    _uiClickSound(); // AUDIO: Button en Next/Menu
    goToNextScreen(); return true;
  }
  if (inside(overlayButtons.restart)){
    _uiClickSound(); // AUDIO: Button en Retry/Restart
    restartLevel(); return true;
  }
  return false;
}

// ---------- Gesto / Helpers ----------
function getPointerScreen(){ if (touches && touches.length>0) return {x:touches[0].x, y:touches[0].y}; return {x:mouseX,y:mouseY}; }
function recordInputSample(now){ const pScr=getPointerScreen(); const p=screenToWorld(pScr); _inputHist.push({t:now, x:p.x, y:p.y}); const cutoff=now - Math.max(GESTURE_WINDOW_MS,60); while(_inputHist.length>1 && _inputHist[0].t<cutoff) _inputHist.shift(); }
function gestureSpeed(){ if (_inputHist.length<2) return 0; const first=_inputHist[0], last=_inputHist[_inputHist.length-1]; const dt=Math.max(1,last.t-first.t)/1000.0; const distPx=Math.hypot(last.x-first.x, last.y-first.y); return distPx/dt; }

// ---------- Bill geom ----------
function getBillRect(pose){
  const spr = (pose===POSE.THROW)?BILL_THROW:((pose===POSE.RISE)?BILL_RISE:BILL_REST);
  const mult = (pose===POSE.THROW)?POSE_SCALE.THROW:((pose===POSE.RISE)?POSE_SCALE.RISE:POSE_SCALE.REST);
  const targetH = desiredBillHeight * mult, s = targetH / spr.img.height;
  const w = spr.img.width * s, h = spr.img.height * s;
  const x = billX, y = groundY - h;
  return { drawX:x, drawY:y, drawW:w, drawH:h, scale:s };
}
function getHandPos(){
  const spr=BILL_RISE; const targetH=desiredBillHeight*POSE_SCALE.RISE; const s=targetH/spr.img.height;
  const w=spr.img.width*s, h=spr.img.height*s; const x=billX, y=groundY-h;
  return { x: x + w * HAND_X, y: y + h * HAND_Y };
}

// ---------- Ball sim ----------
function spawnBall(aimPointBase=null){
  const hand = getHandPos(); const ball = newBall();
  ball.x = hand.x + CFG.BALL.colliderOffsetX; ball.y = hand.y + CFG.BALL.colliderOffsetY;
  let tx=(aimPointBase && typeof aimPointBase.x==='number')?aimPointBase.x:TARGET.x;
  let ty=(aimPointBase && typeof aimPointBase.y==='number')?aimPointBase.y:TARGET.y;
  let dirX=tx-ball.x, dirY=ty-ball.y, len=Math.hypot(dirX,dirY);
  if (len<1e-3){ const first=_inputHist[0], last=_inputHist[_inputHist.length-1]; if (first && last){ dirX=last.x-first.x; dirY=last.y-first.y; len=Math.hypot(dirX,dirY); } if (len<1e-3){ dirX=1; dirY=0; len=1; } }
  const ux=dirX/len, uy=dirY/len;
  let vps=gestureSpeed(); let speedPF=mapRange(vps, GESTURE_VPS_MIN, GESTURE_VPS_MAX, THROW_SPEED_MIN, THROW_SPEED_MAX);
  speedPF=constrain(speedPF, THROW_SPEED_MIN, THROW_SPEED_MAX); _lastThrowSpeed=speedPF;
  ball.vx=ux*speedPF; ball.vy=uy*speedPF; ball.angle=Math.atan2(ball.vy, ball.vx);
  balls.push(ball);
}

// ---------- Golpe exitoso: detección y gating mientras sube ----------
function updateBalls(dt){
  for (let i=balls.length-1; i>=0; --i){
    const b=balls[i];
    if (!b.active){ balls.splice(i,1); continue; }

    if (!b.stuck){
      if (GRAVITY_ON) b.vy += GRAVITY * (dt*60);
      if (CFG.WIND.enabled && WIND_ACTIVE){
        const raw = fbm(noiseT, b.y * CFG.WIND.scaleY, 4)*2 - 1;
        const baseWind = (raw + CFG.WIND.bias) * CFG.WIND.power;
        b.vx += baseWind * CFG.WIND.gain * (dt*60);
      }
      b.x += b.vx * (dt*60); b.y += b.vy * (dt*60); b.angle = Math.atan2(b.vy, b.vx);

      const d = dist(b.x, b.y, TARGET.x, TARGET.y);
      const hit = (d <= TARGET_RADIUS * COLLISION_SHRINK);
      if (hit){
        b.impactSpeed = Math.hypot(b.vx, b.vy);
        const rawPow = b.impactSpeed / impactThreshold;
        const gamma = (CFG.POWERBAR && CFG.POWERBAR.gamma) || 1.0;
        powerBar.active = true; powerBar.value = Math.pow(rawPow, 1/gamma); powerBar.t = 0;
        hitFx = {active:true, x:TARGET.x, y:TARGET.y, t:0, dur:600};

        const strong = b.impactSpeed >= impactThreshold;
        if (strong){
          // AUDIO: impacto fuerte (SUCCESS)
          playSfx('SUCCESS');

          // Solo contar si el enemigo está listo (idle).
          if (canRegisterHit()) onSuccessfulHit();
        } else {
          // AUDIO: impacto débil (FAIL)
          playSfx('FAIL');
        }

        // Clavar bola breve y remover
        b.stuck = true; b.vx = b.vy = 0; b.stickStart = millis();
      }

      if (b.x < -120 || b.x > BASE_W+120 || b.y < -120 || b.y > BASE_H+120) b.active = false;
    } else {
      if (millis() - b.stickStart > 600) b.active = false;
    }
  }
}

function drawBalls(){
  for (const b of balls){
    if (!b.active) continue;
    push(); translate(b.x, b.y); rotate(b.angle);
    imageMode(CENTER);
    image(IMG_BALL, CFG.BALL.drawOffsetX, CFG.BALL.drawOffsetY, IMG_BALL.width * CFG.BALL.spriteScale, IMG_BALL.height * CFG.BALL.spriteScale);
    if (DEBUG_ON){
      noFill(); stroke(0,255,0,220); strokeWeight(2); circle(0,0,14);
      fill(255,0,0,200); noStroke(); circle(CFG.BALL.drawOffsetX, CFG.BALL.drawOffsetY, 8);
      stroke(255,150,0,200); noFill(); line(-16,0,16,0); line(0,-16,0,16);
    }
    imageMode(CORNER);
    pop();
  }
}

// ---------- FX ----------
function drawHitFx(){ const p = hitFx.t / hitFx.dur; const r = lerp(10,150, easeOutQuad(p)); const a = 180 * (1-p); noFill(); stroke(255,245,200,a); strokeWeight(4); circle(hitFx.x, hitFx.y, r*2); }

// ---------- Overlay helpers ----------
function renderNextScreen(){
  clear();
  const v=getViewport();
  noStroke(); fill(10,9,14); rect(v.x,v.y,v.w,v.h);
  push(); translate(v.x,v.y); scale(v.s,v.s);
  noStroke(); fill(255); textAlign(CENTER,CENTER);
  textSize(44); text('Next level — coming soon', BASE_W/2, BASE_H/2 - 20);
  textSize(20); fill(220); text('Press R to restart current level', BASE_W/2, BASE_H/2 + 30);
  pop();
}

// ---------- Utils ----------
function easeOutQuad(t){ return 1-(1-t)*(1-t); }
function easeOutCubic(t){ return 1-Math.pow(1-t,3); }
function mapRange(v,a0,a1,b0,b1){ const denom=(a1-a0); const t=denom===0?0:(v-a0)/denom; return b0 + (b1-b0) * constrain(t,0,1); }
function fbm(x,y,octaves=3){ let value=0, amp=0.5, freq=1; for(let i=0;i<octaves;i++){ value+=amp*noise(x*freq, y*freq); amp*=0.5; freq*=2.0; } return value; }
function cropTransparent(src, alphaThreshold=1){
  src.loadPixels();
  const w=src.width, h=src.height, px=src.pixels;
  let minX=w, minY=h, maxX=-1, maxY=-1;
  for (let y=0; y<h; y++) for (let x=0; x<w; x++){
    const i=(y*w+x)*4;
    if (px[i+3] > alphaThreshold){ if (x<minX) minX=x; if (y<minY) minY=y; if (x>maxX) maxX=x; if (y>maxY) maxY=y; }
  }
  if (maxX<minX || maxY<minY) return {img:src, ox:0, oy:0};
  const cw=maxX-minX+1, ch=maxY-minY+1;
  return { img:src.get(minX, minY, cw, ch), ox:minX, oy:minY };
}
