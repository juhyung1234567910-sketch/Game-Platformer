export class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (!this.gl) {
            alert("WebGL 지원 안 함");
            return;
        }
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
        // 1. 바닥
        this.floorBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.floorBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-100,0,100, 100,0,100, -100,0,-100, 100,0,-100]), gl.STATIC_DRAW);

        // 2. 다른 플레이어 (수직 사각형)
        this.playerBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.playerBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.5,0,0, 0.5,0,0, -0.5,1.8,0, 0.5,1.8,0]), gl.STATIC_DRAW);

        // 3. 상자(벽) 데이터
        this.cubeBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.cubeBuffer);
        const s = 1.0; 
        const vertices = [
            -s,-s, s,  s,-s, s,  s, s, s, -s, s, s, // 앞
            -s,-s,-s, -s, s,-s,  s, s,-s,  s,-s,-s, // 뒤
            -s, s,-s, -s, s, s,  s, s, s,  s, s,-s, // 위
            -s,-s,-s,  s,-s,-s,  s,-s, s, -s,-s, s, // 아래
             s,-s,-s,  s, s,-s,  s, s, s,  s,-s, s, // 우
            -s,-s,-s, -s,-s, s, -s, s, s, -s, s,-s  // 좌
        ];
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);

        this.cubeIndexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.cubeIndexBuffer);
        const indices = [
            0,1,2, 0,2,3, 4,5,6, 4,6,7, 8,9,10, 8,10,11,
            12,13,14, 12,14,15, 16,17,18, 16,18,19, 20,21,22, 20,22,23
        ];
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
    }

    drawWorld(player, cameraData, remotePlayers, mapData) {
        const gl = this.gl;
        gl.clearColor(0.5, 0.8, 1.0, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.DEPTH_TEST);
        gl.useProgram(this.shaderProgram);

        gl.uniformMatrix4fv(this.programInfo.uniformLocations.projectionMatrix, false, cameraData.projectionMatrix);
        gl.uniformMatrix4fv(this.programInfo.uniformLocations.viewMatrix, false, cameraData.viewMatrix);

        // 바닥 그리기 (초록)
        const identity = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
        gl.uniformMatrix4fv(this.programInfo.uniformLocations.modelMatrix, false, identity);
        gl.uniform4fv(this.programInfo.uniformLocations.color, [0.2, 0.6, 0.2, 1.0]);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.floorBuffer);
        gl.vertexAttribPointer(this.programInfo.attribLocations.vertexPosition, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(this.programInfo.attribLocations.vertexPosition);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        // 맵 상자 그리기 (회색)
        if (mapData) {
            gl.bindBuffer(gl.ARRAY_BUFFER, this.cubeBuffer);
            gl.vertexAttribPointer(this.programInfo.attribLocations.vertexPosition, 3, gl.FLOAT, false, 0, 0);
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.cubeIndexBuffer);
            gl.uniform4fv(this.programInfo.uniformLocations.color, [0.5, 0.5, 0.5, 1.0]);
            mapData.forEach(box => {
                const m = new Float32Array([
                    box.scale[0],0,0,0, 0,box.scale[1],0,0, 0,0,box.scale[2],0, 
                    box.pos[0],box.pos[1],box.pos[2],1
                ]);
                gl.uniformMatrix4fv(this.programInfo.uniformLocations.modelMatrix, false, m);
                gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);
            });
        }

        // 다른 플레이어 그리기 (빨강)
        if (remotePlayers) {
            gl.bindBuffer(gl.ARRAY_BUFFER, this.playerBuffer);
            gl.vertexAttribPointer(this.programInfo.attribLocations.vertexPosition, 3, gl.FLOAT, false, 0, 0);
            gl.uniform4fv(this.programInfo.uniformLocations.color, [1.0, 0.0, 0.0, 1.0]);
            for (let id in remotePlayers) {
                const p = remotePlayers[id];
                if (!p.pos) continue;
                const m = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, p.pos[0], p.pos[1]-1.5, p.pos[2],1]);
                gl.uniformMatrix4fv(this.programInfo.uniformLocations.modelMatrix, false, m);
                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            }
        }
    }
}
