// network.js - Firebase Realtime Database 멀티플레이어

import { initializeApp }    from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getDatabase, ref, set, onValue, remove, onDisconnect }
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
    this.myId = 'player_' + Math.random().toString(36).slice(2, 9);

    this.otherPlayers = {};
    this.myHealth     = 100;

    this.onPlayersUpdate = null;
    this.onHealthUpdate  = null;
    this.onHit           = null;

    this._lastSend   = 0;
    this._sendInterval = 50; // 20hz

    this._setupListeners();
  }

  _setupListeners() {
    onValue(ref(this.db, 'players'), snapshot => {
      const data = snapshot.val() || {};
      const others = {};
      for (const [pid, info] of Object.entries(data)) {
        if (pid === this.myId) continue;
        if (info.ts && (Date.now() - info.ts > 3000)) continue;
        others[pid] = info;
      }
      this.otherPlayers = others;
      if (this.onPlayersUpdate) this.onPlayersUpdate(others);
    });

    const hitRef = ref(this.db, `hits/${this.myId}`);
    onValue(hitRef, snapshot => {
      const data = snapshot.val();
      if (!data) return;
      this.myHealth = Math.max(0, this.myHealth - (data.damage || 15));
      if (this.onHealthUpdate) this.onHealthUpdate(this.myHealth);
      if (this.onHit) this.onHit(data.damage || 15);
      remove(hitRef);
    });

    onDisconnect(ref(this.db, `players/${this.myId}`)).remove();
  }

  sendUpdate(snapshot) {
    const now = Date.now();
    if (now - this._lastSend < this._sendInterval) return;
    this._lastSend = now;
    set(ref(this.db, `players/${this.myId}`), { ...snapshot, ts: now }).catch(() => {});
  }

  sendHit(targetId, damage = 15) {
    set(ref(this.db, `hits/${targetId}`), { damage, from: this.myId, ts: Date.now() }).catch(() => {});
  }

  sendRespawn(posArr) {
    set(ref(this.db, `players/${this.myId}`), { pos: posArr, health_reset: true, ts: Date.now() }).catch(() => {});
  }

  disconnect() {
    remove(ref(this.db, `players/${this.myId}`)).catch(() => {});
  }

  getPlayerCount() {
    return Object.keys(this.otherPlayers).length + 1;
  }
}
