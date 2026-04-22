export class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        // WebGL 컨텍스트 및 안티앨리어싱 설정
        this.gl = canvas.getContext('webgl', { antialias: true, alpha: false }) || 
                  canvas.getContext('experimental-webgl');
        
        if (!this.gl) {
            alert("WebGL을 지원하지 않는 환경입니다.");
            return;
        }

        // 1. 그림자 해상도 설정 (실루엣이 똑같이 나오려면 고해상도가 필수)
        this.shadowSize = 2048; 
        
        // 2. 초기화 프로세스
        this.initShaders();
        this.initShadowFramebuffer();
        this.initBuffers();

        // 3. 글로벌 GL 설정
        this.gl.enable(this.gl.DEPTH_TEST);
        this.gl.enable(this.gl.CULL_FACE); // 성능을 위해 뒷면 렌더링 생략
        this.gl.clearColor(0.4, 0.7, 1.0, 1.0); // 하늘색 배경
    }

    initShaders() {
        const gl = this.gl;

        // --- [Shadow Shader] : 물체의 실루엣을 깊이 텍스처에 기록 ---
        const vsShadow = `
            attribute vec4 aPos;
            uniform mat4 uLightMatrix, uModel;
            void main() {
                gl_Position = uLightMatrix * uModel * aPos;
            }
        `;
        const fsShadow = `
            precision highp float;
            void main() {
                // 16비트 이상의 정밀도를 위해 RGBA 채널에 깊이 분산 저장
                vec4 bitShift = vec4(1.0, 256.0, 256.0 * 256.0, 256.0 * 256.0 * 256.0);
                vec4 bitMask = vec4(1.0/256.0, 1.0/256.0, 1.0/256.0, 0.0);
                vec4 res = fract(gl_FragCoord.z * bitShift);
                res -= res.xxyz * bitMask;
                gl_FragColor = res;
            }
        `;

        // --- [Main Shader] : 실루엣 투영 + Blinn-Phong 광택 + 바닥 그림자 ---
        const vsMain = `
            attribute vec4 aPos;
            attribute vec3 aNormal;
            uniform mat4 uModel, uView, uProj, uLightMatrix;
            varying vec3 vNormal, vPos;
            varying vec4 vShadowPos;
            void main() {
                vec4 worldPos = uModel * aPos;
                vPos = worldPos.xyz;
                vNormal = (uModel * vec4(aNormal, 0.0)).xyz;
                // 빛의 시점에서 계산된 좌표를 Fragment Shader로 전달
                vShadowPos = uLightMatrix * worldPos;
                gl_Position = uProj * uView * worldPos;
            }
        `;
        const fsMain = `
            precision highp float;
            varying vec3 vNormal, vPos;
            varying vec4 vShadowPos;
            uniform vec4 uColor;
            uniform vec3 uViewPos, uLightDir;
            uniform sampler2D uShadowMap;

            // RGBA로 인코딩된 깊이값을 다시 복원
            float unpackDepth(vec4 color) {
                const vec4 bitShift = vec4(1.0, 1.0/256.0, 1.0/(256.0*256.0), 1.0/(256.0*256.0*256.0));
                return dot(color, bitShift);
            }

            void main() {
                vec3 normal = normalize(vNormal);
                vec3 lightDir = normalize(uLightDir);
                vec3 viewDir = normalize(uViewPos - vPos);
                vec3 halfDir = normalize(lightDir + viewDir);

                // --- 그림자 투영 알고리즘 (PCF) ---
                vec3 shadowCoord = (vShadowPos.xyz / vShadowPos.w) * 0.5 + 0.5;
                float shadow = 0.0;
                float bias = max(0.005 * (1.0 - dot(normal, lightDir)), 0.0005);
                
                // 3x3 샘플링으로 실루엣 경계를 부드럽게 뭉개줌
                for(float x = -1.0; x <= 1.0; x += 1.0) {
                    for(float y = -1.0; y <= 1.0; y += 1.0) {
                        float depth = unpackDepth(texture2D(uShadowMap, shadowCoord.xy + vec2(x, y) / 2048.0));
                        shadow += (shadowCoord.z - bias > depth) ? 0.35 : 1.0;
                    }
                }
                shadow /= 9.0;

                // --- 조명 계산 (Blinn-Phong) ---
                float diff = max(dot(normal, lightDir), 0.0);
                float spec = pow(max(dot(normal, halfDir), 0.0), 50.0);
                
                vec3 ambient = uColor.rgb * 0.45; // 어두운 곳의 밝기
                vec3 diffuse = uColor.rgb * diff;
                vec3 specular = vec3(0.5) * spec; // 하이라이트 광택

                gl_FragColor = vec4(ambient + (diffuse + specular) * shadow, uColor.a);
            }
        `;

        this.shadowProg = this.createProgram(vsShadow, fsShadow);
        this.mainProg = this.createProgram(vsMain, fsMain);
    }

    createProgram(vsS, fsS) {
        const gl = this.gl;
        const vs = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vs, vsS); gl.compileShader(vs);
        if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) console.error("VS 에러:", gl.getShaderInfoLog(vs));

        const fs = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fs, fsS); gl.compileShader(fs);
        if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) console.error("FS 에러:", gl.getShaderInfoLog(fs));

        const prog = gl.createProgram();
        gl.attachShader(prog, vs); gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        return prog;
    }

    initShadowFramebuffer() {
        const gl = this.gl;
        this.shadowFB = gl.createFramebuffer();
        this.shadowTex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.shadowSize, this.shadowSize, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        this.depthRB = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, this.depthRB);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, this.shadowSize, this.shadowSize);

        gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFB);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.shadowTex, 0);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.depthRB);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    initBuffers() {
        const gl = this.gl;
        this.cubeBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.cubeBuf);
        const s = 1.0;
        // 위치(3) + 법선벡터(3) 데이터
        const data = new Float32Array([
            -s,-s, s, 0,0,1,  s,-s, s, 0,0,1,  s, s, s, 0,0,1, -s, s, s, 0,0,1,
            -s,-s,-s, 0,0,-1, -s, s,-s, 0,0,-1,  s, s,-s, 0,0,-1,  s,-s,-s, 0,0,-1,
            -s, s,-s, 0,1,0, -s, s, s, 0,1,0,  s, s, s, 0,1,0,  s, s,-s, 0,1,0,
            -s,-s,-s, 0,-1,0,  s,-s,-s, 0,-1,0,  s,-s, s, 0,-1,0, -s,-s, s, 0,-1,0,
             s,-s,-s, 1,0,0,  s, s,-s, 1,0,0,  s, s, s, 1,0,0,  s,-s, s, 1,0,0,
            -s,-s,-s,-1,0,0, -s,-s, s,-1,0,0, -s, s, s,-1,0,0, -s, s,-s,-1,0,0
        ]);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);

        this.idxBuf = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.idxBuf);
        const idx = []; for(let i=0; i<24; i+=4) idx.push(i,i+1,i+2, i,i+2,i+3);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
    }

    // --- 행렬 수학 라이브러리 (직접 구현 파트) ---
    multiplyMatrices(a, b) {
        const res = new Float32Array(16);
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
                res[i * 4 + j] = a[i * 4 + 0] * b[0 * 4 + j] + a[i * 4 + 1] * b[1 * 4 + j] + a[i * 4 + 2] * b[2 * 4 + j] + a[i * 4 + 3] * b[3 * 4 + j];
            }
        }
        return res;
    }

    getOrtho(l, r, b, t, n, f) {
        return new Float32Array([2/(r-l),0,0,0, 0,2/(t-b),0,0, 0,0,-2/(f-n),0, -(r+l)/(r-l),-(t+b)/(t-b),-(f+n)/(f-n),1]);
    }

    getLookAt(eye, center, up) {
        const z = this.normalize([eye[0]-center[0], eye[1]-center[1], eye[2]-center[2]]);
        const x = this.normalize(this.cross(up, z));
        const y = this.cross(z, x);
        return new Float32Array([x[0],y[0],z[0],0, x[1],y[1],z[1],0, x[2],y[2],z[2],0, -this.dot(x,eye),-this.dot(y,eye),-this.dot(z,eye),1]);
    }

    normalize(v) { 
        const d = Math.sqrt(v[0]*v[0]+v[1]*v[1]+v[2]*v[2]); 
        return d === 0 ? [0,0,0] : [v[0]/d, v[1]/d, v[2]/d]; 
    }
    cross(a,b) { return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]; }
    dot(a,b) { return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]; }

    // --- 메인 렌더 루프 ---
    drawWorld(player, cam, remotePlayers, mapData) {
        const gl = this.gl;
        if (!mapData) return;

        // 1. 태양(광원) 설정: 비스듬히 위에서 쏨
        const lightPos = [15, 30, 15]; 
        const lightDir = this.normalize(lightPos);
        const lightProj = this.getOrtho(-40, 40, -40, 40, 0.1, 80);
        const lightView = this.getLookAt(lightPos, [0, 0, 0], [0, 1, 0]);
        const lightMatrix = this.multiplyMatrices(lightProj, lightView);

        // 2. Pass 1: 그림자 맵 생성 (모든 사물 실루엣 기록)
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFB);
        gl.viewport(0, 0, this.shadowSize, this.shadowSize);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.useProgram(this.shadowProg);
        this.renderScene(gl, this.shadowProg, lightMatrix, null, mapData, true);

        // 3. Pass 2: 실제 화면 출력
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.useProgram(this.mainProg);
        
        // 쉐도우 맵 전달
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
        gl.uniform1i(gl.getUniformLocation(this.mainProg, "uShadowMap"), 0);
        
        // 유니폼 변수 설정
        gl.uniform3fv(gl.getUniformLocation(this.mainProg, "uViewPos"), player.pos);
        gl.uniform3fv(gl.getUniformLocation(this.mainProg, "uLightDir"), lightDir);
        gl.uniformMatrix4fv(gl.getUniformLocation(this.mainProg, "uLightMatrix"), false, lightMatrix);

        this.renderScene(gl, this.mainProg, cam.viewMatrix, cam.projectionMatrix, mapData, false, remotePlayers);
    }

    renderScene(gl, prog, view, proj, mapData, isShadow, remotePlayers) {
        const uModel = gl.getUniformLocation(prog, "uModel");
        const uView = gl.getUniformLocation(prog, "uView");
        const uProj = gl.getUniformLocation(prog, "uProj");
        const uColor = gl.getUniformLocation(prog, "uColor");
        const aPos = gl.getAttribLocation(prog, "aPos");
        const aNormal = gl.getAttribLocation(prog, "aNormal");

        gl.uniformMatrix4fv(uView, false, view);
        if (proj) gl.uniformMatrix4fv(uProj, false, proj);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.cubeBuf);
        gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 24, 0);
        gl.enableVertexAttribArray(aPos);
        if (!isShadow) {
            gl.vertexAttribPointer(aNormal, 3, gl.FLOAT, false, 24, 12);
            gl.enableVertexAttribArray(aNormal);
        }
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.idxBuf);

        // --- 1. 바닥 (가장 큰 그림자 수신기) ---
        gl.uniform4fv(uColor, [0.3, 0.5, 0.3, 1.0]); // 녹색 바닥
        const groundModel = new Float32Array([100,0,0,0, 0,0.1,0,0, 0,0,100,0, 0,-0.05,0,1]);
        gl.uniformMatrix4fv(uModel, false, groundModel);
        gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);

        // --- 2. 맵 오브젝트 (실루엣 생성기) ---
        gl.uniform4fv(uColor, [0.8, 0.8, 0.8, 1.0]); // 회색 상자
        for (let box of mapData) {
            const m = new Float32Array([
                box.scale[0], 0, 0, 0, 
                0, box.scale[1], 0, 0, 
                0, 0, box.scale[2], 0, 
                box.pos[0], box.pos[1], box.pos[2], 1
            ]);
            gl.uniformMatrix4fv(uModel, false, m);
            gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);
        }

        // --- 3. 네트워크 플레이어 ---
        if (remotePlayers && !isShadow) {
            gl.uniform4fv(uColor, [1.0, 0.2, 0.2, 1.0]); // 적군 빨간색
            for (let id in remotePlayers) {
                const p = remotePlayers[id];
                if (!p.pos) continue;
                const m = new Float32Array([0.5,0,0,0, 0,1,0,0, 0,0,0.5,0, p.pos[0], p.pos[1], p.pos[2], 1]);
                gl.uniformMatrix4fv(uModel, false, m);
                gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);
            }
        }
    }
}
