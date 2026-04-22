export class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (!this.gl) { alert("WebGL 지원 불가"); return; }

        this.shadowSize = 2048; // 그림자 해상도 (고화질)
        this.initShaders();
        this.initShadowFramebuffer();
        this.initBuffers();
    }

    initShaders() {
        const gl = this.gl;

        // 1. Shadow Map Shader: 빛의 관점에서 깊이 기록
        const vsShadow = `
            attribute vec4 aPos;
            uniform mat4 uLightMatrix;
            uniform mat4 uModel;
            void main() {
                gl_Position = uLightMatrix * uModel * aPos;
            }
        `;
        const fsShadow = `
            precision mediump float;
            void main() {
                // RGBA 채널에 깊이 값을 인코딩하여 저장 (정밀도 향상)
                gl_FragColor = vec4(gl_FragCoord.z, gl_FragCoord.z, gl_FragCoord.z, 1.0);
            }
        `;

        // 2. Main Shader: Shadow + Specular + Diffuse + Ambient
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
            precision mediump float;
            varying vec3 vNormal, vPos;
            varying vec4 vShadowPos;
            uniform vec4 uColor;
            uniform vec3 uViewPos;
            uniform sampler2D uShadowMap;

            void main() {
                vec3 normal = normalize(vNormal);
                vec3 lightPos = vec3(10.0, 20.0, 10.0);
                vec3 lightDir = normalize(lightPos);
                vec3 viewDir = normalize(uViewPos - vPos);
                
                // Shadow 계산
                vec3 shadowCoord = (vShadowPos.xyz / vShadowPos.w) * 0.5 + 0.5;
                float currentDepth = shadowCoord.z;
                float closestDepth = texture2D(uShadowMap, shadowCoord.xy).r;
                float bias = max(0.05 * (1.0 - dot(normal, lightDir)), 0.005);
                float shadow = (currentDepth - bias > closestDepth) ? 0.5 : 1.0;

                // Diffuse (난반사)
                float diff = max(dot(normal, lightDir), 0.0);
                vec3 diffuse = diff * uColor.rgb;

                // Specular (햇빛 반사 - 반짝임)
                vec3 reflectDir = reflect(-lightDir, normal);
                float spec = pow(max(dot(viewDir, reflectDir), 0.0), 64.0);
                vec3 specular = spec * vec3(1.0, 1.0, 0.9); // 약간 노란빛 햇살

                // Ambient (기본 주변광)
                vec3 ambient = 0.2 * uColor.rgb;

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
        const data = new Float32Array([
            // Pos(3), Normal(3)
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
        const idx = [0,1,2, 0,2,3, 4,5,6, 4,6,7, 8,9,10, 8,10,11, 12,13,14, 12,14,15, 16,17,18, 16,18,19, 20,21,22, 20,22,23];
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
    }

    drawWorld(player, cam, remotePlayers, mapData) {
        const gl = this.gl;
        if (!mapData) return;

        // 빛의 시점 행렬 계산 (그림자용)
        const lightProj = this.ortho(-20, 20, -20, 20, 0.1, 50);
        const lightView = this.lookAt([10, 20, 10], [0, 0, 0], [0, 1, 0]);
        const lightMatrix = this.multiplyMatrices(lightProj, lightView);

        // Pass 1: Shadow Map 생성
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFB);
        gl.viewport(0, 0, this.shadowSize, this.shadowSize);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.DEPTH_TEST);
        gl.useProgram(this.shadowProg);
        this.renderScene(gl, this.shadowProg, lightMatrix, null, mapData, true);

        // Pass 2: 실제 렌더링
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        gl.clearColor(0.4, 0.6, 0.9, 1.0);
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

        // 바닥
        gl.uniform4fv(uColor, [0.2, 0.4, 0.2, 1.0]);
        gl.uniformMatrix4fv(uModel, false, new Float32Array([100,0,0,0, 0,0.1,0,0, 0,0,100,0, 0,0,0,1]));
        gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);

        // 장애물
        gl.uniform4fv(uColor, [0.7, 0.7, 0.7, 1.0]);
        mapData.forEach(box => {
            const m = new Float32Array([box.scale[0],0,0,0, 0,box.scale[1],0,0, 0,0,box.scale[2],0, box.pos[0],box.pos[1],box.pos[2],1]);
            gl.uniformMatrix4fv(uModel, false, m);
            gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);
        });

        // 타인
        if (remotePlayers && !isShadow) {
            gl.uniform4fv(uColor, [0.9, 0.2, 0.2, 1.0]);
            for (let id in remotePlayers) {
                const p = remotePlayers[id];
                if (!p.pos) continue;
                const m = new Float32Array([0.5,0,0,0, 0,1,0,0, 0,0,0.5,0, p.pos[0], p.pos[1], p.pos[2], 1]);
                gl.uniformMatrix4fv(uModel, false, m);
                gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);
            }
        }
    }

    // --- 수학 도우미 함수 ---
    ortho(l, r, b, t, n, f) {
        return new Float32Array([2/(r-l),0,0,0, 0,2/(t-b),0,0, 0,0,-2/(f-n),0, -(r+l)/(r-l),-(t+b)/(t-b),-(f+n)/(f-n),1]);
    }
    lookAt(eye, center, up) {
        const z = this.normalize([eye[0]-center[0], eye[1]-center[1], eye[2]-center[2]]);
        const x = this.normalize(this.cross(up, z));
        const y = this.cross(z, x);
        return new Float32Array([x[0],y[0],z[0],0, x[1],y[1],z[1],0, x[2],y[2],z[2],0, -this.dot(x,eye),-this.dot(y,eye),-this.dot(z,eye),1]);
    }
    multiplyMatrices(a, b) {
        const out = new Float32Array(16);
        for(let i=0;i<4;i++) for(let j=0;j<4;j++) for(let k=0;k<4;k++) out[i*4+j]+=a[i*4+k]*b[k*4+j];
        return out;
    }
    normalize(v) { const d=Math.sqrt(v[0]*v[0]+v[1]*v[1]+v[2]*v[2]); return [v[0]/d, v[1]/d, v[2]/d]; }
    cross(a,b) { return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]; }
    dot(a,b) { return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]; }
}
