export class Camera {
    constructor() {
        this.distance = 0.0;
        this.maxDistance = 10.0;
        this.isFirstPerson = true;
        this.slideDropCamera = 0.0;
        
        // WebGL 투영(Projection) 설정값
        this.fov = 75.0; // 시야각
        this.near = 0.1; // 렌더링 최소 거리
        this.far = 1000.0; // 렌더링 최대 거리
    }

    // 💡 WebGL용 View 매트릭스와 Projection 매트릭스를 뽑아내는 핵심 함수
    updateAndGetMatrices(player, canvasWidth, canvasHeight) {
        const headHeight = 1.7;
        
        // 1. 슬라이딩 시 카메라 높이 부드럽게 낮추기
        const targetDrop = player.isSliding ? -0.6 : 0.0;
        this.slideDropCamera += (targetDrop - this.slideDropCamera) * 0.2;
        
        // 2. 머리 위치 계산 (플레이어 위치 + 머리 높이 + 슬라이딩 드롭)
        let headPos = [...player.pos];
        headPos[1] += headHeight + this.slideDropCamera;
        
        // 걷거나 뛸 때 카메라 위아래로 흔들림 (Bobbing)
        const viewBobOffset = Math.sin(player.moveTime * 7.0) * 0.06 * player.bobAmp;
        if (player.isGrounded && !player.isSliding) {
            headPos[1] += viewBobOffset;
        }

        // 3. Pitch(상하)와 Yaw(좌우)를 기준으로 앞을 바라보는 벡터(Front) 계산
        const radYaw = player.yaw * (Math.PI / 180);
        const radPitch = player.pitch * (Math.PI / 180);
        
        const front = [
            Math.cos(radYaw) * Math.cos(radPitch),
            Math.sin(radPitch),
            Math.sin(radYaw) * Math.cos(radPitch)
        ];
        
        // 오른쪽 벡터 (Up 벡터는 Y축인 [0, 1, 0]으로 고정하고 Cross Product 수행)
        const right = [-Math.sin(radYaw), 0.0, Math.cos(radYaw)];
        const up = [0.0, 1.0, 0.0];

        // 4. 1인칭/3인칭 카메라 위치(Eye)와 타겟(Center) 설정
        let cameraPos = [...headPos];
        let targetPos = [headPos[0] + front[0], headPos[1] + front[1], headPos[2] + front[2]];

        if (!this.isFirstPerson) {
            const offsetFactor = Math.max(0.0, Math.min(1.0, (this.distance - 0.5) / 2.0));
            cameraPos = [
                headPos[0] - (front[0] * this.distance) - (right[0] * 0.8 * offsetFactor),
                headPos[1] - (front[1] * this.distance) - (right[1] * 0.8 * offsetFactor) + (0.3 * offsetFactor),
                headPos[2] - (front[2] * this.distance) - (right[2] * 0.8 * offsetFactor)
            ];
            targetPos = [headPos[0] + front[0] * 100.0, headPos[1] + front[1] * 100.0, headPos[2] + front[2] * 100.0];
        }

        // 5. 화면 비율(Aspect Ratio) 계산
        const aspect = canvasWidth / canvasHeight;

        // 6. 최종 WebGL 4x4 매트릭스 생성
        const viewMatrix = this.createLookAt(cameraPos, targetPos, up);
        const projectionMatrix = this.createPerspective(this.fov, aspect, this.near, this.far);

        return { 
            front, 
            right, 
            cameraPos, 
            viewMatrix, 
            projectionMatrix 
        };
    }

    /* ==========================================================
       📐 아래는 외부 라이브러리 없이 구현한 순수 수학(Matrix) 함수들
       ========================================================== */

    // 벡터 뺄셈
    subtractVectors(a, b) {
        return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    }

    // 벡터 정규화 (길이를 1로 만듦)
    normalize(v) {
        let length = Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]);
        if (length > 0.00001) {
            return [v[0]/length, v[1]/length, v[2]/length];
        } else {
            return [0, 0, 0];
        }
    }

    // 벡터의 외적 (수직인 벡터 구하기)
    cross(a, b) {
        return [
            a[1] * b[2] - a[2] * b[1],
            a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0]
        ];
    }

    // 카메라의 시점 행렬(View Matrix) 생성 함수 (파이썬의 gluLookAt과 동일)
    createLookAt(eye, center, up) {
        let z = this.normalize(this.subtractVectors(eye, center));
        let x = this.normalize(this.cross(up, z));
        let y = this.normalize(this.cross(z, x));

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

    // 원근 투영 행렬(Projection Matrix) 생성 함수 (파이썬의 gluPerspective와 동일)
    createPerspective(fov, aspect, near, far) {
        let f = Math.tan(Math.PI * 0.5 - 0.5 * (fov * Math.PI / 180));
        let rangeInv = 1.0 / (near - far);

        return new Float32Array([
            f / aspect, 0, 0, 0,
            0, f, 0, 0,
            0, 0, (near + far) * rangeInv, -1,
            0, 0, near * far * rangeInv * 2, 0
        ]);
    }
}
