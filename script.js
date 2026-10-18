(() => {
'use strict';

// --- 1. 初期設定 ---
const W = 600, H = 800, STEP = 1000 / 60;
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// --- 高解像度対応 ---
const DPR = window.devicePixelRatio || 1;
let R = 1; // メイン画面の解像度倍率
function resizeCanvas() {
  const cssW = canvas.getBoundingClientRect().width || W;
  R = Math.max(1, Math.min(3, Math.ceil(cssW * DPR / W)));
  canvas.width = W * R;
  canvas.height = H * R;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// 事前描画する画像は高解像度で作る（描画時は論理サイズに縮小）
const SPRITE_Q = Math.max(2, Math.min(3, Math.ceil(Math.min(screen.width, screen.height * 0.75) / W * DPR)));
const _drawImage = CanvasRenderingContext2D.prototype.drawImage;
CanvasRenderingContext2D.prototype.drawImage = function (img, x, y, w, h) {
  if (img && img._lw && arguments.length === 3) return _drawImage.call(this, img, x, y, img._lw, img._lh);
  return _drawImage.apply(this, arguments);
};

const rgb = (r, g, b) => `rgb(${r},${g},${b})`;
const BLACK = rgb(0, 0, 0), WHITE = rgb(255, 255, 255), YELLOW = rgb(255, 255, 0);
const ORANGE = rgb(255, 128, 0), RED = rgb(255, 50, 50);
const LIGHT_GRAY = rgb(180, 190, 200), DARK_GRAY = rgb(100, 110, 120);
const CYAN = rgb(0, 255, 255), GREEN = rgb(50, 255, 50), PURPLE = rgb(150, 50, 255);
const ENEMY_DARK = rgb(60, 40, 50), ENEMY_LIGHT = rgb(110, 80, 100), ENEMY_COCKPIT = rgb(255, 0, 100);
const PINK = rgb(255, 50, 150);

// 機体設定
const SHIPS = [
  { base: DARK_GRAY,  wing: LIGHT_GRAY, cockpit: CYAN,   speed: 7,    delay: 150, charge: 1500, hp: 3 },
  { base: GREEN,      wing: LIGHT_GRAY, cockpit: YELLOW, speed: 10.5, delay: 200, charge: 1500, hp: 3 },
  { base: PINK,       wing: DARK_GRAY,  cockpit: WHITE,  speed: 7,    delay: 300, charge: 1000, hp: 3 },
  { base: PURPLE,     wing: DARK_GRAY,  cockpit: ORANGE, speed: 5,    delay: 300, charge: 2500, hp: 3 },
  { base: LIGHT_GRAY, wing: rgb(50, 100, 255), cockpit: RED, speed: 4.6, delay: 225, charge: 2000, hp: 5 },
  { base: WHITE,      wing: DARK_GRAY,  cockpit: YELLOW, speed: 7,    delay: 300, charge: 1500, hp: 3 },
];

// --- ユーティリティ ---
const rand = (a, b) => Math.random() * (b - a) + a;
const randint = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const choice = arr => arr[Math.floor(Math.random() * arr.length)];
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w * SPRITE_Q; c.height = h * SPRITE_Q;
  c._lw = w; c._lh = h;
  const g = c.getContext('2d');
  g.scale(SPRITE_Q, SPRITE_Q);
  g.imageSmoothingQuality = 'high';
  return c;
}
function fillPoly(c, color, pts) {
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
  c.closePath();
  c.fill();
}
function fillEllipse(c, color, x, y, w, h) {
  c.fillStyle = color;
  c.beginPath();
  c.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  c.fill();
}
function fillCircle(c, color, x, y, r) {
  c.fillStyle = color;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
}
function sweep(arr) {
  let j = 0;
  for (let i = 0; i < arr.length; i++) if (!arr[i].dead) arr[j++] = arr[i];
  arr.length = j;
}

// --- 画像（事前描画） ---
const FONT = '"Orbitron", "Hiragino Kaku Gothic ProN", "Hiragino Sans", "Yu Gothic", "Meiryo", "Noto Sans JP", sans-serif';
const BPAD = 10; // 弾の発光用の余白

function tint(color, amt) {
  const [r, g, b] = color.match(/\d+/g).map(Number);
  const t = amt < 0 ? 0 : 255, p = Math.abs(amt);
  return `rgb(${Math.round(r + (t - r) * p)},${Math.round(g + (t - g) * p)},${Math.round(b + (t - b) * p)})`;
}
function grad(c, x0, y0, x1, y1, stops) {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  stops.forEach(([o, col]) => g.addColorStop(o, col));
  return g;
}
function outlinePoly(c, pts, color, w = 1) {
  c.strokeStyle = color; c.lineWidth = w; c.lineJoin = 'round';
  c.beginPath();
  c.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
  c.closePath();
  c.stroke();
}
function glowEllipse(c, fill, x, y, w, h, glow, blur) {
  c.save();
  c.shadowColor = glow; c.shadowBlur = blur;
  fillEllipse(c, fill, x, y, w, h);
  c.restore();
}
function glowCircle(c, fill, x, y, r, blur) {
  c.save();
  c.shadowColor = fill; c.shadowBlur = blur;
  fillCircle(c, fill, x, y, r);
  c.restore();
}

function renderShip(cfg, override) {
  const c = makeCanvas(60, 60), g = c.getContext('2d');
  const base = override || cfg.base;
  const wing = override ? tint(cfg.wing, 0.4) : cfg.wing;
  const hull = [[30, 15], [0, 50], [60, 50]];
  // 主翼
  fillPoly(g, grad(g, 0, 15, 0, 52, [[0, tint(base, 0.45)], [1, tint(base, -0.5)]]), hull);
  outlinePoly(g, hull, tint(base, 0.65), 1);
  // 翼端フィン
  const finL = [[0, 50], [4, 36], [13, 48]], finR = [[60, 50], [56, 36], [47, 48]];
  fillPoly(g, tint(wing, -0.35), finL); outlinePoly(g, finL, tint(wing, 0.5), 1);
  fillPoly(g, tint(wing, -0.35), finR); outlinePoly(g, finR, tint(wing, 0.5), 1);
  // 胴体（円柱っぽく見せる横グラデ）
  const body = [[30, 0], [15, 55], [45, 55]];
  fillPoly(g, grad(g, 15, 0, 45, 0, [[0, tint(wing, -0.45)], [0.5, tint(wing, 0.5)], [1, tint(wing, -0.45)]]), body);
  outlinePoly(g, body, 'rgba(255,255,255,0.45)', 1);
  // エンジン
  g.fillStyle = 'rgb(40,45,55)';
  g.fillRect(21, 51, 7, 5); g.fillRect(32, 51, 7, 5);
  // コックピット
  const rg = g.createRadialGradient(30, 24, 1, 30, 27, 11);
  rg.addColorStop(0, '#ffffff'); rg.addColorStop(0.5, cfg.cockpit); rg.addColorStop(1, tint(cfg.cockpit, -0.6));
  glowEllipse(g, rg, 26, 18, 8, 18, cfg.cockpit, 8);
  // 翼端ライト
  glowCircle(g, 'rgb(255,60,60)', 4, 46, 2, 6);
  glowCircle(g, 'rgb(60,255,120)', 56, 46, 2, 6);
  return c;
}

const enemyImages = (() => {
  // UFO
  const ufo = makeCanvas(60, 60), g1 = ufo.getContext('2d');
  const dg = g1.createRadialGradient(28, 14, 1, 30, 22, 16);
  dg.addColorStop(0, tint(ENEMY_LIGHT, 0.6)); dg.addColorStop(1, ENEMY_DARK);
  fillEllipse(g1, dg, 18, 8, 24, 22);
  glowEllipse(g1, ENEMY_COCKPIT, 23, 14, 14, 10, ENEMY_COCKPIT, 8);
  fillEllipse(g1, grad(g1, 0, 22, 0, 44, [[0, tint(ENEMY_LIGHT, 0.3)], [0.5, ENEMY_DARK], [1, 'rgb(25,15,25)']]), 4, 22, 52, 22);
  g1.strokeStyle = 'rgba(255,100,190,0.7)'; g1.lineWidth = 1;
  g1.beginPath(); g1.ellipse(30, 33, 25, 10, 0, 0, Math.PI * 2); g1.stroke();
  [12, 23, 37, 48].forEach((x, i) => glowCircle(g1, i % 2 ? YELLOW : 'rgb(255,80,160)', x, 35, 2, 6));

  // ファイター
  const fighter = makeCanvas(60, 60), g2 = fighter.getContext('2d');
  const wingPts = [[30, 45], [0, 10], [60, 10]];
  fillPoly(g2, grad(g2, 0, 10, 0, 45, [[0, tint(ENEMY_LIGHT, 0.2)], [1, 'rgb(30,20,30)']]), wingPts);
  outlinePoly(g2, wingPts, 'rgba(255,60,140,0.85)', 1.5);
  const bodyPts = [[30, 60], [15, 5], [45, 5]];
  fillPoly(g2, grad(g2, 15, 0, 45, 0, [[0, 'rgb(60,40,60)'], [0.5, ENEMY_LIGHT], [1, 'rgb(60,40,60)']]), bodyPts);
  outlinePoly(g2, bodyPts, 'rgba(255,255,255,0.3)', 1);
  glowEllipse(g2, ENEMY_COCKPIT, 26, 24, 8, 18, ENEMY_COCKPIT, 10);
  glowCircle(g2, 'rgb(255,60,60)', 5, 12, 2, 6);
  glowCircle(g2, 'rgb(255,60,60)', 55, 12, 2, 6);
  return { ufo, fighter };
})();

function renderBoss(isHit) {
  const c = makeCanvas(120, 100), g = c.getContext('2d');
  const lamp = isHit ? WHITE : 'rgb(50,255,90)';
  // 船体
  const hull = isHit ? WHITE
    : grad(g, 0, 30, 0, 80, [[0, 'rgb(140,110,185)'], [0.45, 'rgb(60,40,80)'], [1, 'rgb(22,12,38)']]);
  fillEllipse(g, hull, 0, 30, 120, 50);
  g.strokeStyle = isHit ? WHITE : 'rgba(210,160,255,0.75)'; g.lineWidth = 2;
  g.beginPath(); g.ellipse(60, 55, 59, 24, 0, 0, Math.PI * 2); g.stroke();
  // ドーム
  let dome = LIGHT_GRAY;
  if (!isHit) {
    dome = g.createRadialGradient(54, 22, 2, 60, 30, 28);
    dome.addColorStop(0, 'rgb(210,255,255)'); dome.addColorStop(0.5, 'rgb(0,220,255)'); dome.addColorStop(1, 'rgb(0,80,130)');
  }
  glowEllipse(g, dome, 35, 10, 50, 40, isHit ? WHITE : CYAN, 12);
  if (!isHit) fillEllipse(g, 'rgba(255,255,255,0.8)', 45, 15, 20, 10);
  // ライト
  [[15, 55], [45, 65], [75, 65], [105, 55]].forEach(([x, y]) => glowCircle(g, lamp, x, y, 6, 10));
  // 砲口
  g.fillStyle = grad(g, 0, 80, 0, 90, [[0, 'rgb(150,150,160)'], [1, 'rgb(60,60,70)']]);
  g.fillRect(45, 80, 30, 10);
  g.save(); g.shadowColor = ORANGE; g.shadowBlur = 12;
  g.fillStyle = ORANGE; g.fillRect(50, 90, 20, 5);
  g.restore();
  return c;
}
const bossImages = { normal: renderBoss(false), hit: renderBoss(true) };

function renderBattleship(isHit) {
  const c = makeCanvas(220, 140), g = c.getContext('2d');
  const hull = isHit ? WHITE : grad(g, 0, 25, 0, 115, [
    [0, 'rgb(150,190,205)'], [0.45, 'rgb(45,75,100)'], [1, 'rgb(12,25,45)'],
  ]);
  const shape = [[110, 0], [145, 36], [215, 65], [190, 102], [145, 95],
    [125, 132], [110, 116], [95, 132], [75, 95], [30, 102], [5, 65], [75, 36]];
  fillPoly(g, hull, shape);
  outlinePoly(g, shape, isHit ? WHITE : 'rgba(130,240,255,0.9)', 2);
  fillPoly(g, isHit ? WHITE : 'rgb(25,45,70)', [[75, 35], [110, 10], [145, 35], [160, 78], [60, 78]]);
  glowEllipse(g, isHit ? WHITE : 'rgb(0,230,255)', 92, 28, 36, 40, CYAN, 16);
  for (const x of [27, 55, 165, 193]) {
    g.fillStyle = isHit ? WHITE : 'rgb(30,60,85)';
    g.fillRect(x - 6, 65, 12, 34);
    glowCircle(g, isHit ? WHITE : ORANGE, x, 101, 5, 10);
  }
  for (const x of [82, 110, 138]) {
    g.fillStyle = isHit ? WHITE : 'rgb(95,125,150)';
    g.fillRect(x - 5, 88, 10, 26);
    glowCircle(g, isHit ? WHITE : CYAN, x, 115, 4, 8);
  }
  return c;
}
const battleshipImages = { normal: renderBattleship(false), hit: renderBattleship(true) };

function renderPlayerBoss(cfg, isHit) {
  const c = makeCanvas(150, 150), g = c.getContext('2d');
  g.drawImage(renderShip(cfg), 0, 0, 150, 150);
  const armor = isHit ? WHITE : tint(cfg.base, -0.35);
  const edge = isHit ? WHITE : tint(cfg.base, 0.6);
  fillPoly(g, armor, [[4, 83], [25, 65], [52, 83], [42, 105], [18, 112]]);
  outlinePoly(g, [[4, 83], [25, 65], [52, 83], [42, 105], [18, 112]], edge, 2);
  fillPoly(g, armor, [[146, 83], [125, 65], [98, 83], [108, 105], [132, 112]]);
  outlinePoly(g, [[146, 83], [125, 65], [98, 83], [108, 105], [132, 112]], edge, 2);
  for (const x of [39, 111]) {
    g.fillStyle = isHit ? WHITE : 'rgb(45,55,75)';
    g.fillRect(x - 5, 86, 10, 31);
    glowCircle(g, isHit ? WHITE : ORANGE, x, 116, 5, 10);
  }
  if (isHit) {
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.fillRect(0, 0, 150, 150);
    g.globalCompositeOperation = 'source-over';
  }
  return c;
}
const playerBossImages = SHIPS.map(cfg => ({
  normal: renderPlayerBoss(cfg, false),
  hit: renderPlayerBoss(cfg, true),
}));

const bulletCache = {};
function bulletImage(w, h, color) {
  const key = `${w}x${h}${color}`;
  if (!bulletCache[key]) {
    const c = makeCanvas(w + BPAD * 2, h + BPAD * 2), g = c.getContext('2d');
    g.shadowColor = color; g.shadowBlur = 10;
    fillEllipse(g, color, BPAD, BPAD, w, h);
    fillEllipse(g, color, BPAD, BPAD, w, h);
    g.shadowBlur = 0;
    const cx = BPAD + w / 2, cy = BPAD + h / 2;
    const rg = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) / 2);
    rg.addColorStop(0, '#ffffff'); rg.addColorStop(0.6, '#ffffff'); rg.addColorStop(1, color);
    fillEllipse(g, rg, BPAD + 2, BPAD + 2, w - 4, h - 4);
    bulletCache[key] = c;
  }
  return bulletCache[key];
}

// エンジンの炎（アニメーション）
function drawFlame(c, x, y) {
  const len = 12 + Math.random() * 10;
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.fillStyle = grad(c, 0, y, 0, y + len, [[0, 'rgba(255,255,255,0.95)'], [0.35, 'rgba(255,170,40,0.8)'], [1, 'rgba(255,60,0,0)']]);
  c.beginPath();
  c.moveTo(x - 8, y); c.lineTo(x, y + len); c.lineTo(x + 8, y);
  c.closePath();
  c.fill();
  c.restore();
}

// 背景の星雲
const nebula = (() => {
  const c = makeCanvas(W, H), g = c.getContext('2d');
  const cols = ['90,40,200', '20,120,220', '200,40,140', '30,180,170'];
  for (let i = 0; i < 6; i++) {
    const x = rand(0, W), y = rand(0, H), r = rand(150, 280), col = cols[i % cols.length];
    for (const oy of [-H, 0, H]) {
      const rg = g.createRadialGradient(x, y + oy, 0, x, y + oy, r);
      rg.addColorStop(0, `rgba(${col},0.30)`); rg.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = rg; g.fillRect(0, 0, W, H);
    }
  }
  return c;
})();

// 画面全体のビネット＋走査線
const vignette = (() => {
  const c = makeCanvas(W, H), g = c.getContext('2d');
  const rg = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.78);
  rg.addColorStop(0, 'rgba(0,0,0,0)'); rg.addColorStop(1, 'rgba(0,0,0,0.6)');
  g.fillStyle = rg; g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(0,0,0,0.12)';
  for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);
  return c;
})();

const shipPreviews = SHIPS.map(cfg => renderShip(cfg));
const SHIP_INFO = [
  { name: 'TYPE A', desc: '万能型 / レーザー', charge: 'Jを長押しして離すと、貫通レーザー' },
  { name: 'TYPE B', desc: '高速・ツインショット', charge: 'チャージ攻撃なし（左右2連射）' },
  { name: 'TYPE C', desc: '高速チャージ / レーザー', charge: 'Jを長押しして離すと、貫通レーザー' },
  { name: 'TYPE D', desc: '爆弾 / 範囲攻撃', charge: 'Jを長押しして離すと、5方向の大型爆弾' },
  { name: 'TYPE E', desc: '重装甲 / レーザー', charge: 'Jを長押しして離すと、貫通レーザー' },
  { name: 'TYPE F', desc: 'ホーミング弾', charge: 'Jを長押しして離すと、ホーミング10連射' },
];

// 演出用の状態
let nebulaY = 0, shake = 0, hitFlash = 0, warning = 0;

// --- ゲーム状態 ---
let state = 'title';          // title / select / play / gameover
let selectedType = 0;
let score = 0;
let isNewRecord = false;
let now = performance.now();
let nextBossScore = 1000;
let bossActive = false;
let enemySpawnLimit = 5;
let hiScore = 0;
try { hiScore = parseInt(localStorage.getItem('spaceFighterHi') || '0', 10) || 0; } catch (e) { /* 保存不可の環境 */ }
function saveHi() { try { localStorage.setItem('spaceFighterHi', String(hiScore)); } catch (e) { /* 無視 */ } }

let player = null;
const enemies = [], bullets = [], enemyBullets = [], lasers = [], bosses = [];
const bossBeams = [], bossProjectiles = [], bossBlasts = [];
const particles = [], shockwaves = [];
const stars = Array.from({ length: 60 }, () => ({ x: randint(0, W), y: randint(0, H), speed: rand(0.5, 2.0) }));
const keys = new Set();
const mobileControls = document.getElementById('mobile-controls');
for (const button of mobileControls.querySelectorAll('button[data-key]')) {
  const key = button.dataset.key;
  const release = () => {
    keys.delete(key);
    button.classList.remove('is-pressed');
  };
  button.addEventListener('pointerdown', e => {
    e.preventDefault();
    button.setPointerCapture(e.pointerId);
    keys.add(key);
    button.classList.add('is-pressed');
  });
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('lostpointercapture', release);
}

class Entity {
  constructor(x, y, w, h) { this.x = x; this.y = y; this.w = w; this.h = h; this.dead = false; }
  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
  get bottom() { return this.y + this.h; }
  get right() { return this.x + this.w; }
}

// --- プレイヤー ---
class Player extends Entity {
  constructor(type) {
    super(W / 2 - 30, H - 20 - 60, 60, 60);
    this.type = type;
    this.cfg = SHIPS[type];
    this.img = renderShip(this.cfg);
    this.imgCharged = renderShip(this.cfg, CYAN);
    this.maxHp = this.cfg.hp;
    this.hp = this.maxHp;
    this.invincible = false;
    this.invTimer = 0;
    this.lastShot = 0;
    this.isCharging = false;
    this.chargeStart = 0;
    this.cPressedLast = false;
    this.burstCount = 0;
    this.lastBurst = 0;
  }

  get charged() { return this.isCharging && now - this.chargeStart >= this.cfg.charge; }

  update() {
    if (this.invincible && now - this.invTimer > 1500) this.invincible = false;
    if (state !== 'play') return;

    if (keys.has('KeyA')) this.x -= this.cfg.speed;
    if (keys.has('KeyD')) this.x += this.cfg.speed;
    if (keys.has('Space')) this.shoot();

    // ホーミング連射（TYPE F）
    if (this.burstCount > 0 && now - this.lastBurst > 80) {
      this.lastBurst = now;
      new Bullet(this.cx, this.y, -10, YELLOW, bullets, { player: true, homing: true });
      this.burstCount--;
    }

    // Cキーでチャージ（TYPE Bはチャージなし）
    if (keys.has('KeyJ') && this.type !== 1) {
      if (!this.isCharging) {
        this.isCharging = true;
        this.chargeStart = now;
      }
      if (!this.charged && Math.random() < 0.4) {
        const ang = rand(0, 6.28);
        particles.push(new Particle(
          this.cx + Math.cos(ang) * 60, this.cy + Math.sin(ang) * 60,
          { gather: true, target: [this.cx, this.cy] }));
      }
      this.cPressedLast = true;
    } else {
      if (this.cPressedLast && this.isCharging) {
        if (now - this.chargeStart >= this.cfg.charge) this.fireCharge();
        this.isCharging = false;
      }
      this.cPressedLast = false;
    }
    this.x = Math.max(0, Math.min(W - this.w, this.x));
  }

  fireCharge() {
    if (this.type === 3) {
      const shots = [[-4, -8, H / 2 - 80], [-2, -11, H / 2 - 160], [0, -8, H / 2 - 100],
                     [2, -11, H / 2 - 160], [4, -8, H / 2 - 80]];
      for (const [vx, vy, ty] of shots) {
        const b = new Bullet(this.cx, this.y, vy, PURPLE, bullets, { player: true, bomb: true, charge: true });
        b.vx = vx; b.targetY = ty;
      }
    } else if (this.type === 5) {
      this.burstCount = 10;
      this.lastBurst = now;
    } else {
      lasers.push(new Laser(this));
    }
  }

  shoot() {
    const delay = this.isCharging ? this.cfg.delay * 2 : this.cfg.delay;
    if (now - this.lastShot <= delay) return;
    this.lastShot = now;
    if (this.type === 1) {
      new Bullet(this.x + 5, this.y + 20, -12, CYAN, bullets, { player: true });
      new Bullet(this.right - 5, this.y + 20, -12, CYAN, bullets, { player: true });
    } else if (this.type === 3) {
      new Bullet(this.cx, this.y, -10, PURPLE, bullets, { player: true, bomb: true });
    } else if (this.type === 5) {
      new Bullet(this.cx, this.y, -10, YELLOW, bullets, { player: true, homing: true });
    } else {
      new Bullet(this.cx, this.y, -12, CYAN, bullets, { player: true });
    }
  }

  draw(c) {
    const flash = this.charged && Math.floor(now / 50) % 2 === 0;
    if (!flash && this.invincible && Math.floor(now / 100) % 2 === 0) return;
    drawFlame(c, this.cx, this.y + 54);
    c.drawImage(flash ? this.imgCharged : this.img, Math.round(this.x), Math.round(this.y));
    // チャージリング
    if (this.isCharging) {
      const prog = Math.min(1, (now - this.chargeStart) / this.cfg.charge);
      c.save();
      c.shadowColor = CYAN; c.shadowBlur = 12;
      c.lineWidth = 3;
      c.strokeStyle = prog >= 1 ? WHITE : 'rgba(0,255,255,0.75)';
      c.beginPath();
      c.arc(this.cx, this.cy, 44, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * prog);
      c.stroke();
      if (prog >= 1) {
        c.strokeStyle = 'rgba(0,255,255,0.5)';
        c.beginPath();
        c.arc(this.cx, this.cy, 48 + Math.sin(now / 60) * 4, 0, Math.PI * 2);
        c.stroke();
      }
      c.restore();
    }
  }
}

// --- ザコ敵 ---
class Enemy extends Entity {
  constructor() {
    super(0, 0, 60, 60);
    this.spawn();
  }
  spawn() {
    this.type = choice(['ufo', 'fighter']);
    if (this.type === 'ufo') {
      this.sy = randint(2, 4); this.ws = rand(0.05, 0.1); this.wa = randint(2, 5); this.angle = rand(0, 6.2);
    } else {
      this.sy = randint(4, 7); this.ws = 0; this.wa = 0; this.angle = 0;
    }
    this.x = randint(0, W - 60);
    this.y = randint(-300, -50);
  }
  update() {
    if (this.dead) return;
    this.y += this.sy;
    if (this.type === 'ufo') {
      this.angle += this.ws;
      this.x += Math.trunc(Math.sin(this.angle) * this.wa);
    }
    if (this.y > H) {
      const activeOthers = enemies.filter(enemy => enemy !== this && !enemy.dead).length;
      if (activeOthers < enemySpawnLimit) this.spawn();
      else { this.dead = true; return; }
    }
    if (this.bottom > 0 && this.bottom < H && Math.random() < 0.015) {
      new Bullet(this.cx, this.bottom, 6, RED, enemyBullets, { player: false });
    }
  }
  draw(c) { c.drawImage(enemyImages[this.type], Math.round(this.x), Math.round(this.y)); }
}
function spawnEnemy() {
  if (enemies.filter(enemy => !enemy.dead).length < enemySpawnLimit) enemies.push(new Enemy());
}

// --- ボス ---
class Boss extends Entity {
  constructor(type) {
    const size = type === 2 ? [220, 140] : type === 3 ? [150, 150] : [120, 100];
    super(W / 2 - size[0] / 2, -size[1] - 100, size[0], size[1]);
    this.type = type;
    this.maxHp = type === 2 ? 90 : type === 3 ? 120 : 50;
    this.hp = this.maxHp;
    this.speedY = 2;
    this.speedX = type === 1 ? 3 : 2.5;
    this.direction = 1;
    this.hitTimer = 0;
    this.isHit = false;
    this.nextAttack = now + (type === 2 ? 1800 : 1400);
  }
  flash(frames) { this.hitTimer = frames; this.isHit = true; }
  update() {
    if (this.hitTimer > 0 && --this.hitTimer === 0) this.isHit = false;
    if (this.y < 50) {
      this.y += this.speedY;
      return;
    }
    this.x += this.speedX * this.direction;
    if (this.right > W - 20 || this.x < 20) this.direction *= -1;

    if (this.type === 1) {
      if (Math.random() < 0.03) {
        new Bullet(this.cx, this.bottom, 8, ORANGE, enemyBullets, { player: false });
      }
    } else if (now >= this.nextAttack) {
      if (this.type === 2) {
        bossBeams.push(new BossBeam(this));
        this.nextAttack = now + 2400;
      } else {
        bossProjectiles.push(new BossProjectile(this.cx, this.bottom, player.cx, player.cy));
        this.nextAttack = now + 1250;
      }
    }
  }
  draw(c) {
    const image = this.isHit ? 'hit' : 'normal';
    if (this.type === 3) {
      c.save();
      c.translate(Math.round(this.x), Math.round(this.y + this.h));
      c.scale(1, -1);
      c.drawImage(playerBossImages[selectedType][image], 0, 0);
      c.restore();
      return;
    }
    if (this.type === 2) {
      c.save();
      c.translate(Math.round(this.x), Math.round(this.y + this.h));
      c.scale(1, -1);
      c.drawImage(battleshipImages[image], 0, 0);
      c.restore();
      return;
    }
    const images = bossImages;
    c.drawImage(images[image], Math.round(this.x), Math.round(this.y));
  }
}

class BossBeam extends Entity {
  constructor(boss) {
    const w = 48;
    super(boss.cx - w / 2, boss.bottom, w, H - boss.bottom);
    this.boss = boss;
    this.startedAt = now;
    this.hitPlayer = false;
  }
  update() {
    if (now - this.startedAt > 650) this.dead = true;
    if (!this.boss.dead) {
      this.x = this.boss.cx - this.w / 2;
      this.y = this.boss.bottom;
      this.h = H - this.y;
    }
  }
  canHitPlayer() {
    if (this.dead || this.hitPlayer) return false;
    this.hitPlayer = true;
    return true;
  }
  draw(c) {
    const fade = Math.min(1, (now - this.startedAt) / 90);
    c.save();
    c.globalAlpha = fade;
    c.fillStyle = grad(c, this.x, 0, this.right, 0, [
      [0, 'rgba(255,40,20,0)'], [0.25, 'rgba(255,70,30,0.8)'],
      [0.5, 'rgba(255,245,210,0.95)'], [0.75, 'rgba(255,70,30,0.8)'],
      [1, 'rgba(255,40,20,0)'],
    ]);
    c.shadowColor = RED; c.shadowBlur = 18;
    c.fillRect(this.x, this.y, this.w, this.h);
    c.restore();
  }
}

class BossProjectile extends Entity {
  constructor(x, y, targetX, targetY) {
    super(x - 18, y, 36, 48);
    const angle = Math.atan2(targetY - y, targetX - x);
    this.vx = Math.cos(angle) * 5.5;
    this.vy = Math.sin(angle) * 5.5;
    this.explosionRadius = 100;
  }
  update() {
    this.x += this.vx;
    this.y += this.vy;
    const dx = Math.max(player.x - this.cx, 0, this.cx - player.right);
    const dy = Math.max(player.y - this.cy, 0, this.cy - player.bottom);
    if (Math.hypot(dx, dy) <= this.explosionRadius) {
      this.dead = true;
      bossBlasts.push(new BossBlast(this.cx, this.cy, this.explosionRadius));
      bigBoom(this.cx, this.cy, 1.8);
      shake = Math.max(shake, 7);
      return;
    }
    if (this.bottom < 0 || this.y > H || this.right < 0 || this.x > W) this.dead = true;
  }
  draw(c) {
    c.save();
    c.translate(this.cx, this.cy);
    c.rotate(Math.atan2(this.vy, this.vx) + Math.PI / 2);
    c.shadowColor = ORANGE; c.shadowBlur = 18;
    c.fillStyle = grad(c, -18, 0, 18, 0, [
      [0, 'rgb(130,30,20)'], [0.5, 'rgb(255,120,25)'], [1, 'rgb(130,30,20)'],
    ]);
    c.beginPath();
    c.moveTo(0, -25); c.lineTo(17, -7); c.lineTo(14, 19);
    c.lineTo(0, 24); c.lineTo(-14, 19); c.lineTo(-17, -7);
    c.closePath(); c.fill();
    c.fillStyle = WHITE;
    c.beginPath(); c.ellipse(0, 0, 6, 11, 0, 0, Math.PI * 2); c.fill();
    c.restore();
  }
}

class BossBlast {
  constructor(x, y, maxRadius) {
    this.x = x;
    this.y = y;
    this.radius = 18;
    this.maxRadius = maxRadius;
    this.hitPlayer = false;
    this.dead = false;
  }
  update() {
    this.radius += 7;
    if (this.radius >= this.maxRadius) this.dead = true;
  }
  canHitPlayer() {
    if (this.dead || this.hitPlayer) return false;
    const dx = Math.max(player.x - this.x, 0, this.x - player.right);
    const dy = Math.max(player.y - this.y, 0, this.y - player.bottom);
    if (Math.hypot(dx, dy) > this.radius) return false;
    this.hitPlayer = true;
    return true;
  }
  draw(c) {
    const fade = 1 - this.radius / this.maxRadius;
    const gradient = c.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.radius);
    gradient.addColorStop(0, `rgba(255,255,220,${0.9 * fade})`);
    gradient.addColorStop(0.35, `rgba(255,160,35,${0.85 * fade})`);
    gradient.addColorStop(1, 'rgba(255,55,10,0)');
    c.fillStyle = gradient;
    c.beginPath();
    c.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    c.fill();
  }
}

function killBoss(boss) {
  const cx = boss.cx, cy = boss.cy;
  score += 100;
  shake = 8;
  boss.dead = true;
  bossActive = false;
  player.hp = Math.min(player.maxHp, player.hp + 1);
  enemySpawnLimit = 5;
  while (enemies.filter(enemy => !enemy.dead).length < enemySpawnLimit) spawnEnemy();
  triggerExplosion(cx, cy);
  for (let i = 1; i <= 8; i++) {
    timers.push({ t: i * 5, fn: () => {
      bigBoom(cx + rand(-55, 55), cy + rand(-35, 35), 0.8);
      shake = Math.max(shake, 4);
    } });
  }
  timers.push({ t: 50, fn: () => {
    triggerExplosion(cx, cy);
    bigBoom(cx, cy, 2);
    shake = 10;
  } });
}

// --- 弾 ---
class Bullet extends Entity {
  constructor(x, y, speed, color, group, opts = {}) {
    const isPlayer = !!opts.player;
    const w = opts.bomb ? 14 : (isPlayer ? 10 : 8);
    const h = isPlayer ? 24 : 18;
    super(x - w / 2, speed > 0 ? y : y - h, w, h);
    this.img = bulletImage(w, h, color);
    this.speed = speed;
    this.vx = 0;
    this.targetY = -100;
    this.isBomb = !!opts.bomb;
    this.isCharge = !!opts.charge;
    this.homing = !!opts.homing;
    this.realX = x;
    this.realY = this.y;
    this.homingStartY = y - 120;
    this.angle = -Math.PI / 2;
    this.homingTimer = 5;
    group.push(this);
  }

  update() {
    if (this.homing && this.speed < 0 && this.y < this.homingStartY && this.homingTimer > 0) {
      this.homingTimer--;
      let closest = null, minDist = 999999;
      for (const e of enemies) {
        if (e.dead) continue;
        if (e.cy < this.y) {
          const d = Math.hypot(e.cx - this.cx, e.cy - this.y);
          if (d < minDist) { minDist = d; closest = e; }
        }
      }
      if (closest) {
        const target = Math.atan2(closest.cy - this.realY, closest.cx - this.realX);
        const TWO_PI = Math.PI * 2;
        const diff = ((((target - this.angle + Math.PI) % TWO_PI) + TWO_PI) % TWO_PI) - Math.PI;
        if (diff > 0.05) this.angle += 0.05;
        else if (diff < -0.05) this.angle -= 0.05;
        else this.angle = target;
        this.vx = Math.cos(this.angle) * 11;
        this.speed = Math.sin(this.angle) * 11;
      }
    }

    this.realX += this.vx;
    this.realY += this.speed;
    this.x = Math.trunc(this.realX) - this.w / 2;
    this.y = Math.trunc(this.realY);

    if (this.isBomb && this.speed < 0 && this.y <= this.targetY) {
      triggerExplosion(this.cx, this.cy, 1.5);
      this.dead = true;
      return;
    }
    if (this.bottom < 0 || this.y > H || this.right < 0 || this.x > W) this.dead = true;
  }

  draw(c) { c.drawImage(this.img, Math.round(this.x) - BPAD, Math.round(this.y) - BPAD); }
}

// --- レーザー ---
class Laser extends Entity {
  constructor(p) {
    super(p.cx - 15, p.y - H, 30, H);
    this.player = p;
    this.spawnTime = now;
  }
  update() {
    this.x = this.player.cx - 15;
    this.y = this.player.y - H;
    if (now - this.spawnTime > 1000) this.dead = true;
  }
  draw(c) {
    const half = 15 * (1 + Math.sin(now / 30) * 0.1) + 8;
    const cx = this.cx;
    c.fillStyle = grad(c, cx - half, 0, cx + half, 0, [
      [0, 'rgba(0,255,255,0)'], [0.25, 'rgba(0,200,255,0.75)'], [0.5, 'rgba(255,255,255,1)'],
      [0.75, 'rgba(0,200,255,0.75)'], [1, 'rgba(0,255,255,0)']]);
    c.fillRect(cx - half, this.y, half * 2, this.h);
  }
}

// --- パーティクル ---
class Particle {
  constructor(x, y, opts = {}) {
    this.x = x; this.y = y;
    if (opts.gather && opts.target) {
      this.lt = 15;
      this.vx = (opts.target[0] - x) / 12;
      this.vy = (opts.target[1] - y) / 12;
      this.color = CYAN;
    } else {
      const mult = opts.speedMult || 1.0;
      this.lt = randint(20, 40);
      const ang = rand(0, 6.28), sp = rand(3, 8) * mult;
      this.vx = Math.cos(ang) * sp;
      this.vy = Math.sin(ang) * sp;
      this.color = opts.color || choice([ORANGE, YELLOW, RED]);
    }
  }
  update() { this.x += this.vx; this.y += this.vy; this.lt--; }
  draw(c) {
    if (this.lt <= 0) return;
    c.globalAlpha = Math.min(1, this.lt / 18);
    fillCircle(c, this.color, this.x, this.y, Math.max(1.2, this.lt / 5.5));
    c.globalAlpha = 1;
  }
}

// --- 衝撃波 ---
class Shockwave {
  constructor(x, y, maxRadius = 75, bossDamage = 2) {
    this.x = x; this.y = y;
    this.radius = 5; this.maxRadius = maxRadius; this.speed = 4;
    this.bossDamage = bossDamage;
    this.alive = true;
    this.hit = new Set();
  }
  update() {
    this.radius += this.speed;
    if (this.radius >= this.maxRadius) this.alive = false;

    for (const e of [...enemies]) {
      if (e.dead || this.hit.has(e)) continue;
      if (Math.hypot(e.cx - this.x, e.cy - this.y) <= this.radius) {
        this.hit.add(e);
        score += 10;
        for (let i = 0; i < 15; i++) particles.push(new Particle(e.cx, e.cy));
        smallBoom(e.cx, e.cy);
        e.dead = true;
        spawnEnemy();
      }
    }
    for (const b of [...bosses]) {
      if (b.dead || this.hit.has(b)) continue;
      if (Math.hypot(b.cx - this.x, b.cy - this.y) <= this.radius) {
        this.hit.add(b);
        b.hp -= this.bossDamage;
        b.flash(3);
        if (b.hp <= 0) killBoss(b);
      }
    }
  }
  draw(c) {
    if (!this.alive) return;
    const t = 1 - this.radius / this.maxRadius;
    const rg = c.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.radius);
    rg.addColorStop(0, 'rgba(255,200,80,0)'); rg.addColorStop(1, `rgba(255,140,40,${0.35 * t})`);
    c.fillStyle = rg;
    c.beginPath(); c.arc(this.x, this.y, this.radius, 0, Math.PI * 2); c.fill();
    c.save();
    c.strokeStyle = `rgba(255,220,140,${0.4 + 0.6 * t})`;
    c.lineWidth = Math.max(1.5, 5 * t);
    c.shadowColor = ORANGE; c.shadowBlur = 14;
    c.beginPath(); c.arc(this.x, this.y, this.radius, 0, Math.PI * 2); c.stroke();
    c.restore();
  }
}

// --- 爆発エフェクト（見た目専用） ---
const fx = [], timers = [];

class Flash {
  constructor(x, y, r) { this.x = x; this.y = y; this.r = r; this.t = 0; this.life = 12; this.done = false; }
  update() { if (++this.t >= this.life) this.done = true; }
  draw(c) {
    const p = this.t / this.life, r = this.r * (0.35 + 0.65 * Math.sqrt(p)), a = 1 - p;
    const g = c.createRadialGradient(this.x, this.y, 0, this.x, this.y, r);
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(0.35, `rgba(255,220,120,${a * 0.8})`);
    g.addColorStop(1, 'rgba(255,90,20,0)');
    c.fillStyle = g;
    c.beginPath(); c.arc(this.x, this.y, r, 0, Math.PI * 2); c.fill();
  }
}

class Ring {
  constructor(x, y, r, delay = 0) { this.x = x; this.y = y; this.r = r; this.t = -delay; this.life = 24; this.done = false; }
  update() { if (++this.t >= this.life) this.done = true; }
  draw(c) {
    if (this.t < 0) return;
    const p = this.t / this.life, e = 1 - (1 - p) * (1 - p), r = 10 + (this.r - 10) * e;
    c.save();
    c.strokeStyle = `rgba(255,210,130,${1 - p})`;
    c.lineWidth = 1 + 6 * (1 - p);
    c.shadowColor = ORANGE; c.shadowBlur = 14;
    c.beginPath(); c.arc(this.x, this.y, r, 0, Math.PI * 2); c.stroke();
    c.restore();
  }
}

class Spark {
  constructor(x, y, speed) {
    const a = rand(0, Math.PI * 2), sp = rand(speed * 0.3, speed);
    this.x = x; this.y = y;
    this.vx = Math.cos(a) * sp; this.vy = Math.sin(a) * sp;
    this.lt = this.max = randint(18, 36);
    this.color = choice(['rgb(255,255,255)', 'rgb(255,230,120)', 'rgb(255,150,40)', 'rgb(255,80,40)']);
    this.done = false;
  }
  update() {
    this.x += this.vx; this.y += this.vy;
    this.vx *= 0.93; this.vy = this.vy * 0.93 + 0.12;
    if (--this.lt <= 0) this.done = true;
  }
  draw(c) {
    const a = this.lt / this.max;
    c.globalAlpha = a;
    c.strokeStyle = this.color; c.lineWidth = 1 + a * 2; c.lineCap = 'round';
    c.beginPath();
    c.moveTo(this.x - this.vx * 2.5, this.y - this.vy * 2.5);
    c.lineTo(this.x, this.y);
    c.stroke();
    c.globalAlpha = 1;
  }
}

function bigBoom(x, y, s = 1) {
  fx.push(new Flash(x, y, 90 * s), new Ring(x, y, 125 * s, 0), new Ring(x, y, 85 * s, 6));
  for (let i = 0; i < Math.round(55 * s); i++) fx.push(new Spark(x, y, 13));
}
function smallBoom(x, y) {
  fx.push(new Flash(x, y, 38), new Ring(x, y, 52));
  for (let i = 0; i < 14; i++) fx.push(new Spark(x, y, 8));
}

function triggerExplosion(ex, ey, bossDamage = 2) {
  shockwaves.push(new Shockwave(ex, ey, 75, bossDamage));
  shake = Math.max(shake, 4);
  bigBoom(ex, ey);
  for (let i = 0; i < 70; i++) {
    particles.push(new Particle(ex, ey, { color: choice([ORANGE, RED, YELLOW, WHITE]), speedMult: 1.6 }));
  }
}

// --- ゲーム開始・リセット ---
function resetWorld() {
  enemies.length = 0; bullets.length = 0; enemyBullets.length = 0;
  lasers.length = 0; bosses.length = 0; bossBeams.length = 0;
  bossProjectiles.length = 0; bossBlasts.length = 0;
  shockwaves.length = 0; particles.length = 0;
  nextBossScore = 1000;
  bossActive = false;
  enemySpawnLimit = 5;
  warning = 0; shake = 0; hitFlash = 0;
  fx.length = 0; timers.length = 0;
}
function startGame() {
  resetWorld();
  score = 0;
  isNewRecord = false;
  player = new Player(selectedType);
  enemySpawnLimit = 5;
  for (let i = 0; i < 5; i++) spawnEnemy();
  state = 'play';
}

// --- 入力 ---
window.addEventListener('keydown', e => {
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
  keys.add(e.code);
  if (e.repeat) return;

  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (state === 'play') pauseGame();
    else if (state === 'paused') resumeGame();
  }

  if (state === 'title') {
    // タイトルからはクリック（プレイボタン）でのみ進む
  } else if (state === 'select') {
    if (e.code === 'KeyA' || e.code === 'ArrowLeft' || e.code === 'ArrowUp') selectedType = (selectedType + 5) % 6;
    else if (e.code === 'KeyD' || e.code === 'ArrowRight' || e.code === 'ArrowDown') selectedType = (selectedType + 1) % 6;
    else if (e.code === 'Space') startGame();
  } else if (state === 'gameover') {
    if (e.code === 'KeyR') activate('retry');
  }
});
window.addEventListener('keyup', e => keys.delete(e.code));
window.addEventListener('blur', () => {
  keys.clear();
  mobileControls.querySelectorAll('.is-pressed').forEach(button => button.classList.remove('is-pressed'));
  pauseGame();
});

// --- タイトルのボタン ---
const BTN_PRIMARY = { base: [70, 50, 0, 0.8], hover: [255, 170, 0, 0.95], press: [255, 235, 130, 1],
                      glow: YELLOW, border: YELLOW, textHover: '#1a0e00' };
const BTN_SECOND = { base: [0, 30, 60, 0.8], hover: [0, 140, 185, 0.95], press: [150, 255, 255, 1],
                     glow: CYAN, border: CYAN, textHover: WHITE };
const titleButtons = [
  { id: 'play',   label: 'プレイ',     x: W / 2 - 140, y: 510, w: 280, h: 58, size: 24, kind: 'primary',   t: 0, pressed: false },
];
const selectButtons = [
  { id: 'start', label: 'スタート',     x: W / 2 - 140, y: 628, w: 280, h: 54, size: 22, kind: 'primary',   t: 0, pressed: false },
  { id: 'back',  label: 'タイトルに戻る', x: W / 2 - 140, y: 694, w: 280, h: 54, size: 22, kind: 'secondary', t: 0, pressed: false },
];
const menuButton = { id: 'menu', kind: 'icon', label: '', x: W - 52, y: 8, w: 40, h: 40, size: 0, t: 0, pressed: false };
const pauseButtons = [
  { id: 'resume',  label: 'つづける',         x: W / 2 - 140, y: 340, w: 280, h: 54, size: 22, kind: 'primary',   t: 0, pressed: false },
  { id: 'restart', label: '最初からやり直す', x: W / 2 - 140, y: 406, w: 280, h: 54, size: 20, kind: 'secondary', t: 0, pressed: false },
  { id: 'quit',    label: 'タイトルに戻る',   x: W / 2 - 140, y: 472, w: 280, h: 54, size: 22, kind: 'secondary', t: 0, pressed: false },
];
const gameOverButtons = [
  { id: 'retry', label: 'リトライ',               x: W / 2 - 140, y: 360, w: 280, h: 54, size: 22, kind: 'primary',   t: 0, pressed: false },
  { id: 'selectShip', label: '機体を選択しなおす', x: W / 2 - 140, y: 426, w: 280, h: 54, size: 20, kind: 'secondary', t: 0, pressed: false },
  { id: 'gameOverTitle', label: 'タイトルに戻る', x: W / 2 - 140, y: 492, w: 280, h: 54, size: 22, kind: 'secondary', t: 0, pressed: false },
];
let pauseStart = 0;
const mouse = { x: -1, y: -1, down: false, pressed: null };

function hoverShip() {
  if (state !== 'select') return -1;
  const gap = 88, x0 = W / 2 - gap * 2.5;
  for (let i = 0; i < SHIPS.length; i++) {
    const cx = x0 + gap * i;
    if (mouse.x >= cx - 44 && mouse.x <= cx + 44 && mouse.y >= 135 && mouse.y <= 275) return i;
  }
  return -1;
}
function hoverBtn() {
  const list = state === 'title' ? titleButtons : state === 'select' ? selectButtons
             : state === 'play' ? [menuButton] : state === 'paused' ? pauseButtons
             : state === 'gameover' ? gameOverButtons : null;
  if (!list) return null;
  return list.find(b => mouse.x >= b.x && mouse.x <= b.x + b.w && mouse.y >= b.y && mouse.y <= b.y + b.h) || null;
}
function setMouse(e) {
  const r = canvas.getBoundingClientRect();
  mouse.x = (e.clientX - r.left) * W / r.width;
  mouse.y = (e.clientY - r.top) * H / r.height;
}
function pauseGame() {
  if (state !== 'play') return;
  state = 'paused';
  pauseStart = now;
  shake = 0;
}
function resumeGame() {
  if (state !== 'paused') return;
  const d = performance.now() - pauseStart;   // 停止していた時間ぶん、時間管理の値をずらす
  player.invTimer += d; player.chargeStart += d; player.lastShot += d; player.lastBurst += d;
  for (const l of lasers) l.spawnTime += d;
  state = 'play';
}
function activate(id) {
  if (id === 'play') state = 'select';
  else if (id === 'start') startGame();
  else if (id === 'back') state = 'title';
  else if (id === 'menu') pauseGame();
  else if (id === 'resume') resumeGame();
  else if (id === 'restart') { score = 0; startGame(); }
  else if (id === 'quit') state = 'title';
  else if (id === 'retry') startGame();
  else if (id === 'selectShip') { score = 0; resetWorld(); state = 'select'; }
  else if (id === 'gameOverTitle') { score = 0; state = 'title'; }
}
canvas.addEventListener('pointermove', setMouse);
canvas.addEventListener('pointerdown', e => {
  setMouse(e);
  mouse.down = true;
  mouse.pressed = hoverBtn();
  const si = hoverShip();
  if (si >= 0) {
    selectedType = si;
  }
});
window.addEventListener('pointerup', e => {
  setMouse(e);
  const b = hoverBtn();
  if (mouse.down && b && b === mouse.pressed) activate(b.id);
  mouse.down = false; mouse.pressed = null;
});
canvas.addEventListener('pointerleave', () => { if (!mouse.down) { mouse.x = -1; mouse.y = -1; } });

// --- 更新 ---
function step() {
  now = performance.now();
  mobileControls.classList.toggle('is-active', state === 'play');
  const hb = hoverBtn();
  for (const b of [...titleButtons, ...selectButtons, menuButton, ...pauseButtons, ...gameOverButtons]) {
    b.t += ((b === hb ? 1 : 0) - b.t) * 0.25;
    b.pressed = mouse.down && mouse.pressed === b && b === hb;
  }
  canvas.style.cursor = (hb || hoverShip() >= 0) ? 'pointer' : 'default';
  if (state === 'paused') return;

  nebulaY += 0.35;
  shake *= 0.9; if (shake < 0.3) shake = 0;
  hitFlash = Math.max(0, hitFlash - 0.04);
  if (warning > 0) warning--;

  for (const s of stars) {
    s.y += s.speed;
    if (s.y > H) { s.y = 0; s.x = randint(0, W); }
  }
  for (const p of particles) p.update();
  for (let i = particles.length - 1; i >= 0; i--) if (particles[i].lt <= 0) particles.splice(i, 1);
  for (const w of [...shockwaves]) w.update();
  for (let i = shockwaves.length - 1; i >= 0; i--) if (!shockwaves[i].alive) shockwaves.splice(i, 1);
  for (const tm of timers) { tm.t--; if (tm.t === 0) tm.fn(); }
  for (let i = timers.length - 1; i >= 0; i--) if (timers[i].t <= 0) timers.splice(i, 1);
  for (const f of fx) f.update();
  for (let i = fx.length - 1; i >= 0; i--) if (fx[i].done) fx.splice(i, 1);

  if (state === 'play') {
    // 1000点ごとにボス出現
    if (score >= nextBossScore && !bossActive) {
      const bossType = choice([1, 2, 3]);
      bosses.push(new Boss(bossType));
      enemySpawnLimit = bossType === 2 ? 0 : bossType === 3 ? 3 : 5;
      if (bossType === 3) {
        let remaining = enemies.filter(enemy => !enemy.dead).length;
        for (const enemy of enemies) {
          if (remaining <= enemySpawnLimit) break;
          if (!enemy.dead) {
            enemy.dead = true;
            smallBoom(enemy.cx, enemy.cy);
            remaining--;
          }
        }
      }
      warning = 90;
      bossActive = true;
      nextBossScore += 1000;
    }

    player.update();
    for (const e of enemies) e.update();
    for (const b of bosses) b.update();
    for (const b of bullets) b.update();
    for (const b of enemyBullets) b.update();
    for (const l of lasers) l.update();
    for (const b of bossBeams) b.update();
    for (const b of bossProjectiles) b.update();
    for (const blast of bossBlasts) blast.update();

    // 自機弾 vs ボス / ザコ
    for (const b of [...bullets]) {
      if (b.dead) continue;
      const hitBoss = bosses.find(bo => !bo.dead && overlap(b, bo));
      if (hitBoss) {
        hitBoss.hp -= b.isBomb ? 1.5 : 1;
        hitBoss.flash(3);
        for (let i = 0; i < 5; i++) particles.push(new Particle(b.cx, b.y, { color: WHITE, speedMult: 0.5 }));
        b.dead = true;
        if (hitBoss.hp <= 0) killBoss(hitBoss);
        continue;
      }
      const hitBossProjectile = bossProjectiles.find(projectile => !projectile.dead && overlap(b, projectile));
      if (hitBossProjectile) {
        hitBossProjectile.dead = true;
        b.dead = true;
        smallBoom(hitBossProjectile.cx, hitBossProjectile.cy);
        continue;
      }
      const hitEnemy = enemies.find(en => !en.dead && overlap(b, en));
      if (hitEnemy) {
        if (b.isBomb) {
          triggerExplosion(b.cx, b.cy, 1.5);
        } else {
          score += 10;
          for (let i = 0; i < 20; i++) particles.push(new Particle(hitEnemy.cx, hitEnemy.cy));
          smallBoom(hitEnemy.cx, hitEnemy.cy);
          hitEnemy.dead = true;
          spawnEnemy();
        }
        b.dead = true;
      }
    }

    // レーザー vs ザコ
    for (const e of [...enemies]) {
      if (e.dead) continue;
      if (lasers.some(l => !l.dead && overlap(e, l))) {
        e.dead = true;
        score += 10;
        for (let i = 0; i < 20; i++) particles.push(new Particle(e.cx, e.cy));
        smallBoom(e.cx, e.cy);
        spawnEnemy();
      }
    }

    // レーザー vs ボス
    for (const bo of [...bosses]) {
      if (bo.dead) continue;
      if (lasers.some(l => !l.dead && overlap(bo, l))) {
        bo.hp -= 0.5;
        bo.flash(2);
        if (Math.random() < 0.3) {
          particles.push(new Particle(bo.cx + randint(-40, 40), bo.bottom, { color: CYAN, speedMult: 0.8 }));
        }
        if (bo.hp <= 0) killBoss(bo);
      }
    }

    for (const projectile of bossProjectiles) {
      if (!projectile.dead && lasers.some(l => !l.dead && overlap(projectile, l))) {
        projectile.dead = true;
        smallBoom(projectile.cx, projectile.cy);
      }
    }

    // チャージ爆弾・レーザーは敵弾を消す
    for (const b of bullets) {
      if (b.dead) continue;
      if (b.isBomb && b.isCharge) {
        for (const eb of enemyBullets) if (!eb.dead && overlap(b, eb)) eb.dead = true;
      }
    }
    for (const eb of enemyBullets) {
      if (!eb.dead && lasers.some(l => !l.dead && overlap(eb, l))) eb.dead = true;
    }

    // 自機の被弾
    if (!player.invincible) {
      let hit = false;
      const hitEnemies = enemies.filter(e => !e.dead && overlap(player, e));
      if (hitEnemies.length) {
        hitEnemies.forEach(e => { e.dead = true; });
        hit = true;
      } else {
        const hitBullets = enemyBullets.filter(b => !b.dead && overlap(player, b));
        if (hitBullets.length) {
          hitBullets.forEach(b => { b.dead = true; });
          hit = true;
        } else if (bossProjectiles.some(b => !b.dead && overlap(player, b))) {
          bossProjectiles.filter(b => !b.dead && overlap(player, b)).forEach(b => { b.dead = true; });
          hit = true;
        } else if (bossBeams.some(beam => overlap(player, beam) && beam.canHitPlayer())) {
          hit = true;
        } else if (bossBlasts.some(blast => blast.canHitPlayer())) {
          hit = true;
        } else if (bosses.some(b => !b.dead && overlap(player, b))) {
          hit = true;
        }
      }
      if (hit) {
        sweep(enemies);
        const n = 5 - enemies.length;
        for (let i = 0; i < n; i++) spawnEnemy();
        for (let i = 0; i < 15; i++) particles.push(new Particle(player.cx, player.cy));
        smallBoom(player.cx, player.cy);
        player.hp--;
        shake = 14;
        hitFlash = 1;
        if (player.hp <= 0) {
          state = 'gameover';
        } else {
          player.invincible = true;
          player.invTimer = now;
        }
      }
    }

    sweep(enemies); sweep(bosses); sweep(bullets); sweep(enemyBullets); sweep(lasers);
    sweep(bossBeams); sweep(bossProjectiles);
    for (let i = bossBlasts.length - 1; i >= 0; i--) {
      if (bossBlasts[i].dead) bossBlasts.splice(i, 1);
    }
    if (score > hiScore) { isNewRecord = true; hiScore = score; saveHi(); }
  } else if (state === 'gameover') {
    player.update();
  }
}

// --- 描画 ---
if (document.fonts) {
  document.fonts.load('900 40px Orbitron');
  document.fonts.load('500 20px Orbitron');
}

function drawText(text, x, y, size, fill, align = 'center', glow = null) {
  ctx.save();
  ctx.font = `bold ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = Math.max(6, size / 2); }
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawBackground() {
  ctx.fillStyle = grad(ctx, 0, 0, 0, H, [[0, '#01020a'], [1, '#0b1233']]);
  ctx.fillRect(0, 0, W, H);
  const ny = nebulaY % H;
  ctx.drawImage(nebula, 0, ny);
  ctx.drawImage(nebula, 0, ny - H);
  ctx.fillStyle = WHITE;
  for (const s of stars) {
    ctx.globalAlpha = 0.55 + 0.45 * Math.sin(now / 260 + s.x);
    if (s.speed > 1.5) ctx.fillRect(s.x, s.y, 2, 2 + s.speed * 3);
    else ctx.fillRect(s.x, s.y, 1.5, 1.5);
  }
  ctx.globalAlpha = 1;
}

function drawHeart(x, y, alive) {
  ctx.save();
  if (alive) { ctx.shadowColor = RED; ctx.shadowBlur = 10; }
  const c = alive ? RED : 'rgb(50,60,70)';
  fillCircle(ctx, c, x + 7, y + 7, 7);
  fillCircle(ctx, c, x + 18, y + 7, 7);
  fillPoly(ctx, c, [[x, y + 10], [x + 25, y + 10], [x + 12, y + 25]]);
  ctx.restore();
}

function drawHUD() {
  // バー本体
  ctx.fillStyle = grad(ctx, 0, 0, 0, 56, [[0, 'rgba(6,22,48,0.96)'], [1, 'rgba(2,10,26,0.92)']]);
  ctx.fillRect(0, 0, W, 56);
  ctx.save();
  ctx.strokeStyle = 'rgba(0,255,255,0.85)'; ctx.lineWidth = 2;
  ctx.shadowColor = CYAN; ctx.shadowBlur = 10;
  ctx.beginPath(); ctx.moveTo(0, 56); ctx.lineTo(W, 56); ctx.stroke();
  ctx.restore();
  // 左：HP
  drawText('HP', 14, 5, 10, CYAN, 'left');
  for (let i = 0; i < player.maxHp; i++) drawHeart(14 + i * 34, 20, i < player.hp);
  // 右：SCORE
  drawText('SCORE', W - 68, 5, 10, CYAN, 'right');
  drawText(String(score).padStart(7, '0'), W - 68, 18, 24, WHITE, 'right', CYAN);
  // 右端：メニューボタン
  drawButton(menuButton);

  // ボスのHPバー
  const boss = bosses.find(b => !b.dead);
  if (boss) {
    const x = 70, y = 70, w = W - 140, h = 10, r = Math.max(0, boss.hp / boss.maxHp);
    drawText('BOSS', 14, 66, 12, RED, 'left', RED);
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    ctx.save();
    ctx.shadowColor = RED; ctx.shadowBlur = 10;
    ctx.fillStyle = grad(ctx, x, 0, x + w, 0, [[0, 'rgb(255,60,60)'], [1, 'rgb(255,170,40)']]);
    ctx.fillRect(x, y, w * r, h);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1;
    ctx.strokeRect(x - 2, y - 2, w + 4, h + 4);
  }

  // WARNING 演出
  if (warning > 0 && Math.floor(warning / 10) % 2 === 0) {
    ctx.fillStyle = 'rgba(140,0,0,0.45)';
    ctx.fillRect(0, H / 2 - 90, W, 100);
    ctx.fillStyle = RED;
    ctx.fillRect(0, H / 2 - 92, W, 3);
    ctx.fillRect(0, H / 2 + 7, W, 3);
    drawText('WARNING', W / 2, H / 2 - 80, 50, RED, 'center', RED);
    drawText('ボスが接近中', W / 2, H / 2 - 24, 18, WHITE, 'center', RED);
  }
}

function drawButton(b) {
  const pal = b.kind === 'primary' ? BTN_PRIMARY : BTN_SECOND;
  const mix = (a, c, k) => a.map((v, n) => v + (c[n] - v) * k);
  let col = mix(pal.base, pal.hover, b.t);
  if (b.pressed) col = pal.press;
  const dy = b.pressed ? 2 : -b.t * 2;
  ctx.save();
  ctx.translate(0, dy);
  ctx.shadowColor = pal.glow; ctx.shadowBlur = 8 + 16 * b.t;
  ctx.fillStyle = `rgba(${col[0] | 0},${col[1] | 0},${col[2] | 0},${col[3]})`;
  ctx.strokeStyle = b.pressed ? WHITE : pal.border; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(b.x, b.y, b.w, b.h, 10);
  ctx.fill(); ctx.stroke();
  ctx.restore();
  const textCol = b.pressed ? '#111111' : (b.t > 0.5 ? pal.textHover : WHITE);
  if (b.kind === 'icon') {
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2 + dy;
    ctx.save();
    ctx.strokeStyle = textCol; ctx.lineWidth = 3; ctx.lineCap = 'round';
    for (const o of [-8, 0, 8]) { ctx.beginPath(); ctx.moveTo(cx - 10, cy + o); ctx.lineTo(cx + 10, cy + o); ctx.stroke(); }
    ctx.restore();
  } else {
    drawText(b.label, b.x + b.w / 2, b.y + dy + (b.h - b.size * 1.1) / 2, b.size, textCol);
  }
}

function drawTitle() {
  const titleOffset = matchMedia('(hover: none) and (max-width: 768px)').matches ? 40 : 0;
  const tg = grad(ctx, 0, 70, 0, 230, [[0, '#ffffff'], [0.5, CYAN], [1, 'rgb(40,110,255)']]);
  drawText('SPACE', W / 2, 60 + titleOffset, 72, tg, 'center', CYAN);
  drawText('FIGHTER', W / 2, 140 + titleOffset, 72, tg, 'center', CYAN);

  // 自機デモ
  const bob = Math.sin(now / 400) * 6;
  ctx.save();
  ctx.translate(W / 2, 320 + bob);
  ctx.scale(1.6, 1.6);
  drawFlame(ctx, 0, 24);
  ctx.shadowColor = CYAN; ctx.shadowBlur = 20;
  ctx.drawImage(shipPreviews[0], -30, -30);
  ctx.restore();

  // HI-SCORE
  drawText('HI-SCORE', W / 2, 418, 12, CYAN, 'center', CYAN);
  drawText(String(hiScore).padStart(7, '0'), W / 2, 436, 30, WHITE, 'center', CYAN);

  // ボタン
  for (const b of titleButtons) drawButton(b);

  // 操作説明
  drawText('操作方法', W / 2, 650, 13, CYAN, 'center', CYAN);
  drawText('A / D：移動　SPACE：ショット　J：チャージ', W / 2, 674, 14, LIGHT_GRAY);
}

function drawSelect() {
  drawText('機体を選択', W / 2, 58, 34, WHITE, 'center', CYAN);

  const gap = 88, x0 = W / 2 - gap * 2.5;
  SHIPS.forEach((cfg, i) => {
    const sel = i === selectedType;
    const cx = x0 + gap * i, bob = sel ? Math.sin(now / 200) * 4 : 0;
    ctx.save();
    ctx.globalAlpha = sel ? 1 : (hoverShip() === i ? 0.85 : 0.45);
    ctx.translate(cx, 190 + bob);
    ctx.scale(sel ? 1.45 : 0.85, sel ? 1.45 : 0.85);
    if (sel) { drawFlame(ctx, 0, 24); ctx.shadowColor = CYAN; ctx.shadowBlur = 24; }
    ctx.drawImage(shipPreviews[i], -30, -30);
    ctx.restore();
    drawText(String.fromCharCode(65 + i), cx, 250, 16, sel ? YELLOW : DARK_GRAY, 'center', sel ? YELLOW : null);
  });

  // 情報パネル
  const px = 60, py = 310, pw = W - 120, ph = 300;
  ctx.save();
  ctx.fillStyle = 'rgba(0,20,45,0.75)';
  ctx.strokeStyle = CYAN; ctx.lineWidth = 2;
  ctx.shadowColor = CYAN; ctx.shadowBlur = 14;
  ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 12);
  ctx.fill(); ctx.stroke();
  ctx.restore();

  const info = SHIP_INFO[selectedType], cfg = SHIPS[selectedType];
  drawText(info.name, W / 2, py + 22, 30, YELLOW, 'center', YELLOW);
  drawText(info.desc, W / 2, py + 64, 16, WHITE);
  drawText(info.charge, W / 2, py + 90, 13, LIGHT_GRAY);

  const stats = [
    ['スピード', cfg.speed / 10.5],
    ['連射力', 150 / cfg.delay],
    ['チャージ', selectedType === 1 ? 0 : 1000 / cfg.charge],
    ['装甲', cfg.hp / 5],
  ];
  stats.forEach(([label, v], i) => {
    const y = py + 120 + i * 40, bx = 270, bw = 220;
    drawText(label, px + 30, y - 2, 14, LIGHT_GRAY, 'left');
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(bx, y, bw, 12);
    ctx.save();
    ctx.shadowColor = CYAN; ctx.shadowBlur = 8;
    ctx.fillStyle = grad(ctx, bx, 0, bx + bw, 0, [[0, 'rgb(0,200,255)'], [1, 'rgb(80,120,255)']]);
    ctx.fillRect(bx, y, bw * Math.min(1, v), 12);
    ctx.restore();
    // 目盛り
    ctx.fillStyle = 'rgba(0,15,35,0.9)';
    for (let k = 1; k < 10; k++) ctx.fillRect(bx + (bw / 10) * k - 1, y, 2, 12);
  });

  for (const b of selectButtons) drawButton(b);
  drawText('A / D またはクリックで選択　SPACE：スタート', W / 2, H - 38, 12, LIGHT_GRAY);
}

function drawPause() {
  ctx.fillStyle = 'rgba(0,8,24,0.72)';
  ctx.fillRect(0, 57, W, H - 57);
  drawText('PAUSE', W / 2, 220, 52, WHITE, 'center', CYAN);
  drawText('一時停止中', W / 2, 288, 16, LIGHT_GRAY);
  for (const b of pauseButtons) drawButton(b);
}

function drawGameOver() {
  ctx.fillStyle = 'rgba(0,0,0,0.78)';
  ctx.fillRect(0, 0, W, H);
  const rg = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, 420);
  rg.addColorStop(0, 'rgba(160,0,0,0.35)'); rg.addColorStop(1, 'rgba(160,0,0,0)');
  ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
  drawText('GAME OVER', W / 2, 130, 48, RED, 'center', RED);
  drawText('SCORE', W / 2, 206, 14, CYAN);
  drawText(String(score).padStart(7, '0'), W / 2, 230, 38, WHITE, 'center', CYAN);
  if (isNewRecord) drawText('NEW RECORD', W / 2, 292, 20, YELLOW, 'center', YELLOW);
  for (const b of gameOverButtons) drawButton(b);
}

function render() {
  ctx.setTransform(R, 0, 0, R, 0, 0);
  ctx.save();
  if (shake > 0) ctx.translate(rand(-shake, shake), rand(-shake, shake));
  drawBackground();

  if (state === 'play' || state === 'paused' || state === 'gameover') {
    player.draw(ctx);
    for (const e of enemies) e.draw(ctx);
    for (const b of bosses) b.draw(ctx);
    ctx.globalCompositeOperation = 'lighter';
    for (const b of bossBeams) b.draw(ctx);
    for (const b of bossProjectiles) b.draw(ctx);
    for (const blast of bossBlasts) blast.draw(ctx);
    for (const b of bullets) b.draw(ctx);
    for (const b of enemyBullets) b.draw(ctx);
    for (const l of lasers) l.draw(ctx);
    for (const p of particles) p.draw(ctx);
    for (const w of shockwaves) w.draw(ctx);
    for (const f of fx) f.draw(ctx);
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();

  if (hitFlash > 0) {
    const flash = ctx.createRadialGradient(player.cx, player.cy, 12, player.cx, player.cy, 180);
    flash.addColorStop(0, `rgba(255,35,35,${hitFlash * 0.3})`);
    flash.addColorStop(0.45, `rgba(255,0,0,${hitFlash * 0.16})`);
    flash.addColorStop(1, 'rgba(255,0,0,0)');
    ctx.fillStyle = flash;
    ctx.fillRect(player.cx - 180, player.cy - 180, 360, 360);
  }

  if (state === 'play') drawHUD();
  else if (state === 'paused') { drawHUD(); drawPause(); }
  else if (state === 'title') drawTitle();
  else if (state === 'select') drawSelect();
  else if (state === 'gameover') drawGameOver();

  ctx.drawImage(vignette, 0, 0);

  // 左右のネオンライン
  for (const x of [1.5, W - 1.5]) {
    ctx.save();
    ctx.strokeStyle = CYAN; ctx.lineWidth = 3;
    ctx.shadowColor = CYAN; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    ctx.restore();
  }
}

// --- メインループ（60FPS固定ステップ） ---
let last = performance.now(), acc = 0;
function frame(t) {
  acc += Math.min(t - last, 100);
  last = t;
  while (acc >= STEP) {
    step();
    acc -= STEP;
  }
  now = performance.now();
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

})();