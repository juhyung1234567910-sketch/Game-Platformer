// Firebase Modular SDK를 직접 임포트합니다.
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { getDatabase, ref, set, onValue, onDisconnect } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-database.js";

export class NetworkClient {
    constructor(config) {
        // 1. Firebase 초기화
        this.app = initializeApp(config);
        this.db = getDatabase(this.app);
        
        // 내 고유 ID 생성 (임시)
        this.playerId = "player_" + Math.floor(Math.random() * 100000);
        this.playerRef = ref(this.db, `players/${this.playerId}`);
        
        // 다른 플레이어들의 정보를 담을 객체
        this.remotePlayers = {};

        // 2. 접속 끊기면 데이터 삭제 설정
        onDisconnect(this.playerRef).remove();

        // 3. 다른 플레이어 데이터 감시
        const playersRef = ref(this.db, 'players');
        onValue(playersRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                this.remotePlayers = data;
                // 내 정보는 제외
                delete this.remotePlayers[this.playerId];
            }
        });

        console.log("Firebase 연결 완료! ID:", this.playerId);
    }

    // 내 위치 데이터를 Firebase에 업로드
    sendData(dataObj) {
        set(this.playerRef, {
            pos: dataObj.pos,
            yaw: dataObj.yaw,
            health: dataObj.health || 100,
            timestamp: Date.now()
        });
    }
}
