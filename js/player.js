// player.js - 플레이어 물리/입력/무기 + 로컬 3인칭 바디 + 1인칭 무기 씬

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.module.js';

export class Player {
  constructor(boxes, renderer) {
    this.pos    = new THREE.Vector3(0, 1, 5);
    this.yVel   = 0;

    this.playerRadius = 0.4;
    this.playerHeight = 1.8;

    this.baseSpeed = 0.08;
    this.gravity   = -0.015;
    this.jumpStr   = 0.25;
    this.isJumping = false;

    // 슬라이드/대시
    this.isSliding      = false;
    this.slideSpeed     = 0;
    this.slideDir       = new THREE.Vector3();
    this.dashCooldown   = 0;
    this.dashCooldownMax = 90;

    // 애니메이션 상태
    this.moveTime    = 0;      // 누적 이동 시간 (bob 주기)
    this.bobAmp      = 0;      // 0~1 보간
    this.targetRoll  = 0;      // 이동 방향 틸트
    this.currentRoll = 0;      // 보간된 roll
    this.recoilRoll  = 0;      // 발사 반동 roll

    // 무기
    this.ammo          = 30;
    this.maxAmmo       = 30;
    this.isReloading   = false;
    this.reloadTimer   = 0;
    this.reloadDuration = 60;
    this.recoilOffset  = 0;    // 발사 반동 (무기 앞뒤)
    this.isAiming      = false;
    this.adsProgress   = 0;    // 0=hip, 1=ads
    this.fireMode      = 'AUTO';
    this.fireCooldown  = 0;
    this.fireRate      = 6;
    this.mKeyHeld      = false;
    this.mouseLeftHeld = false;

    // 체력
    this.health    = 100;
    this.maxHealth = 100;

    // 충돌 박스
    this.boxes = boxes;

    // 입력
    this.keys  = {};
    this.mouse = { left: false, right: false };
    this._bindInput();

    // 콜백
    this.onShoot     = null;
    this.onHudUpdate = null;
    this.onDie       = null;

    // ── 3인칭 로컬 바디 ──
    this._buildLocalBody(renderer);

    // ── 1인칭 무기 씬 오브젝트 ──
    this._buildFirstPersonWeapon(renderer);
  }

  // ── 로컬 플레이어 3인칭 바디 ──
  _buildLocalBody(renderer) {
    const scene = renderer.scene;
    const pMat  = (col) => new THREE.MeshLambertMaterial({ color: col, map: renderer.getTexPlayer() });
    const gMat  = ()    => new THREE.MeshLambertMaterial({ color: 0x222222, map: renderer.getTexWeapon() });
    const box   = (sx,sy,sz) => new THREE.BoxGeometry(sx*2, sy*2, sz*2);

    this.bodyGroup = new THREE.Group();
    this.bodyGroup.visible = false; // 3인칭일 때만 보임

    // 몸통
    const body = new THREE.Mesh(box(0.4,0.6,0.25), pMat(0x3366aa));
    body.position.y = 1.0;
    body.castShadow = true;
    this.bodyGroup.add(body);

    // 머리 pivot
    this._headPivot = new THREE.Group();
    this._headPivot.position.y = 1.7;
    const head = new THREE.Mesh(box(0.25,0.25,0.25), pMat(0x4477bb));
    head.castShadow = true;
    this._headPivot.add(head);
    this.bodyGroup.add(this._headPivot);

    // 왼다리
    this._legLPivot = new THREE.Group();
    this._legLPivot.position.set(-0.25, 1.0, 0);
    const legL = new THREE.Mesh(box(0.2,0.7,0.2), pMat(0x2255aa));
    legL.position.y = -0.7; legL.castShadow = true;
    this._legLPivot.add(legL);
    this.bodyGroup.add(this._legLPivot);

    // 오른다리
    this._legRPivot = new THREE.Group();
    this._legRPivot.position.set(0.25, 1.0, 0);
    const legR = new THREE.Mesh(box(0.2,0.7,0.2), pMat(0x2255aa));
    legR.position.y = -0.7; legR.castShadow = true;
    this._legRPivot.add(legR);
    this.bodyGroup.add(this._legRPivot);

    // 오른팔
    this._armRPivot = new THREE.Group();
    this._armRPivot.position.set(0.45, 1.4, 0.05);
    const armR = new THREE.Mesh(box(0.15,0.6,0.15), pMat(0x3366aa));
    armR.position.y = -0.6; armR.castShadow = true;
    this._armRPivot.add(armR);
    this.bodyGroup.add(this._armRPivot);

    // 왼팔
    this._armLPivot = new THREE.Group();
    this._armLPivot.position.set(-0.45, 1.4, 0.05);
    const armL = new THREE.Mesh(box(0.15,0.7,0.15), pMat(0x3366aa));
    armL.position.y = -0.7; armL.castShadow = true;
    this._armLPivot.add(armL);
    this.bodyGroup.add(this._armLPivot);

    // 총 (3인칭)
    this._gunGroup3P = new THREE.Group();
    this._gunGroup3P.position.set(0.35, 1.22, 1.2);
    const gunMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.08,0.1,0.55),
      gMat()
    );
    gunMesh.castShadow = true;
    this._gunGroup3P.add(gunMesh);
    this.bodyGroup.add(this._gunGroup3P);

    scene.add(this.bodyGroup);
  }

  // ── 1인칭 무기 (weaponScene에 배치) ──
  _buildFirstPersonWeapon(renderer) {
    const wScene = renderer.weaponScene;
    const gMat   = () => new THREE.MeshLambertMaterial({ color: 0x222222, map: renderer.getTexWeapon() });

    this._fpWeaponGroup = new THREE.Group();

    // 총몸
    const body   = new THREE.Mesh(new THREE.BoxGeometry(0.06,0.08,0.5),  gMat());
    // 손잡이
    const grip   = new THREE.Mesh(new THREE.BoxGeometry(0.05,0.12,0.06), gMat());
    grip.position.set(0, -0.08, 0.08);
    // 총구 확장
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.03,0.03,0.15), gMat());
    barrel.position.set(0, 0.01, -0.32);
    // 탄창
    const mag    = new THREE.Mesh(new THREE.BoxGeometry(0.04,0.1,0.04),  gMat());
    mag.position.set(0, -0.1, 0.04);

    this._fpWeaponGroup.add(body, grip, barrel, mag);

    // 초기 hip 포지션 (Python: hip_x=0.25, hip_y=-0.85, hip_z=-0.15)
    this._fpWeaponGroup.position.set(0.25, -0.85, -0.15);

    wScene.add(this._fpWeaponGroup);
  }

  _bindInput() {
    window.addEventListener('keydown', e => { this.keys[e.code] = true; });
    window.addEventListener('keyup',   e => { this.keys[e.code] = false; });
    window.addEventListener('mousedown', e => {
      if (e.button === 0) this.mouse.left  = true;
      if (e.button === 2) this.mouse.right = true;
    });
    window.addEventListener('mouseup', e => {
      if (e.button === 0) { this.mouse.left = false; this.mouseLeftHeld = false; }
      if (e.button === 2) this.mouse.right = false;
    });
  }

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
    if (this.ammo <= 0 || this.isReloading) return;
    this.ammo--;
    this.recoilOffset = 0.3;
    this.recoilRoll   = (Math.random() * 6 - 3);
    if (checkHitFn) checkHitFn();
    if (this.onShoot)     this.onShoot();
    if (this.onHudUpdate) this.onHudUpdate();
  }

  startReload() {
    if (this.ammo < this.maxAmmo && !this.isReloading) {
      this.isReloading  = true;
      this.reloadTimer  = this.reloadDuration;
      if (this.onHudUpdate) this.onHudUpdate();
    }
  }

  /**
   * 메인 업데이트
   * @param {CameraController} camCtrl
   * @param {Function} checkHitFn
   */
  update(camCtrl, checkHitFn) {
    const keys  = this.keys;
    const mouse = this.mouse;

    // ── ADS ──
    this.isAiming    = mouse.right && !this.isReloading;
    this.adsProgress += (this.isAiming ? 1 : -1) * 0.1;
    this.adsProgress  = Math.max(0, Math.min(1, this.adsProgress));

    // ── 반동 감쇠 ──
    this.recoilOffset = Math.max(0, this.recoilOffset - 0.05);

    // ── 이동 방향 (yaw 기준) ──
    const yawRad = THREE.MathUtils.degToRad(camCtrl.yaw);
    const front  = new THREE.Vector3(Math.cos(yawRad), 0, Math.sin(yawRad));
    const right  = new THREE.Vector3(-Math.sin(yawRad), 0, Math.cos(yawRad));

    const moveDir  = new THREE.Vector3();
    let targetTilt = 0;

    if (keys['KeyW']) moveDir.addScaledVector(front,  1);
    if (keys['KeyS']) moveDir.addScaledVector(front, -1);
    if (keys['KeyA']) { moveDir.addScaledVector(right, -1); targetTilt -= 3; }
    if (keys['KeyD']) { moveDir.addScaledVector(right,  1); targetTilt += 3; }

    // ── M키 사격 모드 ──
    if (keys['KeyM']) {
      if (!this.mKeyHeld) {
        this.fireMode = this.fireMode === 'AUTO' ? 'SEMI' : 'AUTO';
        this.mKeyHeld = true;
        if (this.onHudUpdate) this.onHudUpdate();
      }
    } else { this.mKeyHeld = false; }

    // ── 사격 ──
    this.fireCooldown = Math.max(0, this.fireCooldown - 1);
    if (mouse.left) {
      if (this.fireMode === 'AUTO') {
        if (this.fireCooldown === 0) { this.shoot(checkHitFn); this.fireCooldown = this.fireRate; }
      } else {
        if (!this.mouseLeftHeld) { this.shoot(checkHitFn); this.mouseLeftHeld = true; }
      }
    }

    // ── Roll 보간 (Python과 동일) ──
    this.targetRoll   = targetTilt;
    this.currentRoll += (this.targetRoll + this.recoilRoll - this.currentRoll) * 0.15;
    this.recoilRoll  *= 0.8;

    // ── 이동 정규화 ──
    const isMoving = moveDir.length() > 0;
    if (isMoving) moveDir.normalize();

    // ── 워킹 밥 (Python: move_time += base_speed*1.5, bob_amp 보간) ──
    if (isMoving && !this.isJumping && !this.isSliding) {
      this.moveTime += this.baseSpeed * 1.5;
      this.bobAmp   += (1 - this.bobAmp) * 0.1;
    } else {
      this.bobAmp += (0 - this.bobAmp) * 0.1;
    }

    // ── 대시 쿨다운 ──
    if (this.dashCooldown > 0) {
      this.dashCooldown--;
      if (this.dashCooldown % 30 === 0 && this.onHudUpdate) this.onHudUpdate();
    }

    // ── 슬라이드 (SHIFT) ──
    if (keys['ShiftLeft'] && !this.isSliding && !this.isJumping && isMoving && this.dashCooldown <= 0) {
      this.isSliding   = true;
      this.slideSpeed  = this.baseSpeed * 3.5;
      this.slideDir.copy(moveDir);
      this.dashCooldown = this.dashCooldownMax;
      if (this.onHudUpdate) this.onHudUpdate();
    }

    // ── 실제 이동량 ──
    let actualMove = new THREE.Vector3();
    if (this.isSliding) {
      actualMove.copy(this.slideDir).multiplyScalar(this.slideSpeed);
      this.slideSpeed -= 0.015;
      if (this.slideSpeed <= this.baseSpeed) this.isSliding = false;
    } else {
      if (isMoving) actualMove.copy(moveDir).multiplyScalar(this.baseSpeed);
    }

    // ── 충돌 처리 (X, Z 분리) ──
    if (actualMove.length() > 0) {
      const tryX = this.pos.clone(); tryX.x += actualMove.x;
      if (!this.checkCollision(tryX)) this.pos.x = tryX.x;
      const tryZ = this.pos.clone(); tryZ.z += actualMove.z;
      if (!this.checkCollision(tryZ)) this.pos.z = tryZ.z;
    }

    // ── 점프 ──
    if (keys['Space'] && !this.isJumping && !this.isSliding) {
      this.yVel = this.jumpStr;
      this.isJumping = true;
    }

    // ── 중력 ──
    this.yVel += this.gravity;
    const tryY = this.pos.clone(); tryY.y += this.yVel;
    if (!this.checkCollision(tryY)) {
      this.pos.y = tryY.y;
    } else {
      if (this.yVel < 0) this.isJumping = false;
      this.yVel = 0;
    }

    // ── 리로드 ──
    if (this.isReloading) {
      this.reloadTimer--;
      if (this.reloadTimer <= 0) {
        this.isReloading = false;
        this.ammo = this.maxAmmo;
        if (this.onHudUpdate) this.onHudUpdate();
      }
    }

    // ── 사망/추락 ──
    if (this.health <= 0 || this.pos.y <= -20) {
      this.health = this.maxHealth;
      this.ammo   = this.maxAmmo;
      this.pos.set(0, 1, 5);
      this.yVel = 0;
      if (this.onDie)       this.onDie();
      if (this.onHudUpdate) this.onHudUpdate();
    }

    // ── 3인칭 바디 업데이트 ──
    this._updateLocalBody(camCtrl);

    // ── 1인칭 무기 업데이트 ──
    this._updateFirstPersonWeapon();
  }

  // ── 로컬 바디 위치/애니메이션 ──
  _updateLocalBody(camCtrl) {
    const isFirstPerson = camCtrl.isFirstPerson;
    this.bodyGroup.visible = !isFirstPerson;

    if (!isFirstPerson) {
      const slideOffset = this.isSliding ? -0.6 : 0;
      this.bodyGroup.position.set(
        this.pos.x,
        this.pos.y + 0.4 + slideOffset,
        this.pos.z
      );
      this.bodyGroup.rotation.y = -THREE.MathUtils.degToRad(camCtrl.yaw) - Math.PI / 2;

      // 머리 pitch
      this._headPivot.rotation.x = THREE.MathUtils.degToRad(-camCtrl.pitch);

      // 다리 스윙 (Python: swing=sin(moveTime*6)*20deg*bobAmp)
      const swing = this.isSliding ? 0 : Math.sin(this.moveTime * 6) * (20 * Math.PI/180) * this.bobAmp;
      this._legLPivot.rotation.x = this.isSliding ?  (70*Math.PI/180) :  swing;
      this._legRPivot.rotation.x = this.isSliding ? -(70*Math.PI/180) : -swing;

      // 팔 (Python draw_asymmetric_arm 직역)
      const ads = this.adsProgress;
      // 오른팔: x_rot=(65-15*ads), z_rot=(-20+10*ads)
      this._armRPivot.rotation.x = THREE.MathUtils.degToRad(65 - ads*15);
      this._armRPivot.rotation.z = THREE.MathUtils.degToRad(-20 + ads*10);
      // 왼팔: x_rot=(45+10*ads), z_rot=(40-20*ads)
      this._armLPivot.rotation.x = THREE.MathUtils.degToRad(45 + ads*10);
      this._armLPivot.rotation.z = THREE.MathUtils.degToRad( 40 - ads*20);

      // 총 반동
      this._gunGroup3P.rotation.x = -this.recoilOffset * 0.3;
    }
  }

  // ── 1인칭 무기 위치/애니메이션 (Python draw_first_person_weapon 직역) ──
  _updateFirstPersonWeapon() {
    // Python: hip(0.25,-0.85,-0.15) → ads(0.0,-0.75,0.25) lerp by adsProgress
    const ads = this.adsProgress;
    const hipX = 0.25, hipY = -0.85, hipZ = -0.15;
    const adsX = 0.0,  adsY = -0.75, adsZ =  0.25;

    // 반동 킥
    const recoilZ = this.recoilOffset;
    const recoilY = this.recoilOffset * 0.1;

    // 밥 (ADS 시 감쇠)
    const bobFactor = this.isAiming ? 0.2 : 1.0;
    const bobX = Math.cos(this.moveTime * 5) * 0.006 * this.bobAmp * bobFactor;
    const bobY = Math.sin(this.moveTime * 10) * 0.006 * this.bobAmp * bobFactor;

    // 리로드 오프셋
    let reloadY = 0, reloadRX = 0, reloadRZ = 0;
    if (this.isReloading) {
      const prog = 1 - (this.reloadTimer / this.reloadDuration);
      reloadY  = -Math.sin(prog * Math.PI) * 0.5;
      reloadRX =  Math.sin(prog * Math.PI) * 60;
      reloadRZ =  Math.sin(prog * Math.PI) * 30;
    }

    const curX = hipX + (adsX - hipX) * ads + bobX;
    const curY = hipY + (adsY - hipY) * ads + recoilY + bobY + reloadY;
    const curZ = hipZ + (adsZ - hipZ) * ads + recoilZ;

    this._fpWeaponGroup.position.set(curX, curY, curZ);
    this._fpWeaponGroup.rotation.set(
      THREE.MathUtils.degToRad(reloadRX),
      Math.PI, // 180도 (Python: create_rotation_matrix_y(180))
      THREE.MathUtils.degToRad(reloadRZ)
    );
  }

  getSnapshot(camCtrl) {
    return {
      pos:        this.pos.toArray(),
      yaw:        camCtrl.yaw,
      pitch:      camCtrl.pitch,
      move_time:  this.moveTime,
      bob_amp:    this.bobAmp,
      is_sliding: this.isSliding,
      recoil:     this.recoilOffset,
      is_aiming:  this.isAiming,
    };
  }
}
