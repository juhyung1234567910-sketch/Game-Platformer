window.onerror = function(msg, url, line) {
    console.error("에러 발생: " + msg + "\n위치: " + url + ":" + line);
    return false;
};

import { Player }        from './player.js';
import { Camera }        from './camera.js';
import { Renderer }      from './renderer.js';
import { NetworkClient } from './network.js';

const firebaseConfig = {
    apiKey:            "AIzaSyAS4bTPT7sNfVs_EblSJEOYlbwXWMd9iPc",
    authDomain:        "multiplatformer-1acb3.firebaseapp.com",
    databaseURL:       "https://multiplatformer-1acb3-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId:         "multiplatformer-1acb3",
    storageBucket:     "multiplatformer-1acb3.firebasestorage.app",
    messagingSenderId: "271218714227",
    appId:             "1:271218714227:web:f20fbfd74cb303c7b76c06"
};

class Game {
    constructor() {
        // 1. 캔버스
        this.canvas        = document.getElementById('gameCanvas');
        this.canvas.width  = window.innerWidth;
        this.canvas.height = window.innerHeight;

        // 2. 핵심 객체
        this.player   = new Player();
        this.camera   = new Camera();
        this.renderer = new Renderer(this.canvas);
        this.network  = new NetworkClient(firebaseConfig);

        // 3. 상태
        this.keys     = {};
        this.lastTime = performance.now();

        // 4. 맵 데이터
        this.mapData = [
            { pos: [8,   1,  8],  scale: [1,   1,  1]  },
            { pos: [-8,  1,  0],  scale: [2,   1,  2]  },
            { pos: [0,   1, -15], scale: [15,  1,  1]  },
            { pos: [15,  2,  0],  scale: [1,   2, 10]  },
            { pos: [0,   0.5, 0], scale: [3, 0.5,  3]  }
        ];

        this.initEvents();
        this.loop = this.loop.bind(this);
        requestAnimationFrame(this.loop);
    }

    initEvents() {
        window.addEventListener('resize', () => {
            this.canvas.width  = window.innerWidth;
            this.canvas.height = window.innerHeight;
        });

        this.canvas.addEventListener('click', () => {
            this.canvas.requestPointerLock();
        });

        document.addEventListener('mousemove', (e) => {
            if (document.pointerLockElement === this.canvas) {
                // Player.rotate() 로 통일 — yaw/pitch 관리 일원화
                this.player.rotate(e.movementX, e.movementY, 0.10);
            }
        });

        document.addEventListener('keydown', (e) => {
            this.keys[e.key] = true;
            // 재장전: startReload() 단일 진입점 사용 (Player 내부와 중복 없음)
            if (e.key === 'r' || e.key === 'R') {
                this.player.startReload();
            }
        });

        document.addEventListener('keyup', (e) => {
            this.keys[e.key] = false;
        });
    }

    loop(timestamp) {
        const dt = Math.min((timestamp - this.lastTime) / 1000.0, 0.1);
        this.lastTime = timestamp;

        // 다른 플레이어 접속 로그 (alert 제거 — 루프를 멈추는 버그 수정)
        if (!this._joinLogged &&
            this.network.remotePlayers &&
            Object.keys(this.network.remotePlayers).length > 0) {
            console.log("다른 플레이어 발견!:",
                Object.keys(this.network.remotePlayers).length, "명");
            this._joinLogged = true;
        }

        // 1. 사망/리스폰 체크
        this.player.checkDeathAndRespawn(this.network);

        // 2. 카메라·이동벡터 계산
        const camData = this.camera.updateAndGetMatrices(
            this.player, this.canvas.width, this.canvas.height
        );

        // 3. 플레이어 물리 업데이트
        //    - network 인자 전달 → Player 내부에서 주기적 동기화 전송
        //    - 재장전 타이머는 Player.update() 내부에서만 처리 (중복 제거)
        this.player.update(
            dt, this.keys, camData.front, camData.right, this.mapData, this.network
        );

        // 4. 렌더링
        this.renderer.drawWorld(
            this.player, camData, this.network.remotePlayers, this.mapData
        );

        // 5. 1인칭 무기 렌더링 (선택적)
        if (this.camera.isFirstPerson &&
            typeof this.renderer.drawFirstPersonWeapon === 'function') {
            this.renderer.drawFirstPersonWeapon(
                this.player, this.canvas.width, this.canvas.height
            );
        }

        requestAnimationFrame(this.loop);
    }
}

window.onload = () => { new Game(); };
