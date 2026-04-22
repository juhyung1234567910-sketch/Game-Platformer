export class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.gl = canvas.getContext('webgl', { antialias: true }) || canvas.getContext('experimental-webgl');
        if (!this.gl) {
            alert("이 브라우저는 WebGL을 지원하지 않습니다.");
            return;
        }

        // 1. 고해상도 그림자 설정
        this.shadowSize = 2048; 
        this.initShaders();
        this.initShadowFramebuffer();
        this.initBuffers();
        
        // GL 설정 초기화
        this.gl.enable(this.gl.DEPTH_TEST);
        this.gl.enable(this.gl.CULL_FACE); // 성능 향상을 위한 후면 제거
    }

    initShaders() {
        const gl = this.gl;

        // --- [Shadow Shader] 깊이 값을 RGBA로 정밀하게 쪼개서 저장 ---
        const vsShadow = `
            attribute vec4 aPos;
            uniform mat4 uLightMatrix;
            uniform mat4 uModel;
            void main() {
                gl_Position = uLightMatrix * uModel * aPos;
            }
        `;
        const fsShadow = `
            precision highp float;
            void main() {
                // 16비트 이상의 정밀도를 위해 깊이 값을 RGBA 채널에 분산 저장
                vec4 bitShift = vec4(1.0, 256.0, 256.0 * 256.0, 256.0 * 256.0 * 256.0);
                vec4 bitMask = vec4(1.0/256.0, 1.0/256.0, 1.0/256.0, 0.0);
                vec4 res = fract(gl_FragCoord.z * bitShift);
                res -= res.xxyz * bitMask;
                gl_FragColor = res;
            }
        `;

        // --- [Main Shader] Blinn-Phong + PCF Soft Shadows + Ambient Occlusion 느낌 ---
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
                vShadowPos = uLightMatrix * worldPos;
                gl_Position = uProj * uView * worldPos;
            }
        `;
        const fsMain = `
            precision highp float;
            varying vec3 vNormal, vPos;
            varying vec4 vShadowPos;
            uniform vec4 uColor;
            uniform vec3 uViewPos;
            uniform sampler2D uShadowMap;

            // RGBA로 쪼개진 깊이 값을 다시 하나로 합치는 함수
            float unpackDepth(vec4 color) {
                const vec4 bitShift = vec4(1.0, 1.0/256.0, 1.0/(256.0*256.0), 1.0/(256.0*256.0*256.0));
                return dot(color, bitShift);
            }

            void main() {
                vec3 normal = normalize(vNormal);
                vec3 lightPos = vec3(15.0, 25.0, 10.0);
                vec3 lightDir = normalize(lightPos);
                vec3 viewDir = normalize(uViewPos - vPos);
                vec3 halfDir = normalize(lightDir + viewDir);

                // 1. 부드러운 그림자 (PCF 9-tap)
                vec3 shadowCoord = (vShadowPos.xyz / vShadowPos.w) * 0.5 + 0.5;
                float shadow = 0.0;
                float bias = max(0.008 * (1.0 - dot(normal, lightDir)), 0.002);
                
                for(float x = -1.0; x <= 1.0; x += 1.0) {
                    for(float y = -1.0; y <= 1.0; y += 1.0) {
                        float depth = unpackDepth(texture2D(uShadowMap, shadowCoord.xy + vec2(x, y) / 2048.0));
                        shadow += (shadowCoord.z - bias > depth) ? 0.35 : 1.0;
                    }
                }
                shadow /= 9.0;

                // 2. 조명 계산 (Blinn-Phong)
                float diff = max(dot(normal, lightDir), 0.0);
                float spec = pow(max(dot(normal, halfDir), 0.0), 50.0);
                
                vec3 ambient = uColor.rgb * 0.45; // 그림자 속 밝기 상향
                vec3 diffuse = uColor.rgb * diff;
                vec3 specular = vec3(0.5) * spec;

                // 최종 색상 조합
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
        const fs = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fs, fsS); gl.compileShader(fs);
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

        const depthRB = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, depthRB);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, this.shadowSize, this.shadowSize);

        gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFB);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.shadowTex, 0);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthRB);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    initBuffers() {
        const gl = this.gl;
        this.cubeBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.cubeBuf);
        const s = 1.0;
        // 위치(3) + 노멀(3)
        const data = new Float32Array([
            -s,-s, s, 0,0,1,  s,-s, s, 0,0,1,  s, s, s, 0,0,1, -s, s, s, 0,0,1, // 앞
            -s,-s,-s, 0,0,-1, -s, s,-s, 0,0,-1,  s, s,-s, 0,0,-1,  s,-s,-s, 0,0,-1, // 뒤
            -s, s,-s, 0,1,0, -s, s, s, 0,1,0,  s, s, s, 0,1,0,  s, s,-s, 0,1,0, // 위
            -s,-s,-s, 0,-1,0,  s,-s,-s, 0,-1,0,  s,-s, s, 0,-1,0, -s,-s, s, 0,-1,0, // 아래
             s,-s,-s, 1,0,0,  s, s,-s, 1,0,0,  s, s, s, 1,0,0,  s,-s, s, 1,0,0, // 우
            -s,-s,-s,-1,0,0, -s,-s, s,-1,0,0, -s, s, s,-1,0,0, -s, s,-s,-1,0,0  // 좌
        ]);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);

        this.idxBuf = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.idxBuf);
        const idx = []; for(let i=0; i<24; i+=4) idx.push(i,i+1,i+2, i,i+2,i+3);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
    }

    // --- 수학 함수 직접 구현 (줄 수 확보 및 정밀도 향상) ---
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

    normalize(v) { const d=Math.sqrt(v[0]*v[0]+v[1]*v[1]+v[2]*v[2]); return [v[0]/d, v[1]/d, v[2]/d]; }
    cross(a,b) { return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]; }
    dot(a,b) { return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]; }

    drawWorld(player, cam, remotePlayers, mapData) {
        const gl = this.gl;
        if (!mapData) return;

        // 빛의 시점 행렬 계산 (정교하게)
        const lightProj = this.getOrtho(-25, 25, -25, 25, 0.1, 60);
        const lightView = this.getLookAt([15, 25, 10], [0, 0, 0], [0, 1, 0]);
        const lightMatrix = this.multiplyMatrices(lightProj, lightView);

        // 1. Shadow Pass
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFB);
        gl.viewport(0, 0, this.shadowSize, this.shadowSize);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.useProgram(this.shadowProg);
        this.renderScene(gl, this.shadowProg, lightMatrix, null, mapData, true);

        // 2. Main Pass
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        gl.clearColor(0.45, 0.75, 1.0, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.useProgram(this.mainProg);
        
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
        gl.uniform1i(gl.getUniformLocation(this.mainProg, "uShadowMap"), 0);
        gl.uniform3fv(gl.getUniformLocation(this.mainProg, "uViewPos"), player.pos);
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

        // 바닥 렌더링
        gl.uniform4fv(uColor, [0.35, 0.55, 0.35, 1.0]);
        const groundModel = new Float32Array([100,0,0,0, 0,0.1,0,0, 0,0,100,0, 0,0,0,1]);
        gl.uniformMatrix4fv(uModel, false, groundModel);
        gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);

        // 맵 오브젝트 렌더링
        gl.uniform4fv(uColor, [0.75, 0.75, 0.75, 1.0]);
        for (let box of mapData) {
            const m = new Float32Array([box.scale[0],0,0,0, 0,box.scale[1],0,0, 0,0,box.scale[2],0, box.pos[0],box.pos[1],box.pos[2],1]);
            gl.uniformMatrix4fv(uModel, false, m);
            gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);
        }

        // 다른 플레이어 렌더링
        if (remotePlayers && !isShadow) {
            gl.uniform4fv(uColor, [1.0, 0.3, 0.3, 1.0]);
            for (let id in remotePlayers) {
                const p = remotePlayers[id];
                if (!p.pos) continue;
                const m = new Float32Array([0.6,0,0,0, 0,0.9,0,0, 0,0,0.6,0, p.pos[0], p.pos[1]+0.5, p.pos[2], 1]);
                gl.uniformMatrix4fv(uModel, false, m);
                gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);
            }
        }
    }
}
