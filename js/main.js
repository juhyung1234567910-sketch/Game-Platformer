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
    storageBucket: "multiplatformer-1acb3.firebasestorage.app",
    messagingSenderId: "271218714227",
    appId: "1:271218714227:web:f20fbfd74cb303c7b76c06"
};

class Game {
    constructor() {
        // 1. 캔버스 초기화
        this.canvas = document.getElementById('gameCanvas');
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;

        // 2. 게임 핵심 객체 생성
        this.player = new Player();
        this.camera = new Camera();
        this.renderer = new Renderer(this.canvas);
        this.network = new NetworkClient(firebaseConfig); 

        // 3. 게임 상태 변수
        this.keys = {}; 
        this.lastTime = performance.now();
        
        // 🗺️ 맵 데이터 정의 (위치[x,y,z], 크기[scaleX, scaleY, scaleZ])
        this.mapData = [
            { pos: [8, 1, 8],   scale: [1, 1, 1] },
            { pos: [-8, 1, 0],  scale: [2, 1, 2] },
            { pos: [0, 1, -15], scale: [15, 1, 1] }, // 긴 북쪽 벽
            { pos: [15, 2, 0],  scale: [1, 2, 10] }, // 높은 동쪽 벽
            { pos: [0, 0.5, 0], scale: [3, 0.5, 3] }  // 중앙 낮은 단상
        ];

        // 4. 이벤트 초기화 및 루프 시작
        this.initEvents();
        this.loop = this.loop.bind(this);
        requestAnimationFrame(this.loop);
    }

    initEvents() {
        // 창 크기 조절 대응
        window.addEventListener('resize', () => {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
            this.renderer.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        });

        // 클릭 시 마우스 가두기 (FPS 조작)
        this.canvas.addEventListener('click', () => {
            this.canvas.requestPointerLock();
        });

        // 마우스 이동 시 시야 회전
        document.addEventListener('mousemove', (e) => {
            if (document.pointerLockElement === this.canvas) {
                this.player.yaw += e.movementX * 0.1;
                this.player.pitch -= e.movementY * 0.1;
                this.player.pitch = Math.max(-89.0, Math.min(89.0, this.player.pitch));
            }
        });

        // 키보드 입력 처리
        document.addEventListener('keydown', (e) => {
            this.keys[e.key] = true;
            // R 키 누르면 재장전
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
        // 프레임 간 시간 계산 (델타 타임)
        const dt = (timestamp - this.lastTime) / 1000.0;
        this.lastTime = timestamp;

        // 📡 네트워크 디버깅 알림 (다른 플레이어 접속 시 1회 발생)
        if (this.network.remotePlayers && Object.keys(this.network.remotePlayers).length > 0) {
            if(!window.alerted) {
                alert("다른 플레이어 발견!: " + Object.keys(this.network.remotePlayers).length + "명");
                window.alerted = true;
            }
        }

        // 1. 재장전 타이머 처리
        if (this.player.isReloading) {
            this.player.reloadTimer -= 1.0; 
            if (this.player.reloadTimer <= 0) {
                this.player.isReloading = false;
                this.player.ammo = this.player.maxAmmo;
                this.player.updateHUD();
            }
        }

        // 2. 사망 및 리스폰 체크
        if (typeof this.player.checkDeathAndRespawn === 'function') {
            this.player.checkDeathAndRespawn(this.network);
        }

        // 3. 카메라 및 이동 벡터 계산
        const camData = this.camera.updateAndGetMatrices(this.player, this.canvas.width, this.canvas.height);
        const radYaw = this.player.yaw * (Math.PI / 180);
        const rightVec = [-Math.sin(radYaw), 0.0, Math.cos(radYaw)];

        // 4. 플레이어 물리 업데이트 (맵 데이터 전달하여 충돌 판정 실행)
        this.player.update(dt, this.keys, camData.front, rightVec, this.mapData);

        // 5. Firebase 서버로 위치 전송 (최적화를 위해 매 프레임이 아닌 3ms마다 전송)
        if (Math.floor(timestamp) % 3 === 0) {
            this.network.sendData({
                pos: this.player.pos,
                yaw: this.player.yaw,
                health: this.player.health
            });
        }

        // 6. 렌더링 실행
        this.renderer.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        this.renderer.drawWorld(this.player, camData, this.network.remotePlayers, this.mapData);
        
        // 7. 1인칭 무기 렌더링 (함수가 존재할 경우만)
        if (this.camera.isFirstPerson && typeof this.renderer.drawFirstPersonWeapon === 'function') {
            this.renderer.drawFirstPersonWeapon(this.player, this.canvas.width, this.canvas.height);
        }

        requestAnimationFrame(this.loop);
    }
} 

// 게임 시작
window.onload = () => {
    new Game();
};
