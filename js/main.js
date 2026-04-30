// main.js - 게임 메인 루프 및 초기화

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.module.js';
import { Renderer }         from './renderer.js';
import { Player }           from './player.js';
import { CameraController } from './camera.js';
import { Network }          from './network.js';

// ── 초기화 ──
const canvas = document.getElementById('gameCanvas');
const renderer = new Renderer(canvas);
const camCtrl = new CameraController(renderer.camera);
const network = new Network();
const player = new Player(renderer.getBoxes(), renderer);

// 마우스 이동
let mouseX = 0, mouseY = 0;
document.addEventListener('mousemove', (e) => {
  const deltaX = e.movementX || 0;
  const deltaY = e.movementY || 0;
  camCtrl.onMouseMove(deltaX, deltaY, player.isAiming);
});

// 마우스 휠 (카메라 거리)
document.addEventListener('wheel', (e) => {
  camCtrl.onWheel(Math.sign(e.deltaY));
}, { passive: true });

// Pointer Lock
canvas.addEventListener('click', () => {
  canvas.requestPointerLock?.();
});

// 원격 플레이어
const playerMeshMap = {};

network.onPlayersUpdate = (others) => {
  Object.keys(others).forEach(pid => {
    const info = others[pid];
    renderer.createOrUpdateRemotePlayer(pid, info, playerMeshMap);
  });
  Object.keys(playerMeshMap).forEach(pid => {
    if (!others[pid]) renderer.removeRemotePlayer(pid, playerMeshMap);
  });
};

network.onHealthUpdate = (health) => {
  player.health = health;
  updateHUD();
};

network.onHit = (damage) => {
  console.log(`Hit! Damage: ${damage}`);
};

player.onShoot = () => {
  renderer.spawnSmokeParticle(
    player.pos.clone().addScaledVector(camCtrl.getFront(), 0.5)
  );
  
  // 레이캐스트: 다른 플레이어 맞혔는지 확인
  const checkHitFn = () => {
    const origin = player.pos.clone().add(new THREE.Vector3(0, 1.4, 0));
    const dir = camCtrl.getFront();
    
    for (const [pid, parts] of Object.entries(playerMeshMap)) {
      const enemyPos = parts.group.position;
      const toEnemy = enemyPos.clone().sub(origin);
      const distToEnemy = toEnemy.length();
      
      // 간단한 sphere-ray 충돌
      const proj = toEnemy.dot(dir);
      if (proj > 0 && proj < 100) {
        const closest = origin.clone().addScaledVector(dir, proj);
        if (closest.distanceTo(enemyPos) < 0.6) {
          network.sendHit(pid, 15);
          console.log(`Hit player ${pid}!`);
          return true;
        }
      }
    }
    return false;
  };
  
  checkHitFn();
};

player.onHudUpdate = () => {
  updateHUD();
};

player.onDie = () => {
  network.sendRespawn(player.pos.toArray());
  console.log('Respawned!');
};

// ── HUD 업데이트 ──
function updateHUD() {
  const hudDiv = document.getElementById('hud');
  if (!hudDiv) return;
  
  const fireMode = player.fireMode;
  const ammo = player.ammo;
  const maxAmmo = player.maxAmmo;
  const health = player.health;
  const maxHealth = player.maxHealth;
  const playerCount = network.getPlayerCount();
  const dashReady = player.dashCooldown === 0;
  
  hudDiv.innerHTML = `
    <div style="color: #0ff; font-family: monospace; font-size: 12px;">
      <div>FPS: <span id="fps">60</span></div>
      <div>Health: ${health}/${maxHealth}</div>
      <div>Ammo: ${ammo}/${maxAmmo} [${fireMode}]</div>
      <div>Dash: ${dashReady ? '✓' : '✗'}</div>
      <div>Players: ${playerCount}</div>
      <div>Ping: ${network.latency ?? '?'}ms</div>
    </div>
  `;
}

// ── 메인 루프 ──
let frameCount = 0;
let lastTime = performance.now();

function gameLoop() {
  // FPS 카운팅
  frameCount++;
  const now = performance.now();
  if (now - lastTime >= 1000) {
    document.getElementById('fps').textContent = frameCount;
    frameCount = 0;
    lastTime = now;
  }
  
  // 플레이어 업데이트
  player.update(camCtrl, () => {});
  
  // 카메라 업데이트
  camCtrl.update(
    player.pos,
    player.isSliding,
    player.bobAmp,
    player.moveTime,
    player.isJumping,
    player.currentRoll
  );
  
  // 파티클 업데이트
  const dt = 0.016; // 60fps 기준
  renderer.updateParticles(dt);
  
  // 네트워크 스냅샷 전송
  network.sendUpdate(player.getSnapshot(camCtrl));
  
  // 렌더링
  renderer.render(renderer.camera);
  
  requestAnimationFrame(gameLoop);
}

// 시작
gameLoop();
updateHUD();

// 윈도우 닫을 때 정리
window.addEventListener('beforeunload', () => {
  network.disconnect();
});
