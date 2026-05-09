/**
 * gameCanvas.js
 * Ana oyun canvas render motoru.
 * - Dünya koordinat sistemi (zoom + pan)
 * - Puzzle tahtası dünya ortasında sabit
 * - Parçalar tahta etrafına 4 yöne dağıtılır
 * - Mouse wheel zoom, orta/sağ tuş pan
 * - Touch: tek parmak sürükle, iki parmak pinch-zoom + pan
 * - redistributePieces() → dağıt butonu
 * - centerBoard() → tahtayı ortala butonu
 */

class GameCanvas {
  constructor(canvas, engine, opts = {}) {
    this.canvas  = canvas;
    this.ctx     = canvas.getContext('2d');
    this.engine  = engine;
    this.opts    = Object.assign({
      bgColor:       '#0d0d1a',
      boardColor:    '#13132a',
      snapThreshold: 20,
      onProgress:    null,
      onComplete:    null,
    }, opts);

    this.W = canvas.width;
    this.H = canvas.height;

    // ── Tahta dünya koordinatı ──
    const totalBoardW = engine.cols * engine.dispW;
    const totalBoardH = engine.rows * engine.dispH;
    this.boardOffX = 1200;
    this.boardOffY = 800;

    // ── Kamera: başlangıçta tahtayı ekran ortasına getir ──
    const boardCX = this.boardOffX + totalBoardW / 2;
    const boardCY = this.boardOffY + totalBoardH / 2;
    const fitZoom = Math.min(
      (this.W * 0.75) / totalBoardW,
      (this.H * 0.80) / totalBoardH,
      1.0
    );
    this.cam = {
      x:    boardCX - (this.W / 2) / fitZoom,
      y:    boardCY - (this.H / 2) / fitZoom,
      zoom: fitZoom,
    };
    this.minZoom = 0.12;
    this.maxZoom = 4.0;

    // ── Sürükleme / pan durumu ──
    this.drag    = null;   // { idx, lastWX, lastWY }
    this.panning = null;   // { lastSX, lastSY }

    // ── Touch (Pointer API) ──
    this.touches          = {};   // pointerId → {x,y}
    this.pinchDist        = null;
    this._lastPinchCenter = null;

    // ── Snap animasyonları ──
    this.snapAnim = [];   // [{idx, t}]

    // ── Z-order ──
    this.zOrder = engine.pieces.map((_, i) => i);

    // ── İlk dağıtma ──
    this._scatterPieces(engine.seed + 77777, false);

    // ── Events ──
    this._bindEvents();

    // ── RAF ──
    this._rafId    = null;
    this._lastTime = 0;
    this.running   = false;
  }

  // ─────────────────────────────────────────────
  // BAŞLAT / DURDUR
  // ─────────────────────────────────────────────

  start() {
    this.running = true;
    this._loop(performance.now());
  }

  stop() {
    this.running = false;
    if (this._rafId) cancelAnimationFrame(this._rafId);
  }

  _loop(now) {
    if (!this.running) return;
    const dt = Math.min((now - this._lastTime) / 1000, 0.05);
    this._lastTime = now;
    this._update(dt);
    this._draw();
    this._rafId = requestAnimationFrame(t => this._loop(t));
  }

  // ─────────────────────────────────────────────
  // DAĞITMA
  // ─────────────────────────────────────────────

  _scatterPieces(rngSeed, onlyUnjoined) {
  const rng    = new window.ImageGen.SeededRandom(rngSeed >>> 0);
  const e      = this.engine;
  const boardW = e.cols * e.dispW;
  const boardH = e.rows * e.dispH;

  const targets = e.pieces.filter(p =>
    onlyUnjoined ? (!p.joined && p.groupId === null) : true
  );
  if (targets.length === 0) return;

  const cw  = e.pieces[0].canvasW + 3;
  const ch  = e.pieces[0].canvasH + 3;
  const gap = 8;

  // Tahtanın etrafını saran dikdörtgen şerit — tek seferde tüm slotları üret
  // Şerit genişliği: kaç parça sığıyorsa o kadar sıra
  const bx = this.boardOffX;
  const by = this.boardOffY;

  // Kaç sıra gerekiyor hesapla
  const totalNeeded = targets.length;
  const slots = [];
  let ring = 0;

  while (slots.length < totalNeeded && ring < 30) {
    const pad   = gap + ring * (Math.max(cw, ch) + 2);
    // Dış dikdörtgenin sol-üst ve sağ-alt köşesi
    const x0    = bx - pad - cw;
    const y0    = by - pad - ch;
    const x1    = bx + boardW + pad;
    const y1    = by + boardH + pad;

    // Üst kenar: x0'dan x1'e kadar yatay
    for (let x = x0; x <= x1; x += cw) {
      slots.push({ x, y: y0 });
    }
    // Sağ kenar: y0+ch'dan y1'e kadar dikey (üst köşe zaten eklendi)
    for (let y = y0 + ch; y <= y1; y += ch) {
      slots.push({ x: x1, y });
    }
    // Alt kenar: x1-cw'dan x0'a kadar (sağ köşe zaten eklendi)
    for (let x = x1 - cw; x >= x0; x -= cw) {
      slots.push({ x, y: y1 });
    }
    // Sol kenar: y1-ch'dan y0+ch'a kadar (iki köşe zaten eklendi)
    for (let y = y1 - ch; y >= y0 + ch; y -= ch) {
      slots.push({ x: x0, y });
    }

    ring++;
  }

  // Karıştır
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }

  targets.forEach((p, i) => {
    const s = slots[i % slots.length];
    p.x = s.x;
    p.y = s.y;
  });
}
  /** Public: joined olmayan parçaları yeniden dağıt */
  redistributePieces() {
  this._scatterPieces(Date.now() & 0xFFFFFF, true);
}

  /** Public: tahtayı ekran ortasına getir */
  centerBoard() {
    const e      = this.engine;
    const boardW = e.cols * e.dispW;
    const boardH = e.rows * e.dispH;
    const cx     = this.boardOffX + boardW / 2;
    const cy     = this.boardOffY + boardH / 2;
    const zoom   = Math.min(
      (this.W * 0.75) / boardW,
      (this.H * 0.80) / boardH,
      1.0
    );
    this.cam.zoom = zoom;
    this.cam.x    = cx - (this.W / 2) / zoom;
    this.cam.y    = cy - (this.H / 2) / zoom;
  }

  resize(w, h) {
    this.W = w;
    this.H = h;
  }

  // ─────────────────────────────────────────────
  // KOORDİNAT DÖNÜŞÜMÜ
  // ─────────────────────────────────────────────

  _clientToCanvas(cx, cy) {
    const rect   = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width  / rect.width;
    const scaleY = this.canvas.height / rect.height;
    return {
      sx: (cx - rect.left) * scaleX,
      sy: (cy - rect.top)  * scaleY,
    };
  }

  _getScreenPos(e) {
    return this._clientToCanvas(e.clientX, e.clientY);
  }

  _screenToWorld(sx, sy) {
    return {
      x: sx / this.cam.zoom + this.cam.x,
      y: sy / this.cam.zoom + this.cam.y,
    };
  }

  _getPos(e) {
    const { sx, sy } = this._getScreenPos(e);
    const { x, y }  = this._screenToWorld(sx, sy);
    return { sx, sy, x, y };
  }

  // ─────────────────────────────────────────────
  // UPDATE
  // ─────────────────────────────────────────────

  _update(dt) {
    this.snapAnim = this.snapAnim.filter(a => {
      a.t += dt * 6;
      return a.t < 1;
    });
  }

  // ─────────────────────────────────────────────
  // DRAW
  // ─────────────────────────────────────────────

  _draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.W, this.H);

    // Arka plan
    ctx.fillStyle = this.opts.bgColor;
    ctx.fillRect(0, 0, this.W, this.H);

    // ── Dünya transform başlat ──
    ctx.save();
    ctx.translate(
      -this.cam.x * this.cam.zoom,
      -this.cam.y * this.cam.zoom
    );
    ctx.scale(this.cam.zoom, this.cam.zoom);

    this._drawGrid();
    this._drawBoard();
    this._drawJoinedOnBoard();

    for (const idx of this.zOrder) {
      const p = this.engine.pieces[idx];
      if (!p.joined) this._drawPiece(ctx, p, idx);
    }

    ctx.restore();
    // ── Dünya transform bitti ──

    // HUD ekran koordinatında
    this._drawHUD();
  }

  _drawGrid() {
    if (this.cam.zoom < 0.22) return;
    const ctx    = this.ctx;
    const step   = 100;
    const zoom   = this.cam.zoom;
    const left   = this.cam.x;
    const top    = this.cam.y;
    const right  = this.cam.x + this.W / zoom;
    const bottom = this.cam.y + this.H / zoom;

    ctx.strokeStyle = 'rgba(255,255,255,0.028)';
    ctx.lineWidth   = 1 / zoom;

    const sx = Math.floor(left  / step) * step;
    const sy = Math.floor(top   / step) * step;

    for (let wx = sx; wx < right;  wx += step) {
      ctx.beginPath(); ctx.moveTo(wx, top); ctx.lineTo(wx, bottom); ctx.stroke();
    }
    for (let wy = sy; wy < bottom; wy += step) {
      ctx.beginPath(); ctx.moveTo(left, wy); ctx.lineTo(right, wy); ctx.stroke();
    }
  }

  _drawBoard() {
    const ctx  = this.ctx;
    const e    = this.engine;
    const bx   = this.boardOffX;
    const by   = this.boardOffY;
    const bw   = e.cols * e.dispW;
    const bh   = e.rows * e.dispH;
    const zoom = this.cam.zoom;

    // Gölge
    ctx.shadowColor   = 'rgba(0,0,0,0.65)';
    ctx.shadowBlur    = 40 / zoom;
    ctx.shadowOffsetX = 8  / zoom;
    ctx.shadowOffsetY = 8  / zoom;

    ctx.fillStyle = this.opts.boardColor;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 8 / zoom);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur  = 0;

    // Border
    ctx.strokeStyle = 'rgba(120,120,255,0.14)';
    ctx.lineWidth   = 1.5 / zoom;
    ctx.stroke();

    // Izgara kılavuz çizgileri
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth   = 0.5 / zoom;
    for (let c = 0; c <= e.cols; c++) {
      const x = bx + c * e.dispW;
      ctx.beginPath(); ctx.moveTo(x, by); ctx.lineTo(x, by + bh); ctx.stroke();
    }
    for (let r = 0; r <= e.rows; r++) {
      const y = by + r * e.dispH;
      ctx.beginPath(); ctx.moveTo(bx, y); ctx.lineTo(bx + bw, y); ctx.stroke();
    }
  }

  _drawJoinedOnBoard() {
    const ctx = this.ctx;
    const e   = this.engine;
    for (const p of e.pieces) {
      if (!p.joined) continue;
      ctx.drawImage(
        p.canvas,
        this.boardOffX + p.col * e.dispW - p.padding,
        this.boardOffY + p.row * e.dispH - p.padding
      );
    }
  }

  _drawPiece(ctx, piece, idx) {
    const isDragging = this.drag && (
      this.drag.idx === idx ||
      (piece.groupId !== null &&
        this.engine.pieces[this.drag.idx]?.groupId === piece.groupId)
    );
    const snapA = this.snapAnim.find(a => a.idx === idx);
    const zoom  = this.cam.zoom;

    ctx.save();

    if (isDragging) {
      ctx.shadowColor   = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur    = 22 / zoom;
      ctx.shadowOffsetX = 4  / zoom;
      ctx.shadowOffsetY = 6  / zoom;
    }

    if (snapA) {
      const pulse       = Math.sin(snapA.t * Math.PI);
      ctx.shadowColor   = `rgba(100,200,255,${0.9 * pulse})`;
      ctx.shadowBlur    = 30 / zoom * pulse;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    }

    ctx.drawImage(piece.canvas, piece.x, piece.y);
    ctx.restore();
  }

  _drawHUD() {
    const ctx    = this.ctx;
    const joined = this.engine.joinedCount();
    const total  = this.engine.totalPieces;
    const pct    = Math.round(joined / total * 100);

    const barX = 15, barY = 15, barW = 220, barH = 6;

    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath(); ctx.roundRect(barX, barY, barW, barH, 3); ctx.fill();

    ctx.fillStyle = 'rgba(61,220,132,0.85)';
    ctx.beginPath(); ctx.roundRect(barX, barY, barW * (joined / total), barH, 3); ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font      = '12px monospace';
    ctx.fillText(`${joined} / ${total}  (${pct}%)`, barX, barY + 22);

    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.font      = '11px monospace';
    ctx.fillText(`zoom ${this.cam.zoom.toFixed(2)}×`, barX, this.H - 30);
    ctx.fillText('Scroll: zoom  |  Sağ/orta tuş: pan  |  ↺ Dağıt  |  ⌂ Tahta', barX, this.H - 14);
  }

  // ─────────────────────────────────────────────
  // SNAP & JOIN
  // ─────────────────────────────────────────────

  _afterDrop(idx) {
    const snapped = this.engine.checkSnap(idx, this.opts.snapThreshold);
    if (snapped) {
      const piece = this.engine.pieces[idx];
      const group = piece.groupId !== null
        ? [...this.engine.groups.get(piece.groupId)]
        : [idx];
      for (const gi of group) this.snapAnim.push({ idx: gi, t: 0 });
    }

    this._checkJoined(idx);

    if (this.opts.onProgress)
      this.opts.onProgress(this.engine.joinedCount(), this.engine.totalPieces);
    if (this.engine.isComplete() && this.opts.onComplete)
      this.opts.onComplete();
  }

  _checkJoined(idx) {
    const e     = this.engine;
    const piece = e.pieces[idx];
    const group = piece.groupId !== null
      ? [...e.groups.get(piece.groupId)]
      : [idx];

    for (const gi of group) {
      const p = e.pieces[gi];
      if (p.joined) continue;
      const tx     = this.boardOffX + p.col * e.dispW - p.padding;
      const ty     = this.boardOffY + p.row * e.dispH - p.padding;
      const thresh = this.opts.snapThreshold * 2.5;
      if (Math.abs(p.x - tx) < thresh && Math.abs(p.y - ty) < thresh) {
        p.joined = true;
        p.x      = tx;
        p.y      = ty;
        this.snapAnim.push({ idx: gi, t: 0 });
      }
    }
  }

  // ─────────────────────────────────────────────
  // MOUSE EVENTS
  // ─────────────────────────────────────────────

  _onMouseDown(e) {
    if (e.button === 1 || e.button === 2) {
      const { sx, sy } = this._getScreenPos(e);
      this.panning = { lastSX: sx, lastSY: sy };
      return;
    }
    if (e.button !== 0) return;
    const { x, y } = this._getPos(e);
    this._tryStartDrag(x, y);
  }

  _onMouseMove(e) {
    if (this.panning) {
      const { sx, sy } = this._getScreenPos(e);
      this.cam.x -= (sx - this.panning.lastSX) / this.cam.zoom;
      this.cam.y -= (sy - this.panning.lastSY) / this.cam.zoom;
      this.panning.lastSX = sx;
      this.panning.lastSY = sy;
      return;
    }
    if (!this.drag) return;
    const { x, y } = this._getPos(e);
    this._moveDrag(x, y);
  }

  _onMouseUp(e) {
    if (this.panning) { this.panning = null; return; }
    if (!this.drag)   return;
    const idx = this.drag.idx;
    this.drag = null;
    this._afterDrop(idx);
  }

  _onWheel(e) {
    e.preventDefault();
    const { sx, sy } = this._getScreenPos(e);
    this._applyZoom(e.deltaY > 0 ? 0.9 : 1.1, sx, sy);
  }

  // ─────────────────────────────────────────────
  // POINTER EVENTS (touch)
  // ─────────────────────────────────────────────

  _onPointerDown(e) {
    this.canvas.setPointerCapture(e.pointerId);
    this.touches[e.pointerId] = { x: e.clientX, y: e.clientY };
    const count = Object.keys(this.touches).length;

    if (count === 1) {
      const { x, y } = this._getPos(e);
      const hit       = this._findPieceAt(x, y);
      if (hit !== -1) {
        this._startDragIdx(hit, x, y);
      } else {
        const { sx, sy } = this._getScreenPos(e);
        this.panning = { lastSX: sx, lastSY: sy };
      }
    } else if (count === 2) {
      this.drag    = null;
      this.panning = null;
      this.pinchDist = this._getPinchDist();
    }
  }

  _onPointerMove(e) {
    if (!this.touches[e.pointerId]) return;
    this.touches[e.pointerId] = { x: e.clientX, y: e.clientY };
    const count = Object.keys(this.touches).length;

    if (count === 2) {
      const newDist = this._getPinchDist();
      if (this.pinchDist && newDist > 0) {
        const center  = this._getPinchCenter();
        const { sx, sy } = this._clientToCanvas(center.x, center.y);
        this._applyZoom(newDist / this.pinchDist, sx, sy);
        if (this._lastPinchCenter) {
          this.cam.x -= (sx - this._lastPinchCenter.sx) / this.cam.zoom;
          this.cam.y -= (sy - this._lastPinchCenter.sy) / this.cam.zoom;
        }
        this._lastPinchCenter = { sx, sy };
      }
      this.pinchDist = newDist;
      return;
    }

    this._lastPinchCenter = null;

    if (this.panning) {
      const { sx, sy } = this._getScreenPos(e);
      this.cam.x -= (sx - this.panning.lastSX) / this.cam.zoom;
      this.cam.y -= (sy - this.panning.lastSY) / this.cam.zoom;
      this.panning.lastSX = sx;
      this.panning.lastSY = sy;
      return;
    }
    if (this.drag) {
      const { x, y } = this._getPos(e);
      this._moveDrag(x, y);
    }
  }

  _onPointerUp(e) {
    delete this.touches[e.pointerId];
    this.pinchDist        = null;
    this._lastPinchCenter = null;
    if (this.panning) { this.panning = null; return; }
    if (this.drag) {
      const idx = this.drag.idx;
      this.drag = null;
      this._afterDrop(idx);
    }
  }

  _getPinchDist() {
    const pts = Object.values(this.touches);
    if (pts.length < 2) return null;
    const dx = pts[0].x - pts[1].x;
    const dy = pts[0].y - pts[1].y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  _getPinchCenter() {
    const pts = Object.values(this.touches);
    return {
      x: (pts[0].x + pts[1].x) / 2,
      y: (pts[0].y + pts[1].y) / 2,
    };
  }

  // ─────────────────────────────────────────────
  // DRAG HELPERS
  // ─────────────────────────────────────────────

  _tryStartDrag(wx, wy) {
    const idx = this._findPieceAt(wx, wy);
    if (idx !== -1) this._startDragIdx(idx, wx, wy);
  }

  _startDragIdx(idx, wx, wy) {
    const piece = this.engine.pieces[idx];
    const group = piece.groupId !== null
      ? new Set(this.engine.groups.get(piece.groupId))
      : new Set([idx]);

    this.zOrder = [
      ...this.zOrder.filter(i => !group.has(i)),
      ...this.zOrder.filter(i => group.has(i) && i !== idx),
      idx,
    ];

    this.drag = { idx, lastWX: wx, lastWY: wy };
  }

  _moveDrag(wx, wy) {
    const dx = wx - this.drag.lastWX;
    const dy = wy - this.drag.lastWY;
    this.drag.lastWX = wx;
    this.drag.lastWY = wy;
    this.engine.moveGroupOf(this.drag.idx, dx, dy);
  }

  _findPieceAt(wx, wy) {
    for (let zi = this.zOrder.length - 1; zi >= 0; zi--) {
      const idx   = this.zOrder[zi];
      const piece = this.engine.pieces[idx];
      if (piece.joined) continue;
      if (wx >= piece.x && wx <= piece.x + piece.canvasW &&
          wy >= piece.y && wy <= piece.y + piece.canvasH) {
        return idx;
      }
    }
    return -1;
  }

  // ─────────────────────────────────────────────
  // ZOOM
  // ─────────────────────────────────────────────

  _applyZoom(factor, sx, sy) {
    const oldZoom = this.cam.zoom;
    const newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, oldZoom * factor));
    if (newZoom === oldZoom) return;
    const wx      = sx / oldZoom + this.cam.x;
    const wy      = sy / oldZoom + this.cam.y;
    this.cam.zoom = newZoom;
    this.cam.x    = wx - sx / newZoom;
    this.cam.y    = wy - sy / newZoom;
  }

  // ─────────────────────────────────────────────
  // EVENT BINDER
  // ─────────────────────────────────────────────

  _bindEvents() {
    const c = this.canvas;
    c.addEventListener('mousedown',     e => this._onMouseDown(e));
    c.addEventListener('mousemove',     e => this._onMouseMove(e));
    c.addEventListener('mouseup',       e => this._onMouseUp(e));
    c.addEventListener('mouseleave',    e => this._onMouseUp(e));
    c.addEventListener('wheel',         e => this._onWheel(e), { passive: false });
    c.addEventListener('contextmenu',   e => e.preventDefault());
    c.addEventListener('pointerdown',   e => this._onPointerDown(e));
    c.addEventListener('pointermove',   e => this._onPointerMove(e));
    c.addEventListener('pointerup',     e => this._onPointerUp(e));
    c.addEventListener('pointercancel', e => this._onPointerUp(e));
  }
}

window.GameCanvas = GameCanvas;
