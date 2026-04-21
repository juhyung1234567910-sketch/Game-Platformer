export class Player {
    constructor() {
        this.maxHealth = 100;
        this.health = this.maxHealth;
        this.maxAmmo = 30;
        this.ammo = this.maxAmmo;
        
        // 위치 및 물리 변수
        this.pos = [0.0, 1.0, 5.0]; // x, y, z
        this.yVel = 0.0;            // Y축 속도 (중력용)
        this.speed = 4.0;
        this.gravity = -15.0;
        this.jumpForce = 6.0;
        this.isGrounded = false;
        
        // 시점 변수
        this.yaw = 0.0;
        this.pitch = 0.0;
        this.moveTime = 0.0;
        // ... (이전 스웨이, 재장전 등 기타 변수 유지) ...
    }

    // 💡 새롭게 추가된 핵심 물리/이동 로직
    update(dt, keys, front, right) {
        let moveDir = [0, 0, 0];
        let isMoving = false;

        // 1. 키보드 입력에 따른 이동 벡터 계산
        if (keys['w'] || keys['W']) { moveDir[0] += front[0]; moveDir[2] += front[2]; isMoving = true; }
        if (keys['s'] || keys['S']) { moveDir[0] -= front[0]; moveDir[2] -= front[2]; isMoving = true; }
        if (keys['a'] || keys['A']) { moveDir[0] -= right[0]; moveDir[2] -= right[2]; isMoving = true; }
        if (keys['d'] || keys['D']) { moveDir[0] += right[0]; moveDir[2] += right[2]; isMoving = true; }

        // 대각선 이동 시 속도 빨라짐 방지 (정규화)
        const length = Math.sqrt(moveDir[0]**2 + moveDir[2]**2);
        if (length > 0) {
            moveDir[0] /= length;
            moveDir[2] /= length;
        }

        // 달리기 (Shift)
        const currentSpeed = (keys['Shift']) ? this.speed * 1.5 : this.speed;

        // X, Z 축 이동 적용
        this.pos[0] += moveDir[0] * currentSpeed * dt;
        this.pos[2] += moveDir[2] * currentSpeed * dt;

        // 2. 중력 및 점프 (Y축 물리)
        if (!this.isGrounded) {
            this.yVel += this.gravity * dt;
        }
        this.pos[1] += this.yVel * dt;

        // 바닥 충돌 처리 (임시 바닥 높이를 1.0으로 설정)
        if (this.pos[1] <= 1.0) {
            this.pos[1] = 1.0;
            this.yVel = 0.0;
            this.isGrounded = true;
        } else {
            this.isGrounded = false;
        }

        // 스페이스바 점프
        if (keys[' '] && this.isGrounded) {
            this.yVel = this.jumpForce;
            this.isGrounded = false;
        }

        // 3. 카메라 흔들림(Bobbing) 연산
        if (isMoving && this.isGrounded) {
            this.moveTime += dt * (keys['Shift'] ? 1.5 : 1.0);
        }
    }

    // ... (이전 checkDeathAndRespawn 등 유지) ...
}
