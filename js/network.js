// network.js - Firebase Realtime Database 멀티플레이어 (UDP 소켓 → Firebase 대체)

import { initializeApp }    from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getDatabase, ref, set, onValue, remove, onDisconnect, serverTimestamp }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';

const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyAS4bTPT7sNfVs_EblSJEOYlbwXWMd9iPc",
  authDomain:        "multiplatformer-1acb3.firebaseapp.com",
  databaseURL:       "https://multiplatformer-1acb3-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId:         "multiplatformer-1acb3",
  storageBucket:     "multiplatformer-1acb3.firebasestorage.app",
  messagingSenderId: "271218714227",
  appId:             "1:271218714227:web:f20fbfd74cb303c7b76c06"
};

export class Network {
  constructor() {
    this.app = initializeApp(FIREBASE_CONFIG);
    this.db  = getDatabase(this.app);

    // 고유 플레이어 ID 생성
    this.myId = 'player_' + Math.random().toString(36).slice(2, 9);

    this.otherPlayers = {};   // { pid: { pos, yaw, pitch, ... } }
    this.myHealth     = 100;

    // 콜백
    this.onPlayersUpdate = null;  // (otherPlayers) => {}
    this.onHealthUpdate  = null;  // (hp) => {}
    this.onHit           = null;  // (damage) => {}

    this._lastSend = 0;
    this._sendInterval = 50; // ms (20hz)

    this._setupListeners();
  }

  _setupListeners() {
    // 전체 players 노드를 구독
    const playersRef = ref(this.db, 'players');
    onValue(playersRef, snapshot => {
      const data = snapshot.val() || {};
      const others = {};
      for (const [pid, info] of Object.entries(data)) {
        if (pid === this.myId) continue;
        // stale check: 3초 이상 업데이트 없으면 무시
        if (info.ts && (Date.now() - info.ts > 3000)) continue;
        others[pid] = info;
      }
      this.otherPlayers = others;
      if (this.onPlayersUpdate) this.onPlayersUpdate(others);
    });

    // 내 피격 이벤트 구독
    const hitRef = ref(this.db, `hits/${this.myId}`);
    onValue(hitRef, snapshot => {
      const data = snapshot.val();
      if (!data) return;
      const damage = data.damage || 15;
      this.myHealth = Math.max(0, this.myHealth - damage);
      if (this.onHealthUpdate) this.onHealthUpdate(this.myHealth);
      if (this.onHit) this.onHit(damage);
      // 처리 후 노드 삭제
      remove(hitRef);
    });

    // 접속 해제 시 자동 정리
    const myRef = ref(this.db, `players/${this.myId}`);
    onDisconnect(myRef).remove();
  }

  // 내 상태 전송 (throttled)
  sendUpdate(snapshot) {
    const now = Date.now();
    if (now - this._lastSend < this._sendInterval) return;
    this._lastSend = now;

    const myRef = ref(this.db, `players/${this.myId}`);
    set(myRef, { ...snapshot, ts: now }).catch(() => {});
  }

  // 상대 피격 전송
  sendHit(targetId, damage = 15) {
    const hitRef = ref(this.db, `hits/${targetId}`);
    set(hitRef, { damage, from: this.myId, ts: Date.now() }).catch(() => {});
  }

  // 부활 (서버에 현재 위치 강제 기록)
  sendRespawn(pos) {
    const myRef = ref(this.db, `players/${this.myId}`);
    set(myRef, { pos, health_reset: true, ts: Date.now() }).catch(() => {});
  }

  // 퇴장
  disconnect() {
    remove(ref(this.db, `players/${this.myId}`)).catch(() => {});
  }

  getPlayerCount() {
    return Object.keys(this.otherPlayers).length + 1;
  }
}
