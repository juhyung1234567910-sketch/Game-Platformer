export class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        this.initShaders();
        this.initBuffers();
    }

    initShaders() {
        const gl = this.gl;
        const vsSource = `
            attribute vec4 aVertexPosition;
            uniform mat4 uModelMatrix;
            uniform mat4 uViewMatrix;
            uniform mat4 uProjectionMatrix;
            void main() {
                gl_Position = uProjectionMatrix * uViewMatrix * uModelMatrix * aVertexPosition;
            }
        `;
        const fsSource = `
            precision mediump float;
            uniform vec4 uColor;
            void main() {
                gl_FragColor = uColor;
            }
        `;

        const vs = this.loadShader(gl.VERTEX_SHADER, vsSource);
        const fs = this.loadShader(gl.FRAGMENT_SHADER, fsSource);
        this.shaderProgram = gl.createProgram();
        gl.attachShader(this.shaderProgram, vs);
        gl.attachShader(this.shaderProgram, fs);
        gl.linkProgram(this.shaderProgram);

        this.programInfo = {
            attribLocations: { vertexPosition: gl.getAttribLocation(this.shaderProgram, 'aVertexPosition') },
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
        return shader;
    }

    initBuffers() {
        const gl = this.gl;
        // 바닥 데이터 (평면)
        this.floorBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.floorBuffer);
        const s = 100.0;
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-s,0,s, s,0,s, -s,0,-s, s,0,-s]), gl.STATIC_DRAW);

        // 플레이어 모양 데이터 (간단한 수직 사각형)
        this.playerBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.playerBuffer);
        const w = 0.5, h = 1.8;
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-w,0,0, w,0,0, -w,h,0, w,h,0]), gl.STATIC_DRAW);
    }

    drawWorld(player, cameraData, remotePlayers) {
        const gl = this.gl;
        gl.clearColor(0.5, 0.8, 1.0, 1.0); // 배경 파란색
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.DEPTH_TEST);
        gl.useProgram(this.shaderProgram);

        gl.uniformMatrix4fv(this.programInfo.uniformLocations.projectionMatrix, false, cameraData.projectionMatrix);
        gl.uniformMatrix4fv(this.programInfo.uniformLocations.viewMatrix, false, cameraData.viewMatrix);

        // 1. 바닥 그리기 (초록색)
        const identity = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
        gl.uniformMatrix4fv(this.programInfo.uniformLocations.modelMatrix, false, identity);
        gl.uniform4fv(this.programInfo.uniformLocations.color, [0.2, 0.8, 0.2, 1.0]);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.floorBuffer);
        gl.vertexAttribPointer(this.programInfo.attribLocations.vertexPosition, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(this.programInfo.attribLocations.vertexPosition);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        // 2. 다른 플레이어 그리기 (빨간색)
        if (remotePlayers) {
            gl.bindBuffer(gl.ARRAY_BUFFER, this.playerBuffer);
            gl.vertexAttribPointer(this.programInfo.attribLocations.vertexPosition, 3, gl.FLOAT, false, 0, 0);
            gl.uniform4fv(this.programInfo.uniformLocations.color, [1.0, 0.0, 0.0, 1.0]);

            for (let id in remotePlayers) {
                const p = remotePlayers[id];
                if (!p.pos) continue;
                
                // 간단한 위치 행렬 생성 (x, y, z 이동)
                const m = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, p.pos[0], p.pos[1]-1.5, p.pos[2], 1]);
                gl.uniformMatrix4fv(this.programInfo.uniformLocations.modelMatrix, false, m);
                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            }
        }
    }
}
