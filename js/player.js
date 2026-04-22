export class Player {
    constructor() {
        // 초기 위치 및 물리 속성
        this.pos = [0, 2, 5]; // [x, y, z]
        this.vel = [0, 0, 0]; // 속도
        this.yaw = 0;   // 좌우 회전
        this.pitch = 0; // 상하 회전
        
        // 상태 능력치
        this.health = 100;
        this.maxHealth = 100;
        this.ammo = 30;
        this.maxAmmo = 30;
        
        // 충돌 및 이동 설정
        this.radius = 0.4;       // 플레이어 몸체 반지름 (히트박스)
        this.height = 1.8;       // 플레이어 키
        this.speed = 6.0;        // 이동 속도
        this.jumpForce = 0.15;   // 점프 힘
        this.gravity = -0.4;     // 중력 가속도
        
        // 상태 변수
        this.onGround = false;
        this.isReloading = false;
        this.reloadTimer = 0;
        this.reloadDuration = 60; // 약 1초 (60프레임 기준)
    }

    update(dt, keys, front, right, mapData) {
        // 1. 중력 적용 (y축 속도 감소)
        this.vel[1] += this.gravity * dt;
        
        // 2. 이동 입력 계산 (x, z축)
        let moveX = 0;
        let moveZ = 0;

        if (keys['w'] || keys['W']) { moveX += front[0]; moveZ += front[2]; }
        if (keys['s'] || keys['S']) { moveX -= front[0]; moveZ -= front[2]; }
        if (keys['a'] || keys['A']) { moveX -= right[0]; moveZ -= right[2]; }
        if (keys['d'] || keys['D']) { moveX += right[0]; moveZ += right[2]; }

        // 대각선 이동 속도 표준화
        const mag = Math.sqrt(moveX * moveX + moveZ * moveZ);
        if (mag > 0) {
            moveX = (moveX / mag) * this.speed * dt;
            moveZ = (moveZ / mag) * this.speed * dt;
        }

        // 3. 점프 (바닥에 있을 때만)
        if ((keys[' '] || keys['Spacebar']) && this.onGround) {
            this.vel[1] = this.jumpForce;
            this.onGround = false;
        }

        // 4. 물리 이동 및 충돌 판정 (X, Z축 분리 처리)
        // X축 이동 및 충돌
        let nextPosX = this.pos[0] + moveX;
        if (!this.checkCollision(nextPosX, this.pos[1], this.pos[2], mapData)) {
            this.pos[0] = nextPosX;
        }

        // Z축 이동 및 충돌
        let nextPosZ = this.pos[2] + moveZ;
        if (!this.checkCollision(this.pos[0], this.pos[1], nextPosZ, mapData)) {
            this.pos[2] = nextPosZ;
        }

        // Y축 이동 및 바닥 충돌
        this.pos[1] += this.vel[1];
        if (this.pos[1] < 1.0) { // 기본 바닥 높이 처리
            this.pos[1] = 1.0;
            this.vel[1] = 0;
            this.onGround = true;
        } else {
            // 공중에 있을 때 상자 윗면과의 충돌 체크 (심화)
            if (this.checkCollision(this.pos[0], this.pos[1], this.pos[2], mapData)) {
                this.pos[1] -= this.vel[1]; // 이전 위치로 복구
                this.vel[1] = 0;
                this.onGround = true;
            } else {
                this.onGround = false;
            }
        }
        
        this.updateHUD();
    }

    // AABB 충돌 체크 로직
    checkCollision(x, y, z, mapData) {
        if (!mapData) return false;

        for (let box of mapData) {
            // 상자의 경계 계산 (Renderer의 scale 반영)
            const minX = box.pos[0] - box.scale[0];
            const maxX = box.pos[0] + box.scale[0];
            const minY = box.pos[1] - box.scale[1];
            const maxY = box.pos[1] + box.scale[1];
            const minZ = box.pos[2] - box.scale[2];
            const maxZ = box.pos[2] + box.scale[2];

            // 플레이어의 히트박스 범위와 상자 범위가 겹치는지 확인
            if (x + this.radius > minX && x - this.radius < maxX &&
                y > minY && y - this.height * 0.5 < maxY &&
                z + this.radius > minZ && z - this.radius < maxZ) {
                return true; // 충돌 발생
            }
        }
        return false;
    }

    checkDeathAndRespawn(network) {
        if (this.health <= 0) {
            alert("KILLED! Respawning...");
            this.pos = [0, 2, 5];
            this.health = 100;
            this.ammo = 30;
            if (network) {
                network.sendData({
                    pos: this.pos,
                    health: this.health,
                    action: 'respawn'
                });
            }
            this.updateHUD();
        }
    }

    updateHUD() {
        const hpElem = document.getElementById('hp');
        const ammoElem = document.getElementById('ammo');
        if (hpElem) hpElem.innerText = Math.floor(this.health);
        if (ammoElem) ammoElem.innerText = this.ammo;
    }
}
