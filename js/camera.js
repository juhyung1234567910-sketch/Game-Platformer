// camera.js - 1인칭/3인칭 카메라 로직 (Python 코드 직역)

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.module.js';

export class CameraController {
  constructor(threeCamera) {
    this.camera = threeCamera;

    this.yaw   = -90.0;   // Python 초기값
    this.pitch = 0.0;
    this.cameraDistance = 4.0;
    this.minDist = 0.0;
    this.maxDist = 8.0;
    this.isFirstPerson = false;

    // 무기 흔들림 (bob, sway, roll)
    this.moveTime  = 0;
    this.bobAmp    = 0;
    this.currentRoll = 0;
    this.targetRoll  = 0;
    this.recoilRoll  = 0;
    this.swayX = 0; this.swayY = 0;
    this.targetSwayX = 0; this.targetSwayY = 0;

    this.slideDrop = 0;

    // 임시 벡터 (GC 절약)
    this._front = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._headPos = new THREE.Vector3();
    this._camPos  = new THREE.Vector3();
    this._target  = new THREE.Vector3();
  }

  // 마우스 이동 처리
  onMouseMove(dx, dy, isAiming) {
    const sens = 0.08 * (isAiming ? 0.5 : 1.0);
    this.yaw   += dx * sens;
    this.pitch -= dy * sens;
    this.pitch  = Math.max(-89, Math.min(89, this.pitch));
    this.targetSwayX = dx * 0.0005;
    this.targetSwayY = dy * 0.0005;
  }

  // 마우스 휠 - 줌
  onWheel(delta) {
    this.cameraDistance = Math.max(this.minDist, Math.min(this.maxDist, this.cameraDistance - delta * 0.5));
    this.isFirstPerson = this.cameraDistance <= 0.5;
  }

  // 매 프레임 호출 - 카메라 위치 및 뷰 매트릭스 계산
  update(playerPos, isSliding, bobAmp, moveTime, isJumping, currentRoll) {
    const yawRad   = THREE.MathUtils.degToRad(this.yaw);
    const pitchRad = THREE.MathUtils.degToRad(this.pitch);

    // 전방 벡터
    this._front.set(
      Math.cos(yawRad) * Math.cos(pitchRad),
      Math.sin(pitchRad),
      Math.sin(yawRad) * Math.cos(pitchRad)
    );
    this._right.set(-Math.sin(yawRad), 0, Math.cos(yawRad));

    const HEAD_HEIGHT = 1.7;
    this.slideDrop += (( isSliding ? -0.6 : 0) - this.slideDrop) * 0.2;

    this._headPos.copy(playerPos).y += HEAD_HEIGHT + this.slideDrop;

    // 뷰 밥 (걷기 흔들림)
    if (!isJumping && !isSliding) {
      const viewBob = Math.sin(moveTime * 7) * 0.06 * bobAmp;
      this._headPos.y += viewBob;
    }

    const dist = this.cameraDistance;

    if (this.isFirstPerson) {
      this._camPos.copy(this._headPos);
      this._target.copy(this._headPos).addScaledVector(this._front, 1);
    } else {
      const offsetFactor = Math.max(0, Math.min(1, (dist - 0.5) / 2.0));
      this._camPos.copy(this._headPos)
        .addScaledVector(this._front, -dist)
        .addScaledVector(this._right, -0.8 * offsetFactor)
        .y += 0.3 * offsetFactor;
      this._target.copy(this._headPos).addScaledVector(this._front, 100);
    }

    // 카메라 적용
    this.camera.position.copy(this._camPos);
    this.camera.lookAt(this._target);

    // Roll (틸트)
    this.camera.rotation.z = THREE.MathUtils.degToRad(currentRoll);
  }

  // 전방벡터 반환 (이동, 사격에 사용)
  getFront() { return this._front.clone(); }
  getRight() { return this._right.clone(); }
  getHeadPos() { return this._headPos.clone(); }
}
