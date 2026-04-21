export class Player {
    constructor() {
        this.maxHealth = 100;
        this.health = this.maxHealth;
        this.maxAmmo = 30;
        this.ammo = this.maxAmmo;
        this.pos = [0.0, 1.0, 5.0];
        
        this.yaw = 0.0;
        this.pitch = 0.0;
        this.moveTime = 0.0;
        this.bobAmp = 0.0;
        this.isAiming = false;
        this.isSliding = false;
        this.isReloading = false;
        this.reloadTimer = 0;
        this.reloadDuration = 60.0;
        
        this.swayX = 0.0;
        this.swayY = 0.0;
        this.targetSwayX = 0.0;
        this.targetSwayY = 0.0;
        this.recoilOffset = 0.0;
        this.adsProgress = 0.0;
    }

    updateHUD() {
        document.getElementById('hp').innerText = this.health;
        document.getElementById('ammo').innerText = this.ammo;
    }

    checkDeathAndRespawn(networkClient) {
        if (this.health <= 0 || this.pos[1] <= -20.0) {
            console.log(`[💀] 사망! (현재 HP: ${this.health})`);
            
            this.health = this.maxHealth;
            this.ammo = this.maxAmmo;
            this.pos = [0.0, 1.0, 5.0]; 
            this.updateHUD();

            if (networkClient) {
                networkClient.sendData({
                    type: "update",
                    pos: this.pos,
                    health_reset: true
                });
            }
        }
    }
}
