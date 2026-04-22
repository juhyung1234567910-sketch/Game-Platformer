export class Player {
    constructor() {
        // 1. 위치 및 물리 속성
        this.pos = [0, 2, 5]; // [x, y, z]
        this.vel = [0, 0, 0]; // 속도 (y축은 중력/점프용)
        this.yaw = 0;   // 좌우 회전 (도 단위)
        this.pitch = 0; // 상하 회전 (도 단위)
        
        // 2. 상태 능력치
        this.health = 100;
        this.maxHealth = 100;
        this.ammo = 30;
        this.maxAmmo = 30;
        
        // 3. 충돌 및 이동 설정 (Renderer와 연동됨)
        this.radius = 0.5;       // 플레이어 몸체 반지름 (히트박스)
        this.height = 1.8;       // 플레이어 키
        this.speed = 7.0;        // 이동 속도 (약간 상향)
        this.jumpForce = 0.2;    // 점프 힘 (시원하게 점프하도록 수정)
        this.gravity = -0.5;     // 중력 가속도
        
        // 4. 상태 변수
        this.onGround = false;
        this.isReloading = false;
        this.reloadTimer = 0;
        this.reloadDuration = 60; // 약 1초 (60프레임 기준)
    }

    update(dt, keys, front, right, mapData) {
        // --- A. 물리 엔진 (중력 및 재장전) ---
        if (dt > 0.1) dt = 0.1; // 프레임 드랍 시 튕김 방지용 캡
        
        this.vel[1] += this.gravity * dt; // 중력 가속도 적용

        if (this.isReloading) {
            this.reloadTimer -= 1;
            if (this.reloadTimer <= 0) {
                this.ammo = this.maxAmmo;
                this.isReloading = false;
            }
        }

        // --- B. 이동 입력 계산 ---
        let moveX = 0;
        let moveZ = 0;

        if (keys['w'] || keys['W']) { moveX += front[0]; moveZ += front[2]; }
        if (keys['s'] || keys['S']) { moveX -= front[0]; moveZ -= front[2]; }
        if (keys['a'] || keys['A']) { moveX -= right[0]; moveZ -= right[2]; }
        if (keys['d'] || keys['D']) { moveX += right[0]; moveZ += right[2]; }

        // 대각선 이동 속도 보정
        const mag = Math.sqrt(moveX * moveX + moveZ * moveZ);
        if (mag > 0) {
            moveX = (moveX / mag) * this.speed * dt;
            moveZ = (moveZ / mag) * this.speed * dt;
        }

        // --- C. 점프 처리 ---
        if ((keys[' '] || keys['Spacebar']) && this.onGround) {
            this.vel[1] = this.jumpForce;
            this.onGround = false;
        }

        // --- D. Sliding Collision (미끄러지는 충돌 판정) ---
        // X축 따로, Z축 따로 검사해야 벽에 비벼도 멈추지 않고 미끄러집니다.
        
        let nextPosX = this.pos[0] + moveX;
        if (!this.checkCollision(nextPosX, this.pos[1], this.pos[2], mapData)) {
            this.pos[0] = nextPosX;
        }

        let nextPosZ = this.pos[2] + moveZ;
        if (!this.checkCollision(this.pos[0], this.pos[1], nextPosZ, mapData)) {
            this.pos[2] = nextPosZ;
        }

        // --- E. Y축(수직) 이동 및 바닥 판정 ---
        this.pos[1] += this.vel[1];

        // 기본 바닥(y=1) 및 상자 윗면 판정
        if (this.pos[1] < 1.0) {
            this.pos[1] = 1.0;
            this.vel[1] = 0;
            this.onGround = true;
        } else {
            // 상자 윗면에 착지하는지 체크
            if (this.checkCollision(this.pos[0], this.pos[1], this.pos[2], mapData)) {
                this.pos[1] -= this.vel[1]; // 충돌 전 위치로 복구
                this.vel[1] = 0;
                this.onGround = true;
            } else {
                this.onGround = false;
            }
        }
        
        this.updateHUD();
    }

    // AABB (Axis-Aligned Bounding Box) 충돌 알고리즘
    checkCollision(x, y, z, mapData) {
        if (!mapData) return false;

        for (let box of mapData) {
            // 상자의 실제 물리 범위 계산 (중심점 +- 스케일)
            const minX = box.pos[0] - box.scale[0];
            const maxX = box.pos[0] + box.scale[0];
            const minY = box.pos[1] - box.scale[1];
            const maxY = box.pos[1] + box.scale[1];
            const minZ = box.pos[2] - box.scale[2];
            const maxZ = box.pos[2] + box.scale[2];

            // 플레이어 히트박스와 상자의 겹침 판정
            if (x + this.radius > minX && x - this.radius < maxX &&
                y + 0.1 > minY && y - this.height < maxY && // 높이 판정 최적화
                z + this.radius > minZ && z - this.radius < maxZ) {
                return true;
            }
        }
        return false;
    }

    checkDeathAndRespawn(network) {
        if (this.health <= 0) {
            this.health = 100;
            this.pos = [0, 2, 5];
            this.vel = [0, 0, 0];
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
