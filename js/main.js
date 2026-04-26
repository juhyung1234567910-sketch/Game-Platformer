/*
  물리 기반 맵 설계 수치 (60fps 기준):
    jumpForce = 0.2,  gravity = -0.5 * dt
    → 최대 점프 상승: +2.3 units
    → 체공 시간: ~0.8s
    → 체공 중 최대 수평 이동: speed(7) × 0.8 = 5.6 units

  올라갈 수 있는 플랫폼 윗면 최대 y: 1.0 + 2.3 − 0.1 = 3.2
  안전 점프 gap: ≤ 4.0 units
  도전 점프 gap: 4.5 ~ 5.0 units
  불가능 gap:   ≥ 5.6 units
*/

window.onerror = function(msg, url, line) {
    console.error("에러: " + msg + " @ " + url + ":" + line);
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
        this.canvas        = document.getElementById('gameCanvas');
        this.canvas.width  = window.innerWidth;
        this.canvas.height = window.innerHeight;

        this.player   = new Player();
        this.camera   = new Camera();
        this.renderer = new Renderer(this.canvas);
        this.network  = new NetworkClient(firebaseConfig);

        this.keys     = {};
        this.lastTime = performance.now();

        // ─────────────────────────────────────────────────────────
        // 맵 데이터 — 물리값 기반 설계
        //
        //  tag 값:
        //    'wall'      → 이동 차단 수직 벽
        //    'platform'  → 올라설 수 있는 플랫폼 (윗면 y ≤ 3.2)
        //    'ramp'      → 경사로처럼 쓰는 얕은 단차
        //    없음(기본)  → 일반 박스
        //
        //  스폰: [0, 2, 5] — 중앙 남쪽
        // ─────────────────────────────────────────────────────────
        this.mapData = [

            // ── 외곽 경계 벽 (맵 밖으로 나가지 못하도록) ─────────
            // 북벽  z=-28, 동벽 x=28, 서벽 x=-28, 남벽 z=28
            { pos:[  0, 3,-28], scale:[28,3,0.5], tag:'wall' },
            { pos:[  0, 3, 28], scale:[28,3,0.5], tag:'wall' },
            { pos:[ 28, 3,  0], scale:[0.5,3,28], tag:'wall' },
            { pos:[-28, 3,  0], scale:[0.5,3,28], tag:'wall' },

            // ── 중앙 구조물 ───────────────────────────────────────
            // 중앙 낮은 단상 (올라갈 수 있음: 윗면 y=1.5)
            { pos:[0, 0.75, 0], scale:[4,0.75,4] },

            // 중앙 단상 위 작은 박스 (엄폐물)
            { pos:[ 2, 1.75, 0], scale:[0.6,0.5,0.6], tag:'wall' },
            { pos:[-2, 1.75, 0], scale:[0.6,0.5,0.6], tag:'wall' },

            // ── 북쪽 계단식 플랫폼 ───────────────────────────────
            // 1단: 윗면 y=2.0 → 점프로 올라갈 수 있음
            { pos:[0, 1.0,-8],  scale:[3,1.0,3], tag:'platform' },
            // 2단: 윗면 y=3.0 → 1단 위에서 점프해야 도달 (2.0→3.0: +1.0, 가능)
            { pos:[0, 1.5,-14], scale:[2.5,1.5,2.5], tag:'platform' },
            // 3단: 윗면 y=3.0 → 측면 이동 플랫폼
            { pos:[6, 1.5,-14], scale:[2,1.5,2], tag:'platform' },

            // ── 동쪽 높은 벽·엄폐물 ─────────────────────────────
            // 낮은 엄폐벽 (윗면 y=2.4 → 못 올라감, 엄폐 전용)
            { pos:[12, 1.2, 0],  scale:[0.5,1.2,6], tag:'wall' },
            // 플랫폼 (윗면 y=2.0)
            { pos:[18, 1.0,-6],  scale:[3,1.0,3], tag:'platform' },
            // 높은 탑 (엄폐물, 못 올라감)
            { pos:[22, 2.5, 6],  scale:[2,2.5,2], tag:'wall' },

            // ── 서쪽 구조물 ──────────────────────────────────────
            // 낮은 플랫폼 (윗면 y=1.5)
            { pos:[-10, 0.75,-5], scale:[3,0.75,3], tag:'platform' },
            // 중간 플랫폼 (윗면 y=2.5) — 낮은 플랫폼에서 점프
            { pos:[-16, 1.25,-5], scale:[2.5,1.25,2.5], tag:'platform' },
            // 서쪽 엄폐벽
            { pos:[-12, 1.5, 8],  scale:[0.5,1.5,5], tag:'wall' },

            // ── 남쪽 장애물 코스 ─────────────────────────────────
            // 디딤돌 A (윗면 y=2.0, gap=4 → 안전 점프)
            { pos:[-4, 1.0, 14], scale:[2,1.0,2], tag:'platform' },
            // 디딤돌 B (윗면 y=2.0, gap=4)
            { pos:[ 4, 1.0, 14], scale:[2,1.0,2], tag:'platform' },
            // 디딤돌 C — 높이 다름 (윗면 y=3.0, 디딤돌A에서 점프)
            { pos:[0, 1.5, 20],  scale:[2,1.5,2], tag:'platform' },

            // ── 중앙-북 연결 경사 단차 (낮은 단) ─────────────────
            { pos:[0, 0.4,-4],   scale:[2,0.4,1.5], tag:'ramp' },

            // ── 산발적 엄폐 박스들 ───────────────────────────────
            { pos:[ 6, 0.6, 6],  scale:[1.2,0.6,1.2] },
            { pos:[-6, 0.6, 6],  scale:[1.2,0.6,1.2] },
            { pos:[ 6, 0.6,-4],  scale:[1.2,0.6,1.2] },
            { pos:[-6, 0.6,-4],  scale:[1.2,0.6,1.2] },
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

        this.canvas.addEventListener('click', () => this.canvas.requestPointerLock());

        document.addEventListener('mousemove', (e) => {
            if (document.pointerLockElement === this.canvas)
                this.player.rotate(e.movementX, e.movementY, 0.10);
        });

        document.addEventListener('keydown', (e) => {
            this.keys[e.key] = true;
            if (e.key === 'r' || e.key === 'R') this.player.startReload();
        });

        document.addEventListener('keyup', (e) => { this.keys[e.key] = false; });
    }

    loop(timestamp) {
        const dt = Math.min((timestamp - this.lastTime) / 1000.0, 0.1);
        this.lastTime = timestamp;

        if (!this._joinLogged &&
            this.network.remotePlayers &&
            Object.keys(this.network.remotePlayers).length > 0) {
            console.log("다른 플레이어:", Object.keys(this.network.remotePlayers).length, "명");
            this._joinLogged = true;
        }

        this.player.checkDeathAndRespawn(this.network);

        const camData = this.camera.updateAndGetMatrices(
            this.player, this.canvas.width, this.canvas.height
        );

        this.player.update(
            dt, this.keys, camData.front, camData.right, this.mapData, this.network
        );

        this.renderer.drawWorld(
            this.player, camData, this.network.remotePlayers, this.mapData
        );

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
