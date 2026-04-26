export class Camera {
    constructor() {
        this.distance      = 0.0;
        this.maxDistance   = 10.0;
        this.isFirstPerson = true;
        this.slideDropCamera = 0.0;

        this.fov  = 75.0;
        this.near = 0.1;
        this.far  = 1000.0;
    }

    updateAndGetMatrices(player, canvasWidth, canvasHeight) {
        const headHeight = 1.7;

        // 슬라이딩 시 카메라 높이 부드럽게 낮추기
        // player.isSliding 은 Player.js 에 항상 존재 (false 기본값)
        const targetDrop = player.isSliding ? -0.6 : 0.0;
        this.slideDropCamera += (targetDrop - this.slideDropCamera) * 0.2;

        // 머리 위치
        let headPos = [...player.pos];
        headPos[1] += headHeight + this.slideDropCamera;

        // 카메라 bobbing
        // player.moveTime, player.bobAmp, player.isGrounded 는
        // Player.js 에 모두 선언돼 있으므로 undefined 없음
        const viewBobOffset = Math.sin(player.moveTime * 7.0) * 0.06 * player.bobAmp;
        if (player.isGrounded && !player.isSliding) {
            headPos[1] += viewBobOffset;
        }

        // 시선 벡터 계산
        const radYaw   = player.yaw   * (Math.PI / 180);
        const radPitch = player.pitch * (Math.PI / 180);

        const front = [
            Math.cos(radYaw) * Math.cos(radPitch),
            Math.sin(radPitch),
            Math.sin(radYaw) * Math.cos(radPitch)
        ];
        const right = [-Math.sin(radYaw), 0.0, Math.cos(radYaw)];
        const up    = [0.0, 1.0, 0.0];

        // 1인칭 / 3인칭 카메라 위치
        let cameraPos = [...headPos];
        let targetPos = [
            headPos[0] + front[0],
            headPos[1] + front[1],
            headPos[2] + front[2]
        ];

        if (!this.isFirstPerson) {
            const t = Math.max(0.0, Math.min(1.0, (this.distance - 0.5) / 2.0));
            cameraPos = [
                headPos[0] - front[0] * this.distance - right[0] * 0.8 * t,
                headPos[1] - front[1] * this.distance - right[1] * 0.8 * t + 0.3 * t,
                headPos[2] - front[2] * this.distance - right[2] * 0.8 * t
            ];
            targetPos = [
                headPos[0] + front[0] * 100.0,
                headPos[1] + front[1] * 100.0,
                headPos[2] + front[2] * 100.0
            ];
        }

        const aspect         = canvasWidth / canvasHeight;
        const viewMatrix     = this.createLookAt(cameraPos, targetPos, up);
        const projectionMatrix = this.createPerspective(this.fov, aspect, this.near, this.far);

        return { front, right, cameraPos, viewMatrix, projectionMatrix };
    }

    // ── 벡터 수학 ──────────────────────────────────────────────────
    subtractVectors(a, b) { return [a[0]-b[0], a[1]-b[1], a[2]-b[2]]; }

    normalize(v) {
        const l = Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]);
        return l > 0.00001 ? [v[0]/l, v[1]/l, v[2]/l] : [0, 0, 0];
    }

    cross(a, b) {
        return [
            a[1]*b[2] - a[2]*b[1],
            a[2]*b[0] - a[0]*b[2],
            a[0]*b[1] - a[1]*b[0]
        ];
    }

    createLookAt(eye, center, up) {
        const z = this.normalize(this.subtractVectors(eye, center));
        const x = this.normalize(this.cross(up, z));
        const y = this.normalize(this.cross(z, x));
        return new Float32Array([
            x[0], y[0], z[0], 0,
            x[1], y[1], z[1], 0,
            x[2], y[2], z[2], 0,
            -(x[0]*eye[0] + x[1]*eye[1] + x[2]*eye[2]),
            -(y[0]*eye[0] + y[1]*eye[1] + y[2]*eye[2]),
            -(z[0]*eye[0] + z[1]*eye[1] + z[2]*eye[2]),
            1
        ]);
    }

    createPerspective(fov, aspect, near, far) {
        const f = Math.tan(Math.PI * 0.5 - 0.5 * (fov * Math.PI / 180));
        const ri = 1.0 / (near - far);
        return new Float32Array([
            f / aspect, 0,  0,                        0,
            0,          f,  0,                        0,
            0,          0,  (near + far) * ri,       -1,
            0,          0,  near * far * ri * 2,      0
        ]);
    }
}
