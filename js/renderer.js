export class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
        
        if (!this.gl) {
            console.error("WebGL을 지원하지 않는 브라우저입니다.");
            return;
        }

        // 1. 셰이더 초기화
        this.initShaders();
        // 2. 바닥(Floor) 데이터 초기화
        this.initBuffers();
    }

    initShaders() {
        const gl = this.gl;

        // 💡 3D 좌표에 카메라(View)와 원근감(Projection)을 곱해 화면에 찍어주는 역할
        const vsSource = `
            attribute vec4 aVertexPosition;
            uniform mat4 uModelMatrix;
            uniform mat4 uViewMatrix;
            uniform mat4 uProjectionMatrix;
            void main() {
                // 곱하는 순서가 매우 중요합니다! (Projection * View * Model * Vertex)
                gl_Position = uProjectionMatrix * uViewMatrix * uModelMatrix * aVertexPosition; 
            }
        `;

        // 💡 물체의 색상을 칠해주는 역할 (현재는 회색빛 바닥)
        const fsSource = `
            precision mediump float;
            void main() {
                gl_FragColor = vec4(0.5, 0.5, 0.5, 1.0); // 회색
            }
        `;

        const vertexShader = this.loadShader(gl.VERTEX_SHADER, vsSource);
        const fragmentShader = this.loadShader(gl.FRAGMENT_SHADER, fsSource);

        this.shaderProgram = gl.createProgram();
        gl.attachShader(this.shaderProgram, vertexShader);
        gl.attachShader(this.shaderProgram, fragmentShader);
        gl.linkProgram(this.shaderProgram);

        // 셰이더로 데이터를 보낼 "파이프(Location)" 위치 찾기
        this.programInfo = {
            attribLocations: {
                vertexPosition: gl.getAttribLocation(this.shaderProgram, 'aVertexPosition'),
            },
            uniformLocations: {
                projectionMatrix: gl.getUniformLocation(this.shaderProgram, 'uProjectionMatrix'),
                viewMatrix: gl.getUniformLocation(this.shaderProgram, 'uViewMatrix'),
                modelMatrix: gl.getUniformLocation(this.shaderProgram, 'uModelMatrix'),
            },
        };
    }

    loadShader(type, source) {
        const shader = this.gl.createShader(type);
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);
        return shader;
    }

    initBuffers() {
        const gl = this.gl;
        this.positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);

        // 💡 가로 20, 세로 20짜리 거대한 바닥 만들기 (Y축은 0)
        const size = 10.0;
        const positions = [
            -size, 0.0,  size, // 왼쪽 앞
             size, 0.0,  size, // 오른쪽 앞
            -size, 0.0, -size, // 왼쪽 뒤
             size, 0.0, -size  // 오른쪽 뒤
        ];

        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
    }

    // 기본 단위 행렬(Identity Matrix) 생성 (물체의 기본 위치)
    createIdentityMatrix() {
        return new Float32Array([
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            0, 0, 0, 1
        ]);
    }

    // 💡 화면을 실제로 그리는 함수 (main.js에서 매 프레임 호출됨)
    drawWorld(player, cameraData) {
        const gl = this.gl;

        // 1. 화면 초기화 (파란색 하늘)
        gl.clearColor(0.4, 0.6, 0.9, 1.0);
        gl.clearDepth(1.0);
        gl.enable(gl.DEPTH_TEST); // 깊이 테스트 켜기 (앞에 있는 물체가 뒤를 가리도록)
        gl.depthFunc(gl.LEQUAL);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        // 카메라 데이터가 없으면 그리지 않음
        if (!cameraData) return;

        // 2. 셰이더 프로그램 사용
        gl.useProgram(this.shaderProgram);

        // 3. 카메라 행렬 전달 (View, Projection)
        gl.uniformMatrix4fv(this.programInfo.uniformLocations.projectionMatrix, false, cameraData.projectionMatrix);
        gl.uniformMatrix4fv(this.programInfo.uniformLocations.viewMatrix, false, cameraData.viewMatrix);

        // 4. 바닥(Floor) 그리기 설정
        const modelMatrix = this.createIdentityMatrix(); // 바닥은 정중앙(0,0,0)에 고정
        gl.uniformMatrix4fv(this.programInfo.uniformLocations.modelMatrix, false, modelMatrix);

        // 버퍼에서 정점 데이터 읽어오기
        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        gl.vertexAttribPointer(this.programInfo.attribLocations.vertexPosition, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(this.programInfo.attribLocations.vertexPosition);

        // 5. 실제 렌더링 명령 (삼각형 모양의 띠(TRIANGLE_STRIP)로 사각형 바닥 그리기)
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
}
