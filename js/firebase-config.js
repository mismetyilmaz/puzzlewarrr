/**
 * firebase-config.js
 * Firebase başlatma, anonim auth, Realtime Database referansları.
 * Tüm sayfalar bu dosyayı type="module" olarak yükler.
 */

import { initializeApp }          from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, signInAnonymously, onAuthStateChanged }
                                   from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getDatabase, ref, set, get, update, push, remove,
         onValue, onDisconnect, serverTimestamp }
                                   from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';

const firebaseConfig = {
  apiKey:            'AIzaSyCMRlrM2UFRN6l7qzygmkVThR6ubvtNoPI',
  authDomain:        'puzzlewar-bb023.firebaseapp.com',
  databaseURL:       'https://puzzlewar-bb023-default-rtdb.firebaseio.com',
  projectId:         'puzzlewar-bb023',
  storageBucket:     'puzzlewar-bb023.firebasestorage.app',
  messagingSenderId: '672350676623',
  appId:             '1:672350676623:web:999e9b3be017629135b2fa',
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getDatabase(app);

// ── DB yol yardımcıları ──
const DB = {
  room:        (id)       => ref(db, `rooms/${id}`),
  roomMeta:    (id)       => ref(db, `rooms/${id}/meta`),
  roomPieces:  (id)       => ref(db, `rooms/${id}/pieces`),
  roomPiece:   (id, pid)  => ref(db, `rooms/${id}/pieces/${pid}`),
  roomPresence:(id)       => ref(db, `rooms/${id}/presence`),
  roomPlayer:  (id, uid)  => ref(db, `rooms/${id}/presence/${uid}`),
  queue:       ()         => ref(db, 'matchmaking/queue'),
  queuePlayer: (uid)      => ref(db, `matchmaking/queue/${uid}`),
};

/**
 * Anonim olarak giriş yap.
 * displayName localStorage'da tutulur (Firebase anon auth'ta isim yok).
 * @returns {Promise<{uid, displayName}>}
 */
async function signInAnon(displayName) {
  // Daha önce giriş yapıldıysa mevcut user'ı döndür
  if (auth.currentUser) {
    if (displayName) localStorage.setItem('pw_name', displayName);
    return {
      uid:         auth.currentUser.uid,
      displayName: displayName || localStorage.getItem('pw_name') || 'Oyuncu',
    };
  }

  const cred = await signInAnonymously(auth);
  if (displayName) localStorage.setItem('pw_name', displayName);
  return {
    uid:         cred.user.uid,
    displayName: displayName || localStorage.getItem('pw_name') || 'Oyuncu',
  };
}

/**
 * Mevcut kullanıcıyı döndürür (yoksa null).
 */
function currentUser() {
  return auth.currentUser
    ? { uid: auth.currentUser.uid, displayName: localStorage.getItem('pw_name') || 'Oyuncu' }
    : null;
}

/**
 * Auth hazır olana kadar bekle.
 */
function waitForAuth() {
  return new Promise(resolve => {
    const unsub = onAuthStateChanged(auth, user => {
      if (user) { unsub(); resolve(user); }
    });
    // 3 sn timeout → anonim giriş yap
    setTimeout(async () => {
      if (!auth.currentUser) await signInAnonymously(auth);
    }, 3000);
  });
}

// Global export — module olmayan script'ler window.FB üzerinden erişir
window.FB = {
  db, auth, DB,
  ref, set, get, update, push, remove,
  onValue, onDisconnect, serverTimestamp,
  signInAnon, currentUser, waitForAuth,
};
