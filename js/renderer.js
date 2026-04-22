export class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        // 학교 컴퓨터는 WebGL2를 지원 안 할 수도 있으니 WebGL1부터 체크
        this.gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        
        if (!this.gl) {
            alert("이 컴퓨터는 WebGL을 지원하지 않습니다.");
            return;
        }

        this.initShaders();
        this.initBuffers();
    }

    initShaders() {
        const gl = this.gl;
        const vsSource = "attribute vec4 aVertexPosition; uniform mat4 uModelMatrix; uniform mat4 uViewMatrix; uniform mat4 uProjectionMatrix; void main() { gl_Position = uProjectionMatrix * uViewMatrix * uModelMatrix * aVertexPosition; }";
        const fsSource = "precision mediump float; void main() { gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0); }"; // 바닥은 일단 흰색

        const vs = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vs, vsSource);
        gl.compileShader(vs);

        const fs = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fs, fsSource);
        gl.compileShader(fs);

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
            },
        };
    }

    initBuffers() {
        const gl = this.gl;
        this.positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        const s = 100.0;
        const positions = [-s, 0, s, s, 0, s, -s, 0, -s, s, 0, -s];
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
    }

    drawWorld(player, cameraData) {
        const gl = this.gl;

        // 💡 성공하면 화면이 분홍색으로 변해야 합니다!
        gl.clearColor(1.0, 0.0, 1.0, 1.0); 
        gl.clearDepth(1.0);
        gl.enable(gl.DEPTH_TEST);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        if (!cameraData) return;

        gl.useProgram(this.shaderProgram);
        gl.uniformMatrix4fv(this.programInfo.uniformLocations.projectionMatrix, false, cameraData.projectionMatrix);
        gl.uniformMatrix4fv(this.programInfo.uniformLocations.viewMatrix, false, cameraData.viewMatrix);
        
        const identity = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
        gl.uniformMatrix4fv(this.programInfo.uniformLocations.modelMatrix, false, identity);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        gl.vertexAttribPointer(this.programInfo.attribLocations.vertexPosition, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(this.programInfo.attribLocations.vertexPosition);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
}
