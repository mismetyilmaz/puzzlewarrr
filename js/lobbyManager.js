/**
 * lobbyManager.js
 * Lobi sistemi: oda oluştur / katıl, takım seçimi, hazır, oyun başlat.
 * window.FB (firebase-config.js) yüklü olmalı.
 */

class LobbyManager {
  constructor() {
    this.roomId      = null;
    this.uid         = null;
    this.displayName = null;
    this._listeners  = [];   // firebase listener unsub fonksiyonları
  }

  // ─────────────────────────────────────────────
  // ODA OLUŞTUR
  // ─────────────────────────────────────────────

  /**
   * Yeni lobi odası oluşturur.
   * @param {object} opts - { displayName, pieceCount, seed }
   * @returns {Promise<string>} roomId (6 haneli büyük harf kod)
   */
  async createRoom(opts = {}) {
    const { FB } = window;
    const user   = await FB.signInAnon(opts.displayName);
    this.uid         = user.uid;
    this.displayName = user.displayName;

    const roomId = this._genCode();
    this.roomId  = roomId;

    const seed   = opts.seed        || (Math.floor(Math.random() * 999999) + 1);
    const pieces = opts.pieceCount  || 500;

    // Oda meta verisi
    await FB.set(FB.DB.roomMeta(roomId), {
      status:      'waiting',   // waiting | countdown | playing | done
      mode:        'lobby',
      seed,
      pieceCount:  pieces,
      createdAt:   FB.serverTimestamp(),
      createdBy:   this.uid,
    });

    // Oyuncuyu A takımına ekle
    await FB.set(FB.DB.roomPlayer(roomId, this.uid), {
      displayName: this.displayName,
      team:        'A',
      ready:       false,
      joinedAt:    FB.serverTimestamp(),
    });

    // Disconnect koruması: odadan ayrılınca oyuncu sil
    FB.onDisconnect(FB.DB.roomPlayer(roomId, this.uid)).remove();

    return roomId;
  }

  // ─────────────────────────────────────────────
  // ODAYA KATIL
  // ─────────────────────────────────────────────

  /**
   * Var olan odaya katıl.
   * @param {string} roomId
   * @param {string} displayName
   * @returns {Promise<object>} roomMeta
   */
  async joinRoom(roomId, displayName) {
    const { FB } = window;
    roomId = roomId.toUpperCase().trim();

    // Oda var mı?
    const snap = await FB.get(FB.DB.roomMeta(roomId));
    if (!snap.exists()) throw new Error('Oda bulunamadı: ' + roomId);

    const meta = snap.val();
    if (meta.status === 'playing' || meta.status === 'done') {
      throw new Error('Bu oyun zaten başlamış.');
    }

    const user   = await FB.signInAnon(displayName);
    this.uid         = user.uid;
    this.displayName = user.displayName;
    this.roomId      = roomId;

    // Mevcut oyuncuları say, takım dengesi için B'ye ekle
    const presSnap = await FB.get(FB.DB.roomPresence(roomId));
    const players  = presSnap.exists() ? Object.values(presSnap.val()) : [];
    const aCount   = players.filter(p => p.team === 'A').length;
    const bCount   = players.filter(p => p.team === 'B').length;
    const team     = bCount <= aCount ? 'B' : 'A';

    await FB.set(FB.DB.roomPlayer(roomId, this.uid), {
      displayName: this.displayName,
      team,
      ready:    false,
      joinedAt: FB.serverTimestamp(),
    });

    FB.onDisconnect(FB.DB.roomPlayer(roomId, this.uid)).remove();

    return meta;
  }

  // ─────────────────────────────────────────────
  // TAKIM DEĞİŞTİR
  // ─────────────────────────────────────────────

  async switchTeam(team) {
    const { FB } = window;
    if (!this.roomId || !this.uid) return;
    await FB.update(FB.DB.roomPlayer(this.roomId, this.uid), { team });
  }

  // ─────────────────────────────────────────────
  // HAZIR TOGGLE
  // ─────────────────────────────────────────────

  async setReady(ready) {
    const { FB } = window;
    if (!this.roomId || !this.uid) return;
    await FB.update(FB.DB.roomPlayer(this.roomId, this.uid), { ready });
  }

  // ─────────────────────────────────────────────
  // OYUN BAŞLAT (oda sahibi tetikler)
  // ─────────────────────────────────────────────

  /**
   * Her iki takımda en az 1 hazır oyuncu varsa oyunu başlatır.
   * status: waiting → countdown (3sn) → playing
   */
  async startGame() {
    const { FB } = window;
    if (!this.roomId) return;

    const snap    = await FB.get(FB.DB.roomPresence(this.roomId));
    if (!snap.exists()) throw new Error('Odada oyuncu yok.');

    const players = Object.values(snap.val());
    const aReady  = players.filter(p => p.team === 'A' && p.ready);
    const bReady  = players.filter(p => p.team === 'B' && p.ready);

    if (aReady.length === 0) throw new Error('A takımında hazır oyuncu yok.');
    if (bReady.length === 0) throw new Error('B takımında hazır oyuncu yok.');

    await FB.update(FB.DB.roomMeta(this.roomId), {
      status:    'countdown',
      startedAt: FB.serverTimestamp(),
    });
  }

  // ─────────────────────────────────────────────
  // DİNLEYİCİLER
  // ─────────────────────────────────────────────

  /**
   * Oda meta değişikliklerini dinle.
   * @param {function} cb - (meta) => void
   */
  onMeta(cb) {
    const { FB } = window;
    const unsub = FB.onValue(FB.DB.roomMeta(this.roomId), snap => {
      if (snap.exists()) cb(snap.val());
    });
    this._listeners.push(unsub);
    return unsub;
  }

  /**
   * Oyuncu listesi değişikliklerini dinle.
   * @param {function} cb - (playersObj) => void
   */
  onPlayers(cb) {
    const { FB } = window;
    const unsub = FB.onValue(FB.DB.roomPresence(this.roomId), snap => {
      cb(snap.exists() ? snap.val() : {});
    });
    this._listeners.push(unsub);
    return unsub;
  }

  // ─────────────────────────────────────────────
  // TEMİZLE
  // ─────────────────────────────────────────────

  dispose() {
    this._listeners.forEach(u => u());
    this._listeners = [];
  }

  async leaveRoom() {
    const { FB } = window;
    if (!this.roomId || !this.uid) return;
    this.dispose();
    await FB.remove(FB.DB.roomPlayer(this.roomId, this.uid));
    this.roomId = null;
  }

  // ─────────────────────────────────────────────
  // YARDIMCI
  // ─────────────────────────────────────────────

  _genCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  }
}

window.LobbyManager = LobbyManager;
