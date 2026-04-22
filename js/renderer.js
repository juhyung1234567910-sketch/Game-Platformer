export class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (!this.gl) {
            alert("WebGL을 지원하지 않는 브라우저입니다.");
            return;
        }
        this.initShaders();
        this.initBuffers();
    }

    initShaders() {
        const gl = this.gl;

        // 버텍스 쉐이더: 위치와 법선(Normal)을 처리하여 빛 계산 준비
        const vsSource = `
            attribute vec4 aVertexPosition;
            attribute vec3 aNormal;
            uniform mat4 uModelMatrix;
            uniform mat4 uViewMatrix;
            uniform mat4 uProjectionMatrix;
            varying vec3 vNormal;
            varying vec3 vPosition;

            void main() {
                vec4 worldPosition = uModelMatrix * aVertexPosition;
                gl_Position = uProjectionMatrix * uViewMatrix * worldPosition;
                vPosition = worldPosition.xyz;
                // 법선 벡터를 모델의 회전에 맞게 변환
                vNormal = (uModelMatrix * vec4(aNormal, 0.0)).xyz;
            }
        `;

        // 프래그먼트 쉐이더: 램버트 조명 모델(Lambertian Reflection) 적용
        const fsSource = `
            precision mediump float;
            varying vec3 vNormal;
            uniform vec4 uColor;

            void main() {
                vec3 normal = normalize(vNormal);
                vec3 lightDir = normalize(vec3(0.5, 1.0, 0.4)); // 하늘에서 내려오는 빛 방향
                
                // 빛의 세기 계산 (최소 밝기 0.3 보장)
                float diff = max(dot(normal, lightDir), 0.3);
                
                gl_FragColor = vec4(uColor.rgb * diff, uColor.a);
            }
        `;

        const vs = this.loadShader(gl.VERTEX_SHADER, vsSource);
        const fs = this.loadShader(gl.FRAGMENT_SHADER, fsSource);
        
        this.shaderProgram = gl.createProgram();
        gl.attachShader(this.shaderProgram, vs);
        gl.attachShader(this.shaderProgram, fs);
        gl.linkProgram(this.shaderProgram);

        if (!gl.getProgramParameter(this.shaderProgram, gl.LINK_STATUS)) {
            console.error("쉐이더 링크 실패: " + gl.getProgramInfoLog(this.shaderProgram));
        }

        this.programInfo = {
            attribLocations: {
                vertexPosition: gl.getAttribLocation(this.shaderProgram, 'aVertexPosition'),
                normal: gl.getAttribLocation(this.shaderProgram, 'aNormal'),
            },
            uniformLocations: {
                projectionMatrix: gl.getUniformLocation(this.shaderProgram, 'uProjectionMatrix'),
                viewMatrix: gl.getUniformLocation(this.shaderProgram, 'uViewMatrix'),
                modelMatrix: gl.getUniformLocation(this.shaderProgram, 'uModelMatrix'),
                color: gl.getUniformLocation(this.shaderProgram, 'uColor'),
            },
        };
    }

    loadShader(type, source) {
        const gl = this.gl;
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error("쉐이더 컴파일 실패: " + gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }
        return shader;
    }

    initBuffers() {
        const gl = this.gl;

        // 1. 바닥 데이터 (넓은 평면)
        this.floorBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.floorBuffer);
        // 위치(3) + 법선(3)
        const floorData = new Float32Array([
            -100, 0, 100,  0, 1, 0,
             100, 0, 100,  0, 1, 0,
            -100, 0,-100,  0, 1, 0,
             100, 0,-100,  0, 1, 0
        ]);
        gl.bufferData(gl.ARRAY_BUFFER, floorData, gl.STATIC_DRAW);

        // 2. 상자(벽/플레이어) 공용 버퍼 (정육면체 6면 전부 데이터화)
        this.cubeBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.cubeBuffer);
        const s = 1.0;
        const cubeVertices = new Float32Array([
            // 위치(x,y,z)      법선(nx,ny,nz)
            // 앞면
            -s, -s,  s,  0, 0, 1,   s, -s,  s,  0, 0, 1,   s,  s,  s,  0, 0, 1,  -s,  s,  s,  0, 0, 1,
            // 뒷면
            -s, -s, -s,  0, 0,-1,  -s,  s, -s,  0, 0,-1,   s,  s, -s,  0, 0,-1,   s, -s, -s,  0, 0,-1,
            // 윗면
            -s,  s, -s,  0, 1, 0,  -s,  s,  s,  0, 1, 0,   s,  s,  s,  0, 1, 0,   s,  s, -s,  0, 1, 0,
            // 아랫면
            -s, -s, -s,  0,-1, 0,   s, -s, -s,  0,-1, 0,   s, -s,  s,  0,-1, 0,  -s, -s,  s,  0,-1, 0,
            // 우측면
             s, -s, -s,  1, 0, 0,   s,  s, -s,  1, 0, 0,   s,  s,  s,  1, 0, 0,   s, -s,  s,  1, 0, 0,
            // 좌측면
            -s, -s, -s, -1, 0, 0,  -s, -s,  s, -1, 0, 0,  -s,  s,  s, -1, 0, 0,  -s,  s, -s, -1, 0, 0
        ]);
        gl.bufferData(gl.ARRAY_BUFFER, cubeVertices, gl.STATIC_DRAW);

        this.cubeIndexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.cubeIndexBuffer);
        const indices = [];
        for (let i = 0; i < 24; i += 4) {
            indices.push(i, i + 1, i + 2, i, i + 2, i + 3);
        }
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
    }

    drawWorld(player, cameraData, remotePlayers, mapData) {
        const gl = this.gl;
        gl.clearColor(0.4, 0.7, 1.0, 1.0); // 맑은 하늘색
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.DEPTH_TEST);
        gl.useProgram(this.shaderProgram);

        gl.uniformMatrix4fv(this.programInfo.uniformLocations.projectionMatrix, false, cameraData.projectionMatrix);
        gl.uniformMatrix4fv(this.programInfo.uniformLocations.viewMatrix, false, cameraData.viewMatrix);

        // --- 1. 바닥 그리기 ---
        const identity = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
        gl.uniformMatrix4fv(this.programInfo.uniformLocations.modelMatrix, false, identity);
        gl.uniform4fv(this.programInfo.uniformLocations.color, [0.2, 0.5, 0.2, 1.0]); // 짙은 초록
        
        gl.bindBuffer(gl.ARRAY_BUFFER, this.floorBuffer);
        gl.vertexAttribPointer(this.programInfo.attribLocations.vertexPosition, 3, gl.FLOAT, false, 24, 0);
        gl.enableVertexAttribArray(this.programInfo.attribLocations.vertexPosition);
        gl.vertexAttribPointer(this.programInfo.attribLocations.normal, 3, gl.FLOAT, false, 24, 12);
        gl.enableVertexAttribArray(this.programInfo.attribLocations.normal);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        // --- 2. 맵 상자(벽) 그리기 ---
        if (mapData) {
            gl.bindBuffer(gl.ARRAY_BUFFER, this.cubeBuffer);
            gl.vertexAttribPointer(this.programInfo.attribLocations.vertexPosition, 3, gl.FLOAT, false, 24, 0);
            gl.vertexAttribPointer(this.programInfo.attribLocations.normal, 3, gl.FLOAT, false, 24, 12);
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.cubeIndexBuffer);
            gl.uniform4fv(this.programInfo.uniformLocations.color, [0.6, 0.6, 0.6, 1.0]); // 회색 벽

            mapData.forEach(box => {
                const m = new Float32Array([
                    box.scale[0], 0, 0, 0,
                    0, box.scale[1], 0, 0,
                    0, 0, box.scale[2], 0, 
                    box.pos[0], box.pos[1], box.pos[2], 1
                ]);
                gl.uniformMatrix4fv(this.programInfo.uniformLocations.modelMatrix, false, m);
                gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);
            });
        }

        // --- 3. 다른 플레이어 그리기 ---
        if (remotePlayers) {
            gl.uniform4fv(this.programInfo.uniformLocations.color, [1.0, 0.3, 0.3, 1.0]); // 붉은색 캐릭터
            for (let id in remotePlayers) {
                const p = remotePlayers[id];
                if (!p.pos) continue;
                // 플레이어는 길쭉한 상자로 표현
                const m = new Float32Array([
                    0.5, 0, 0, 0,
                    0, 1.0, 0, 0,
                    0, 0, 0.5, 0, 
                    p.pos[0], p.pos[1], p.pos[2], 1
                ]);
                gl.uniformMatrix4fv(this.programInfo.uniformLocations.modelMatrix, false, m);
                gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);
            }
        }
    }
}
