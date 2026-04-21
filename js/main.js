import { Player } from './player.js';
import { Camera } from './camera.js';
import { Renderer } from './renderer.js';

class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;

        this.player = new Player();
        this.camera = new Camera();
        this.renderer = new Renderer(this.canvas);
        
        this.keys = {}; // 💡 현재 눌린 키보드 상태를 저장하는 딕셔너리
        this.lastTime = performance.now();
        
        this.initEvents();
        this.loop = this.loop.bind(this);
        requestAnimationFrame(this.loop);
    }

    initEvents() {
        // ... (마우스 클릭 잠금, 마우스 이동 시점 변경 로직 유지) ...

        // 💡 키가 눌렸을 때 상태 저장
        document.addEventListener('keydown', (e) => {
            this.keys[e.key] = true;
        });

        // 💡 키를 뗐을 때 상태 해제
        document.addEventListener('keyup', (e) => {
            this.keys[e.key] = false;
        });
    }

    loop(timestamp) {
        const dt = (timestamp - this.lastTime) / 1000.0;
        this.lastTime = timestamp;

        // 1. 카메라 벡터(앞, 오른쪽)를 먼저 계산해서 플레이어에게 넘겨줍니다.
        const camData = this.camera.updateAndGetMatrices(this.player);
        
        // 오른쪽 벡터 계산 (Y축 회전 기준)
        const radYaw = this.player.yaw * (Math.PI / 180);
        const rightVec = [-Math.sin(radYaw), 0.0, Math.cos(radYaw)];

        // 2. 플레이어 이동 및 물리 업데이트 (키 입력 전달)
        this.player.update(dt, this.keys, camData.front, rightVec);

        // ... (이후 렌더링 로직 유지) ...
        requestAnimationFrame(this.loop);
    }
}

window.onload = () => new Game();
