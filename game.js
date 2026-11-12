const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const cabinet = document.querySelector('.cabinet');
const music = document.getElementById('backgroundMusic');
const ui = {
  time: document.getElementById('time'), health: document.getElementById('health'),
  weapon: document.getElementById('weaponLabel'), overlay: document.getElementById('overlay'),
  headline: document.getElementById('headline'), summary: document.getElementById('summary'),
  action: document.getElementById('action'), pause: document.getElementById('pauseButton'),
  squad: document.getElementById('squadCount'),
  houseArt: document.getElementById('houseArt'), houseImage: document.getElementById('houseImage'),
  weaponArt: document.getElementById('weaponArt'), weaponImage: document.getElementById('weaponImage'),
};

const MAX_WEAPON_UNLOCKS = 5;
const weaponNames = ['制式步枪', '双路霰弹枪', '三路电磁枪', '四路脉冲炮', '五路重炮', '六路超载炮'];
const bulletColors = ['#ffdd85', '#85faff', '#aafa79', '#ffad82', '#d6a5ff', '#ffffff'];
const ASSET_VERSION = '20261112f';
const MOBILE_ASSETS = window.matchMedia('(max-width: 600px)').matches;
const sprites = {};
const spriteMasks = Object.fromEntries(Object.entries(window.BOSS_MASKS || {}).map(([name, mask]) => [name, {
  width: mask.width, height: mask.height,
  bits: Uint8Array.from(atob(mask.bits), char => char.charCodeAt(0)),
}]));
const keys = new Set();
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
let W = 1280, H = 720, lanes, state, audioContext;
music.volume = 0.28;

function loadSprite(name, file, attempt = 0) {
  const image = new Image();
  image.fetchPriority = ['normal', 'soldier', 'weapon', 'house'].includes(name) ? 'high' : 'low';
  image.onload = () => { sprites[name] = image; };
  image.onerror = () => {
    if (attempt < 3) setTimeout(() => loadSprite(name, file, attempt + 1), 1000 * 2 ** attempt);
  };
  image.src = `assets/${file}?v=${ASSET_VERSION}${attempt ? `-${attempt}` : ''}`;
}
loadSprite('normal', 'normal-zombie.png');
loadSprite('soldier', 'soldier.png');
loadSprite('weapon', MOBILE_ASSETS ? 'frozen-weapon-mobile.png' : 'frozen-weapon.png');
loadSprite('house', MOBILE_ASSETS ? 'house-mobile.png' : 'house.png');
setTimeout(() => {
  loadSprite('brute', 'brute-zombie.png');
  loadSprite('final', 'final-boss.png');
  loadSprite('finalMobile', 'final-boss-mobile.png');
}, 2000);

function syncStaticArt() {
  if (W >= 600) {
    ui.houseArt.style.display = 'none';
    ui.weaponArt.style.display = 'none';
    return;
  }
  const houseWidth = Math.min(148, lanes[1].w - 12);
  const houseHeight = houseWidth * 0.56;
  Object.assign(ui.houseArt.style, {
    left: `${lanes[1].center - houseWidth / 2}px`, top: `${H - houseHeight - 8}px`,
    width: `${houseWidth}px`, height: `${houseHeight}px`,
    display: 'block',
  });
  const weaponWidth = Math.min(245, lanes[0].w - 18);
  const weaponHeight = weaponWidth * 0.47;
  const weaponY = (54 + H) / 2;
  Object.assign(ui.weaponArt.style, {
    left: `${lanes[0].center - weaponWidth / 2}px`, top: `${weaponY - weaponHeight * 0.55}px`,
    width: `${weaponWidth}px`, height: `${weaponHeight * 1.1}px`,
    display: !state || state.tier < MAX_WEAPON_UNLOCKS ? 'block' : 'none',
  });
  ui.weaponImage.style.top = `${weaponHeight * 0.05}px`;
  ui.weaponImage.style.height = `${weaponHeight}px`;
  ui.weaponImage.style.filter = `hue-rotate(${(state?.tier || 0) * 34}deg) saturate(${1 + (state?.tier || 0) * 0.1})`;
}

function resize() {
  const oldW = W, oldH = H;
  W = cabinet.clientWidth;
  H = cabinet.clientHeight;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(W * ratio);
  canvas.height = Math.round(H * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  const margin = W < 600 ? 6 : 18;
  const gap = W < 600 ? 10 : 18;
  const laneWidth = (W - margin * 2 - gap) / 2;
  lanes = [
    { x: margin, w: laneWidth, center: margin + laneWidth / 2 },
    { x: margin + laneWidth + gap, w: laneWidth, center: W - margin - laneWidth / 2 },
  ];
  if (state) {
    state.player.x *= W / oldW;
    state.player.y = H - 118;
    state.bullets.forEach(bullet => { bullet.x *= W / oldW; bullet.y *= H / oldH; });
    state.enemies.forEach(enemy => { enemy.x *= W / oldW; enemy.y *= H / oldH; });
    state.walls.forEach(wall => { wall.y *= H / oldH; });
  }
  syncStaticArt();
}

function reset() {
  state = {
    running: false, paused: false, elapsed: 0, lastFrame: 0,
    player: { x: lanes[1].center, y: H - 118, fireTimer: 0, targetX: null },
    houseHp: 100, bullets: [], enemies: [], walls: [], nextWall: 30,
    squadCount: 1, particles: [], impacts: [], lastImpactSound: -Infinity,
    tier: 0, iceDamage: 0, iceTarget: 100, spawnTimer: 0,
    nextBrute: 60, currentMinute: 0, finalWave: false, kills: 0, flash: 0,
  };
  updateUi();
  syncStaticArt();
}

function updateUi() {
  const remaining = Math.max(0, 300 - Math.floor(state.elapsed));
  ui.time.textContent = state.finalWave ? '清场' : `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
  ui.health.textContent = Math.max(0, Math.ceil(state.houseHp));
  ui.health.classList.toggle('danger', state.houseHp <= 25);
  ui.squad.textContent = state.squadCount;
  ui.weapon.textContent = weaponNames[state.tier] || `极地武器 ${state.tier + 1}`;
}

function audio() {
  if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
  if (audioContext.state === 'suspended') audioContext.resume();
  return audioContext;
}

function tone(frequency, duration, volume, type = 'sine', delay = 0) {
  const sound = audio(), at = sound.currentTime + delay;
  const oscillator = sound.createOscillator(), gain = sound.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, at);
  gain.gain.setValueAtTime(volume, at);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  oscillator.connect(gain).connect(sound.destination);
  oscillator.start(at);
  oscillator.stop(at + duration);
}

function soundShot() {
  tone(175 + state.tier * 28, 0.045, 0.019, state.tier ? 'sawtooth' : 'square');
}
function soundIceHit() { tone(860, 0.07, 0.026); tone(1280, 0.035, 0.016, 'triangle', 0.012); }
function soundUnlock() { [392, 494, 587, 784].forEach((note, i) => tone(note, 0.24, 0.05, 'sine', i * 0.11)); }
function soundHouseImpact() { tone(105, 0.12, 0.042, 'sawtooth'); tone(58, 0.18, 0.035, 'triangle', 0.012); }

function burst(x, y, color, amount) {
  for (let i = 0; i < amount; i++) {
    const angle = Math.random() * Math.PI * 2, speed = 22 + Math.random() * 75;
    state.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 0.2 + Math.random() * 0.4, color });
  }
}

function squadLayout() {
  const total = state.squadCount;
  if (total < 1) return { positions: [], spriteWidth: 0, spriteHeight: 0, spacing: 0, width: 0 };
  const mobile = W < 600;
  const maxWidth = lanes[1].w / 2;
  const perRow = mobile ? 5 : 7;
  const columns = Math.min(perRow, total);
  const compactness = Math.min(1, (total - 1) / 47);
  const baseHeight = mobile ? 49 : 67;
  const spriteHeight = baseHeight * (1 - compactness * (mobile ? 0.59 : 0.5));
  const spriteWidth = spriteHeight * 0.77;
  const baseWidth = baseHeight * 0.77;
  const spacing = columns === 1 ? 0 :
    Math.min(maxWidth / 2, (maxWidth - baseWidth) / (columns - 1)) * (1 - compactness * 0.12);
  const rowStep = Math.max(14, spriteHeight * 0.7);
  const positions = [];
  for (let row = 0, index = 0; index < total; row++) {
    const count = Math.min(perRow, total - index);
    const half = (count - 1) * spacing / 2;
    const center = clamp(state.player.x, lanes[0].x + spriteWidth / 2 + half,
      lanes[1].x + lanes[1].w - spriteWidth / 2 - half);
    for (let column = 0; column < count; column++, index++) {
      positions.push({ x: center + (column - (count - 1) / 2) * spacing, y: state.player.y - row * rowStep });
    }
  }
  return { positions, spriteWidth, spriteHeight, spacing, width: spriteWidth + (columns - 1) * spacing };
}

function squadPositions() { return squadLayout().positions; }

function fire() {
  const player = state.player;
  const count = state.tier === 0 ? 1 : state.tier + 1;
  const power = 1;
  const bulletSpeed = 580;
  const color = bulletColors[state.tier];
  const layout = squadLayout();
  for (const member of layout.positions) {
    for (let i = 0; i < count; i++) {
      const angle = (i - (count - 1) / 2) * 0.095;
      state.bullets.push({
        x: member.x, y: member.y - layout.spriteHeight * 0.43, vx: Math.sin(angle) * bulletSpeed,
        vy: -Math.cos(angle) * bulletSpeed, power, radius: 3.5, color,
      });
    }
    burst(member.x, member.y - layout.spriteHeight * 0.43, color, 2);
  }
  player.fireTimer = 0.5;
  soundShot();
}

function enemySize(kind) {
  if (kind === 'brute') return { w: 156, h: 282 };
  if (kind === 'final') return { w: 260, h: W < 600 ? 235 : 470 };
  return { w: 52, h: 94 };
}

function spawnEnemy(kind) {
  const size = enemySize(kind);
  const minute = Math.floor(Math.min(state.elapsed, 299.999) / 60);
  const maxHp = kind === 'final' ? 1000 : (kind === 'brute' ? 30 : 1) * 2 ** minute;
  const lane = lanes[1];
  const left = Math.max(size.w / 2 + 5, lane.x + size.w / 2 + 4);
  const right = Math.min(W - size.w / 2 - 5, lane.x + lane.w - size.w / 2 - 4);
  const x = kind === 'normal' ? left + Math.random() * Math.max(0, right - left) : clamp(lane.center, size.w / 2 + 4, W - size.w / 2 - 4);
  state.enemies.push({
    kind, x, y: 56 + size.h / 2, w: size.w, h: size.h,
    hp: maxHp, maxHp, speed: kind === 'normal' ? 10 + Math.random() * 7 + minute * 2 : kind === 'brute' ? 8 : 7,
    atHouse: false, attackTimer: 0, wobble: Math.random() * Math.PI * 2,
  });
  if (kind !== 'normal') burst(x, 70, kind === 'final' ? '#cc8aff' : '#ffa788', 24);
}

function finish(win, reason = 'house') {
  state.running = false;
  state.paused = false;
  music.pause();
  if (audioContext) audioContext.suspend();
  ui.headline.textContent = win ? '您已通关' : '家园失守';
  ui.summary.textContent = win
    ? `最终波次已清除，共击退 ${state.kills} 个目标。`
    : `家园血量耗尽，共击退 ${state.kills} 个目标。`;
  if (reason === 'squad') {
    ui.headline.textContent = '队伍阵亡';
    ui.summary.textContent = '通过墙体后士兵数量不足 1 人。';
  }
  ui.action.textContent = '重新部署';
  ui.overlay.hidden = false;
}

function hitIce(bullet) {
  if (state.tier >= MAX_WEAPON_UNLOCKS) return false;
  const center = lanes[0].center, y = (54 + H) / 2;
  const width = Math.min(245, lanes[0].w - 18), height = width * 0.47;
  const dx = (bullet.x - center) / (width * 0.5);
  const dy = (bullet.y - y) / (height * 0.55);
  if (dx * dx + dy * dy > 1) return false;
  state.iceDamage = Math.min(state.iceTarget, state.iceDamage + bullet.power);
  soundIceHit();
  burst(bullet.x, bullet.y, '#a4f7ff', 3);
  if (state.iceDamage >= state.iceTarget) {
    state.tier++;
    state.iceDamage = 0;
    state.iceTarget = state.tier < MAX_WEAPON_UNLOCKS ? (state.tier + 1) * 100 : 0;
    syncStaticArt();
    soundUnlock();
    burst(center, y, '#c8ffff', 32);
  }
  return true;
}

function hitEnemy(bullet) {
  // The final boss obscures smaller targets in its visible area.
  const boss = state.enemies.find(enemy => enemy.kind === 'final');
  if (boss && bossCovers(boss, bullet)) {
    return damageEnemy(boss, bullet);
  }
  for (let index = state.enemies.length - 1; index >= 0; index--) {
    const enemy = state.enemies[index];
    if (enemy.kind === 'final') continue;
    if (Math.abs(bullet.x - enemy.x) > enemy.w * 0.45 || Math.abs(bullet.y - enemy.y) > enemy.h * 0.46) continue;
    return damageEnemy(enemy, bullet);
  }
  return false;
}

function bossCovers(boss, bullet) {
  const x = (bullet.x - boss.x) / boss.w + 0.5;
  const y = (bullet.y - boss.y) / boss.h + 0.5;
  if (x < 0 || x >= 1 || y < 0 || y >= 1) return false;
  const mask = spriteMasks[W < 600 ? 'finalMobile' : 'final'];
  if (!mask) return Math.abs(x - 0.5) <= 0.45 && Math.abs(y - 0.5) <= 0.46;
  const bit = Math.floor(y * mask.height) * mask.width + Math.floor(x * mask.width);
  return (mask.bits[bit >> 3] & (1 << (bit & 7))) !== 0;
}

function damageEnemy(enemy, bullet) {
  enemy.hp -= bullet.power;
  burst(bullet.x, bullet.y, enemy.kind === 'final' ? '#ca8aff' : '#b6e887', 4);
  if (enemy.hp <= 0) {
    state.enemies.splice(state.enemies.indexOf(enemy), 1);
    state.kills++;
    burst(enemy.x, enemy.y, enemy.kind === 'final' ? '#ca8aff' : '#b6e887', enemy.kind === 'normal' ? 12 : 28);
  }
  return true;
}

const wallOperations = ['+2', '−2', '×2', '÷2'];

function spawnWallPair() {
  const first = Math.floor(Math.random() * wallOperations.length);
  const remaining = wallOperations.filter((_, index) => index !== first);
  const options = [wallOperations[first], remaining[Math.floor(Math.random() * remaining.length)]];
  state.walls.push({ y: 54 + 31, height: 62, options, speed: 2 * (14 + Math.floor(state.elapsed / 60) * 2), passed: false });
}

function applyWall(operation) {
  const count = state.squadCount;
  if (operation === '+2') state.squadCount = count + 2;
  if (operation === '−2') state.squadCount = count - 2;
  if (operation === '×2') state.squadCount = count * 2;
  if (operation === '÷2') state.squadCount = Math.floor(count / 2);
  if (state.squadCount < 1) {
    state.squadCount = 0;
    finish(false, 'squad');
    updateUi();
    return;
  }
  burst(state.player.x, state.player.y - 24, '#9df5ff', 16);
  tone(operation === '+2' || operation === '×2' ? 660 : 330, 0.18, 0.035, 'triangle');
  updateUi();
}

function strikeHouse(enemy) {
  const width = Math.min(116, lanes[1].w - 26);
  const x = clamp(enemy.x, lanes[1].center - width / 2, lanes[1].center + width / 2);
  const y = H - 94;
  const damage = enemy.kind === 'final' ? 7 : enemy.kind === 'brute' ? 2 : 1;
  state.houseHp = Math.max(0, state.houseHp - damage);
  state.impacts.push({ x, y, life: 0.28, radius: enemy.kind === 'final' ? 30 : 19 });
  state.flash = Math.max(state.flash, 0.14);
  burst(x, y, '#ffb36d', enemy.kind === 'normal' ? 7 : 13);
  if (state.elapsed - state.lastImpactSound >= 0.1) {
    soundHouseImpact();
    state.lastImpactSound = state.elapsed;
  }
}

function update(dt) {
  const s = state, p = s.player;
  s.elapsed = Math.min(300, s.elapsed + dt);
  s.flash = Math.max(0, s.flash - dt);
  const minute = Math.floor(s.elapsed / 60);
  while (s.currentMinute < minute) {
    s.currentMinute++;
    for (const enemy of s.enemies) {
      enemy.hp *= 2;
      enemy.maxHp *= 2;
    }
  }
  if (!s.finalWave && s.elapsed >= 300) {
    s.finalWave = true;
    spawnEnemy('final');
  }
  if (!s.finalWave && s.elapsed >= s.nextWall && s.nextWall <= 270) {
    spawnWallPair();
    s.nextWall += 60;
  }

  const moveSpeed = 460;
  if (keys.has('ArrowLeft') || keys.has('a')) p.x -= moveSpeed * dt;
  if (keys.has('ArrowRight') || keys.has('d')) p.x += moveSpeed * dt;
  if (p.targetX !== null) {
    const distance = p.targetX - p.x;
    p.x += Math.sign(distance) * Math.min(Math.abs(distance), moveSpeed * 1.6 * dt);
  }
  p.x = clamp(p.x, lanes[0].x + 21, lanes[1].x + lanes[1].w - 21);
  for (const wall of s.walls) {
    wall.y += wall.speed * dt;
    if (!wall.passed && wall.y >= p.y) {
      wall.passed = true;
      if (p.x >= lanes[1].x && p.x <= lanes[1].x + lanes[1].w) {
        applyWall(wall.options[p.x < lanes[1].center ? 0 : 1]);
        if (!s.running) return;
      }
    }
  }
  s.walls = s.walls.filter(wall => wall.y - wall.height / 2 < H);
  p.fireTimer -= dt;
  if (p.fireTimer <= 0) fire();

  if (!s.finalWave) {
    s.spawnTimer -= dt;
    if (s.spawnTimer <= 0) {
      spawnEnemy('normal');
      s.spawnTimer = Math.max(0.16, (1.05 - s.elapsed / 620) / 2) * (0.75 + Math.random() * 0.6);
    }
    if (s.elapsed >= s.nextBrute) {
      spawnEnemy('brute');
      s.nextBrute += 60;
    }
  }

  for (let index = s.bullets.length - 1; index >= 0; index--) {
    const bullet = s.bullets[index];
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    const outside = bullet.y < 50 || bullet.x < 0 || bullet.x > W;
    if (outside || hitIce(bullet) || hitEnemy(bullet)) s.bullets.splice(index, 1);
  }

  const houseFront = H - 100;
  for (const enemy of s.enemies) {
    if (!enemy.atHouse) {
      enemy.y = Math.min(houseFront - enemy.h / 2, enemy.y + enemy.speed * dt);
      enemy.atHouse = enemy.y + enemy.h / 2 >= houseFront;
    }
    enemy.wobble += dt * 2.2;
    if (enemy.atHouse) {
      enemy.attackTimer -= dt;
      while (enemy.attackTimer <= 0 && s.houseHp > 0) {
        strikeHouse(enemy);
        enemy.attackTimer += 1;
      }
    }
  }
  for (let index = s.particles.length - 1; index >= 0; index--) {
    const particle = s.particles[index];
    particle.life -= dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    if (particle.life <= 0) s.particles.splice(index, 1);
  }
  for (let index = s.impacts.length - 1; index >= 0; index--) {
    s.impacts[index].life -= dt;
    if (s.impacts[index].life <= 0) s.impacts.splice(index, 1);
  }
  if (s.houseHp <= 0) finish(false);
  else if (s.finalWave && s.enemies.length === 0) finish(true);
  updateUi();
}

function line(x1, y1, x2, y2, color, width = 1) {
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
}

function road(lane, danger) {
  ctx.fillStyle = danger ? '#192d33' : '#15343a';
  ctx.fillRect(lane.x, 54, lane.w, H - 54);
  ctx.fillStyle = '#0d2931';
  ctx.fillRect(lane.x + 4, 54, lane.w - 8, H - 54);
  for (let y = 78; y < H; y += 49) {
    ctx.fillStyle = danger ? '#fe766b44' : '#8fe5e844';
    ctx.fillRect(lane.center - 2, y, 4, 25);
  }
  line(lane.x, 54, lane.x, H, '#8bd8dc77', 2);
  line(lane.x + lane.w, 54, lane.x + lane.w, H, '#8bd8dc77', 2);
}

function house() {
  if (W < 600 && ui.houseImage.complete && ui.houseImage.naturalWidth > 0) return;
  const x = lanes[1].center, width = Math.min(148, lanes[1].w - 12);
  const height = width * 0.56;
  ctx.save();
  ctx.shadowColor = state.houseHp < 25 ? '#ff7155' : '#9deaff';
  ctx.shadowBlur = state.houseHp < 25 ? 22 : 7;
  if (sprites.house) ctx.drawImage(sprites.house, x - width / 2, H - height - 8, width, height);
  ctx.restore();
}

function frozenWeapon() {
  const x = lanes[0].center, y = (54 + H) / 2;
  if (state.tier >= MAX_WEAPON_UNLOCKS) {
    ctx.fillStyle = '#b9f6e1'; ctx.textAlign = 'center'; ctx.font = '700 13px Microsoft YaHei';
    ctx.fillText('武器已满级', x, y);
    return;
  }
  const width = Math.min(245, lanes[0].w - 18), height = width * 0.47;
  const domWeapon = W < 600 && ui.weaponImage.complete && ui.weaponImage.naturalWidth > 0;
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = '#72edf327'; ctx.beginPath(); ctx.ellipse(0, 0, width * 0.53, height * 0.62, 0, 0, Math.PI * 2); ctx.fill();
  if (!domWeapon && sprites.weapon) {
    ctx.filter = `hue-rotate(${state.tier * 34}deg) saturate(${1 + state.tier * 0.1})`;
    ctx.drawImage(sprites.weapon, -width / 2, -height / 2, width, height);
    ctx.filter = 'none';
  }
  if (state.tier > 0) {
    const color = bulletColors[state.tier + 1];
    ctx.shadowColor = color; ctx.shadowBlur = 12;
    ctx.fillStyle = color;
    ctx.fillRect(-width * 0.22, -height * 0.12, width * 0.4, 4);
    ctx.fillRect(width * 0.12, -height * 0.4, width * 0.11, height * 0.34);
    ctx.shadowBlur = 0;
  }
  if (!domWeapon) {
    ctx.fillStyle = '#b4f8ff55';
    ctx.beginPath(); ctx.ellipse(0, 0, width * 0.5, height * 0.55, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ddffff'; ctx.lineWidth = 1.5; ctx.stroke();
  }
  ctx.restore();
  const barWidth = Math.min(148, lanes[0].w - 24);
  ctx.fillStyle = '#071a20'; ctx.fillRect(x - barWidth / 2, y + height / 2 + 14, barWidth, 7);
  ctx.fillStyle = '#96eff0'; ctx.fillRect(x - barWidth / 2, y + height / 2 + 14, barWidth * state.iceDamage / state.iceTarget, 7);
  ctx.fillStyle = '#dcf9fb'; ctx.textAlign = 'center'; ctx.font = '700 12px Microsoft YaHei';
  ctx.fillText(`新武器 ${state.tier + 1}  ${state.iceDamage}/${state.iceTarget}`, x, y + height / 2 + 40);
}

function drawEnemy(enemy) {
  ctx.save(); ctx.translate(enemy.x, enemy.y);
  ctx.rotate(Math.sin(enemy.wobble) * 0.012);
  const sprite = enemy.kind === 'final' && W < 600 ? sprites.finalMobile : sprites[enemy.kind];
  if (sprite) ctx.drawImage(sprite, -enemy.w / 2, -enemy.h / 2, enemy.w, enemy.h);
  else { ctx.fillStyle = '#8baa81'; ctx.fillRect(-enemy.w / 2, -enemy.h / 2, enemy.w, enemy.h); }
  if (enemy.maxHp > 1) {
    const width = Math.min(enemy.w * 0.85, 140), top = -enemy.h / 2 - 12;
    ctx.fillStyle = '#2a1717'; ctx.fillRect(-width / 2, top, width, 6);
    ctx.fillStyle = enemy.kind === 'final' ? '#d99afa' : '#f79a7a';
    ctx.fillRect(-width / 2, top, width * enemy.hp / enemy.maxHp, 6);
  }
  ctx.restore();
}

function drawImpact(impact) {
  const fade = impact.life / 0.28;
  ctx.save(); ctx.translate(impact.x, impact.y); ctx.globalAlpha = fade;
  ctx.shadowColor = '#ff8b3d'; ctx.shadowBlur = 16;
  ctx.fillStyle = '#ff9a43'; ctx.beginPath();
  for (let point = 0; point < 20; point++) {
    const angle = point * Math.PI / 10;
    const radius = impact.radius * (point % 2 ? 0.42 : 1) * (1.15 - fade * 0.15);
    const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius;
    if (point === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath(); ctx.fill();
  ctx.shadowBlur = 0; ctx.fillStyle = '#fff1b5';
  ctx.beginPath(); ctx.arc(0, 0, impact.radius * 0.25, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function soldier() {
  const layout = squadLayout();
  for (const member of layout.positions) {
    ctx.save();
    ctx.shadowColor = bulletColors[state.tier]; ctx.shadowBlur = 12;
    if (sprites.soldier) ctx.drawImage(sprites.soldier, member.x - layout.spriteWidth / 2,
      member.y - layout.spriteHeight / 2, layout.spriteWidth, layout.spriteHeight);
    else { ctx.fillStyle = '#9caa91'; ctx.fillRect(member.x - layout.spriteWidth / 2,
      member.y - layout.spriteHeight / 2, layout.spriteWidth, layout.spriteHeight); }
    ctx.restore();
  }
}

function drawWalls() {
  const lane = lanes[1], half = lane.w / 2;
  for (const wall of state.walls) {
    for (let side = 0; side < 2; side++) {
      const x = lane.x + side * half;
      ctx.fillStyle = '#a1eaffd9';
      ctx.fillRect(x + 1, wall.y - wall.height / 2, half - 2, wall.height);
      ctx.strokeStyle = '#e3ffff'; ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, wall.y - wall.height / 2, half - 2, wall.height);
      ctx.fillStyle = '#073842'; ctx.textAlign = 'center';
      ctx.font = `900 ${W < 600 ? 25 : 32}px system-ui`;
      ctx.fillText(wall.options[side], x + half / 2, wall.y + 10);
    }
  }
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  ui.houseArt.classList.toggle('hit', W < 600 && state.impacts.length > 0);
  ctx.fillStyle = '#081821'; ctx.fillRect(0, 0, W, H);
  road(lanes[0], false); road(lanes[1], true);
  ctx.fillStyle = '#badfe0a9'; ctx.textAlign = 'center'; ctx.font = '700 11px Microsoft YaHei';
  ctx.fillText('武器回收', lanes[0].center, 77);
  ctx.fillText('家园防线', lanes[1].center, 77);
  house();
  frozenWeapon();
  for (const enemy of state.enemies) if (enemy.kind !== 'final') drawEnemy(enemy);
  for (const enemy of state.enemies) if (enemy.kind === 'final') drawEnemy(enemy);
  drawWalls();
  for (const impact of state.impacts) drawImpact(impact);
  for (const bullet of state.bullets) {
    ctx.fillStyle = bullet.color;
    ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
  }
  for (const particle of state.particles) {
    ctx.fillStyle = particle.color; ctx.globalAlpha = Math.min(1, particle.life * 3);
    ctx.fillRect(particle.x, particle.y, 3, 3);
  }
  ctx.globalAlpha = 1;
  soldier();
  if (state.flash > 0) {
    ctx.fillStyle = `rgba(255, 68, 43, ${state.flash * 0.25})`;
    ctx.fillRect(lanes[1].x, H - 155, lanes[1].w, 155);
  }
  if (state.paused) {
    ctx.fillStyle = '#07131add'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#e2fbfc'; ctx.textAlign = 'center'; ctx.font = '800 28px Microsoft YaHei';
    ctx.fillText('已暂停', W / 2, H / 2);
  }
}

function frame(time) {
  if (!state.lastFrame) state.lastFrame = time;
  const dt = Math.min(0.05, (time - state.lastFrame) / 1000);
  state.lastFrame = time;
  if (state.running && !state.paused) update(dt);
  draw();
  requestAnimationFrame(frame);
}

function start() {
  reset(); state.running = true; ui.overlay.hidden = true;
  music.currentTime = 0; music.play().catch(() => {});
  audio();
}

function pause() {
  if (!state.running) return;
  state.paused = !state.paused;
  if (state.paused) { music.pause(); if (audioContext) audioContext.suspend(); }
  else { music.play().catch(() => {}); if (audioContext) audioContext.resume(); }
  ui.pause.textContent = state.paused ? '▶' : '⏸';
  ui.pause.title = state.paused ? '继续' : '暂停';
  ui.pause.setAttribute('aria-label', ui.pause.title);
}

ui.action.addEventListener('click', start);
ui.pause.addEventListener('click', pause);
window.addEventListener('keydown', event => {
  if (['ArrowLeft', 'ArrowRight', 'a', 'd'].includes(event.key)) {
    keys.add(event.key); event.preventDefault();
  }
  if (event.key.toLowerCase() === 'p' && !event.repeat) pause();
});
window.addEventListener('keyup', event => keys.delete(event.key));
window.addEventListener('blur', () => { keys.clear(); if (state.running && !state.paused) pause(); });
canvas.addEventListener('pointerdown', event => {
  if (!state.running || state.paused) return;
  canvas.setPointerCapture(event.pointerId);
  state.player.targetX = event.clientX - canvas.getBoundingClientRect().left;
});
canvas.addEventListener('pointermove', event => {
  if (!state.running || !canvas.hasPointerCapture(event.pointerId)) return;
  state.player.targetX = event.clientX - canvas.getBoundingClientRect().left;
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  canvas.addEventListener(type, () => { if (state) state.player.targetX = null; });
}
ui.houseImage.addEventListener('load', syncStaticArt);
ui.weaponImage.addEventListener('load', syncStaticArt);
if (MOBILE_ASSETS) {
  ui.houseImage.fetchPriority = 'high';
  ui.weaponImage.fetchPriority = 'high';
  ui.houseImage.src = `assets/house-mobile.png?v=${ASSET_VERSION}`;
  ui.weaponImage.src = `assets/frozen-weapon-mobile.png?v=${ASSET_VERSION}`;
}
window.addEventListener('resize', resize);
resize(); reset();
if (new URLSearchParams(location.search).has('play')) start();
requestAnimationFrame(frame);
