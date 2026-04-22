export class Player {
    constructor() {
        this.pos = [0, 2, 5]; // 시작 위치
        this.yaw = 0;
        this.pitch = 0;
        this.health = 100;
        this.ammo = 30;
        this.maxAmmo = 30;
        this.isReloading = false;
        this.reloadTimer = 0;
        this.reloadDuration = 100; // 재장전 시간 (프레임 단위)
    }

    update(dt, keys, front, right) {
        const speed = 5.0 * dt;
        if (keys['w'] || keys['W']) {
            this.pos[0] += front[0] * speed;
            this.pos[2] += front[2] * speed;
        }
        if (keys['s'] || keys['S']) {
            this.pos[0] -= front[0] * speed;
            this.pos[2] -= front[2] * speed;
        }
        if (keys['a'] || keys['A']) {
            this.pos[0] -= right[0] * speed;
            this.pos[2] -= right[2] * speed;
        }
        if (keys['d'] || keys['D']) {
            this.pos[0] += right[0] * speed;
            this.pos[2] += right[2] * speed;
        }
    }

    // 💡 아까 에러 났던 바로 그 함수입니다!
    checkDeathAndRespawn(network) {
        if (this.health <= 0) {
            alert("전사하셨습니다! 리스폰합니다.");
            this.health = 100;
            this.pos = [0, 2, 5]; // 시작 지점으로 강제 이동
            this.updateHUD();
            
            // 서버(Firebase)에도 죽었다는 정보 갱신
            if (network) {
                network.sendData({
                    pos: this.pos,
                    yaw: this.yaw,
                    health: this.health
                });
            }
        }
    }

    updateHUD() {
        const hpElement = document.getElementById('hp');
        const ammoElement = document.getElementById('ammo');
        if (hpElement) hpElement.innerText = Math.floor(this.health);
        if (ammoElement) ammoElement.innerText = this.ammo;
    }
}
