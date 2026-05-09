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
    this._writtenJoined = new Set();   // zaten yazılmış joined parçalar (tekrar yazma)
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
  notifyJoined(pieceIdx) {
    if (this._writtenJoined.has(pieceIdx)) return;
    this._writtenJoined.add(pieceIdx);

    const { FB } = window;
    // Takım bazlı key: A_42, B_17 gibi — iki takım aynı DB yoluna yazıyor
    const key = `${this.team}_${pieceIdx}`;
    FB.set(FB.DB.roomPiece(this.roomId, key), {
      joined: true,
      team:   this.team,
      idx:    pieceIdx,
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

      const data      = snap.val();
      const joinedSet = new Set();

      for (const [key, val] of Object.entries(data)) {
        if (val.team === this._opponentTeam && val.joined) {
          joinedSet.add(val.idx);
        }
      }

      this.onOppUpd(joinedSet);
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
