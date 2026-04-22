// main.js 맨 위에 추가
window.onerror = function(msg, url, line) {
    alert("에러 발생: " + msg + "\n위치: " + url + ":" + line);
    return false;
};

import { Player } from './player.js';
import { Camera } from './camera.js';
import { Renderer } from './renderer.js';
import { NetworkClient } from './network.js';

// ★ Firebase 설정
const firebaseConfig = {
    apiKey: "AIzaSyAS4bTPT7sNfVs_EblSJEOYlbwXWMd9iPc",
    authDomain: "multiplatformer-1acb3.firebaseapp.com",
    databaseURL: "https://multiplatformer-1acb3-default-rtdb.asia-southeast1.firebasedatabase.app", 
    projectId: "multiplatformer-1acb3",
    storageBucket: "multiplatformer-1acb3.firebasedatabase.app",
    messagingSenderId: "271218714227",
    appId: "1:271218714227:web:f20fbfd74cb303c7b76c06"
};

class Game {
    constructor() {
        // 1. 캔버스 초기화
        this.canvas = document.getElementById('gameCanvas');
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;

        // 2. 게임 객체 생성
        this.player = new Player();
        this.camera = new Camera();
        this.renderer = new Renderer(this.canvas);
        
        // Firebase 네트워크 클라이언트 생성
        this.network = new NetworkClient(firebaseConfig); 

        // 3. 상태 변수
        this.keys = {}; 
        this.lastTime = performance.now();
        
        // 4. 이벤트 및 루프 시작
        this.initEvents();
        this.loop = this.loop.bind(this);
        requestAnimationFrame(this.loop);
    }

    initEvents() {
        window.addEventListener('resize', () => {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
            this.renderer.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        });

        this.canvas.addEventListener('click', () => {
            this.canvas.requestPointerLock();
        });

        document.addEventListener('mousemove', (e) => {
            if (document.pointerLockElement === this.canvas) {
                this.player.yaw += e.movementX * 0.1;
                this.player.pitch -= e.movementY * 0.1;
                this.player.pitch = Math.max(-89.0, Math.min(89.0, this.player.pitch));
            }
        });

        document.addEventListener('keydown', (e) => {
            this.keys[e.key] = true;
            if ((e.key === 'r' || e.key === 'R') && this.player.ammo < this.player.maxAmmo && !this.player.isReloading) {
                this.player.isReloading = true;
                this.player.reloadTimer = this.player.reloadDuration;
            }
        });

        document.addEventListener('keyup', (e) => {
            this.keys[e.key] = false;
        });
    }

    loop(timestamp) {
        // loop 안에 추가
        if (this.network.remotePlayers && Object.keys(this.network.remotePlayers).length > 0) {
            // 다른 플레이어가 감지되면 딱 한 번만 알림
            if(!window.alerted) {
                alert("다른 플레이어 발견!: " + Object.keys(this.network.remotePlayers).length + "명");
                window.alerted = true;
            }
        }
        const dt = (timestamp - this.lastTime) / 1000.0;
        this.lastTime = timestamp;

        // 1. 재장전 연산
        if (this.player.isReloading) {
            this.player.reloadTimer -= 1.0; 
            if (this.player.reloadTimer <= 0) {
                this.player.isReloading = false;
                this.player.ammo = this.player.maxAmmo;
                this.player.updateHUD();
            }
        }

        // 2. 사망 연산 및 서버 통신
        this.player.checkDeathAndRespawn(this.network);

        // 3. 카메라 데이터 계산
        const camData = this.camera.updateAndGetMatrices(this.player, this.canvas.width, this.canvas.height);

        // 4. 플레이어 이동 및 물리 업데이트
        const radYaw = this.player.yaw * (Math.PI / 180);
        const rightVec = [-Math.sin(radYaw), 0.0, Math.cos(radYaw)];
        this.player.update(dt, this.keys, camData.front, rightVec);

        // Firebase 서버로 내 위치 정보 전송
        if (Math.floor(timestamp) % 3 === 0) {
            this.network.sendData({
                pos: this.player.pos,
                yaw: this.player.yaw,
                health: this.player.health
            });
        }

        // 5. 렌더링 실행
        this.renderer.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        
        // 💡 중요: 여기서 세 번째 인자로 this.network.remotePlayers를 꼭 넘겨줘야 함!
        this.renderer.drawWorld(this.player, camData, this.network.remotePlayers);
        
        if (this.camera.isFirstPerson && typeof this.renderer.drawFirstPersonWeapon === 'function') {
            this.renderer.drawFirstPersonWeapon(this.player, this.canvas.width, this.canvas.height);
        }

        requestAnimationFrame(this.loop);
    }
} 

window.onload = () => {
    new Game();
};
