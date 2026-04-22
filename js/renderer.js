export class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.gl = canvas.getContext('webgl', { antialias: false });
        
        if (!this.gl) {
            alert("WebGL을 사용할 수 없습니다.");
            return;
        }

        this.shadowSize = 1024; // 사양을 고려해 일단 1024로 조정
        this.initShaders();
        this.initShadowFramebuffer();
        this.initBuffers();

        this.gl.enable(this.gl.DEPTH_TEST);
        this.gl.clearColor(0.5, 0.7, 1.0, 1.0); 
    }

    // --- 쉐이더 소스 (에러 방지를 위해 가장 표준적인 문법 사용) ---
    initShaders() {
        const gl = this.gl;

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
                vec4 bitShift = vec4(1.0, 256.0, 65536.0, 16777216.0);
                vec4 bitMask = vec4(1.0/256.0, 1.0/256.0, 1.0/256.0, 0.0);
                vec4 res = fract(gl_FragCoord.z * bitShift);
                res -= res.xxyz * bitMask;
                gl_FragColor = res;
            }
        `;

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
            uniform vec3 uViewPos, uLightDir;
            uniform sampler2D uShadowMap;

            float unpackDepth(vec4 color) {
                const vec4 bitShift = vec4(1.0, 1.0/256.0, 1.0/65536.0, 1.0/16777216.0);
                return dot(color, bitShift);
            }

            void main() {
                vec3 normal = normalize(vNormal);
                vec3 lightDir = normalize(uLightDir);
                vec3 shadowCoord = (vShadowPos.xyz / vShadowPos.w) * 0.5 + 0.5;
                
                float shadow = 1.0;
                if(shadowCoord.z <= 1.0) {
                    float depth = unpackDepth(texture2D(uShadowMap, shadowCoord.xy));
                    if(shadowCoord.z - 0.005 > depth) shadow = 0.5;
                }

                float diff = max(dot(normal, lightDir), 0.2); // 최소 밝기 0.2
                gl_FragColor = vec4(uColor.rgb * diff * shadow, uColor.a);
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
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        const rb = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, this.shadowSize, this.shadowSize);

        gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFB);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.shadowTex, 0);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    initBuffers() {
        const gl = this.gl;
        this.cubeBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.cubeBuf);
        const s = 1.0;
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

    // --- 수동 행렬 연산 (외부 라이브러리 의존성 제거) ---
    getOrtho(l, r, b, t, n, f) {
        return new Float32Array([2/(r-l),0,0,0, 0,2/(t-b),0,0, 0,0,-2/(f-n),0, -(r+l)/(r-l),-(t+b)/(t-b),-(f+n)/(f-n),1]);
    }

    getLookAt(eye, center, up) {
        const z = this.normalize([eye[0]-center[0], eye[1]-center[1], eye[2]-center[2]]);
        const x = this.normalize(this.cross(up, z));
        const y = this.cross(z, x);
        return new Float32Array([x[0],y[0],z[0],0, x[1],y[1],z[1],0, x[2],y[2],z[2],0, -this.dot(x,eye),-this.dot(y,eye),-this.dot(z,eye),1]);
    }

    multiply(a, b) {
        let out = new Float32Array(16);
        for(let i=0; i<4; i++) {
            for(let j=0; j<4; j++) {
                out[i*4+j] = a[i*4+0]*b[0*4+j] + a[i*4+1]*b[1*4+j] + a[i*4+2]*b[2*4+j] + a[i*4+3]*b[3*4+j];
            }
        }
        return out;
    }

    normalize(v) { const d=Math.sqrt(v[0]*v[0]+v[1]*v[1]+v[2]*v[2]); return [v[0]/d, v[1]/d, v[2]/d]; }
    cross(a,b) { return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]; }
    dot(a,b) { return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]; }

    // --- 메인 렌더링 함수 ---
    drawWorld(player, camera, mapData, remotePlayers) {
        const gl = this.gl;

        // 1. 빛 시점 행렬 계산
        const lp = [player.pos[0] + 20, 40, player.pos[2] + 10];
        const lt = [player.pos[0], 0, player.pos[2]];
        const lProj = this.getOrtho(-40, 40, -40, 40, 1, 100);
        const lView = this.getLookAt(lp, lt, [0, 1, 0]);
        const lMat = this.multiply(lProj, lView);

        // PASS 1: Shadow Map
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFB);
        gl.viewport(0, 0, this.shadowSize, this.shadowSize);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.useProgram(this.shadowProg);
        gl.uniformMatrix4fv(gl.getUniformLocation(this.shadowProg, "uLightMatrix"), false, lMat);
        this.renderScene(this.shadowProg, mapData, remotePlayers, true);

        // PASS 2: Main
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.useProgram(this.mainProg);
        
        gl.uniformMatrix4fv(gl.getUniformLocation(this.mainProg, "uProj"), false, camera.projectionMatrix);
        gl.uniformMatrix4fv(gl.getUniformLocation(this.mainProg, "uView"), false, camera.viewMatrix);
        gl.uniformMatrix4fv(gl.getUniformLocation(this.mainProg, "uLightMatrix"), false, lMat);
        gl.uniform3fv(gl.getUniformLocation(this.mainProg, "uLightDir"), this.normalize(lp));
        gl.uniform3fv(gl.getUniformLocation(this.mainProg, "uViewPos"), player.pos);

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
        if(!isShadow) {
            gl.vertexAttribPointer(aNormal, 3, gl.FLOAT, false, 24, 12);
            gl.enableVertexAttribArray(aNormal);
        }
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.idxBuf);

        // 바닥
        if(!isShadow) gl.uniform4fv(uColor, [0.4, 0.4, 0.4, 1.0]);
        gl.uniformMatrix4fv(uModel, false, new Float32Array([100,0,0,0, 0,0.1,0,0, 0,0,100,0, 0,-0.1,0,1]));
        gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);

        // 맵 데이터 (객체 형태인 경우를 대비해 Object.values 처리)
        const boxes = Array.isArray(mapData) ? mapData : (mapData ? Object.values(mapData) : []);
        for (const box of boxes) {
            if(!box.pos || !box.scale) continue;
            const m = new Float32Array([box.scale[0],0,0,0, 0,box.scale[1],0,0, 0,0,box.scale[2],0, box.pos[0],box.pos[1],box.pos[2],1]);
            gl.uniformMatrix4fv(uModel, false, m);
            if(!isShadow) gl.uniform4fv(uColor, box.color || [0.7, 0.7, 0.7, 1.0]);
            gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);
        }
    }
}
