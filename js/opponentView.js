/**
 * opponentView.js
 * Sağ üstte rakibin ilerleme durumunu gösteren minimap.
 *
 * - Siyah zemin
 * - joined=true olan parçalar beyaz dikdörtgen
 * - Siyah outline
 * - SyncManager'dan gelen Set<pieceIdx> ile güncellenir
 */

class OpponentView {
  /**
   * @param {HTMLCanvasElement} canvas  - minimap canvas elementi
   * @param {PuzzleEngine}      engine
   */
  constructor(canvas, engine) {
    this.canvas  = canvas;
    this.ctx     = canvas.getContext('2d');
    this.engine  = engine;

    // Canvas boyutunu ayarla
    this.W = canvas.width;
    this.H = canvas.height;

    // Parça minimap scale: tüm grid bu canvas'a sığsın
    const scaleX = this.W / engine.cols;
    const scaleY = this.H / engine.rows;
    this.cellW   = scaleX;
    this.cellH   = scaleY;

    this._joinedSet = new Set();
    this._draw();
  }

  /**
   * Rakipten gelen yeni joined set ile güncelle.
   * @param {Set<number>} joinedSet - joined parça indexleri
   */
  update(joinedSet) {
    this._joinedSet = joinedSet;
    this._draw();
  }

  _draw() {
    const ctx = this.ctx;
    const e   = this.engine;
    ctx.clearRect(0, 0, this.W, this.H);

    // Zemin
    ctx.fillStyle = '#0a0a18';
    ctx.fillRect(0, 0, this.W, this.H);

    // Border
    ctx.strokeStyle = 'rgba(120,120,255,0.25)';
    ctx.lineWidth   = 1;
    ctx.strokeRect(0.5, 0.5, this.W - 1, this.H - 1);

    // Joined parçalar
    for (const p of e.pieces) {
      const col = p.col;
      const row = p.row;
      const x   = col * this.cellW;
      const y   = row * this.cellH;
      const w   = Math.max(1, this.cellW - 0.5);
      const h   = Math.max(1, this.cellH - 0.5);

      if (this._joinedSet.has(p.idx)) {
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.lineWidth   = 0.5;
        ctx.strokeRect(x, y, w, h);
      } else {
        // Boş hücre: çok ince grid çizgisi
        ctx.strokeStyle = 'rgba(255,255,255,0.04)';
        ctx.lineWidth   = 0.3;
        ctx.strokeRect(x, y, w, h);
      }
    }

    // Başlık
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font      = `bold ${Math.max(9, this.W * 0.07)}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('RAKİP', this.W / 2, this.H + (this.W * 0.08));
    ctx.textAlign = 'left';
  }

  resize(w, h) {
    this.canvas.width  = w;
    this.canvas.height = h;
    this.W     = w;
    this.H     = h;
    const scaleX = w / this.engine.cols;
    const scaleY = h / this.engine.rows;
    this.cellW   = scaleX;
    this.cellH   = scaleY;
    this._draw();
  }
}

window.OpponentView = OpponentView;
