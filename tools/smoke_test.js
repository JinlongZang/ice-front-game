const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

async function run() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }, { width: 320, height: 700 }]) {
      const context = await browser.newContext({ viewport, isMobile: viewport.width < 600, hasTouch: viewport.width < 600 });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(pathToFileURL(path.resolve(__dirname, '..', 'index.html')).href);
      await page.getByRole('button', { name: '开始任务' }).click();
      await page.waitForFunction(() => Object.keys(sprites).length === 7);
      if (viewport.width < 600) {
        await page.waitForFunction(() => ['houseArt', 'weaponArt'].every(id => {
          const element = document.getElementById(id);
          return getComputedStyle(element).display === 'block' && element.querySelector('img').complete && element.querySelector('img').naturalWidth > 0;
        }));
        const staticArt = await page.evaluate(() => ({
          house: document.getElementById('houseArt').getBoundingClientRect().width,
          weapon: document.getElementById('weaponArt').getBoundingClientRect().width,
        }));
        assert.ok(staticArt.house > 100 && staticArt.weapon > 100);
      }
      await page.screenshot({ path: path.join(os.tmpdir(), `ice-front-${viewport.width}-true-check.png`) });
      await page.getByRole('button', { name: '暂停' }).click();
      assert.equal(await page.getByRole('button', { name: '继续' }).count(), 1);
      await page.getByRole('button', { name: '继续' }).click();
      const metrics = await page.evaluate(() => ({
        width: W, height: H,
        rightEdge: lanes[1].x + lanes[1].w,
        zombieWidth: enemySize('normal').w,
        frozenY: (54 + H) / 2,
        houseHp: state.houseHp,
      }));
      assert.equal(metrics.width, viewport.width);
      assert.equal(metrics.height, viewport.height);
      assert.ok(metrics.rightEdge <= viewport.width);
      assert.equal(metrics.zombieWidth, 52);
      assert.equal(metrics.houseHp, 100);

      if (viewport.width < 600) {
        await page.evaluate(() => {
          state.enemies = [];
          state.bullets = [];
          state.spawnTimer = 100;
          state.player.fireTimer = 100;
          state.elapsed = 299.99;
          update(0.02);
          draw();
        });
        await page.screenshot({ path: path.join(os.tmpdir(), 'ice-front-390-final-check.png') });
        await page.evaluate(() => start());
        const dragY = Math.min(650, viewport.height - 50);
        await page.mouse.move(40, dragY);
        await page.mouse.down();
        const dragX = Math.min(320, viewport.width - 20);
        await page.mouse.move(dragX, dragY, { steps: 8 });
        await page.waitForTimeout(200);
        const target = await page.evaluate(() => state.player.targetX);
        assert.ok(target >= dragX - 20 && target <= dragX + 20);
        await page.mouse.up();
      }

      const rules = await page.evaluate(() => {
        const shotStats = () => ({
          damage: state.bullets[0].power,
          speed: Math.round(Math.hypot(state.bullets[0].vx, state.bullets[0].vy)),
          radius: state.bullets[0].radius,
          interval: state.player.fireTimer,
        });
        state.bullets = [];
        state.player.fireTimer = 100;
        state.spawnTimer = 100;
        fire();
        const baseShots = state.bullets.length;
        const baseStats = shotStats();
        state.bullets = [];
        state.iceDamage = 99;
        hitIce({ x: lanes[0].center, y: (54 + H) / 2, power: 1 });
        const first = { tier: state.tier, target: state.iceTarget };
        fire();
        const firstShots = state.bullets.length, firstColor = state.bullets[0].color;
        const firstStats = shotStats();
        state.bullets = [];
        state.iceDamage = 199;
        hitIce({ x: lanes[0].center, y: (54 + H) / 2, power: 1 });
        const second = { tier: state.tier, target: state.iceTarget };
        fire();
        const secondShots = state.bullets.length, secondColor = state.bullets[0].color;
        const secondStats = shotStats();
        state.bullets = [];
        while (state.tier < MAX_WEAPON_UNLOCKS) {
          state.iceDamage = state.iceTarget - 1;
          hitIce({ x: lanes[0].center, y: (54 + H) / 2, power: 1 });
        }
        const maxTier = state.tier, maxTarget = state.iceTarget;
        const extraUnlock = hitIce({ x: lanes[0].center, y: (54 + H) / 2, power: 999 });
        fire();
        const finalShots = state.bullets.length, finalColor = state.bullets[0].color;
        const finalStats = shotStats();
        state.bullets = [];
        state.player.fireTimer = 100;
        state.enemies = [];
        state.elapsed = 59.99;
        spawnEnemy('normal');
        const normalBefore = state.enemies.at(-1).hp;
        const topEntry = state.enemies.at(-1).y - state.enemies.at(-1).h / 2;
        update(0.02);
        const existingAfter = state.enemies[0].hp;
        spawnEnemy('normal');
        const normalAfter = state.enemies.at(-1).hp;
        spawnEnemy('brute');
        const brute = state.enemies.at(-1).hp;
        state.enemies = [];
        state.elapsed = 299.99;
        update(0.02);
        const final = { count: state.enemies.filter(enemy => enemy.kind === 'final').length, hp: state.enemies.at(-1).hp };
        const countAtFive = state.enemies.length;
        update(0.04);
        const noMore = state.enemies.length === countAtFive;
        state.enemies.at(-1).atHouse = true;
        const hpBeforeAttack = state.houseHp;
        update(0.05);
        const houseAfterFirst = state.houseHp;
        const impactVisible = state.impacts.length > 0;
        const impactSoundPlayed = state.lastImpactSound > -Infinity;
        update(0.5);
        const houseBeforeSecond = state.houseHp;
        update(0.46);
        const houseAfterSecond = state.houseHp;
        const boss = state.enemies.at(-1);
        const bossHpBefore = boss.hp;
        hitEnemy({ x: boss.x, y: boss.y, power: 1 });
        const bossCanBeHitAtHouse = boss.hp === bossHpBefore - 1;
        state.enemies = [];
        update(0.02);
        return { first, second, baseShots, firstShots, secondShots, finalShots, baseStats, firstStats, secondStats, finalStats,
          firstColor, secondColor, finalColor,
          maxTier, maxTarget, extraUnlock, normalBefore, topEntry, existingAfter, normalAfter, brute, final, noMore,
          hpBeforeAttack, houseAfterFirst, houseBeforeSecond, houseAfterSecond, impactVisible, impactSoundPlayed, bossCanBeHitAtHouse,
          won: document.getElementById('headline').textContent };
      });
      assert.deepEqual(rules.first, { tier: 1, target: 200 });
      assert.deepEqual(rules.second, { tier: 2, target: 300 });
      assert.deepEqual([rules.baseShots, rules.firstShots, rules.secondShots, rules.finalShots], [1, 2, 3, 6]);
      assert.deepEqual(rules.baseStats, { damage: 1, speed: 580, radius: 3.5, interval: 0.5 });
      assert.deepEqual([rules.firstStats, rules.secondStats, rules.finalStats], [rules.baseStats, rules.baseStats, rules.baseStats]);
      assert.equal(new Set([rules.firstColor, rules.secondColor, rules.finalColor]).size, 3);
      assert.deepEqual([rules.maxTier, rules.maxTarget, rules.extraUnlock], [5, 0, false]);
      assert.equal(rules.normalBefore, 1);
      assert.equal(rules.topEntry, 56);
      assert.equal(rules.existingAfter, 2);
      assert.equal(rules.normalAfter, 2);
      assert.equal(rules.brute, 60);
      assert.deepEqual(rules.final, { count: 1, hp: 1000 });
      assert.equal(rules.hpBeforeAttack - rules.houseAfterFirst, 7);
      assert.equal(rules.houseAfterFirst, rules.houseBeforeSecond);
      assert.equal(rules.houseBeforeSecond - rules.houseAfterSecond, 7);
      assert.ok(rules.noMore && rules.impactVisible && rules.impactSoundPlayed && rules.bossCanBeHitAtHouse);
      assert.equal(rules.won, '您已通关');
      const newRules = await page.evaluate(() => {
        start();
        state.spawnTimer = 100;
        state.player.fireTimer = 100;
        state.elapsed = 29.99;
        update(0.02);
        const wall = state.walls[0];
        const scheduled = { count: state.walls.length, next: state.nextWall, options: wall.options, width: lanes[1].w / 2, speed: wall.speed };
        state.player.x = lanes[1].x + lanes[1].w / 4;
        wall.options = ['+2', '×2'];
        wall.y = state.player.y - 0.1;
        update(0.02);
        const afterAdd = state.squadCount;
        const spacing = squadPositions()[1].x - squadPositions()[0].x;
        state.bullets = [];
        fire();
        const squadShots = state.bullets.length;
        applyWall('×2');
        const doubled = state.squadCount;
        applyWall('−2');
        const subtracted = state.squadCount;
        applyWall('÷2');
        const divided = state.squadCount;
        state.enemies = [];
        spawnEnemy('normal');
        spawnEnemy('final');
        const normal = state.enemies[0], boss = state.enemies[1];
        normal.x = boss.x; normal.y = boss.y;
        const normalHp = normal.hp, bossHp = boss.hp;
        hitEnemy({ x: boss.x, y: boss.y, power: 1 });
        const priority = normal.hp === normalHp && boss.hp === bossHp - 1;
        boss.hp = 1;
        hitEnemy({ x: boss.x, y: boss.y, power: 1 });
        hitEnemy({ x: normal.x, y: normal.y, power: normal.hp });
        const cleared = state.enemies.length === 0;
        const maskAvailable = Boolean(spriteMasks[W < 600 ? 'finalMobile' : 'final']);
        state.enemies = [];
        spawnEnemy('normal');
        spawnEnemy('final');
        const visibleNormal = state.enemies[0], visibleBoss = state.enemies[1];
        const mask = spriteMasks[W < 600 ? 'finalMobile' : 'final'];
        let clearSpot = null;
        for (let row = 30; row < 98 && !clearSpot; row += 4) {
          for (let column = 30; column < 98; column += 4) {
            const bit = row * mask.width + column;
            if ((mask.bits[bit >> 3] & (1 << (bit & 7))) === 0) {
              clearSpot = { x: visibleBoss.x + (column / mask.width - 0.5) * visibleBoss.w,
                y: visibleBoss.y + (row / mask.height - 0.5) * visibleBoss.h };
              break;
            }
          }
        }
        visibleNormal.x = clearSpot.x; visibleNormal.y = clearSpot.y;
        const untouchedBossHp = visibleBoss.hp;
        hitEnemy({ x: clearSpot.x, y: clearSpot.y, power: visibleNormal.hp });
        const transparentPass = visibleBoss.hp === untouchedBossHp && state.enemies.includes(visibleBoss) && !state.enemies.includes(visibleNormal);
        return { scheduled, afterAdd, spacing, squadShots, doubled, subtracted, divided,
          priority, cleared, transparentPass, bossSize: enemySize('final'), maskAvailable };
      });
      assert.equal(newRules.scheduled.count, 1);
      assert.equal(newRules.scheduled.next, 90);
      assert.equal(new Set(newRules.scheduled.options).size, 2);
      assert.equal(newRules.scheduled.speed, 28);
      assert.equal(newRules.scheduled.width, (viewport.width - (viewport.width < 600 ? 12 : 36) - (viewport.width < 600 ? 10 : 18)) / 4);
      assert.equal(newRules.afterAdd, 3);
      assert.ok(newRules.spacing > 0 && newRules.spacing < viewport.width / 10);
      assert.deepEqual([newRules.squadShots, newRules.doubled, newRules.subtracted, newRules.divided], [3, 6, 4, 2]);
      assert.ok(newRules.priority && newRules.cleared && newRules.transparentPass, JSON.stringify(newRules));
      assert.ok(newRules.maskAvailable);
      assert.deepEqual(newRules.bossSize, { w: 260, h: viewport.width < 600 ? 235 : 470 });
      assert.deepEqual(errors, []);
      const formation = await page.evaluate(() => {
        start();
        state.player.x = lanes[1].center;
        return [2, 3, 4, 8, 24, 48].map(count => {
          state.squadCount = count;
          const layout = squadLayout();
          const xs = layout.positions.map(member => member.x);
          return { spacing: layout.spacing, width: Math.max(...xs) - Math.min(...xs) + layout.spriteWidth,
            count: layout.positions.length, left: Math.min(...xs) - layout.spriteWidth / 2,
            right: Math.max(...xs) + layout.spriteWidth / 2 };
        });
      });
      assert.ok(formation.every(item => item.width <= newRules.scheduled.width + 0.01));
      assert.ok(formation.every(item => item.left >= 0 && item.right <= viewport.width));
      assert.ok(formation.every((item, index) => item.count === [2, 3, 4, 8, 24, 48][index]));
      assert.ok(formation.every((item, index) => index === 0 || item.spacing < formation[index - 1].spacing));
      const wallDeaths = await page.evaluate(() => {
        const cross = (count, operation) => {
          start();
          state.squadCount = count;
          state.player.x = lanes[1].x + lanes[1].w / 4;
          state.player.fireTimer = 100;
          state.spawnTimer = 100;
          state.walls = [{ y: state.player.y + 0.1, height: 62, options: [operation, '+2'], speed: 0, passed: false }];
          update(0.02);
          return { count: state.squadCount, running: state.running, overlay: ui.overlay.hidden,
            headline: ui.headline.textContent, bullets: state.bullets.length };
        };
        return { minusOne: cross(1, '−2'), minusTwo: cross(2, '−2'), divideOne: cross(1, '÷2'), survives: cross(3, '−2') };
      });
      for (const result of [wallDeaths.minusOne, wallDeaths.minusTwo, wallDeaths.divideOne]) {
        assert.deepEqual(result, { count: 0, running: false, overlay: false, headline: '队伍阵亡', bullets: 0 });
      }
      assert.equal(wallDeaths.survives.count, 1);
      assert.equal(wallDeaths.survives.running, true);
      await page.evaluate(() => {
        start();
        state.spawnTimer = 100;
        state.player.fireTimer = 100;
        state.squadCount = 3;
        state.player.x = lanes[1].center;
        spawnWallPair();
        state.walls[0].y = H / 2;
        draw();
      });
      await page.screenshot({ path: path.join(os.tmpdir(), `ice-front-${viewport.width}-walls-check.png`) });
      if (viewport.width < 600) {
        await page.evaluate(() => {
          start();
          state.spawnTimer = 100;
          state.player.fireTimer = 100;
          state.squadCount = 48;
          spawnEnemy('brute');
          state.enemies[0].y = H * 0.43;
          for (let i = 0; i < 4; i++) {
            spawnEnemy('normal');
            state.enemies.at(-1).y = H * (0.26 + i * 0.1);
          }
          draw();
        });
        await page.screenshot({ path: path.join(os.tmpdir(), `ice-front-${viewport.width}-crowd-check.png`) });
        await page.evaluate(() => {
          start();
          state.enemies = [];
          state.bullets = [];
          state.spawnTimer = 100;
          state.player.fireTimer = 100;
          spawnEnemy('normal');
          const enemy = state.enemies[0];
          enemy.y = H - 100 - enemy.h / 2;
          enemy.atHouse = true;
          update(0.01);
          draw();
        });
        await page.screenshot({ path: path.join(os.tmpdir(), 'ice-front-390-impact-check.png') });
      }
      console.log(`${viewport.width}x${viewport.height}: layout, touch, upgrades, waves, house and victory passed`);
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
