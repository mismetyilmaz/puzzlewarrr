/**
 * syncManager.js
 * Firebase Realtime Database ile parça senkronizasyonu.
 *
 * Strateji:
 *  - joined=true → anında yaz (onSnapshot ile rakip görür)
 *  - Serbest hareket → sadece yerel, Firebase'e yazılmaz
 *  - Rakip minimap → sadece joined durumu dinlenir
 */

class SyncManager {
  /**
   * @param {string}        roomId
   * @param {string}        uid       - bu oyuncunun uid'si
   * @param {string}        team      - 'A' | 'B'
   * @param {PuzzleEngine}  engine
   * @param {function}      onOpponentUpdate - (joinedSet: Set<number>) => void
   */
  constructor(roomId, uid, team, engine, onOpponentUpdate) {
    this.roomId    = roomId;
    this.uid       = uid;
    this.team      = team;
    this.engine    = engine;
    this.onOppUpd  = onOpponentUpdate;

    this._listeners     = [];
    this._writtenJoined = new Map();
    this._opponentTeam  = team === 'A' ? 'B' : 'A';
  }

  // ─────────────────────────────────────────────
  // BAŞLAT
  // ─────────────────────────────────────────────

  start() {
    this._listenOpponent();
  }

  // ─────────────────────────────────────────────
  // PARÇA BİRLEŞTİ → Firebase'e yaz
  // ─────────────────────────────────────────────

  /**
   * Bir parça joined=true olduğunda çağır.
   * gameCanvas.js içindeki onProgress callback'inden tetiklenmeli.
   * @param {number} pieceIdx
   */
notifyJoined(pieceIdx, onBoard = false) {
  const { FB } = window;
  const key    = `${this.team}_${pieceIdx}`;
  
  // onBoard=true ise güncelle (false→true geçiş)
  const current = this._writtenJoined.get(pieceIdx);
  if (current === 'board') return; // zaten en üst seviye
  if (current === 'group' && !onBoard) return; // aynı seviye tekrar yazma
  
  this._writtenJoined.set(pieceIdx, onBoard ? 'board' : 'group');
  
  FB.set(FB.DB.roomPiece(this.roomId, key), {
    team:    this.team,
    idx:     pieceIdx,
    onBoard, // true=tahtada(yeşil), false=dışarda gruplu(beyaz)
  }).catch(err => console.warn('sync write error:', err));
}
  /**
   * Tüm joined parçaları toplu yaz (oyun başlangıcında değil,
   * bağlantı kopup tekrar kurulunca kullanılır).
   */
  syncAllJoined() {
    for (const p of this.engine.pieces) {
      if (p.joined) this.notifyJoined(p.idx);
    }
  }

  // ─────────────────────────────────────────────
  // RAKİP joined DURUMUNU DİNLE
  // ─────────────────────────────────────────────

_listenOpponent() {
  const { FB } = window;
  const unsub = FB.onValue(FB.DB.roomPieces(this.roomId), snap => {
    if (!snap.exists()) return;
    const data       = snap.val();
    const boardSet   = new Set(); // tahtada (yeşil)
    const groupSet   = new Set(); // dışarda gruplu (beyaz)

    for (const [key, val] of Object.entries(data)) {
      if (val.team !== this._opponentTeam) continue;
      if (val.onBoard) boardSet.add(val.idx);
      else             groupSet.add(val.idx);
    }

    this.onOppUpd(boardSet, groupSet);
  });
  this._listeners.push(unsub);
}
  // ─────────────────────────────────────────────
  // TEMİZLE
  // ─────────────────────────────────────────────

  dispose() {
    this._listeners.forEach(u => u());
    this._listeners = [];
  }
}

window.SyncManager = SyncManager;
