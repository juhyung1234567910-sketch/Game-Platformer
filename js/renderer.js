// renderer.js - Three.js 씬, 쉐이더, 그림자, 렌더링 담당

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.module.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.width = window.innerWidth;
    this.height = window.innerHeight;

    // WebGL Renderer
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.setClearColor(0x6699cc);

    // Scene
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x6699cc, 80, 280);

    // Camera (FOV 60도, Python 코드와 동일)
    this.camera = new THREE.PerspectiveCamera(60, this.width / this.height, 0.05, 400);
    this.camera.position.set(0, 2.7, 5);

    // Lighting
    this._setupLights();
    this._buildWorld();
    this._buildParticlePool();

    // Weapon 씬 (1인칭 무기는 별도 카메라로 렌더링)
    this.weaponScene = new THREE.Scene();
    this.weaponCamera = new THREE.PerspectiveCamera(50, this.width / this.height, 0.001, 50);

    window.addEventListener('resize', () => this._onResize());
  }

  _setupLights() {
    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    this.scene.add(ambient);

    this.sunLight = new THREE.DirectionalLight(0xfff0d0, 1.6);
    this.sunLight.position.set(-20, 60, -20);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.near = 1;
    this.sunLight.shadow.camera.far = 200;
    const s = 80;
    this.sunLight.shadow.camera.left   = -s;
    this.sunLight.shadow.camera.right  =  s;
    this.sunLight.shadow.camera.top    =  s;
    this.sunLight.shadow.camera.bottom = -s;
    this.sunLight.shadow.bias = -0.0005;
    this.scene.add(this.sunLight);
  }

  // Python boxes 배열을 그대로 재현
  _buildWorld() {
    this.boxMeshes = [];
    const makeTex = (c1, c2, pattern = 'checker') => {
      const size = 64;
      const data = new Uint8Array(size * size * 3);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          let on;
          if (pattern === 'checker') on = ((Math.floor(x / 8) + Math.floor(y / 8)) % 2 === 0);
          else if (pattern === 'stripe') on = (x % 16 < 8);
          else on = Math.random() > 0.5;
          const col = on ? c1 : c2;
          const i = (y * size + x) * 3;
          data[i]=col[0]; data[i+1]=col[1]; data[i+2]=col[2];
        }
      }
      const tex = new THREE.DataTexture(data, size, size, THREE.RGBFormat);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.needsUpdate = true;
      return tex;
    };

    const texChecker = makeTex([255,255,255],[150,150,150],'checker');
    const texStripe  = makeTex([255,200,100],[200,100,50],'stripe');
    const texNoise   = makeTex([100,200,100],[50,100,50],'noise');
    const texSolid   = makeTex([200,200,200],[200,200,200],'checker');

    const texMap = { checker: texChecker, stripe: texStripe, noise: texNoise, solid: texSolid };

    // [x, y, z, sx, sy, sz, color_hex, tex_name]
    const boxes = [
      [0,-30,80, 400,1,400,     0x0d0d15,'checker'],
      [0,0,0,    15,1,15,       0xccccda,'checker'],
      [-14,1.5,-14,0.5,1,0.5,  0xb39933,'stripe'],
      [14,1.5,-14, 0.5,1,0.5,  0xb39933,'stripe'],
      [-14,1.5,14, 0.5,1,0.5,  0xb39933,'stripe'],
      [14,1.5,14,  0.5,1,0.5,  0xb39933,'stripe'],
      [0,1,12,   4,0.5,4,      0x7fa0b3,'solid'],
      [0,2,15,   4,0.5,4,      0x7fa0b3,'solid'],
      [0,3,18,   4,0.5,4,      0x7fa0b3,'solid'],
      [0,4,21,   4,0.5,4,      0x7fa0b3,'solid'],
      [0,5,35,   15,1,15,      0x4d5966,'checker'],
      [-6,6.5,37,2,1,2,        0x666666,'stripe'],
      [8,6.8,40, 1.5,1.3,1.5,  0x666666,'stripe'],
      [-4,6.2,45,3,0.7,1.5,    0x666666,'stripe'],
      [5,6.5,47, 1,1,3,        0x666666,'stripe'],
      [-13,8,42, 1,3,1,        0x333333,'solid'],
      [-13,11.5,42,1.5,0.5,1.5,0xccb833,'solid'],
      [13,8,42,  1,3,1,        0x333333,'solid'],
      [13,11.5,42,1.5,0.5,1.5, 0xccb833,'solid'],
      [0,6,54,   3,0.2,3,      0xe69a1a,'solid'],
      [-4,7,60,  3,0.2,3,      0xe69a1a,'solid'],
      [-8,8,66,  3,0.2,3,      0xe69a1a,'solid'],
      [-4,9,72,  3,0.2,3,      0xe69a1a,'solid'],
      [0,10,78,  3,0.2,3,      0xe69a1a,'solid'],
      [4,11,84,  3,0.2,3,      0xe69a1a,'solid'],
      [0,12,90,  3,0.2,3,      0xe69a1a,'solid'],
      [0,13,99,  10,0.5,10,    0xccd9e6,'checker'],
      [-8,14.5,99,1,1.5,1,     0x999999,'solid'],
      [8,14.5,99, 1,1.5,1,     0x999999,'solid'],
      [0,16.5,99, 9,0.5,1,     0x999999,'solid'],
      [0,15,99,   2,2,2,       0xffcc33,'noise'],
      [0,14,109,  4,0.5,4,     0x80b3e6,'solid'],
      [0,15,115,  3,0.5,3,     0x80b3e6,'solid'],
      [0,16,121,  3,0.5,3,     0x80b3e6,'solid'],
      [-5,17,124, 3,0.2,3,     0xe63333,'solid'],
      [-11,18,126,3,0.2,3,     0xe63333,'solid'],
      [-14,19,128,3,0.2,3,     0xe63333,'solid'],
      [-11,20,130,3,0.2,3,     0xe63333,'solid'],
      [-5,21,132, 3,0.2,3,     0xe63333,'solid'],
      [0,22,136,  3,0.2,3,     0xe63333,'solid'],
      [0,23,162,  25,1,25,     0xf2f2ff,'checker'],
      [-15,27.5,152,2,10,2,    0xccccdd,'stripe'],
      [15,27.5,152, 2,10,2,    0xccccdd,'stripe'],
      [0,32,152,   32,1,4,     0xccccdd,'solid'],
      [0,25,152,   3,4,3,      0x9933dd,'noise'],
      [0,29,152,   1.5,1.5,1.5,0xe6ccff,'noise'],
    ];

    boxes.forEach(([x,y,z, sx,sy,sz, hex, texName]) => {
      const geo = new THREE.BoxGeometry(sx*2, sy*2, sz*2);
      const mat = new THREE.MeshLambertMaterial({ color: hex, map: texMap[texName] });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.boxMeshes.push({ mesh, pos: [x,y,z], size: [sx,sy,sz] });
    });
  }

  _buildParticlePool() {
    this.particles = [];
  }

  spawnSmokeParticle(position) {
    const geo = new THREE.BoxGeometry(0.05, 0.05, 0.05);
    const mat = new THREE.MeshBasicMaterial({ color: 0xaaaaaa, transparent: true, opacity: 0.6 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(position);
    this.scene.add(mesh);
    this.particles.push({
      mesh,
      life: 1.0,
      maxLife: 1.0,
      baseSize: 0.05,
      vel: new THREE.Vector3(
        (Math.random()-0.5)*0.04,
        Math.random()*0.02+0.01,
        (Math.random()-0.5)*0.04
      )
    });
  }

  updateParticles(dt) {
    this.particles = this.particles.filter(p => {
      p.life -= dt * 1.2;
      if (p.life <= 0) { this.scene.remove(p.mesh); return false; }
      p.vel.y += 0.0005;
      p.vel.multiplyScalar(0.93);
      p.mesh.position.add(p.vel);
      const s = p.baseSize * (1 + (1-p.life)*4);
      p.mesh.scale.setScalar(s / p.baseSize);
      p.mesh.material.opacity = p.life > 0.2 ? p.life*0.6 : (p.life/0.2)*0.6;
      return true;
    });
  }

  // 다른 플레이어 캡슐 메시 관리
  createOrUpdateRemotePlayer(pid, info, playerMeshMap) {
    if (!playerMeshMap[pid]) {
      const group = new THREE.Group();
      // 몸통
      const bodyGeo = new THREE.BoxGeometry(0.8, 1.2, 0.5);
      const bodyMat = new THREE.MeshLambertMaterial({ color: 0x4466cc });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.y = 1.0;
      group.add(body);
      // 머리
      const headGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
      const headMat = new THREE.MeshLambertMaterial({ color: 0xffddbb });
      const head = new THREE.Mesh(headGeo, headMat);
      head.position.y = 1.95;
      group.add(head);
      this.scene.add(group);
      playerMeshMap[pid] = group;
    }
    const g = playerMeshMap[pid];
    g.position.set(info.pos[0], info.pos[1], info.pos[2]);
    g.rotation.y = -THREE.MathUtils.degToRad(info.yaw || 0) - Math.PI/2;
    return g;
  }

  removeRemotePlayer(pid, playerMeshMap) {
    if (playerMeshMap[pid]) {
      this.scene.remove(playerMeshMap[pid]);
      delete playerMeshMap[pid];
    }
  }

  render(camera) {
    this.renderer.autoClear = true;
    this.renderer.render(this.scene, camera);
    // 무기씬은 별도 렌더 (깊이 버퍼 클리어 후)
    this.renderer.autoClear = false;
    this.renderer.clearDepth();
    this.renderer.render(this.weaponScene, this.weaponCamera);
  }

  _onResize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.weaponCamera.aspect = this.width / this.height;
    this.weaponCamera.updateProjectionMatrix();
    this.renderer.setSize(this.width, this.height);
  }

  // 충돌 박스 목록 반환 (player.js에서 사용)
  getBoxes() {
    return this.boxMeshes;
  }
}
