export class Player {
    constructor() {
        // ── 위치·물리 ──────────────────────────────────────────────
        this.pos   = [0, 2, 5];
        this.vel   = [0, 0, 0];
        this.yaw   = 0;
        this.pitch = 0;

        // ── 능력치 ─────────────────────────────────────────────────
        this.health    = 100;
        this.maxHealth = 100;
        this.ammo      = 30;
        this.maxAmmo   = 30;

        // ── 이동·충돌 설정 ──────────────────────────────────────────
        this.radius        = 0.5;
        this.height        = 1.8;
        this.speed         = 7.0;
        this.jumpForce     = 0.2;
        this.gravity       = -0.5;

        // ── 상태 플래그 ─────────────────────────────────────────────
        this.onGround      = false;
        this.isReloading   = false;
        this.reloadTimer   = 0;
        this.reloadDuration = 60;

        // ── Camera.js 가 참조하는 Bobbing 속성 ─────────────────────
        this.moveTime   = 0;
        this.bobAmp     = 0;
        this.isGrounded = false;  // Camera 호환 별칭 (onGround 와 동기화)
        this.isSliding  = false;

        // ── 네트워크 전송 주기 관리 ─────────────────────────────────
        this._netSendTimer    = 0;
        this._netSendInterval = 3;
        this._lastSentYaw     = null;
    }

    // ── 재장전 시작 단일 진입점 ─────────────────────────────────────
    startReload() {
        if (!this.isReloading && this.ammo < this.maxAmmo) {
            this.isReloading = true;
            this.reloadTimer = this.reloadDuration;
        }
    }

    // ── 마우스 → yaw/pitch ─────────────────────────────────────────
    rotate(dx, dy, sensitivity = 0.10) {
        this.yaw   += dx * sensitivity;
        this.pitch -= dy * sensitivity;
        this.pitch  = Math.max(-89, Math.min(89, this.pitch));
        this.yaw    = ((this.yaw % 360) + 360) % 360;
    }

    // ── 메인 업데이트 ───────────────────────────────────────────────
    update(dt, keys, front, right, mapData, network) {
        if (dt > 0.1) dt = 0.1;

        // A. 중력
        this.vel[1] += this.gravity * dt;

        // B. 재장전 타이머 (main.js 에는 재장전 중복 코드 없어야 함)
        if (this.isReloading) {
            this.reloadTimer--;
            if (this.reloadTimer <= 0) {
                this.ammo        = this.maxAmmo;
                this.isReloading = false;
                this.updateHUD();
            }
        }

        // C. 이동 입력
        let moveX = 0, moveZ = 0;
        if (keys['w'] || keys['W']) { moveX += front[0]; moveZ += front[2]; }
        if (keys['s'] || keys['S']) { moveX -= front[0]; moveZ -= front[2]; }
        if (keys['a'] || keys['A']) { moveX -= right[0]; moveZ -= right[2]; }
        if (keys['d'] || keys['D']) { moveX += right[0]; moveZ += right[2]; }

        const mag = Math.sqrt(moveX * moveX + moveZ * moveZ);
        if (mag > 0) {
            moveX = (moveX / mag) * this.speed * dt;
            moveZ = (moveZ / mag) * this.speed * dt;
        }

        // D. 카메라 Bobbing 업데이트
        const isMoving = mag > 0;
        this.bobAmp = isMoving
            ? Math.min(1.0, this.bobAmp + dt * 8)
            : Math.max(0.0, this.bobAmp - dt * 8);
        if (isMoving && this.onGround) this.moveTime += dt;

        // E. 점프
        if ((keys[' '] || keys['Spacebar']) && this.onGround) {
            this.vel[1]   = this.jumpForce;
            this.onGround = false;
        }

        // F. 수평 Sliding Collision
        const nx = this.pos[0] + moveX;
        if (!this.checkCollision(nx, this.pos[1], this.pos[2], mapData))
            this.pos[0] = nx;

        const nz = this.pos[2] + moveZ;
        if (!this.checkCollision(this.pos[0], this.pos[1], nz, mapData))
            this.pos[2] = nz;

        // G. 수직 이동 + 바닥 판정
        this.pos[1] += this.vel[1];
        if (this.pos[1] < 1.0) {
            this.pos[1]   = 1.0;
            this.vel[1]   = 0;
            this.onGround = true;
        } else if (this.checkCollision(this.pos[0], this.pos[1], this.pos[2], mapData)) {
            this.pos[1]  -= this.vel[1];
            this.vel[1]   = 0;
            this.onGround = true;
        } else {
            this.onGround = false;
        }

        // Camera 별칭 동기화
        this.isGrounded = this.onGround;

        // H. 네트워크 전송
        if (network) {
            this._netSendTimer++;
            const yawChanged = this._lastSentYaw === null ||
                               Math.abs(this.yaw - this._lastSentYaw) > 1.0;
            if (this._netSendTimer >= this._netSendInterval &&
                (isMoving || yawChanged)) {
                this._netSendTimer = 0;
                this._lastSentYaw  = this.yaw;
                network.sendData({
                    pos:    [...this.pos],
                    yaw:    this.yaw,
                    health: this.health
                });
            }
        }

        this.updateHUD();
    }

    // ── AABB 충돌 판정 ─────────────────────────────────────────────
    checkCollision(x, y, z, mapData) {
        if (!mapData) return false;
        for (const box of mapData) {
            const minX = box.pos[0] - box.scale[0], maxX = box.pos[0] + box.scale[0];
            const minY = box.pos[1] - box.scale[1], maxY = box.pos[1] + box.scale[1];
            const minZ = box.pos[2] - box.scale[2], maxZ = box.pos[2] + box.scale[2];
            if (x + this.radius > minX && x - this.radius < maxX &&
                y + 0.1         > minY && y - this.height  < maxY &&
                z + this.radius > minZ && z - this.radius  < maxZ) return true;
        }
        return false;
    }

    // ── 사망/리스폰 ───────────────────────────────────────────────
    checkDeathAndRespawn(network) {
        if (this.health <= 0) {
            this.health = 100;
            this.pos    = [0, 2, 5];
            this.vel    = [0, 0, 0];
            this.ammo   = 30;
            if (network) network.sendData({
                pos: [...this.pos], yaw: this.yaw,
                health: this.health, action: 'respawn'
            });
            this.updateHUD();
        }
    }

    // ── HUD ───────────────────────────────────────────────────────
    updateHUD() {
        const hp   = document.getElementById('hp');
        const ammo = document.getElementById('ammo');
        if (hp)   hp.innerText   = Math.floor(this.health);
        if (ammo) ammo.innerText = this.ammo;
    }
}
