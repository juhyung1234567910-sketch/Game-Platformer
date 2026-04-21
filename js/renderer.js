export class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
        
        if (!this.gl) {
            console.error("WebGL을 지원하지 않는 브라우저입니다.");
            return;
        }

        this.initShaders();
    }

    // 💡 그래픽 카드가 이해할 수 있게 셰이더 코드를 컴파일
    initShaders() {
        const gl = this.gl;

        // 1. Vertex Shader (물체의 3D 위치를 2D 화면으로 변환)
        const vsSource = `
            attribute vec4 aVertexPosition;
            // uniform mat4 uModelViewMatrix;
            // uniform mat4 uProjectionMatrix;
            void main() {
                // 향후 카메라 매트릭스 곱셈이 들어갈 자리
                gl_Position = aVertexPosition; 
            }
        `;

        // 2. Fragment Shader (물체에 색상을 칠함)
        const fsSource = `
            precision mediump float;
            void main() {
                gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0); // 흰색으로 칠하기
            }
        `;

        const vertexShader = this.loadShader(gl.VERTEX_SHADER, vsSource);
        const fragmentShader = this.loadShader(gl.FRAGMENT_SHADER, fsSource);

        this.shaderProgram = gl.createProgram();
        gl.attachShader(this.shaderProgram, vertexShader);
        gl.attachShader(this.shaderProgram, fragmentShader);
        gl.linkProgram(this.shaderProgram);

        if (!gl.getProgramParameter(this.shaderProgram, gl.LINK_STATUS)) {
            console.error('셰이더 초기화 실패:', gl.getProgramInfoLog(this.shaderProgram));
        }
    }

    loadShader(type, source) {
        const shader = this.gl.createShader(type);
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);
        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            console.error('셰이더 컴파일 오류:', this.gl.getShaderInfoLog(shader));
            this.gl.deleteShader(shader);
            return null;
        }
        return shader;
    }

    drawWorld(player) {
        // 여기에 향후 바닥(Floor) 버퍼를 묶고(bind) 그리는(drawArrays) 코드가 들어갑니다.
    }
}
