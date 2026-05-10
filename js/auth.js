// auth.js - Firebase Anonymous Auth + 닉네임/DB 로그인
// Firebase 규칙: auth != null, auth.uid === $uid 통과를 위해 signInAnonymously() 사용

import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getDatabase, ref, set, get, child, update
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';
import {
  getAuth, signInAnonymously
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyCHXYjHr67AHEj6cfUUn5jxGfKa3c5adYE",
  authDomain:        "multiplatformer-6db0f.firebaseapp.com",
  databaseURL:       "https://multiplatformer-6db0f-default-rtdb.europe-west1.firebasedatabase.app",
  projectId:         "multiplatformer-6db0f",
  storageBucket:     "multiplatformer-6db0f.firebasestorage.app",
  messagingSenderId: "74962223394",
  appId:             "1:74962223394:web:e4ab2a77d480a19474e57b",
  measurementId:     "G-VDQ9ESN8L5"
};

const app  = getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG);
const db   = getDatabase(app);
const auth = getAuth(app);

// ── 익명 Auth 확보 ──
// Firebase 규칙에서 auth != null 통과를 위해 반드시 먼저 호출해야 함
export async function ensureAuth() {
  if (auth.currentUser) return auth.currentUser;
  const cred = await signInAnonymously(auth);
  return cred.user;
}

export function getCurrentUid() {
  return auth.currentUser?.uid || null;
}

// ── 기본 픽셀 캐릭터 ──
export const DEFAULT_PIXELS = (() => {
  const grid = [];
  for (let y = 0; y < 16; y++) {
    const row = [];
    for (let x = 0; x < 16; x++) {
      if      (x>=4&&x<=11&&y>=0&&y<=4)                          row.push('#4477bb');
      else if (y===2&&(x===5||x===6||x===9||x===10))             row.push('#000000');
      else if (x>=3&&x<=12&&y>=5&&y<=10)                         row.push('#3366aa');
      else if ((x>=0&&x<=2||x>=13&&x<=15)&&y>=5&&y<=9)          row.push('#3366aa');
      else if ((x>=4&&x<=7||x>=8&&x<=11)&&y>=11&&y<=15)         row.push('#2255aa');
      else                                                         row.push(null);
    }
    grid.push(row);
  }
  return grid;
})();

// ── 비밀번호 해시 ──
function hashPassword(pw) {
  let h = 0;
  for (let i = 0; i < pw.length; i++) { h = ((h << 5) - h) + pw.charCodeAt(i); h |= 0; }
  return h.toString(16);
}

// ── 회원가입 ──
export async function register(nickname, password, pixels) {
  nickname = nickname.trim();
  if (!nickname || nickname.length < 2)  throw new Error('닉네임은 2자 이상이어야 합니다.');
  if (nickname.length > 12)              throw new Error('닉네임은 12자 이하여야 합니다.');
  if (!/^[a-zA-Z0-9가-힣_\-]+$/.test(nickname)) throw new Error('닉네임에 허용되지 않는 문자가 있습니다.');
  if (!password || password.length < 4) throw new Error('비밀번호는 4자 이상이어야 합니다.');

  // 익명 Auth 먼저 확보 (auth != null 규칙 통과)
  const user = await ensureAuth();

  // 닉네임 중복 체크
  const snap = await get(child(ref(db), `users/${nickname}`));
  if (snap.exists()) throw new Error('이미 사용 중인 닉네임입니다.');

  // users/$nickname 저장
  await set(ref(db, `users/${nickname}`), {
    uid:       user.uid,
    password:  hashPassword(password),
    pixels,
    kills:     0,
    deaths:    0,
    rating:    0,
    createdAt: Date.now(),
  });

  // uid → nickname 역매핑 (network.js 에서 auth.uid 기반 경로에 쓸 때 사용)
  await set(ref(db, `uid_map/${user.uid}`), nickname);

  return { nickname, uid: user.uid, pixels, kills: 0, deaths: 0, rating: 0 };
}

// ── 로그인 ──
export async function login(nickname, password) {
  nickname = nickname.trim();

  // 익명 Auth 먼저 확보
  const user = await ensureAuth();

  const snap = await get(child(ref(db), `users/${nickname}`));
  if (!snap.exists()) throw new Error('존재하지 않는 닉네임입니다.');
  const data = snap.val();
  if (data.password !== hashPassword(password)) throw new Error('비밀번호가 틀렸습니다.');

  // uid 갱신 (다른 기기 재로그인 시 uid 달라질 수 있음)
  await update(ref(db, `users/${nickname}`), { uid: user.uid }).catch(() => {});
  await set(ref(db, `uid_map/${user.uid}`), nickname).catch(() => {});

  return {
    nickname,
    uid:    user.uid,
    pixels: data.pixels,
    kills:  data.kills  || 0,
    deaths: data.deaths || 0,
    rating: data.rating || 0,
  };
}

export { db, app, auth };
