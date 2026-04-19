// 필요에 따라 다른 모듈들을 import 합니다.
// import { Player } from './player.js';
// import { Renderer } from './renderer.js';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('webgl'); // 또는 '2d'나 Three.js의 WebGLRenderer 사용

// 캔버스 크기 조정
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    // WebGL 뷰포트 업데이트 로직 추가
}
window.addEventListener('resize', resize);
resize();

// 마우스 잠금 (FPS 시점 제어용)
canvas.addEventListener('click', () => {
    canvas.requestPointerLock();
});

let lastTime = 0;

// 메인 게임 루프
function gameLoop(timestamp) {
    const deltaTime = (timestamp - lastTime) / 1000.0; // 초 단위 델타 타임
    lastTime = timestamp;

    // 1. 입력 처리 및 로직 업데이트
    // player.update(deltaTime);
    // camera.update(player);

    // 2. 화면 렌더링
    // renderer.render(scene, camera);

    // 다음 프레임 요청
    requestAnimationFrame(gameLoop);
}

// 루프 시작
requestAnimationFrame(gameLoop);
