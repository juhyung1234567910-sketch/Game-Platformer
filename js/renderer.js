/**
 * Renderer Class: Shadow Mapping (Silhouette Projection) 구현
 * - Pass 1: 빛의 시점에서 Depth Map 생성 (실루엣 추출)
 * - Pass 2: 카메라 시점에서 Shadow Map을 비교하여 그림자 투영
 */
export class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.gl = canvas.getContext('webgl', { antialias: true }) || canvas.getContext('experimental-webgl');
        
        if (!this.gl) {
            console.error("WebGL을 지원하지 않는 브라우저입니다.");
            return;
        }

        // 1. 그림자 해상도 설정 (높을수록 실루엣이 선명함)
        this.shadowSize = 2048; 
        
        // 2. 쉐이더 초기화
        this.initShaders();
        // 3. 그림자용 프레임버퍼(FBO) 생성
        this.initShadowFramebuffer();
        // 4. 버퍼 데이터 초기화
        this.initBuffers();

        // 기본 렌더링 설정
        this.gl.enable(this.gl.DEPTH_TEST);
        this.gl.enable(this.gl.CULL_FACE);
        this.gl.clearColor(0.53, 0.81, 0.92, 1.0); // 스카이 블루 배경
    }

    initShaders() {
        const gl = this.gl;

        // --- [Pass 1] Shadow Shader: 빛의 시점에서 실루엣 깊이만 계산 ---
        const vsShadow = `
            attribute vec4 aPos;
            uniform mat4 uModel, uLightMatrix;
            void main() {
                gl_Position = uLightMatrix * uModel * aPos;
            }
        `;
        const fsShadow = `
            precision highp float;
            void main() {
                // RGBA 채널에 깊이값을 쪼개어 저장 (정밀도 향상)
                vec4 bitShift = vec4(1.0, 256.0, 256.0 * 256.0, 256.0 * 256.0 * 256.0);
                vec4 bitMask = vec4(1.0/256.0, 1.0/256.0, 1.0/256.0, 0.0);
                vec4 res = fract(gl_FragCoord.z * bitShift);
                res -= res.xxyz * bitMask;
                gl_FragColor = res;
            }
        `;

        // --- [Pass 2] Main Shader: 실제 색상 + 실루엣 그림자 투영 ---
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
                // 현재 픽셀이 빛의 시점에서 어디인지 계산 (그림자 대조용)
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

            // RGBA로 쪼개진 깊이값을 다시 수치로 변환
            float unpackDepth(vec4 color) {
                const vec4 bitShift = vec4(1.0, 1.0/256.0, 1.0/(256.0*256.0), 1.0/(256.0*256.0*256.0));
                return dot(color, bitShift);
            }

            void main() {
                vec3 normal = normalize(vNormal);
                vec3 lightDir = normalize(uLightDir);
                vec3 viewDir = normalize(uViewPos - vPos);
                vec3 halfDir = normalize(lightDir + viewDir);

                // --- 그림자 투영 로직 ---
                vec3 shadowCoord = (vShadowPos.xyz / vShadowPos.w) * 0.5 + 0.5;
                float shadow = 0.0;
                // Bias: Shadow Acne(줄무늬 현상) 방지
                float bias = max(0.005 * (1.0 - dot(normal, lightDir)), 0.0005);
                
                // PCF (Percentage Closer Filtering): 그림자 경계를 부드럽게 샘플링
                for(float x = -1.0; x <= 1.0; x += 1.0) {
                    for(float y = -1.0; y <= 1.0; y += 1.0) {
                        float depth = unpackDepth(texture2D(uShadowMap, shadowCoord.xy + vec2(x, y) / 2048.0));
                        shadow += (shadowCoord.z - bias > depth) ? 0.4 : 1.0;
                    }
                }
                shadow /= 9.0;

                // --- 조명 계산 (Blinn-Phong) ---
                float diff = max(dot(normal, lightDir), 0.0);
                float spec = pow(max(dot(normal, halfDir), 0.0), 48.0);
                
                vec3 ambient = uColor.rgb * 0.4;
                vec3 diffuse = uColor.rgb * diff;
                vec3 specular = vec3(0.5) * spec;

                // 최종 색상에 그림자 계수(shadow) 적용
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
        if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(vs));

        const fs = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fs, fsS); gl.compileShader(fs);
        if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(fs));

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
        // Pos(3) + Normal(3)
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

    // --- 행렬 연산 유틸리티 ---
    multiplyMatrices(a, b) {
        const out = new Float32Array(16);
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
                out[i * 4 + j] = a[i * 4 + 0] * b[0 * 4 + j] + a[i * 4 + 1] * b[1 * 4 + j] + a[i * 4 + 2] * b[2 * 4 + j] + a[i * 4 + 3] * b[3 * 4 + j];
            }
        }
        return out;
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

    normalize(v) { const d=Math.sqrt(v[0]*v[0]+v[1]*v[1]+v[2]*v[2]); return [v[0]/d, v[1]/d, v[2]/d]; }
    cross(a,b) { return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]; }
    dot(a,b) { return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]; }

    // --- 통합 렌더링 루프 ---
    drawWorld(player, camera, mapData, remotePlayers) {
        const gl = this.gl;
        if (!mapData) return;

        // 1. 빛의 시점 계산 (플레이어 추적형 태양광)
        const lightPos = [player.pos[0] + 15, 45, player.pos[2] + 15];
        const lightTarget = [player.pos[0], 0, player.pos[2]];
        const lightProj = this.getOrtho(-50, 50, -50, 50, 0.1, 150);
        const lightView = this.getLookAt(lightPos, lightTarget, [0, 1, 0]);
        const lightMatrix = this.multiplyMatrices(lightProj, lightView);

        // --- Pass 1: Shadow Map 생성 ---
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFB);
        gl.viewport(0, 0, this.shadowSize, this.shadowSize);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.useProgram(this.shadowProg);
        gl.uniformMatrix4fv(gl.getUniformLocation(this.shadowProg, "uLightMatrix"), false, lightMatrix);

        this.renderScene(this.shadowProg, mapData, remotePlayers, true);

        // --- Pass 2: 실제 화면 렌더링 ---
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.useProgram(this.mainProg);

        // 유니폼 전송
        gl.uniformMatrix4fv(gl.getUniformLocation(this.mainProg, "uProj"), false, camera.projectionMatrix);
        gl.uniformMatrix4fv(gl.getUniformLocation(this.mainProg, "uView"), false, camera.viewMatrix);
        gl.uniformMatrix4fv(gl.getUniformLocation(this.mainProg, "uLightMatrix"), false, lightMatrix);
        gl.uniform3fv(gl.getUniformLocation(this.mainProg, "uLightDir"), this.normalize([15, 45, 15]));
        gl.uniform3fv(gl.getUniformLocation(this.mainProg, "uViewPos"), player.pos);

        // Shadow Map 바인딩
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
        gl.uniform1i(gl.getUniformLocation(this.mainProg, "uShadowMap"), 0);

        this.renderScene(this.mainProg, mapData, remotePlayers, false);
    }

    renderScene(prog, mapData, remotePlayers, isShadow) {
        const gl = this.gl;
        const uModel = gl.getUniformLocation(prog, "uModel");
        const uColor = gl.getUniformLocation(prog, "uColor");
        const aPos = gl.getAttribLocation(prog, "aPos");
        const aNormal = gl.getAttribLocation(prog, "aNormal");

        gl.bindBuffer(gl.ARRAY_BUFFER, this.cubeBuf);
        gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 24, 0);
        gl.enableVertexAttribArray(aPos);
        
        if (!isShadow) {
            gl.vertexAttribPointer(aNormal, 3, gl.FLOAT, false, 24, 12);
            gl.enableVertexAttribArray(aNormal);
        }

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.idxBuf);

        // 1. 바닥 렌더링 (그림자를 받는 면)
        if (!isShadow) gl.uniform4fv(uColor, [0.45, 0.45, 0.5, 1.0]);
        const groundM = new Float32Array([200,0,0,0, 0,0.2,0,0, 0,0,200,0, 0,-0.1,0,1]);
        gl.uniformMatrix4fv(uModel, false, groundM);
        gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);

        // 2. 맵 블록들 (실루엣을 던지는 물체들)
        for (const box of mapData) {
            const m = new Float32Array([
                box.scale[0], 0, 0, 0,
                0, box.scale[1], 0, 0,
                0, 0, box.scale[2], 0,
                box.pos[0], box.pos[1], box.pos[2], 1
            ]);
            gl.uniformMatrix4fv(uModel, false, m);
            if (!isShadow) gl.uniform4fv(uColor, box.color || [0.8, 0.8, 0.8, 1.0]);
            gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);
        }

        // 3. 다른 플레이어들 (실루엣을 던지는 물체들)
        if (remotePlayers) {
            for (const id in remotePlayers) {
                const p = remotePlayers[id];
                const m = new Float32Array([0.5,0,0,0, 0,1,0,0, 0,0,0.5,0, p.pos[0], p.pos[1], p.pos[2], 1]);
                gl.uniformMatrix4fv(uModel, false, m);
                if (!isShadow) gl.uniform4fv(uColor, [1.0, 0.3, 0.3, 1.0]);
                gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);
            }
        }
    }
}
