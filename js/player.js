export class Player {
    constructor() {
        // 1. 위치 및 물리 속성
        this.pos   = [0, 2, 5];  // [x, y, z]
        this.vel   = [0, 0, 0];  // 속도
        this.yaw   = 0;          // 좌우 회전 (도 단위) — 네트워크로 전송됨
        this.pitch = 0;          // 상하 회전 (도 단위)

        // 2. 상태 능력치
        this.health  = 100;
        this.maxHealth = 100;
        this.ammo    = 30;
        this.maxAmmo = 30;

        // 3. 충돌 및 이동 설정
        this.radius   = 0.5;
        this.height   = 1.8;
        this.speed    = 7.0;
        this.jumpForce = 0.2;
        this.gravity  = -0.5;

        // 4. 상태 변수
        this.onGround     = false;
        this.isReloading  = false;
        this.reloadTimer  = 0;
        this.reloadDuration = 60;

        // 5. 네트워크 동기화 주기 관리 (매 프레임 전송 방지)
        this._netSendTimer    = 0;
        this._netSendInterval = 3;  // 3프레임마다 1회 전송
        this._lastSentYaw     = null;
    }

    update(dt, keys, front, right, mapData, network) {
        if (dt > 0.1) dt = 0.1;

        // --- A. 물리 ---
        this.vel[1] += this.gravity * dt;

        if (this.isReloading) {
            this.reloadTimer--;
            if (this.reloadTimer <= 0) {
                this.ammo = this.maxAmmo;
                this.isReloading = false;
            }
        }

        // --- B. 이동 입력 ---
        let moveX = 0, moveZ = 0;

        if (keys['w'] || keys['W']) { moveX += front[0]; moveZ += front[2]; }
        if (keys['s'] || keys['S']) { moveX -= front[0]; moveZ -= front[2]; }
        if (keys['a'] || keys['A']) { moveX -= right[0]; moveZ -= right[2]; }
        if (keys['d'] || keys['D']) { moveX += right[0]; moveZ += right[2]; }

        const mag = Math.sqrt(moveX*moveX + moveZ*moveZ);
        if (mag > 0) {
            moveX = (moveX / mag) * this.speed * dt;
            moveZ = (moveZ / mag) * this.speed * dt;
        }

        // --- C. 점프 ---
        if ((keys[' '] || keys['Spacebar']) && this.onGround) {
            this.vel[1] = this.jumpForce;
            this.onGround = false;
        }

        // --- D. Sliding Collision ---
        let nextX = this.pos[0] + moveX;
        if (!this.checkCollision(nextX, this.pos[1], this.pos[2], mapData))
            this.pos[0] = nextX;

        let nextZ = this.pos[2] + moveZ;
        if (!this.checkCollision(this.pos[0], this.pos[1], nextZ, mapData))
            this.pos[2] = nextZ;

        // --- E. 수직 이동 ---
        this.pos[1] += this.vel[1];
        if (this.pos[1] < 1.0) {
            this.pos[1] = 1.0;
            this.vel[1] = 0;
            this.onGround = true;
        } else if (this.checkCollision(this.pos[0], this.pos[1], this.pos[2], mapData)) {
            this.pos[1] -= this.vel[1];
            this.vel[1] = 0;
            this.onGround = true;
        } else {
            this.onGround = false;
        }

        // --- F. 네트워크 위치·방향 전송 ---
        // yaw 변화가 있거나 이동 중일 때만, 주기적으로 전송합니다.
        if (network) {
            this._netSendTimer++;
            const isMoving = (mag > 0);
            const yawChanged = (this._lastSentYaw === null ||
                                Math.abs(this.yaw - this._lastSentYaw) > 1.0);

            if (this._netSendTimer >= this._netSendInterval &&
                (isMoving || yawChanged)) {
                this._netSendTimer = 0;
                this._lastSentYaw  = this.yaw;

                network.sendData({
                    pos:    [...this.pos],
                    yaw:    this.yaw,   // ← 방향 추가 전송
                    health: this.health
                });
            }
        }

        this.updateHUD();
    }

    /**
     * 마우스 이동으로 yaw / pitch 업데이트.
     * Camera 클래스나 input 핸들러에서 호출하면 됩니다.
     *
     * @param {number} dx  마우스 X 이동량 (픽셀)
     * @param {number} dy  마우스 Y 이동량 (픽셀)
     * @param {number} sensitivity  감도 (기본 0.15)
     */
    rotate(dx, dy, sensitivity = 0.15) {
        this.yaw   += dx * sensitivity;
        this.pitch -= dy * sensitivity;

        // pitch 클램프 (-89 ~ +89도)
        this.pitch = Math.max(-89, Math.min(89, this.pitch));

        // yaw 0~360 정규화 (선택)
        this.yaw = ((this.yaw % 360) + 360) % 360;
    }

    // AABB 충돌
    checkCollision(x, y, z, mapData) {
        if (!mapData) return false;
        for (const box of mapData) {
            const minX = box.pos[0] - box.scale[0];
            const maxX = box.pos[0] + box.scale[0];
            const minY = box.pos[1] - box.scale[1];
            const maxY = box.pos[1] + box.scale[1];
            const minZ = box.pos[2] - box.scale[2];
            const maxZ = box.pos[2] + box.scale[2];

            if (x + this.radius > minX && x - this.radius < maxX &&
                y + 0.1 > minY && y - this.height < maxY &&
                z + this.radius > minZ && z - this.radius < maxZ) {
                return true;
            }
        }
        return false;
    }

    checkDeathAndRespawn(network) {
        if (this.health <= 0) {
            this.health = 100;
            this.pos    = [0, 2, 5];
            this.vel    = [0, 0, 0];
            this.ammo   = 30;

            if (network) {
                network.sendData({
                    pos:    [...this.pos],
                    yaw:    this.yaw,
                    health: this.health,
                    action: 'respawn'
                });
            }
            this.updateHUD();
        }
    }

    updateHUD() {
        const hpElem   = document.getElementById('hp');
        const ammoElem = document.getElementById('ammo');
        if (hpElem)   hpElem.innerText   = Math.floor(this.health);
        if (ammoElem) ammoElem.innerText = this.ammo;
    }
}
