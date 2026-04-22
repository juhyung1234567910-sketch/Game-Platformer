export class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        
        // 그림자용 텍스처 크기 (사양에 따라 512, 1024, 2048 조절)
        this.shadowSize = 1024;
        
        this.initShaders();
        this.initShadowFramebuffer(); // 그림자 전용 버퍼 추가
        this.initBuffers();
    }

    initShaders() {
        const gl = this.gl;

        // 1. 그림자 생성용 쉐이더 (Depth Shader)
        const vsShadow = `attribute vec4 aPos; uniform mat4 uLightMatrix; uniform mat4 uModel; void main(){ gl_Position = uLightMatrix * uModel * aPos; }`;
        const fsShadow = `precision mediump float; void main(){ }`; // 깊이값만 저장

        // 2. 메인 렌더링 쉐이더 (Shadow + Specular + Diffuse)
        const vsMain = `
            attribute vec4 aPos;
            attribute vec3 aNormal;
            uniform mat4 uModel, uView, uProj, uLightMatrix;
            varying vec3 vNormal, vPos;
            varying vec4 vShadowPos;
            void main() {
                vec4 worldPos = uModel * aPos;
                gl_Position = uProj * uView * worldPos;
                vPos = worldPos.xyz;
                vNormal = (uModel * vec4(aNormal, 0.0)).xyz;
                // 그림자 위치 계산
                vShadowPos = uLightMatrix * worldPos;
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
                vec3 lightDir = normalize(vec3(0.5, 1.0, 0.4));
                vec3 viewDir = normalize(uViewPos - vPos);
                
                // 1. 그림자 판정 (Shadow Calculation)
                vec3 shadowCoord = (vShadowPos.xyz / vShadowPos.w) * 0.5 + 0.5;
                float depth = texture2D(uShadowMap, shadowCoord.xy).r;
                float bias = 0.005; 
                float shadow = (shadowCoord.z - bias > depth) ? 0.5 : 1.0;

                // 2. 난반사 (Diffuse)
                float diff = max(dot(normal, lightDir), 0.3);

                // 3. 햇빛 반사 (Specular - Phong Reflection)
                vec3 reflectDir = reflect(-lightDir, normal);
                float spec = pow(max(dot(viewDir, reflectDir), 0.0), 32.0) * 0.7;

                gl_FragColor = vec4(uColor.rgb * diff * shadow + spec, uColor.a);
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
            -s,-s,s, 0,0,1, s,-s,s, 0,0,1, s,s,s, 0,0,1, -s,s,s, 0,0,1, // 앞
            -s,-s,-s, 0,0,-1, -s,s,-s, 0,0,-1, s,s,-s, 0,0,-1, s,-s,-s, 0,0,-1, // 뒤
            -s,s,-s, 0,1,0, -s,s,s, 0,1,0, s,s,s, 0,1,0, s,s,-s, 0,1,0, // 위
            -s,-s,-s, 0,-1,0, s,-s,-s, 0,-1,0, s,-s,s, 0,-1,0, -s,-s,s, 0,-1,0, // 아래
            s,-s,-s, 1,0,0, s,s,-s, 1,0,0, s,s,s, 1,0,0, s,-s,s, 1,0,0, // 우
            -s,-s,-s, -1,0,0, -s,-s,s, -1,0,0, -s,s,s, -1,0,0, -s,s,-s, -1,0,0 // 좌
        ]);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);

        this.idxBuf = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.idxBuf);
        const idx = []; for(let i=0;i<24;i+=4) idx.push(i,i+1,i+2, i,i+2,i+3);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
    }

    drawWorld(player, cam, remotePlayers, mapData) {
        const gl = this.gl;
        const lightMatrix = new Float32Array([
            0.1, 0, -0.1, 0, 
            -0.1, 0.1, -0.1, 0, 
            0, 0, 0.1, 0, 
            0, -0.5, 0, 1
        ]); // 간단한 빛 시점 행렬 (정식 계산 대신 고정값)

        // 1. 그림자 맵 생성
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFB);
        gl.viewport(0, 0, this.shadowSize, this.shadowSize);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.useProgram(this.shadowProg);
        this.renderScene(gl, this.shadowProg, lightMatrix, null, mapData, true);

        // 2. 실제 화면 렌더링
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        gl.clearColor(0.4, 0.7, 1.0, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.useProgram(this.mainProg);
        
        // 그림자 텍스처 전달
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

        if(proj) gl.uniformMatrix4fv(uProj, false, proj);
        gl.uniformMatrix4fv(uView, false, view);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.cubeBuf);
        gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 24, 0);
        gl.enableVertexAttribArray(aPos);
        if(!isShadow) {
            gl.vertexAttribPointer(aNormal, 3, gl.FLOAT, false, 24, 12);
            gl.enableVertexAttribArray(aNormal);
        }
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.idxBuf);

        // 바닥
        gl.uniform4fv(uColor, [0.3, 0.6, 0.3, 1.0]);
        gl.uniformMatrix4fv(uModel, false, new Float32Array([50,0,0,0, 0,0.1,0,0, 0,0,50,0, 0,-0.1,0,1]));
        gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);

        // 맵 상자
        gl.uniform4fv(uColor, [0.7, 0.7, 0.7, 1.0]);
        mapData.forEach(box => {
            const m = new Float32Array([box.scale[0],0,0,0, 0,box.scale[1],0,0, 0,0,box.scale[2],0, box.pos[0],box.pos[1],box.pos[2],1]);
            gl.uniformMatrix4fv(uModel, false, m);
            gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);
        });

        // 타인 캐릭터
        if(remotePlayers && !isShadow) {
            gl.uniform4fv(uColor, [1.0, 0.0, 0.0, 1.0]);
            for(let id in remotePlayers) {
                const p = remotePlayers[id];
                const m = new Float32Array([0.5,0,0,0, 0,1,0,0, 0,0,0.5,0, p.pos[0], p.pos[1], p.pos[2], 1]);
                gl.uniformMatrix4fv(uModel, false, m);
                gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);
            }
        }
    }
}
