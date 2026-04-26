import { initializeApp }                            from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { getDatabase, ref, set, onValue, onDisconnect } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-database.js";

export class NetworkClient {
    constructor(config) {
        this.app = initializeApp(config);
        this.db  = getDatabase(this.app);

        this.playerId  = "player_" + Math.floor(Math.random() * 100000);
        this.playerRef = ref(this.db, `players/${this.playerId}`);

        this.remotePlayers = {};

        // 접속 해제 시 내 데이터 자동 삭제
        onDisconnect(this.playerRef).remove();

        // 전체 플레이어 감시
        const playersRef = ref(this.db, 'players');
        onValue(playersRef, (snapshot) => {
            const data = snapshot.val() || {};
            // 오래된 데이터 필터링 (5초 이상 지난 플레이어 제거)
            const now = Date.now();
            this.remotePlayers = {};
            for (const id in data) {
                if (id === this.playerId) continue;
                const p = data[id];
                // timestamp 가 없거나 5초 이내인 경우만 유지
                if (!p.timestamp || (now - p.timestamp) < 5000) {
                    this.remotePlayers[id] = p;
                }
            }
        });

        console.log("Firebase 연결 완료! ID:", this.playerId);
    }

    sendData(dataObj) {
        // yaw 가 undefined 이면 0 으로 안전 처리
        set(this.playerRef, {
            pos:       dataObj.pos,
            yaw:       dataObj.yaw ?? 0,
            health:    dataObj.health ?? 100,
            action:    dataObj.action ?? null,
            timestamp: Date.now()
        });
    }
}
