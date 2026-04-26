export class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.gl = canvas.getContext('webgl', { antialias: true, alpha: false }) ||
                  canvas.getContext('experimental-webgl');
        if (!this.gl) { alert("WebGL 미지원 환경입니다."); return; }

        this.shadowSize = 2048;
        this.initShaders();
        this.initShadowFramebuffer();
        this.initBuffers();

        this.gl.enable(this.gl.DEPTH_TEST);
        this.gl.enable(this.gl.CULL_FACE);
        this.gl.clearColor(0.53, 0.81, 0.98, 1.0); // 하늘색
    }

    initShaders() {
        const gl = this.gl;

        // ── Shadow Pass: 깊이를 RGBA에 팩킹 ───────────────────────
        const vsShadow = `
            attribute vec4 aPos;
            uniform mat4 uLightMVP, uModel;
            void main() { gl_Position = uLightMVP * uModel * aPos; }
        `;
        const fsShadow = `
            precision highp float;
            void main() {
                float d = gl_FragCoord.z;
                vec4 s = vec4(1.0, 256.0, 65536.0, 16777216.0);
                vec4 m = vec4(1.0/256.0, 1.0/256.0, 1.0/256.0, 0.0);
                vec4 r = fract(d * s);
                gl_FragColor = r - r.yzww * m;
            }
        `;

        // ── Main Pass: Blinn-Phong + PCF 소프트섀도우 ─────────────
        // 바닥·벽·박스·캐릭터 모두 동일 셰이더로 그림자 수신
        const vsMain = `
            attribute vec4 aPos;
            attribute vec3 aNormal;
            uniform mat4 uModel, uView, uProj, uLightMVP;
            varying vec3 vNormal, vWorldPos;
            varying vec4 vShadowCoord;
            void main() {
                vec4 wp    = uModel * aPos;
                vWorldPos  = wp.xyz;
                // 법선: 비균등 스케일에도 올바른 법선을 위해 역전치 사용
                // (균등 스케일만 사용하므로 단순 회전 추출로 충분)
                vNormal     = normalize(mat3(uModel) * aNormal);
                vShadowCoord = uLightMVP * wp;
                gl_Position  = uProj * uView * wp;
            }
        `;
        const fsMain = `
            precision highp float;
            varying vec3 vNormal, vWorldPos;
            varying vec4 vShadowCoord;
            uniform vec4      uColor;
            uniform vec3      uCamPos, uLightDir;
            uniform sampler2D uShadowMap;

            float unpack(vec4 c) {
                return dot(c, vec4(1.0, 1.0/256.0, 1.0/65536.0, 1.0/16777216.0));
            }

            // PCF 5x5 소프트 섀도우
            float shadowFactor(vec4 sc, vec3 n, vec3 ld) {
                vec3 proj = sc.xyz / sc.w * 0.5 + 0.5;

                // 뷰 프러스텀 밖은 그림자 없음
                if (proj.x < 0.0 || proj.x > 1.0 ||
                    proj.y < 0.0 || proj.y > 1.0 ||
                    proj.z > 1.0) return 1.0;

                float bias   = max(0.006 * (1.0 - dot(n, ld)), 0.0008);
                float shadow = 0.0;
                float texel  = 1.0 / 2048.0;

                for (float x = -2.0; x <= 2.0; x += 1.0) {
                    for (float y = -2.0; y <= 2.0; y += 1.0) {
                        float depth = unpack(texture2D(uShadowMap,
                                        proj.xy + vec2(x, y) * texel));
                        shadow += (proj.z - bias > depth) ? 0.30 : 1.0;
                    }
                }
                return shadow / 25.0;
            }

            void main() {
                vec3 n  = normalize(vNormal);
                vec3 ld = normalize(uLightDir);
                vec3 vd = normalize(uCamPos - vWorldPos);
                vec3 h  = normalize(ld + vd);

                float sh   = shadowFactor(vShadowCoord, n, ld);
                float diff = max(dot(n, ld), 0.0);
                float spec = pow(max(dot(n, h), 0.0), 64.0);

                vec3 ambient  = uColor.rgb * 0.38;
                vec3 diffuse  = uColor.rgb * diff;
                vec3 specular = vec3(0.4) * spec;

                gl_FragColor = vec4(ambient + (diffuse + specular) * sh, uColor.a);
            }
        `;

        this.shadowProg = this.createProgram(vsShadow, fsShadow);
        this.mainProg   = this.createProgram(vsMain,   fsMain);
    }

    createProgram(vsS, fsS) {
        const gl = this.gl;
        const compile = (type, src) => {
            const s = gl.createShader(type);
            gl.shaderSource(s, src); gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
                console.error(gl.getShaderInfoLog(s));
            return s;
        };
        const p = gl.createProgram();
        gl.attachShader(p, compile(gl.VERTEX_SHADER,   vsS));
        gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fsS));
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS))
            console.error("Link error:", gl.getProgramInfoLog(p));
        return p;
    }

    initShadowFramebuffer() {
        const gl = this.gl;
        this.shadowTex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA,
            this.shadowSize, this.shadowSize, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        const rb = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
        gl.renderbufferStorage(gl.RENDERBUFFER,
            gl.DEPTH_COMPONENT16, this.shadowSize, this.shadowSize);

        this.shadowFB = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFB);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
            gl.TEXTURE_2D, this.shadowTex, 0);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT,
            gl.RENDERBUFFER, rb);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    initBuffers() {
        const gl = this.gl;
        const s  = 1.0;
        // pos(3) + normal(3), stride=24
        const verts = new Float32Array([
            -s,-s, s, 0,0,1,   s,-s, s, 0,0,1,   s, s, s, 0,0,1,  -s, s, s, 0,0,1,
            -s,-s,-s, 0,0,-1, -s, s,-s, 0,0,-1,   s, s,-s, 0,0,-1,  s,-s,-s, 0,0,-1,
            -s, s,-s, 0,1,0,  -s, s, s, 0,1,0,    s, s, s, 0,1,0,   s, s,-s, 0,1,0,
            -s,-s,-s, 0,-1,0,  s,-s,-s, 0,-1,0,   s,-s, s, 0,-1,0, -s,-s, s, 0,-1,0,
             s,-s,-s, 1,0,0,   s, s,-s, 1,0,0,    s, s, s, 1,0,0,   s,-s, s, 1,0,0,
            -s,-s,-s,-1,0,0,  -s,-s, s,-1,0,0,   -s, s, s,-1,0,0,  -s, s,-s,-1,0,0
        ]);
        this.cubeBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.cubeBuf);
        gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);

        const idx = [];
        for (let i = 0; i < 24; i += 4) idx.push(i,i+1,i+2, i,i+2,i+3);
        this.idxBuf = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.idxBuf);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
    }

    // ── 행렬 수학 ──────────────────────────────────────────────────
    mulMat(a, b) {
        const r = new Float32Array(16);
        for (let i = 0; i < 4; i++)
            for (let j = 0; j < 4; j++)
                r[i*4+j] = a[i*4]*b[j] + a[i*4+1]*b[4+j] +
                            a[i*4+2]*b[8+j] + a[i*4+3]*b[12+j];
        return r;
    }
    ortho(l,r,b,t,n,f) {
        return new Float32Array([
            2/(r-l),0,0,0, 0,2/(t-b),0,0, 0,0,-2/(f-n),0,
            -(r+l)/(r-l), -(t+b)/(t-b), -(f+n)/(f-n), 1
        ]);
    }
    lookAt(eye, ctr, up) {
        const z = this.norm([eye[0]-ctr[0], eye[1]-ctr[1], eye[2]-ctr[2]]);
        const x = this.norm(this.cross(up, z));
        const y = this.cross(z, x);
        return new Float32Array([
            x[0],y[0],z[0],0, x[1],y[1],z[1],0, x[2],y[2],z[2],0,
            -this.dot(x,eye), -this.dot(y,eye), -this.dot(z,eye), 1
        ]);
    }
    norm(v)    { const d=Math.hypot(...v); return d<1e-8?[0,0,0]:[v[0]/d,v[1]/d,v[2]/d]; }
    cross(a,b) { return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]; }
    dot(a,b)   { return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]; }

    // ── 메인 렌더 ──────────────────────────────────────────────────
    drawWorld(player, cam, remotePlayers, mapData) {
        const gl = this.gl;
        if (!mapData) return;

        // 광원 위치 — 맵 북서쪽 높은 곳 (고정 태양)
        // 변경 원하면 lightPos를 시간 기반으로 움직이면 됩니다
        const lightPos = [20, 35, 20];
        const lightDir = this.norm(lightPos);

        // 라이트 뷰 행렬: 광원 → 맵 중심을 바라봄
        const lightView = this.lookAt(lightPos, [0, 0, 0], [0, 1, 0]);

        // 직교 투영: 맵 전체를 포함하는 넉넉한 범위
        // 맵이 ±30 범위에 분포하므로 충분히 커야 그림자가 잘림 없이 생김
        const lightProj   = this.ortho(-45, 45, -45, 45, 1.0, 90);
        const lightMVP    = this.mulMat(lightProj, lightView);

        // ── Pass 1: 그림자 맵 ──────────────────────────────────────
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFB);
        gl.viewport(0, 0, this.shadowSize, this.shadowSize);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.useProgram(this.shadowProg);
        this._renderScene(lightMVP, null, mapData, player, remotePlayers, true);

        // ── Pass 2: 메인 패스 ─────────────────────────────────────
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.useProgram(this.mainProg);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
        gl.uniform1i( gl.getUniformLocation(this.mainProg, "uShadowMap"), 0);
        gl.uniform3fv(gl.getUniformLocation(this.mainProg, "uCamPos"),   player.pos);
        gl.uniform3fv(gl.getUniformLocation(this.mainProg, "uLightDir"), lightDir);
        gl.uniformMatrix4fv(gl.getUniformLocation(this.mainProg, "uLightMVP"),
            false, lightMVP);

        this._renderScene(cam.viewMatrix, cam.projectionMatrix,
            mapData, player, remotePlayers, false);
    }

    _renderScene(view, proj, mapData, player, remotePlayers, isShadow) {
        const gl   = this.gl;
        const prog = isShadow ? this.shadowProg : this.mainProg;

        // 유니폼 로케이션
        const uModel = gl.getUniformLocation(prog, "uModel");
        const uLMVP  = gl.getUniformLocation(prog, isShadow ? "uLightMVP" : "uLightMVP");
        const uView  = gl.getUniformLocation(prog, "uView");
        const uProj  = gl.getUniformLocation(prog, "uProj");
        const uColor = gl.getUniformLocation(prog, "uColor");

        if (!isShadow) {
            gl.uniformMatrix4fv(uView, false, view);
            gl.uniformMatrix4fv(uProj, false, proj);
        } else {
            // 섀도우 패스: uLightMVP 가 view 역할
            gl.uniformMatrix4fv(gl.getUniformLocation(prog, "uLightMVP"), false, view);
        }

        // 버텍스 속성 설정
        gl.bindBuffer(gl.ARRAY_BUFFER, this.cubeBuf);
        const aPos    = gl.getAttribLocation(prog, "aPos");
        const aNormal = gl.getAttribLocation(prog, "aNormal");
        gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 24, 0);
        gl.enableVertexAttribArray(aPos);
        if (!isShadow && aNormal >= 0) {
            gl.vertexAttribPointer(aNormal, 3, gl.FLOAT, false, 24, 12);
            gl.enableVertexAttribArray(aNormal);
        }
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.idxBuf);

        const draw = (model, color) => {
            if (!isShadow && color) gl.uniform4fv(uColor, color);
            gl.uniformMatrix4fv(uModel, false, model);
            gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);
        };

        const scaleM = (px,py,pz, sx,sy,sz) => new Float32Array([
            sx,0,0,0, 0,sy,0,0, 0,0,sz,0, px,py,pz,1
        ]);

        // ── 1. 바닥 ───────────────────────────────────────────────
        // 반드시 그림자 패스에도 그려야 바닥에 그림자가 맺힘
        draw(scaleM(0,-0.05,0, 60,0.05,60), [0.28,0.50,0.24,1]);

        // ── 2. 맵 오브젝트 ────────────────────────────────────────
        for (const box of mapData) {
            // 지형 박스 색상: y 높이로 구분
            let color = [0.70,0.68,0.62,1]; // 기본 콘크리트
            if (box.tag === 'wall')     color = [0.60,0.55,0.48,1];
            if (box.tag === 'platform') color = [0.55,0.72,0.48,1]; // 초록 플랫폼
            if (box.tag === 'ramp')     color = [0.65,0.60,0.50,1];
            draw(scaleM(...box.pos, ...box.scale), color);
        }

        // ── 3. 원격 플레이어 ─────────────────────────────────────
        if (remotePlayers && !isShadow) {
            for (const id in remotePlayers) {
                const p = remotePlayers[id];
                if (!p.pos) continue;
                this._drawHumanoid(p.pos[0], p.pos[1], p.pos[2],
                    p.yaw ?? 0, true, isShadow, uModel, uColor);
            }
        } else if (remotePlayers && isShadow) {
            // 그림자 패스에도 캐릭터 실루엣 포함
            for (const id in remotePlayers) {
                const p = remotePlayers[id];
                if (!p.pos) continue;
                this._drawHumanoid(p.pos[0], p.pos[1], p.pos[2],
                    p.yaw ?? 0, true, isShadow, uModel, uColor);
            }
        }
    }

    // ── 인체 모델 (15파츠) ─────────────────────────────────────────
    // 발바닥 기준 y=by (by = player.pos[1])
    _drawHumanoid(bx, by, bz, yawDeg, isEnemy, isShadow, uModel, uColor) {
        const gl = this.gl;

        if (!this._animT) this._animT = 0;
        this._animT += 0.04;
        const sw  = Math.sin(this._animT) * 0.10;
        const lsw = Math.sin(this._animT) * 0.09;

        const skin  = [0.88,0.72,0.60,1];
        const shirt = isEnemy ? [0.80,0.12,0.12,1] : [0.15,0.35,0.80,1];
        const pants = isEnemy ? [0.48,0.08,0.08,1] : [0.08,0.18,0.52,1];
        const shoe  = [0.18,0.14,0.10,1];

        const rad = yawDeg * Math.PI / 180;
        const c = Math.cos(rad), s = Math.sin(rad);

        const part = (lx,ly,lz, sx,sy,sz, color) => {
            if (!isShadow) {
                const p = this.mainProg;
                gl.uniform4fv(uColor, color);
            }
            const rx = lx*c - lz*s;
            const rz = lx*s + lz*c;
            const m  = new Float32Array([
                sx,0,0,0, 0,sy,0,0, 0,0,sz,0,
                bx+rx, by+ly, bz+rz, 1
            ]);
            gl.uniformMatrix4fv(uModel, false, m);
            gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);
        };

        part(0,    1.72, 0,    0.24,0.27,0.24, skin);   // 머리
        part(0,    1.50, 0,    0.08,0.09,0.08, skin);   // 목
        part(0,    1.15, 0,    0.27,0.33,0.17, shirt);  // 몸통
        part(0,    0.76, 0,    0.22,0.13,0.15, pants);  // 골반
        part(-0.40, 1.08+sw,  0, 0.10,0.27,0.10, shirt); // 왼팔
        part(-0.40, 0.68+sw*0.5,0,0.08,0.22,0.08,skin);  // 왼 전완
        part( 0.40, 1.08-sw,  0, 0.10,0.27,0.10, shirt); // 오른팔
        part( 0.40, 0.68-sw*0.5,0,0.08,0.22,0.08,skin);  // 오른 전완
        part(-0.13, 0.50+lsw, 0, 0.11,0.25,0.11, pants); // 왼 허벅지
        part(-0.13, 0.15+lsw*0.5,0,0.09,0.23,0.09,pants);// 왼 정강이
        part(-0.13,-0.07,0.04, 0.10,0.06,0.13, shoe);     // 왼발
        part( 0.13, 0.50-lsw, 0, 0.11,0.25,0.11, pants);  // 오른 허벅지
        part( 0.13, 0.15-lsw*0.5,0,0.09,0.23,0.09,pants); // 오른 정강이
        part( 0.13,-0.07,0.04, 0.10,0.06,0.13, shoe);      // 오른발
    }
}
