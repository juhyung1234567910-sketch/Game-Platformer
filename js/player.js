// player.js - 플레이어 물리, 입력, 무기 로직 (Python Game 클래스 직역)

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.module.js';

export class Player {
  constructor(boxes) {
    // 위치/속도
    this.pos    = new THREE.Vector3(0, 1, 5);
    this.vel    = new THREE.Vector3();

    this.playerRadius = 0.4;
    this.playerHeight = 1.8;

    // 이동
    this.baseSpeed  = 0.08;
    this.gravity    = -0.015;
    this.jumpStr    = 0.25;
    this.yVel       = 0;
    this.isJumping  = false;

    // 슬라이드/대시
    this.isSliding      = false;
    this.slideSpeed     = 0;
    this.slideDir       = new THREE.Vector3();
    this.dashCooldown   = 0;
    this.dashCooldownMax = 90;

    // 애니메이션
    this.moveTime    = 0;
    this.bobAmp      = 0;
    this.targetRoll  = 0;
    this.currentRoll = 0;
    this.recoilRoll  = 0;
    this.swayX = 0; this.swayY = 0;
    this.targetSwayX = 0; this.targetSwayY = 0;

    // 무기
    this.ammo         = 30;
    this.maxAmmo      = 30;
    this.isReloading  = false;
    this.reloadTimer  = 0;
    this.reloadDuration = 60; // 프레임 단위
    this.recoilOffset = 0;
    this.isAiming     = false;
    this.adsProgress  = 0;
    this.fireMode     = 'AUTO';
    this.fireCooldown = 0;
    this.fireRate     = 6;
    this.mKeyHeld     = false;
    this.mouseLeftHeld = false;

    // 체력
    this.health    = 100;
    this.maxHealth = 100;

    // 충돌 박스 (renderer에서 전달)
    this.boxes = boxes;

    // 키 상태
    this.keys = {};
    this.mouse = { left: false, right: false };

    this._bindInput();

    // 이벤트 콜백 (main에서 연결)
    this.onShoot   = null;
    this.onReload  = null;
    this.onDie     = null;
    this.onHudUpdate = null;
  }

  _bindInput() {
    window.addEventListener('keydown', e => { this.keys[e.code] = true; });
    window.addEventListener('keyup',   e => { this.keys[e.code] = false; });
    window.addEventListener('mousedown', e => {
      if (e.button === 0) this.mouse.left  = true;
      if (e.button === 2) this.mouse.right = true;
    });
    window.addEventListener('mouseup', e => {
      if (e.button === 0) { this.mouse.left  = false; this.mouseLeftHeld = false; }
      if (e.button === 2) this.mouse.right = false;
    });
  }

  // AABB 충돌
  checkCollision(pos) {
    const feetY = pos.y;
    const headY = pos.y + this.playerHeight;
    for (const b of this.boxes) {
      const [bx,by,bz] = b.pos;
      const [sx,sy,sz] = b.size;
      if (pos.x > bx-sx-this.playerRadius && pos.x < bx+sx+this.playerRadius &&
          feetY < by+sy && headY > by-sy &&
          pos.z > bz-sz-this.playerRadius && pos.z < bz+sz+this.playerRadius) {
        return true;
      }
    }
    return false;
  }

  shoot(checkHitFn) {
    if (this.ammo <= 0 || this.isReloading) return false;
    this.ammo--;
    this.recoilOffset = 0.3;
    this.pitch += (Math.random() * 1 + 1.5); // 반동 (카메라 컨트롤러로 전달)
    this.recoilRoll = (Math.random() * 6 - 3);
    if (checkHitFn) checkHitFn();
    if (this.onShoot) this.onShoot();
    if (this.onHudUpdate) this.onHudUpdate();
    return true;
  }

  // 매 프레임 호출
  update(camCtrl, checkHitFn) {
    const keys = this.keys;
    const mouse = this.mouse;

    // ADS
    this.isAiming = mouse.right && !this.isReloading;
    this.adsProgress += (this.isAiming ? 1 : -1) * 0.1;
    this.adsProgress = Math.max(0, Math.min(1, this.adsProgress));

    this.recoilOffset = Math.max(0, this.recoilOffset - 0.05);

    // 방향
    const yawRad = THREE.MathUtils.degToRad(camCtrl.yaw);
    const front  = new THREE.Vector3(Math.cos(yawRad), 0, Math.sin(yawRad));
    const right  = new THREE.Vector3(-Math.sin(yawRad), 0, Math.cos(yawRad));

    const moveDir = new THREE.Vector3();
    let targetTilt = 0;

    if (keys['KeyW']) moveDir.addScaledVector(front, 1);
    if (keys['KeyS']) moveDir.addScaledVector(front, -1);
    if (keys['KeyA']) { moveDir.addScaledVector(right, -1); targetTilt -= 3; }
    if (keys['KeyD']) { moveDir.addScaledVector(right,  1); targetTilt += 3; }

    // M키 - 사격 모드 전환
    if (keys['KeyM']) {
      if (!this.mKeyHeld) {
        this.fireMode = this.fireMode === 'AUTO' ? 'SEMI' : 'AUTO';
        this.mKeyHeld = true;
        if (this.onHudUpdate) this.onHudUpdate();
      }
    } else { this.mKeyHeld = false; }

    // 사격
    this.fireCooldown = Math.max(0, this.fireCooldown - 1);
    if (mouse.left) {
      if (this.fireMode === 'AUTO') {
        if (this.fireCooldown === 0) { this.shoot(checkHitFn); this.fireCooldown = this.fireRate; }
      } else {
        if (!this.mouseLeftHeld) { this.shoot(checkHitFn); this.mouseLeftHeld = true; }
      }
    }

    this.targetRoll = targetTilt;
    const isMoving = moveDir.length() > 0;
    if (isMoving) moveDir.normalize();

    // 밥 업데이트
    if (isMoving && !this.isJumping && !this.isSliding) {
      this.moveTime += this.baseSpeed * 1.5;
      this.bobAmp += (1 - this.bobAmp) * 0.1;
    } else {
      this.bobAmp += (0 - this.bobAmp) * 0.1;
    }

    // 롤 업데이트
    this.currentRoll += (this.targetRoll + this.recoilRoll - this.currentRoll) * 0.15;
    this.recoilRoll *= 0.8;

    // 대시 쿨다운
    if (this.dashCooldown > 0) {
      this.dashCooldown--;
      if (this.dashCooldown % 30 === 0 && this.onHudUpdate) this.onHudUpdate();
    }

    // 슬라이드 / 대시 (SHIFT)
    if (keys['ShiftLeft'] && !this.isSliding && !this.isJumping && isMoving && this.dashCooldown <= 0) {
      this.isSliding  = true;
      this.slideSpeed = this.baseSpeed * 3.5;
      this.slideDir.copy(moveDir);
      this.dashCooldown = this.dashCooldownMax;
      if (this.onHudUpdate) this.onHudUpdate();
    }

    let actualMove = new THREE.Vector3();
    if (this.isSliding) {
      actualMove.copy(this.slideDir).multiplyScalar(this.slideSpeed);
      this.slideSpeed -= 0.015;
      if (this.slideSpeed <= this.baseSpeed) this.isSliding = false;
    } else {
      if (isMoving) actualMove.copy(moveDir).multiplyScalar(this.baseSpeed);
    }

    // 수평 이동 + 충돌 (X, Z 분리)
    if (actualMove.length() > 0) {
      const tryX = this.pos.clone(); tryX.x += actualMove.x;
      if (!this.checkCollision(tryX)) this.pos.x = tryX.x;
      const tryZ = this.pos.clone(); tryZ.z += actualMove.z;
      if (!this.checkCollision(tryZ)) this.pos.z = tryZ.z;
    }

    // 점프
    if (keys['Space'] && !this.isJumping && !this.isSliding) {
      this.yVel = this.jumpStr;
      this.isJumping = true;
    }

    // 중력
    this.yVel += this.gravity;
    const tryY = this.pos.clone(); tryY.y += this.yVel;
    if (!this.checkCollision(tryY)) {
      this.pos.y = tryY.y;
    } else {
      if (this.yVel < 0) this.isJumping = false;
      this.yVel = 0;
    }

    // 리로드 업데이트
    if (this.isReloading) {
      this.reloadTimer--;
      if (this.reloadTimer <= 0) {
        this.isReloading = false;
        this.ammo = this.maxAmmo;
        if (this.onHudUpdate) this.onHudUpdate();
      }
    }

    // 사망/추락 체크
    if (this.health <= 0 || this.pos.y <= -20) {
      this.health = this.maxHealth;
      this.ammo   = this.maxAmmo;
      this.pos.set(0, 1, 5);
      this.yVel = 0;
      if (this.onDie) this.onDie();
      if (this.onHudUpdate) this.onHudUpdate();
    }

    // Pitch 반동을 카메라 컨트롤러에 전달
    camCtrl.pitch = Math.max(-89, Math.min(89, camCtrl.pitch));
  }

  startReload(camCtrl) {
    if (this.ammo < this.maxAmmo && !this.isReloading) {
      this.isReloading = true;
      this.reloadTimer = this.reloadDuration;
      if (this.onHudUpdate) this.onHudUpdate();
    }
  }

  // 네트워크 전송용 상태 스냅샷
  getSnapshot(camCtrl) {
    return {
      pos:       this.pos.toArray(),
      yaw:       camCtrl.yaw,
      pitch:     camCtrl.pitch,
      move_time: this.moveTime,
      bob_amp:   this.bobAmp,
      is_sliding: this.isSliding,
      recoil:    this.recoilOffset,
      is_aiming: this.isAiming,
    };
  }
}
