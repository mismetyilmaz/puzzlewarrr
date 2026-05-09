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
this._boardSet = new Set();
this._groupSet = new Set();
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
 update(boardSet, groupSet) {
  this._boardSet = boardSet || new Set();
  this._groupSet = groupSet || new Set();
  this._draw();
}

_draw() {
  const ctx = this.ctx;
  const e   = this.engine;
  ctx.clearRect(0, 0, this.W, this.H);

  ctx.fillStyle = '#0a0a18';
  ctx.fillRect(0, 0, this.W, this.H);

  ctx.strokeStyle = 'rgba(120,120,255,0.25)';
  ctx.lineWidth   = 1;
  ctx.strokeRect(0.5, 0.5, this.W - 1, this.H - 1);

  for (const p of e.pieces) {
    const x = p.col * this.cellW;
    const y = p.row * this.cellH;
    const w = Math.max(1, this.cellW - 0.5);
    const h = Math.max(1, this.cellH - 0.5);

    if (this._boardSet.has(p.idx)) {
      // Tahtada → yeşil
      ctx.fillStyle   = 'rgba(61,220,132,0.92)';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth   = 0.5;
      ctx.strokeRect(x, y, w, h);
    } else if (this._groupSet.has(p.idx)) {
      // Dışarda gruplu → beyaz
      ctx.fillStyle   = 'rgba(255,255,255,0.85)';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth   = 0.5;
      ctx.strokeRect(x, y, w, h);
    } else {
      // Boş
      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      ctx.lineWidth   = 0.3;
      ctx.strokeRect(x, y, w, h);
    }
  }
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
