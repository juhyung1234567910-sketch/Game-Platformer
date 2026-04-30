// main.js - 게임 루프, HUD, 이벤트 연결

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.module.js';
import { Renderer }         from './renderer.js';
import { CameraController } from './camera.js';
import { Player }           from './player.js';
import { Network }          from './network.js';

// ── DOM 참조 ──
const canvas       = document.getElementById('canvas');
const lockOverlay  = document.getElementById('lock-overlay');
const lockBtn      = document.getElementById('lock-btn');
const deathScreen  = document.getElementById('death-screen');
const dmgFlash     = document.getElementById('damage-flash');
const adsVignette  = document.getElementById('ads-vignette');
const hitmarker    = document.getElementById('hitmarker');
const reloadBar    = document.getElementById('reload-bar');
const reloadFill   = document.getElementById('reload-fill');
const healthFill   = document.getElementById('health-fill');
const healthNum    = document.getElementById('health-num');
const ammoCurrentEl= document.getElementById('ammo-current');
const ammoMaxEl    = document.getElementById('ammo-max');
const ammoMode     = document.getElementById('ammo-mode');
const dashCdEl     = document.getElementById('dash-cd');
const playerCountEl= document.getElementById('player-count');
const killfeed     = document.getElementById('killfeed');

// ── 초기화 ──
const renderer = new Renderer(canvas);
const camera   = renderer.camera;
const camCtrl  = new CameraController(camera);
const player   = new Player(renderer.getBoxes());
const network  = new Network();

const remoteMeshes = {};   // pid → THREE.Group
const clock = new THREE.Clock();

// ── 포인터 락 ──
lockBtn.addEventListener('click', () => {
  canvas.requestPointerLock();
});
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === canvas) {
    lockOverlay.style.display = 'none';
  } else {
    lockOverlay.style.display = 'flex';
  }
});
canvas.addEventListener('contextmenu', e => e.preventDefault());

// ── 마우스 이동 ──
document.addEventListener('mousemove', e => {
  if (document.pointerLockElement !== canvas) return;
  camCtrl.onMouseMove(e.movementX, e.movementY, player.isAiming);
  // 반동 pitch를 player에서 camCtrl로 전달하기 위해 공유
});

// ── 마우스 휠 ──
canvas.addEventListener('wheel', e => {
  camCtrl.onWheel(e.deltaY > 0 ? 1 : -1);
});

// ── R키 리로드 ──
window.addEventListener('keydown', e => {
  if (e.code === 'KeyR') player.startReload(camCtrl);
  if (e.code === 'Escape') document.exitPointerLock();
});

// ── 히트마커 표시 ──
let hitmarkerTimer = 0;
function showHitmarker() {
  hitmarker.classList.add('active');
  hitmarkerTimer = 200;
}

// ── 킬피드 ──
function addKillfeed(text) {
  const el = document.createElement('div');
  el.className = 'killfeed-entry';
  el.textContent = text;
  killfeed.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ── HUD 업데이트 ──
function updateHud() {
  const hp = player.health;
  const pct = hp / player.maxHealth;
  healthFill.style.width = (pct * 100) + '%';
  healthNum.textContent = hp;
  healthFill.className = '';
  if (pct <= 0.3) { healthFill.classList.add('crit'); healthNum.style.color = '#ff3c3c'; }
  else if (pct <= 0.6) { healthFill.classList.add('warn'); healthNum.style.color = '#ffcc00'; }
  else { healthNum.style.color = ''; }

  ammoCurrentEl.textContent = player.ammo;
  ammoMaxEl.textContent     = '/ ' + player.maxAmmo;
  ammoMode.textContent      = '[' + player.fireMode + ']';

  if (player.isReloading) {
    reloadBar.classList.add('visible');
  } else {
    reloadBar.classList.remove('visible');
  }

  if (player.dashCooldown > 0) {
    dashCdEl.classList.add('visible');
    dashCdEl.textContent = `DASH CD: ${Math.ceil(player.dashCooldown/60)}s`;
  } else {
    dashCdEl.classList.remove('visible');
  }
}

// ── 충돌 히트 체크 (ray casting against other players) ──
function checkHit() {
  const origin = camCtrl.getHeadPos();
  const front  = camCtrl.getFront();
  let minDist = 100, hitTarget = null;

  for (const [pid, info] of Object.entries(network.otherPlayers)) {
    if (!info || !info.pos) continue;
    const tPos = new THREE.Vector3(info.pos[0], info.pos[1]+0.9, info.pos[2]);
    const v = tPos.clone().sub(origin);
    const t = v.dot(front);
    if (t < 0) continue;
    const nearest = origin.clone().addScaledVector(front, t);
    const dist = tPos.distanceTo(nearest);
    if (dist < 0.6 && t < minDist) { minDist = t; hitTarget = pid; }
  }

  if (hitTarget) {
    network.sendHit(hitTarget, 15);
    showHitmarker();
    addKillfeed(`💥 HIT → ${hitTarget.slice(-4)}`);
  }
}

// ── 플레이어 콜백 연결 ──
player.onShoot    = () => {};
player.onHudUpdate = updateHud;
player.onDie = () => {
  deathScreen.classList.add('active');
  setTimeout(() => deathScreen.classList.remove('active'), 1500);
  network.sendRespawn(player.pos.toArray());
};

// ── 네트워크 콜백 ──
network.onPlayersUpdate = (others) => {
  // 사라진 플레이어 메시 제거
  for (const pid of Object.keys(remoteMeshes)) {
    if (!others[pid]) renderer.removeRemotePlayer(pid, remoteMeshes);
  }
  // 있는 플레이어 메시 업데이트
  for (const [pid, info] of Object.entries(others)) {
    renderer.createOrUpdateRemotePlayer(pid, info, remoteMeshes);
  }
  playerCountEl.textContent = `PLAYERS: ${network.getPlayerCount()}`;
};

network.onHealthUpdate = (hp) => {
  player.health = hp;
  updateHud();
  // 피격 플래시
  dmgFlash.classList.add('active');
  setTimeout(() => dmgFlash.classList.remove('active'), 150);
};

// ── 메인 루프 ──
let frame = 0;
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (document.pointerLockElement !== canvas) return;

  // pitch 반동 전달 (player → camCtrl)
  // 총 쏠 때 player 내부에서 pitchDelta를 쌓지 않고, 
  // camCtrl.pitch를 직접 조작
  player.update(camCtrl, checkHit);

  camCtrl.update(
    player.pos,
    player.isSliding,
    player.bobAmp,
    player.moveTime,
    player.isJumping,
    player.currentRoll
  );

  // ADS 비네트
  adsVignette.style.opacity = player.adsProgress;

  // 히트마커 타이머
  if (hitmarkerTimer > 0) {
    hitmarkerTimer -= dt * 1000;
    if (hitmarkerTimer <= 0) hitmarker.classList.remove('active');
  }

  // 리로드 바 진행도
  if (player.isReloading) {
    const progress = 1 - (player.reloadTimer / player.reloadDuration);
    reloadFill.style.width = (progress * 100) + '%';
  }

  // 파티클 업데이트
  renderer.updateParticles(dt);

  // 네트워크 전송 (20hz throttle은 내부 처리)
  network.sendUpdate(player.getSnapshot(camCtrl));

  // 렌더
  renderer.render(camera);

  frame++;
}

// 초기 HUD 설정
updateHud();
playerCountEl.textContent = 'PLAYERS: 1';

// 루프 시작
loop();
