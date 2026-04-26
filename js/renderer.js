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
        this.gl.clearColor(0.53, 0.81, 0.98, 1.0);
    }

    initShaders() {
        const gl = this.gl;

        const vsShadow = `
            attribute vec4 aPos;
            uniform mat4 uLightMVP, uModel;
            void main() { gl_Position = uLightMVP * uModel * aPos; }
        `;
        
        const fsShadow = `
            precision highp float;
            void main() {
                float d = gl_FragCoord.z;
                vec4 s  = vec4(1.0, 256.0, 65536.0, 16777216.0);
                vec4 r  = fract(d * s);
                gl_FragColor = r - r.yzww * vec4(1.0/256.0, 1.0/256.0, 1.0/256.0, 0.0);
            }
        `;

        const vsMain = `
            attribute vec4 aPos;
            attribute vec3 aNormal;
            uniform mat4 uModel, uView, uProj, uLightMVP;
            varying vec3 vNormal, vWorldPos;
            varying vec4 vShadowCoord;
            void main() {
                vec4 wp      = uModel * aPos;
                vWorldPos    = wp.xyz;
                vNormal      = normalize(mat3(uModel) * aNormal);
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

            float shadowFactor(vec4 sc, vec3 n, vec3 ld) {
                vec3 proj = sc.xyz / sc.w * 0.5 + 0.5;

                if (proj.x < 0.0 || proj.x > 1.0 ||
                    proj.y < 0.0 || proj.y > 1.0 ||
                    proj.z > 1.0) return 1.0;

                float cosTheta = clamp(dot(n, ld), 0.0, 1.0);
                // ✅ 수정: 비스듬할수록 bias 증가, 최대값 대폭 감소
                float bias = max(0.002 * (1.0 - cosTheta), 0.001);

                float shadow = 0.0;
                float texel  = 1.0 / 2048.0;

                // ✅ 수정: 모바일/엄격한 WebGL 호환성을 위해 루프를 정수형으로 변경
                for (int x = -2; x <= 2; x++) {
                    for (int y = -2; y <= 2; y++) {
                        vec2 offset = vec2(float(x), float(y)) * texel;
                        float storedDepth = unpack(texture2D(uShadowMap, proj.xy + offset));
                        shadow += (proj.z - bias > storedDepth) ? 0.30 : 1.0;
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

                vec3 col = uColor.rgb * 0.38
                         + (uColor.rgb * diff + vec3(0.4)*spec)
                           * sh;
                gl_FragColor = vec4(col, uColor.a);
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
            console.error("Link:", gl.getProgramInfoLog(p));
        return p;
    }

    initShadowFramebuffer() {
        const gl = this.gl;
        this.shadowTex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA,
            this.shadowSize, this.shadowSize, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
            
        // ✅ 수정: Packed Depth 보간 방지를 위해 NEAREST로 설정
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
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
        for (let col = 0; col < 4; col++)
            for (let row = 0; row < 4; row++)
                for (let k = 0; k < 4; k++)
                    r[col*4+row] += a[k*4+row] * b[col*4+k];
        return r;
    }
    ortho(l,r,b,t,n,f) {
        return new Float32Array([
            2/(r-l),0,0,0, 0,2/(t-b),0,0, 0,0,-2/(f-n),0,
            -(r+l)/(r-l),-(t+b)/(t-b),-(f+n)/(f-n),1
        ]);
    }
    lookAt(eye,ctr,up) {
        const z=this.norm([eye[0]-ctr[0],eye[1]-ctr[1],eye[2]-ctr[2]]);
        const x=this.norm(this.cross(up,z));
        const y=this.cross(z,x);
        return new Float32Array([
            x[0],y[0],z[0],0, x[1],y[1],z[1],0, x[2],y[2],z[2],0,
            -this.dot(x,eye),-this.dot(y,eye),-this.dot(z,eye),1
        ]);
    }
    norm(v)    { const d=Math.hypot(...v); return d<1e-8?[0,0,0]:[v[0]/d,v[1]/d,v[2]/d]; }
    cross(a,b) { return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]; }
    dot(a,b)   { return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]; }

    // ── 메인 렌더 ──────────────────────────────────────────────────
    drawWorld(player, cam, remotePlayers, mapData) {
        const gl = this.gl;
        if (!mapData) return;

        const lightPos  = [20, 40, 20];
        const lightDir  = this.norm(lightPos);
        const lightView = this.lookAt(lightPos, [0,0,0], [0,1,0]);
        const lightProj = this.ortho(-25, 25, -25, 25, 0.1, 120);
        const lightMVP  = this.mulMat(lightProj, lightView);

        // ── Pass 1: Shadow Map ─────────────────────────────────────
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFB);
        gl.viewport(0, 0, this.shadowSize, this.shadowSize);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.useProgram(this.shadowProg);
        
        // ✅ 수정: Shadow Acne 방지를 위해 앞면(FRONT)을 Cull
        gl.cullFace(gl.BACK);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.cubeBuf);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.idxBuf);
        const aPosS = gl.getAttribLocation(this.shadowProg, "aPos");
        gl.vertexAttribPointer(aPosS, 3, gl.FLOAT, false, 24, 0);
        gl.enableVertexAttribArray(aPosS);
        gl.uniformMatrix4fv(
            gl.getUniformLocation(this.shadowProg, "uLightMVP"), false, lightMVP);

        const uModelS = gl.getUniformLocation(this.shadowProg, "uModel");

        for (const box of mapData) {
            gl.uniformMatrix4fv(uModelS, false, this._scaleM(...box.pos, ...box.scale));
            gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);
        }
        if (remotePlayers) {
            for (const id in remotePlayers) {
                const p = remotePlayers[id];
                if (!p.pos) continue;
                const footY = p.pos[1] - 1.0;
                this._drawHumanoidParts(uModelS, null,
                    p.pos[0], footY, p.pos[2], p.yaw ?? 0, p.pitch ?? 0, true, true);
            }
        }

        // ── Pass 2: Main ───────────────────────────────────────────
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.useProgram(this.mainProg);

        // ✅ 수정: 메인 씬 렌더링 시에는 정상적으로 뒷면(BACK)을 Cull
        gl.cullFace(gl.BACK);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
        gl.uniform1i( gl.getUniformLocation(this.mainProg, "uShadowMap"), 0);
        gl.uniform3fv(gl.getUniformLocation(this.mainProg, "uCamPos"),   player.pos);
        gl.uniform3fv(gl.getUniformLocation(this.mainProg, "uLightDir"), lightDir);
        gl.uniformMatrix4fv(
            gl.getUniformLocation(this.mainProg, "uLightMVP"), false, lightMVP);
        gl.uniformMatrix4fv(
            gl.getUniformLocation(this.mainProg, "uView"), false, cam.viewMatrix);
        gl.uniformMatrix4fv(
            gl.getUniformLocation(this.mainProg, "uProj"), false, cam.projectionMatrix);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.cubeBuf);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.idxBuf);
        const aPosM    = gl.getAttribLocation(this.mainProg, "aPos");
        const aNormalM = gl.getAttribLocation(this.mainProg, "aNormal");
        gl.vertexAttribPointer(aPosM, 3, gl.FLOAT, false, 24, 0);
        gl.enableVertexAttribArray(aPosM);
        gl.vertexAttribPointer(aNormalM, 3, gl.FLOAT, false, 24, 12);
        gl.enableVertexAttribArray(aNormalM);

        const uModelM = gl.getUniformLocation(this.mainProg, "uModel");
        const uColorM = gl.getUniformLocation(this.mainProg, "uColor");

        // 바닥
        gl.uniform4fv(uColorM, [0.28, 0.50, 0.24, 1.0]);
        gl.uniformMatrix4fv(uModelM, false, this._scaleM(0,-0.01,0, 60,0.01,60));
        gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);

        // 맵 박스
        for (const box of mapData) {
            let color = [0.70,0.68,0.62,1.0];
            if (box.tag === 'wall')     color = [0.60,0.55,0.48,1.0];
            if (box.tag === 'platform') color = [0.55,0.72,0.48,1.0];
            if (box.tag === 'ramp')     color = [0.65,0.60,0.50,1.0];
            gl.uniform4fv(uColorM, color);
            gl.uniformMatrix4fv(uModelM, false, this._scaleM(...box.pos, ...box.scale));
            gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);
        }

        // 원격 플레이어
        if (remotePlayers) {
            for (const id in remotePlayers) {
                const p = remotePlayers[id];
                if (!p.pos) continue;
                const footY = p.pos[1] - 1.0;
                this._drawHumanoidParts(uModelM, uColorM,
                    p.pos[0], footY, p.pos[2],
                    p.yaw ?? 0, p.pitch ?? 0,
                    true, false);
            }
        }
    }

    _scaleM(px,py,pz, sx,sy,sz) {
        return new Float32Array([sx,0,0,0, 0,sy,0,0, 0,0,sz,0, px,py,pz,1]);
    }

    _drawHumanoidParts(uModel, uColor, bx, footY, bz, yawDeg, pitchDeg, isEnemy, isShadow) {
        const gl = this.gl;

        if (!this._animT) this._animT = 0;
        this._animT += 0.04;
        const sw  = Math.sin(this._animT) * 0.09;
        const lsw = Math.sin(this._animT) * 0.08;

        const skin  = [0.88, 0.72, 0.60, 1.0];
        const shirt = isEnemy ? [0.80,0.12,0.12,1.0] : [0.15,0.35,0.80,1.0];
        const pants = isEnemy ? [0.48,0.08,0.08,1.0] : [0.08,0.18,0.52,1.0];
        const shoe  = [0.20, 0.16, 0.11, 1.0];

        const yr  = yawDeg * Math.PI / 180;
        const cy  = Math.cos(yr), sy = Math.sin(yr);

        const pr   = pitchDeg * Math.PI / 180;
        const cp   = Math.cos(pr), sp = Math.sin(pr);
        const cph  = Math.cos(pr * 0.5), sph = Math.sin(pr * 0.5);

        const drawPart = (lx, ly, lz, sx, sy2, sz, color, applyPitch, pitchCos, pitchSin) => {
            if (!isShadow && uColor) gl.uniform4fv(uColor, color);

            const rx = lx * cy - lz * sy;
            const rz = lx * sy + lz * cy;

            let wx = bx + rx;
            let wy = footY + ly;
            let wz = bz + rz;

            if (applyPitch) {
                const pivotY = footY + 1.30;
                const dy     = wy - pivotY;
                const dz_rot = wz - bz;
                wy = pivotY + dy * pitchCos - dz_rot * pitchSin;
                wz = bz     + dy * pitchSin + dz_rot * pitchCos;
            }

            const m = new Float32Array([sx,0,0,0, 0,sy2,0,0, 0,0,sz,0, wx,wy,wz,1]);
            gl.uniformMatrix4fv(uModel, false, m);
            gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);
        };

        const B  = false;
        const UP = true;

        drawPart(-0.13, 0.50+lsw,     0, 0.11,0.24,0.11, pants, B,  1,0);
        drawPart(-0.13, 0.14+lsw*0.5, 0, 0.09,0.22,0.09, pants, B,  1,0);
        drawPart(-0.13,-0.01,       0.04, 0.10,0.06,0.13, shoe,  B,  1,0);
        drawPart( 0.13, 0.50-lsw,     0, 0.11,0.24,0.11, pants, B,  1,0);
        drawPart( 0.13, 0.14-lsw*0.5, 0, 0.09,0.22,0.09, pants, B,  1,0);
        drawPart( 0.13,-0.01,       0.04, 0.10,0.06,0.13, shoe,  B,  1,0);
        drawPart( 0,    0.76,          0, 0.22,0.13,0.15, pants, B,  1,0);

        drawPart( 0,    1.15,          0, 0.27,0.33,0.17, shirt, UP, cph,sph);
        drawPart(-0.40, 1.08+sw,       0, 0.10,0.27,0.10, shirt, UP, cph,sph);
        drawPart(-0.40, 0.68+sw*0.5,   0, 0.08,0.22,0.08, skin,  UP, cph,sph);
        drawPart( 0.40, 1.08-sw,       0, 0.10,0.27,0.10, shirt, UP, cph,sph);
        drawPart( 0.40, 0.68-sw*0.5,   0, 0.08,0.22,0.08, skin,  UP, cph,sph);

        drawPart( 0,    1.50,          0, 0.08,0.09,0.08, skin,  UP, cp, sp);
        drawPart( 0,    1.72,          0, 0.24,0.27,0.24, skin,  UP, cp, sp);
    }
}
