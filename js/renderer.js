export class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.gl = canvas.getContext('webgl', { antialias: true, alpha: false }) ||
                  canvas.getContext('experimental-webgl');

        if (!this.gl) {
            alert("WebGL을 지원하지 않는 환경입니다.");
            return;
        }

        this.shadowSize = 2048;

        this.initShaders();
        this.initShadowFramebuffer();
        this.initBuffers();

        this.gl.enable(this.gl.DEPTH_TEST);
        this.gl.enable(this.gl.CULL_FACE);
        this.gl.clearColor(0.4, 0.7, 1.0, 1.0);
    }

    initShaders() {
        const gl = this.gl;

        // --- [Shadow Shader] ---
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
                vec4 bitShift = vec4(1.0, 256.0, 256.0*256.0, 256.0*256.0*256.0);
                vec4 bitMask  = vec4(1.0/256.0, 1.0/256.0, 1.0/256.0, 0.0);
                vec4 res = fract(gl_FragCoord.z * bitShift);
                res -= res.xxyz * bitMask;
                gl_FragColor = res;
            }
        `;

        // --- [Main Shader] : PCF 소프트 섀도우 + Blinn-Phong ---
        const vsMain = `
            attribute vec4 aPos;
            attribute vec3 aNormal;
            uniform mat4 uModel, uView, uProj, uLightMatrix;
            varying vec3 vNormal, vPos;
            varying vec4 vShadowPos;
            void main() {
                vec4 worldPos = uModel * aPos;
                vPos      = worldPos.xyz;
                vNormal   = normalize((uModel * vec4(aNormal, 0.0)).xyz);
                vShadowPos = uLightMatrix * worldPos;
                gl_Position = uProj * uView * worldPos;
            }
        `;
        const fsMain = `
            precision highp float;
            varying vec3 vNormal, vPos;
            varying vec4 vShadowPos;
            uniform vec4  uColor;
            uniform vec3  uViewPos, uLightDir;
            uniform sampler2D uShadowMap;

            float unpackDepth(vec4 c) {
                const vec4 b = vec4(1.0, 1.0/256.0, 1.0/(256.0*256.0), 1.0/(256.0*256.0*256.0));
                return dot(c, b);
            }

            void main() {
                vec3 normal   = normalize(vNormal);
                vec3 lightDir = normalize(uLightDir);
                vec3 viewDir  = normalize(uViewPos - vPos);
                vec3 halfDir  = normalize(lightDir + viewDir);

                // --- PCF 5x5 소프트 섀도우 ---
                vec3 sc   = (vShadowPos.xyz / vShadowPos.w) * 0.5 + 0.5;
                float bias = max(0.005 * (1.0 - dot(normal, lightDir)), 0.0005);
                float shadow = 0.0;
                float texel  = 1.0 / 2048.0;

                for (float x = -2.0; x <= 2.0; x += 1.0) {
                    for (float y = -2.0; y <= 2.0; y += 1.0) {
                        float depth = unpackDepth(texture2D(uShadowMap, sc.xy + vec2(x, y) * texel));
                        shadow += (sc.z - bias > depth) ? 0.35 : 1.0;
                    }
                }
                shadow /= 25.0;

                // 그림자 범위 바깥이면 완전히 밝게
                if (sc.x < 0.0 || sc.x > 1.0 || sc.y < 0.0 || sc.y > 1.0 || sc.z > 1.0)
                    shadow = 1.0;

                // --- Blinn-Phong 조명 ---
                float diff = max(dot(normal, lightDir), 0.0);
                float spec = pow(max(dot(normal, halfDir), 0.0), 50.0);

                vec3 ambient  = uColor.rgb * 0.45;
                vec3 diffuse  = uColor.rgb * diff;
                vec3 specular = vec3(0.5) * spec;

                gl_FragColor = vec4(ambient + (diffuse + specular) * shadow, uColor.a);
            }
        `;

        this.shadowProg = this.createProgram(vsShadow, fsShadow);
        this.mainProg   = this.createProgram(vsMain,   fsMain);
    }

    createProgram(vsS, fsS) {
        const gl = this.gl;
        const vs = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vs, vsS); gl.compileShader(vs);
        if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) console.error("VS:", gl.getShaderInfoLog(vs));

        const fs = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fs, fsS); gl.compileShader(fs);
        if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) console.error("FS:", gl.getShaderInfoLog(fs));

        const prog = gl.createProgram();
        gl.attachShader(prog, vs); gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        return prog;
    }

    initShadowFramebuffer() {
        const gl = this.gl;
        this.shadowFB  = gl.createFramebuffer();
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
        const data = new Float32Array([
            -s,-s, s, 0,0,1,   s,-s, s, 0,0,1,   s, s, s, 0,0,1,  -s, s, s, 0,0,1,
            -s,-s,-s, 0,0,-1, -s, s,-s, 0,0,-1,   s, s,-s, 0,0,-1,  s,-s,-s, 0,0,-1,
            -s, s,-s, 0,1,0,  -s, s, s, 0,1,0,    s, s, s, 0,1,0,   s, s,-s, 0,1,0,
            -s,-s,-s, 0,-1,0,  s,-s,-s, 0,-1,0,   s,-s, s, 0,-1,0, -s,-s, s, 0,-1,0,
             s,-s,-s, 1,0,0,   s, s,-s, 1,0,0,    s, s, s, 1,0,0,   s,-s, s, 1,0,0,
            -s,-s,-s,-1,0,0,  -s,-s, s,-1,0,0,   -s, s, s,-1,0,0,  -s, s,-s,-1,0,0
        ]);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);

        this.idxBuf = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.idxBuf);
        const idx = [];
        for (let i = 0; i < 24; i += 4) idx.push(i, i+1, i+2, i, i+2, i+3);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
    }

    // ─── 행렬 수학 ───────────────────────────────────────────────
    multiplyMatrices(a, b) {
        const r = new Float32Array(16);
        for (let i = 0; i < 4; i++)
            for (let j = 0; j < 4; j++)
                r[i*4+j] = a[i*4]*b[j] + a[i*4+1]*b[4+j] + a[i*4+2]*b[8+j] + a[i*4+3]*b[12+j];
        return r;
    }

    getOrtho(l, r, b, t, n, f) {
        return new Float32Array([
            2/(r-l),0,0,0,
            0,2/(t-b),0,0,
            0,0,-2/(f-n),0,
            -(r+l)/(r-l),-(t+b)/(t-b),-(f+n)/(f-n),1
        ]);
    }

    getLookAt(eye, center, up) {
        const z = this.normalize([eye[0]-center[0], eye[1]-center[1], eye[2]-center[2]]);
        const x = this.normalize(this.cross(up, z));
        const y = this.cross(z, x);
        return new Float32Array([
            x[0],y[0],z[0],0,
            x[1],y[1],z[1],0,
            x[2],y[2],z[2],0,
            -this.dot(x,eye),-this.dot(y,eye),-this.dot(z,eye),1
        ]);
    }

    normalize(v) {
        const d = Math.sqrt(v[0]*v[0]+v[1]*v[1]+v[2]*v[2]);
        return d===0 ? [0,0,0] : [v[0]/d,v[1]/d,v[2]/d];
    }
    cross(a,b) { return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]; }
    dot(a,b)   { return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]; }

    makeYRotation(yawDeg) {
        const r = (yawDeg * Math.PI) / 180;
        const c = Math.cos(r), s = Math.sin(r);
        return new Float32Array([
             c, 0,-s, 0,
             0, 1, 0, 0,
             s, 0, c, 0,
             0, 0, 0, 1
        ]);
    }

    makeTRS(tx, ty, tz, yawDeg, sx, sy, sz) {
        const r = (yawDeg * Math.PI) / 180;
        const c = Math.cos(r), s = Math.sin(r);
        return new Float32Array([
            sx* c,  0, sx*-s, 0,
            0,      sy, 0,   0,
            sz* s,  0, sz* c, 0,
            tx,     ty,    tz, 1
        ]);
    }

    // ─── 메인 렌더 루프 ───────────────────────────────────────────
    drawWorld(player, cam, remotePlayers, mapData) {
        const gl = this.gl;
        if (!mapData) return;

        if (this.lightAngle === undefined) this.lightAngle = 0;
        
        const lx = Math.sin(this.lightAngle) * 20 + 15;
        const lz = Math.cos(this.lightAngle) * 10 + 15;
        const lightPos = [lx, 30, lz];
        const lightDir = this.normalize(lightPos);

        const lightProj = this.getOrtho(-50, 50, -50, 50, 0.1, 100);
        const lightView = this.getLookAt(lightPos, [0, 0, 0], [0, 1, 0]);
        const lightMatrix = this.multiplyMatrices(lightProj, lightView);

        // Pass 1: 그림자 맵 생성
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFB);
        gl.viewport(0, 0, this.shadowSize, this.shadowSize);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.useProgram(this.shadowProg);
        this.renderScene(gl, this.shadowProg, lightMatrix, null, mapData, player, remotePlayers, true);

        // Pass 2: 화면 렌더링
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.useProgram(this.mainProg);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
        gl.uniform1i(gl.getUniformLocation(this.mainProg, "uShadowMap"), 0);
        gl.uniform3fv(gl.getUniformLocation(this.mainProg, "uViewPos"),    player.pos);
        gl.uniform3fv(gl.getUniformLocation(this.mainProg, "uLightDir"),   lightDir);
        gl.uniformMatrix4fv(gl.getUniformLocation(this.mainProg, "uLightMatrix"), false, lightMatrix);

        this.renderScene(gl, this.mainProg, cam.viewMatrix, cam.projectionMatrix, mapData, player, remotePlayers, false);
    }

    renderScene(gl, prog, view, proj, mapData, player, remotePlayers, isShadow) {
        const uModel = gl.getUniformLocation(prog, "uModel");
        const uView  = gl.getUniformLocation(prog, "uView");
        const uProj  = gl.getUniformLocation(prog, "uProj");
        const uColor = gl.getUniformLocation(prog, "uColor");
        const aPos    = gl.getAttribLocation(prog, "aPos");
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

        // ── 1. 바닥 ──────────────────────────────────
        if (!isShadow) gl.uniform4fv(uColor, [0.30, 0.52, 0.28, 1.0]);
        const groundModel = new Float32Array([
            50, 0, 0, 0,
             0, 0.05, 0, 0,
             0, 0, 50, 0,
             0, -0.025, 0, 1
        ]);
        gl.uniformMatrix4fv(uModel, false, groundModel);
        gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);

        // ── 2. 맵 오브젝트 ─────────────────────────────────────────
        if (!isShadow) gl.uniform4fv(uColor, [0.75, 0.75, 0.75, 1.0]);
        for (const box of mapData) {
            const m = new Float32Array([
                box.scale[0], 0, 0, 0,
                0, box.scale[1], 0, 0,
                0, 0, box.scale[2], 0,
                box.pos[0], box.pos[1], box.pos[2], 1
            ]);
            gl.uniformMatrix4fv(uModel, false, m);
            gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);
        }

        // ── 3. 원격 플레이어 ───────────────────────────
        if (remotePlayers) {
            for (const id in remotePlayers) {
                const p = remotePlayers[id];
                if (!p.pos) continue;
                const yaw = (p.yaw !== undefined) ? p.yaw : 0;
                this.drawHumanoid(gl, prog, uModel, uColor, isShadow,
                    p.pos[0], p.pos[1], p.pos[2], yaw,
                    true);
            }
        }
        
        // ── 4. 로컬 플레이어 (나 자신도 화면에 표시할 경우) ────────────────
        if (player && player.pos) {
            const yaw = (player.yaw !== undefined) ? player.yaw : 0;
            // 1인칭이라 내가 안 보여야 하면 이 블록은 지우셔도 됩니다.
            this.drawHumanoid(gl, prog, uModel, uColor, isShadow,
                player.pos[0], player.pos[1], player.pos[2], yaw,
                false);
        }
    }

    drawHumanoid(gl, prog, uModel, uColor, isShadow, bx, by, bz, yawDeg, isEnemy) {
        if (!this._t) this._t = 0;
        this._t += 0.04;

        const swing = Math.sin(this._t) * 0.12;
        const legSwing = Math.sin(this._t) * 0.10;
        
        // [FIX 3] 워킹밥: 걷을 때 위아래로 몸이 살짝 뜁니다 (사인 그래프의 절댓값 이용)
        const walkBob = Math.abs(Math.sin(this._t * 2)) * 0.05;

        // [FIX 2] 공중 부양 해결: player.pos[1]이 1.0일 때 발끝이 0.0에 닿도록 0.92를 빼줍니다.
        // 그리고 거기에 워킹밥(walkBob)을 더해줍니다.
        const adjustedBy = by - 0.92 + walkBob;

        const skinColor  = [0.85, 0.70, 0.58, 1.0];
        const bodyColor  = isEnemy ? [0.80, 0.12, 0.12, 1.0] : [0.12, 0.30, 0.80, 1.0];
        const pantsColor = isEnemy ? [0.50, 0.08, 0.08, 1.0] : [0.08, 0.15, 0.50, 1.0];
        const shoeColor  = [0.18, 0.14, 0.10, 1.0];

        const drawPart = (lx, ly, lz, sx, sy, sz, color) => {
            if (!isShadow) gl.uniform4fv(uColor, color);

            const rad = (yawDeg * Math.PI) / 180;
            const c = Math.cos(rad), s = Math.sin(rad);

            // 로컬 오프셋에 회전 적용
            const rx = lx * c - lz * s;
            const rz = lx * s + lz * c;

            const wx = bx + rx;
            const wy = adjustedBy + ly; // 보정된 Y값 사용
            const wz = bz + rz;

            // [FIX 1] makeTRS를 이용해 모델 자체의 방향 회전까지 한 번에 적용
            const m = this.makeTRS(wx, wy, wz, yawDeg, sx, sy, sz);
            gl.uniformMatrix4fv(uModel, false, m);
            gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);
        };

        // ── 머리 ──
        drawPart(0,    1.69, 0,    0.25, 0.28, 0.25, skinColor);
        // ── 목 ──
        drawPart(0,    1.47, 0,    0.08, 0.10, 0.08, skinColor);
        // ── 몸통 ──
        drawPart(0,    1.13, 0,    0.28, 0.35, 0.18, bodyColor);
        // ── 골반 ──
        drawPart(0,    0.73, 0,    0.24, 0.14, 0.16, pantsColor);

        // ── 왼쪽 위팔 ──
        drawPart(-0.42, 1.05 + swing, 0, 0.10, 0.28, 0.10, bodyColor);
        // ── 왼쪽 전완 ──
        drawPart(-0.42, 0.67 + swing * 0.5, 0, 0.08, 0.23, 0.08, skinColor);

        // ── 오른쪽 위팔 ──
        drawPart( 0.42, 1.05 - swing, 0, 0.10, 0.28, 0.10, bodyColor);
        // ── 오른쪽 전완 ──
        drawPart( 0.42, 0.67 - swing * 0.5, 0, 0.08, 0.23, 0.08, skinColor);

        // ── 왼쪽 허벅지 ──
        drawPart(-0.13, 0.49 + legSwing, 0, 0.11, 0.26, 0.11, pantsColor);
        // ── 왼쪽 정강이 ──
        drawPart(-0.13, 0.14 + legSwing * 0.5, 0, 0.09, 0.24, 0.09, pantsColor);
        // ── 왼쪽 발 ──
        drawPart(-0.13, -0.08, 0.04, 0.10, 0.06, 0.14, shoeColor);

        // ── 오른쪽 허벅지 ──
        drawPart( 0.13, 0.49 - legSwing, 0, 0.11, 0.26, 0.11, pantsColor);
        // ── 오른쪽 정강이 ──
        drawPart( 0.13, 0.14 - legSwing * 0.5, 0, 0.09, 0.24, 0.09, pantsColor);
        // ── 오른쪽 발 ──
        drawPart( 0.13, -0.08, 0.04, 0.10, 0.06, 0.14, shoeColor);
    }
}
