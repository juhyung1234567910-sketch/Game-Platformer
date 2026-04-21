import { Player } from './player.js';
import { Camera } from './camera.js';
import { Renderer } from './renderer.js';
import { NetworkClient } from './network.js';

// ★ 여기에 Firebase 설정이 들어가야 합니다!
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

        // 2. 게임 객체 생성
        this.player = new Player();
        this.camera = new Camera();
        this.renderer = new Renderer(this.canvas);
        
        // ★ 127.0.0.1 대신 firebaseConfig를 넣어줍니다!
        this.network = new NetworkClient(firebaseConfig); 

        // 3. 상태 변수
        this.keys = {}; // 눌린 키보드 상태를 저장하는 딕셔너리
        this.lastTime = performance.now();
        
        // 4. 이벤트 및 루프 시작
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

        // 화면 클릭 시 마우스 잠금 (FPS 시점용)
        this.canvas.addEventListener('click', () => {
            this.canvas.requestPointerLock();
        });

        // 마우스 이동 시 시점 회전
        document.addEventListener('mousemove', (e) => {
            if (document.pointerLockElement === this.canvas) {
                this.player.yaw += e.movementX * 0.1;
                this.player.pitch -= e.movementY * 0.1;
                this.player.pitch = Math.max(-89.0, Math.min(89.0, this.player.pitch));
            }
        });

        // 💡 키가 눌렸을 때 상태 저장 (WASD 동시 입력 처리용)
        document.addEventListener('keydown', (e) => {
            this.keys[e.key] = true;

            // R키 재장전 (단발성 이벤트)
            if ((e.key === 'r' || e.key === 'R') && this.player.ammo < this.player.maxAmmo && !this.player.isReloading) {
                this.player.isReloading = true;
                this.player.reloadTimer = this.player.reloadDuration;
            }
        });

        // 💡 키를 뗐을 때 상태 해제
        document.addEventListener('keyup', (e) => {
            this.keys[e.key] = false;
        });
    }

    loop(timestamp) {
        // 델타 타임(초 단위) 계산
        const dt = (timestamp - this.lastTime) / 1000.0;
        this.lastTime = timestamp;

        // 1. 재장전 연산
        if (this.player.isReloading) {
            this.player.reloadTimer -= 1.0; // 프레임 단위로 감소 (필요시 dt 기반으로 수정 가능)
            if (this.player.reloadTimer <= 0) {
                this.player.isReloading = false;
                this.player.ammo = this.player.maxAmmo;
                this.player.updateHUD();
            }
        }

        // 2. 사망 연산 및 서버 통신
        this.player.checkDeathAndRespawn(this.network);

        // 3. 카메라 데이터(행렬 등) 계산
        const camData = this.camera.updateAndGetMatrices(this.player, this.canvas.width, this.canvas.height);

        // 4. 플레이어 이동 및 물리 업데이트
        const radYaw = this.player.yaw * (Math.PI / 180);
        const rightVec = [-Math.sin(radYaw), 0.0, Math.cos(radYaw)];
        this.player.update(dt, this.keys, camData.front, rightVec);

        // ★ Firebase 서버로 내 위치 정보 전송 (너무 많이 보내면 튕기므로 적당히 조절)
        if (Math.floor(timestamp) % 3 === 0) {
            this.network.sendData({
                pos: this.player.pos,
                yaw: this.player.yaw,
                health: this.player.health
            });
        }

        // 5. 렌더링 실행
        this.renderer.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        this.renderer.drawWorld(this.player, camData);
        
        // (향후 1인칭 무기 렌더링이 추가되면 사용할 부분)
        if (this.camera.isFirstPerson && typeof this.renderer.drawFirstPersonWeapon === 'function') {
            this.renderer.drawFirstPersonWeapon(this.player, this.canvas.width, this.canvas.height);
        }

        // 무한 루프
        requestAnimationFrame(this.loop);
    }
} // <--- 아까 빠져있던 클래스 닫는 중괄호입니다!

// 브라우저 렌더링이 끝나면 게임 시작
window.onload = () => {
    new Game();
};
