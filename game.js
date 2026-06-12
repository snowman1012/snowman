const HAN_IMAGE =
  "https://cdn.discordapp.com/attachments/969789360822165564/1514930019648934109/image.png?ex=6a2d2806&is=6a2bd686&hm=7a37ca49f1ac104172ae459f67230505cc3b5050a85b008172d240090a74535b&";
const KANG_IMAGE =
  "https://cdn.discordapp.com/attachments/969789360822165564/1514930020080943104/image.png?ex=6a2d2806&is=6a2bd686&hm=04a9c29ad6743adff4393b336d44fd792306a25b93482990273a7c4dd4d26aa8&";

const characters = {
  han: {
    id: "han",
    name: "한건희",
    hp: 150,
    speed: 220,
    radius: 35,
    color: "#30d6ff",
    image: HAN_IMAGE,
    tags: "원거리, 똥 폭격",
    skill: "5초마다 똥을 던집니다. 맞으면 80 피해를 줍니다.",
    cooldown: 5,
  },
  kang: {
    id: "kang",
    name: "강승민",
    hp: 400,
    speed: 180,
    radius: 43,
    color: "#ff4d6d",
    image: KANG_IMAGE,
    tags: "탱커, 근접 제압",
    skill: "8초마다 가까운 상대를 삼키고 뱉으며 50 피해를 줍니다.",
    cooldown: 8,
  },
};

const screens = [...document.querySelectorAll(".screen")];
const canvas = document.querySelector("#arena");
const ctx = canvas.getContext("2d");
const logEl = document.querySelector("#battleLog");
const matchTitle = document.querySelector("#matchTitle");
const cardEls = [document.querySelector("#card0"), document.querySelector("#card1")];
const selected = ["han", "kang"];

let fighters = [];
let projectiles = [];
let effects = [];
let lastFrame = 0;
let running = false;
let paused = false;
let speedMultiplier = 1;
let winner = null;

const loadedImages = {};

function showScreen(name) {
  screens.forEach((screen) => screen.classList.toggle("active", screen.dataset.screen === name));
  if (name !== "battle") running = false;
}

document.querySelectorAll("[data-go]").forEach((button) => {
  button.addEventListener("click", () => showScreen(button.dataset.go));
});

document.querySelectorAll(".speed-btn").forEach((button) => {
  button.addEventListener("click", () => {
    speedMultiplier = Number(button.dataset.speed);
    document.querySelectorAll(".speed-btn").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
  });
});

document.querySelector("#startBattle").addEventListener("click", startBattle);
document.querySelector("#restartBtn").addEventListener("click", startBattle);
document.querySelector("#pauseBtn").addEventListener("click", () => {
  paused = !paused;
  document.querySelector("#pauseBtn").textContent = paused ? "계속" : "중단";
});

function renderSelectCards() {
  document.querySelectorAll(".character-list").forEach((list) => {
    const slot = Number(list.dataset.slot);
    list.innerHTML = "";
    Object.values(characters).forEach((character) => {
      const button = document.createElement("button");
      button.className = `character-card ${selected[slot] === character.id ? "selected" : ""}`;
      button.innerHTML = `
        <div class="portrait-preview" style="background-image:url('${character.image}')"></div>
        <div>
          <div class="character-name">${character.name}</div>
          <p>Tags: ${character.tags}</p>
          <p>Stats: HP ${character.hp}, Speed ${character.speed}px/s</p>
          <p>Skill: ${character.skill}</p>
        </div>
      `;
      button.addEventListener("click", () => {
        selected[slot] = character.id;
        renderSelectCards();
      });
      list.appendChild(button);
    });
  });
}

function getImage(character) {
  if (loadedImages[character.id]) return loadedImages[character.id];
  const image = new Image();
  image.src = character.image;
  loadedImages[character.id] = image;
  return image;
}

function makeFighter(characterId, index) {
  const character = characters[characterId];
  return {
    ...character,
    index,
    x: index === 0 ? 165 : canvas.width - 165,
    y: index === 0 ? canvas.height - 145 : 145,
    vx: index === 0 ? character.speed * 0.78 : -character.speed * 0.72,
    vy: index === 0 ? -character.speed * 0.54 : character.speed * 0.48,
    hpNow: character.hp,
    cooldownLeft: index === 0 ? 1.1 : 2.2,
    swallowedTimer: 0,
    spitTimer: 0,
    invulnerable: 0,
    bounceLock: 0,
  };
}

function startBattle() {
  fighters = [makeFighter(selected[0], 0), makeFighter(selected[1], 1)];
  projectiles = [];
  effects = [];
  winner = null;
  running = true;
  paused = false;
  lastFrame = performance.now();
  document.querySelector("#pauseBtn").textContent = "중단";
  matchTitle.textContent = `${fighters[0].name} vs ${fighters[1].name}`;
  log(`${fighters[0].name}와 ${fighters[1].name} 전투 시작`);
  showScreen("battle");
  requestAnimationFrame(loop);
}

function loop(now) {
  if (!running) return;
  const rawDt = Math.min((now - lastFrame) / 1000, 0.04);
  lastFrame = now;
  if (!paused && !winner) update(rawDt * speedMultiplier);
  draw();
  renderHud();
  requestAnimationFrame(loop);
}

function update(dt) {
  fighters.forEach((fighter) => {
    fighter.cooldownLeft = Math.max(0, fighter.cooldownLeft - dt);
    fighter.invulnerable = Math.max(0, fighter.invulnerable - dt);
  });

  const [a, b] = fighters;
  updateFighter(a, b, dt);
  updateFighter(b, a, dt);
  resolveFighterCollision(a, b);
  updateProjectiles(dt);
  updateEffects(dt);
  checkWinner();
}

function updateFighter(fighter, enemy, dt) {
  if (fighter.hpNow <= 0) return;

  if (fighter.swallowedTimer > 0) {
    fighter.swallowedTimer -= dt;
    fighter.x = enemy.x;
    fighter.y = enemy.y;
    fighter.vx = 0;
    fighter.vy = 0;
    return;
  }

  if (fighter.id === "han" && fighter.cooldownLeft <= 0) {
    throwDung(fighter, enemy);
    fighter.cooldownLeft = fighter.cooldown;
  }

  if (fighter.id === "kang" && fighter.cooldownLeft <= 0 && distance(fighter, enemy) < 150 && enemy.swallowedTimer <= 0) {
    swallow(fighter, enemy);
    fighter.cooldownLeft = fighter.cooldown;
  }

  const dx = enemy.x - fighter.x;
  const dy = enemy.y - fighter.y;
  const dist = Math.max(1, Math.hypot(dx, dy));
  const desired = fighter.id === "han" ? 285 : 92;
  const steer = dist > desired ? 1 : -0.86;
  const orbit = Math.sin(performance.now() / 360 + fighter.index * 2.4) * 0.7;

  fighter.bounceLock = Math.max(0, fighter.bounceLock - dt);
  if (fighter.bounceLock <= 0) {
    fighter.vx += ((dx / dist) * steer + (-dy / dist) * orbit) * fighter.speed * 0.42 * dt;
    fighter.vy += ((dy / dist) * steer + (dx / dist) * orbit) * fighter.speed * 0.42 * dt;
  }

  keepBallSpeed(fighter);
  fighter.x += fighter.vx * dt;
  fighter.y += fighter.vy * dt;
  bounce(fighter);
}

function throwDung(fighter, enemy) {
  const dx = enemy.x - fighter.x;
  const dy = enemy.y - fighter.y;
  const dist = Math.max(1, Math.hypot(dx, dy));
  projectiles.push({
    owner: fighter.index,
    x: fighter.x,
    y: fighter.y,
    vx: (dx / dist) * 425 + enemy.vx * 0.2,
    vy: (dy / dist) * 425 + enemy.vy * 0.2,
    spin: Math.random() * Math.PI,
    radius: 17,
    damage: 80,
    life: 2.3,
    kind: "dung",
  });
  effects.push({ kind: "ring", x: fighter.x, y: fighter.y, color: "#8a4f24", life: 0.45, max: 0.45, radius: 32 });
  log(`${fighter.name} 똥 투척! 명중 시 80 피해`);
}

function swallow(fighter, enemy) {
  enemy.swallowedTimer = 0.95;
  enemy.invulnerable = 1.1;
  fighter.spitTimer = 1.2;
  effects.push({ kind: "zone", x: fighter.x, y: fighter.y, color: "#ff4d6d", life: 0.95, max: 0.95, radius: 155 });
  log(`${fighter.name}이 ${enemy.name}을 삼켰습니다`);

  setTimeout(() => {
    if (!running || winner || enemy.hpNow <= 0) return;
    const angle = Math.atan2(enemy.y - fighter.y || 1, enemy.x - fighter.x || 1) + Math.PI * 0.15;
    enemy.swallowedTimer = 0;
    enemy.invulnerable = 0;
    enemy.x = fighter.x + Math.cos(angle) * 86;
    enemy.y = fighter.y + Math.sin(angle) * 86;
    enemy.vx = Math.cos(angle) * 620;
    enemy.vy = Math.sin(angle) * 620;
    damage(enemy, 50);
    effects.push({ kind: "burst", x: enemy.x, y: enemy.y, color: "#fff06a", life: 0.55, max: 0.55, radius: 20 });
    log(`${fighter.name}이 뱉어내며 50 피해`);
  }, 950 / speedMultiplier);
}

function updateProjectiles(dt) {
  projectiles = projectiles.filter((projectile) => {
    projectile.life -= dt;
    projectile.spin += dt * 8;
    projectile.x += projectile.vx * dt;
    projectile.y += projectile.vy * dt;
    projectile.vy += 105 * dt;

    if (projectile.x < 12 || projectile.x > canvas.width - 12) projectile.vx *= -0.72;
    if (projectile.y < 12 || projectile.y > canvas.height - 12) projectile.vy *= -0.72;
    projectile.x = clamp(projectile.x, 12, canvas.width - 12);
    projectile.y = clamp(projectile.y, 12, canvas.height - 12);

    const target = fighters[1 - projectile.owner];
    if (target.hpNow > 0 && target.swallowedTimer <= 0 && distance(projectile, target) < projectile.radius + target.radius) {
      damage(target, projectile.damage);
      effects.push({ kind: "splatter", x: projectile.x, y: projectile.y, color: "#6b3d1e", life: 0.75, max: 0.75, radius: 22 });
      log(`${target.name} 명중! 80 피해`);
      return false;
    }
    return projectile.life > 0;
  });
}

function damage(target, amount) {
  if (target.invulnerable > 0) return;
  target.hpNow = Math.max(0, target.hpNow - amount);
  target.vx += (target.index === 0 ? -1 : 1) * 130;
}

function updateEffects(dt) {
  effects = effects.filter((effect) => {
    effect.life -= dt;
    return effect.life > 0;
  });
}

function checkWinner() {
  const alive = fighters.filter((fighter) => fighter.hpNow > 0);
  if (alive.length === 1) {
    winner = alive[0];
    log(`${winner.name} 승리!`);
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawArena();
  effects.forEach(drawEffect);
  projectiles.forEach(drawProjectile);
  fighters.forEach(drawFighter);
  if (winner) drawWinner();
}

function drawArena() {
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, "#122035");
  gradient.addColorStop(0.5, "#101525");
  gradient.addColorStop(1, "#2a1020");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= canvas.width; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y <= canvas.height; y += 48) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  ctx.save();
  ctx.globalAlpha = 0.2;
  ctx.strokeStyle = "#ffe66d";
  ctx.lineWidth = 4;
  ctx.setLineDash([14, 12]);
  ctx.strokeRect(18, 18, canvas.width - 36, canvas.height - 36);
  ctx.restore();
}

function drawFighter(fighter) {
  if (fighter.hpNow <= 0) return;
  const swallowed = fighter.swallowedTimer > 0;
  const pulse = Math.sin(performance.now() / 120) * 2;

  ctx.save();
  ctx.globalAlpha = swallowed ? 0.25 : 1;
  ctx.translate(fighter.x, fighter.y);

  ctx.beginPath();
  ctx.arc(0, 0, fighter.radius + 11 + pulse, 0, Math.PI * 2);
  ctx.fillStyle = fighter.id === "han" ? "rgba(48,214,255,0.16)" : "rgba(255,77,109,0.16)";
  ctx.fill();
  ctx.strokeStyle = fighter.color;
  ctx.lineWidth = 5;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, 0, fighter.radius + 2, 0, Math.PI * 2);
  ctx.fillStyle = "#050916";
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 3;
  ctx.stroke();

  const image = getImage(fighter);
  if (image.complete && image.naturalWidth) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, fighter.radius - 3, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(image, -fighter.radius, -fighter.radius, fighter.radius * 2, fighter.radius * 2);
    ctx.restore();
  } else {
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "900 20px Arial";
    ctx.fillText(fighter.name.slice(0, 1), 0, 1);
  }

  ctx.restore();

  if (fighter.id === "kang" && fighter.cooldownLeft <= 1.8) {
    ctx.save();
    ctx.globalAlpha = 0.2;
    ctx.beginPath();
    ctx.arc(fighter.x, fighter.y, 150, 0, Math.PI * 2);
    ctx.fillStyle = "#ff4d6d";
    ctx.fill();
    ctx.strokeStyle = "#ffb3c1";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }
}

function drawProjectile(projectile) {
  if (projectile.kind !== "dung") return;
  ctx.save();
  ctx.translate(projectile.x, projectile.y);
  ctx.rotate(projectile.spin);

  ctx.strokeStyle = "#3f220f";
  ctx.lineWidth = 2.5;
  ctx.fillStyle = "#6f3f1d";
  ctx.beginPath();
  ctx.ellipse(0, 8, 18, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#875022";
  ctx.beginPath();
  ctx.ellipse(0, 0, 14, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#9a5d2c";
  ctx.beginPath();
  ctx.ellipse(0, -8, 10, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#b3743c";
  ctx.beginPath();
  ctx.moveTo(-4, -13);
  ctx.quadraticCurveTo(6, -21, 8, -9);
  ctx.quadraticCurveTo(2, -13, -4, -13);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "rgba(255,226,170,0.8)";
  ctx.beginPath();
  ctx.arc(-6, -5, 2.2, 0, Math.PI * 2);
  ctx.arc(5, 4, 1.8, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(95, 64, 35, 0.42)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 3; i += 1) {
    ctx.beginPath();
    ctx.moveTo(-24 - i * 8, -6 + i * 5);
    ctx.bezierCurveTo(-35 - i * 8, -16, -39 - i * 8, 10, -50 - i * 8, 0);
    ctx.stroke();
  }

  ctx.restore();
}

function drawEffect(effect) {
  const t = effect.life / effect.max;
  ctx.save();
  if (effect.kind === "zone") {
    ctx.globalAlpha = 0.24 * t;
    ctx.fillStyle = effect.color;
    ctx.beginPath();
    ctx.arc(effect.x, effect.y, effect.radius * (1.12 - t * 0.1), 0, Math.PI * 2);
    ctx.fill();
  } else if (effect.kind === "splatter") {
    ctx.globalAlpha = t;
    ctx.fillStyle = effect.color;
    for (let i = 0; i < 9; i += 1) {
      const angle = (Math.PI * 2 * i) / 9;
      const spread = effect.radius + (1 - t) * 42;
      ctx.beginPath();
      ctx.arc(effect.x + Math.cos(angle) * spread, effect.y + Math.sin(angle) * spread, 3 + (i % 3), 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    ctx.globalAlpha = t;
    ctx.strokeStyle = effect.color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(effect.x, effect.y, effect.radius + (1 - t) * 36, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawWinner() {
  ctx.save();
  ctx.fillStyle = "rgba(4, 7, 16, 0.72)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = "center";
  ctx.fillStyle = "#fff";
  ctx.font = "900 48px Arial";
  ctx.fillText(`${winner.name} 승리`, canvas.width / 2, canvas.height / 2);
  ctx.font = "800 18px Arial";
  ctx.fillStyle = "#ffe66d";
  ctx.fillText("다시하기 또는 선택으로 돌아가기", canvas.width / 2, canvas.height / 2 + 44);
  ctx.restore();
}

function renderHud() {
  fighters.forEach((fighter, index) => {
    const hpPercent = Math.max(0, fighter.hpNow / fighter.hp) * 100;
    const coolPercent = (1 - fighter.cooldownLeft / fighter.cooldown) * 100;
    cardEls[index].className = `fighter-card ${index === 1 ? "enemy" : ""}`;
    cardEls[index].innerHTML = `
      <h3>${fighter.name}</h3>
      <div class="stat-line">HP ${Math.ceil(fighter.hpNow)} / ${fighter.hp}</div>
      <div class="bar"><span style="width:${hpPercent}%"></span></div>
      <div class="stat-line">SKILL ${Math.floor(clamp(coolPercent, 0, 100))}%</div>
      <div class="bar cooldown"><span style="width:${clamp(coolPercent, 0, 100)}%"></span></div>
      <div class="tag-row">
        <span class="tag">속도 ${fighter.speed}px/s</span>
        <span class="tag">${fighter.id === "han" ? "똥 투척" : "삼키기"}</span>
      </div>
    `;
  });
}

function keepBallSpeed(fighter) {
  const current = Math.hypot(fighter.vx, fighter.vy);
  const target = fighter.speed;
  if (current < 1) {
    fighter.vx = fighter.index === 0 ? target : -target;
    fighter.vy = fighter.index === 0 ? -target * 0.35 : target * 0.35;
    return;
  }

  const next = current + (target - current) * 0.055;
  fighter.vx = (fighter.vx / current) * next;
  fighter.vy = (fighter.vy / current) * next;
}

function resolveFighterCollision(a, b) {
  if (a.hpNow <= 0 || b.hpNow <= 0 || a.swallowedTimer > 0 || b.swallowedTimer > 0) return;

  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.max(1, Math.hypot(dx, dy));
  const minDist = a.radius + b.radius + 10;
  if (dist >= minDist) return;

  const nx = dx / dist;
  const ny = dy / dist;
  const overlap = minDist - dist;
  a.x -= nx * overlap * 0.5;
  a.y -= ny * overlap * 0.5;
  b.x += nx * overlap * 0.5;
  b.y += ny * overlap * 0.5;

  const tx = -ny;
  const ty = nx;
  const aNormal = a.vx * nx + a.vy * ny;
  const bNormal = b.vx * nx + b.vy * ny;
  const aTangent = a.vx * tx + a.vy * ty;
  const bTangent = b.vx * tx + b.vy * ty;

  a.vx = bNormal * nx + aTangent * tx;
  a.vy = bNormal * ny + aTangent * ty;
  b.vx = aNormal * nx + bTangent * tx;
  b.vy = aNormal * ny + bTangent * ty;
  a.bounceLock = 0.55;
  b.bounceLock = 0.55;
  keepBallSpeed(a);
  keepBallSpeed(b);
}

function bounce(fighter) {
  const min = fighter.radius + 10;
  const maxX = canvas.width - min;
  const maxY = canvas.height - min;
  let bounced = false;

  if (fighter.x < min) {
    fighter.x = min;
    fighter.vx = Math.abs(fighter.vx);
    bounced = true;
  } else if (fighter.x > maxX) {
    fighter.x = maxX;
    fighter.vx = -Math.abs(fighter.vx);
    bounced = true;
  }

  if (fighter.y < min) {
    fighter.y = min;
    fighter.vy = Math.abs(fighter.vy);
    bounced = true;
  } else if (fighter.y > maxY) {
    fighter.y = maxY;
    fighter.vy = -Math.abs(fighter.vy);
    bounced = true;
  }

  if (bounced) {
    fighter.bounceLock = 0.6;
    keepBallSpeed(fighter);
  }
  fighter.x = clamp(fighter.x, min, maxX);
  fighter.y = clamp(fighter.y, min, maxY);
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function log(message) {
  logEl.textContent = message;
}

renderSelectCards();
showScreen("home");
