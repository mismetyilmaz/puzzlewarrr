/**
 * puzzleEngine.js
 * Jigsaw puzzle parça kesme motoru.
 * - N×M grid hesabı
 * - Her kenara bağımsız tab/blank bezier şekli
 * - Komşu simetri garantisi (A.sağ = -B.sol)
 * - Snap, grup taşıma, birleştirme
 */

class PuzzleEngine {
  /**
   * @param {HTMLCanvasElement} sourceImage - Kaynak görsel (2400×2400)
   * @param {number} pieceCount - Hedef parça sayısı (≈500)
   * @param {number} seed - RNG seed (imageGen ile aynı)
   */
  constructor(sourceImage, pieceCount = 500, seed = 1) {
    this.source     = sourceImage;
    this.seed       = seed;
    this.rng        = new window.ImageGen.SeededRandom(seed + 9999);

    // Grid boyutlarını hesapla (en-boy oranına göre)
    const aspect    = sourceImage.width / sourceImage.height; // 1.0 for square
    this.cols       = Math.round(Math.sqrt(pieceCount * aspect));
    this.rows       = Math.round(pieceCount / this.cols);
    this.totalPieces= this.cols * this.rows;

    this.pieceW     = sourceImage.width  / this.cols;
    this.pieceH     = sourceImage.height / this.rows;

    // Tab parametreleri grid başında sabitlenir (deterministic)
    // edges[row][col] = { right: tabVal, bottom: tabVal }
    // tabVal > 0 → tab (dışbükey), tabVal < 0 → blank (içbükey)
    this.edges      = this._generateEdges();
    this.pieces     = [];
    this.groups     = new Map(); // groupId → Set<pieceIndex>
    this._nextGroup = 1;
  }

  /** Tüm parçaları oluştur ve canvas fragmentlarını hazırla */
  buildPieces(displayScale = 1) {
    this.displayScale = displayScale;
    this.dispW = this.pieceW * displayScale;
    this.dispH = this.pieceH * displayScale;
    this.pieces = [];

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const idx   = r * this.cols + c;
        const piece = this._buildPiece(r, c, idx);
        this.pieces.push(piece);
      }
    }
    return this.pieces;
  }

  /** Tek parça objesi oluşturur */
  _buildPiece(row, col, idx) {
    const TAB_SIZE  = Math.min(this.dispW, this.dispH) * 0.28; // tab dışarı taşma miktarı
    const padding   = TAB_SIZE + 4;

    // Ekran canvas boyutu: parça + tab taşmaları
    const canvasW   = Math.ceil(this.dispW + padding * 2);
    const canvasH   = Math.ceil(this.dispH + padding * 2);

    const cv  = document.createElement('canvas');
    cv.width  = canvasW;
    cv.height = canvasH;
    const ctx = cv.getContext('2d');

    // Tab değerleri: +1 tab dışarı, -1 blank içeri
    const topTab    = row > 0             ? -this.edges[row-1][col].bottom   : 0;
    const bottomTab = row < this.rows - 1 ?  this.edges[row][col].bottom     : 0;
    const leftTab   = col > 0             ? -this.edges[row][col-1].right    : 0;
    const rightTab  = col < this.cols - 1 ?  this.edges[row][col].right      : 0;

    // Clip path çiz
    ctx.save();
    this._drawPiecePath(ctx, padding, padding, this.dispW, this.dispH,
      topTab, rightTab, bottomTab, leftTab, TAB_SIZE);
    ctx.clip();

    // Kaynak görseli bu bölgeye çiz
    ctx.drawImage(
      this.source,
      col * this.pieceW,           // sx
      row * this.pieceH,           // sy
      this.pieceW * (1 + 2 * 0.3), // sw (tab taşmaları dahil - yaklaşık)
      this.pieceH * (1 + 2 * 0.3), // sh
      padding - this.dispW * 0.3,  // dx
      padding - this.dispH * 0.3,  // dy
      this.dispW * 1.6,            // dw
      this.dispH * 1.6             // dh
    );

    // Doğru kırpma: sadece bu parçanın pikselleri
    ctx.restore();

    // Yeniden temiz çizim - kaynak görseli tam offsetle çiz
    ctx.clearRect(0, 0, canvasW, canvasH);
    ctx.save();
    this._drawPiecePath(ctx, padding, padding, this.dispW, this.dispH,
      topTab, rightTab, bottomTab, leftTab, TAB_SIZE);
    ctx.clip();

    ctx.drawImage(
      this.source,
      col * this.pieceW - TAB_SIZE / this.displayScale,
      row * this.pieceH - TAB_SIZE / this.displayScale,
      canvasW / this.displayScale,
      canvasH / this.displayScale,
      0, 0, canvasW, canvasH
    );
    ctx.restore();

    // Outline çiz
    ctx.save();
    this._drawPiecePath(ctx, padding, padding, this.dispW, this.dispH,
      topTab, rightTab, bottomTab, leftTab, TAB_SIZE);
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth   = 1.5;
    ctx.stroke();
    ctx.restore();

    return {
      idx,
      row,
      col,
      canvas:    cv,
      padding,
      canvasW,
      canvasH,
      // Oyun dünya koordinatı (parçanın sol-üst noktası, padding dahil değil)
      x: 0,
      y: 0,
      // Doğru konumda olduğu hedef koordinat
      targetX: col * this.dispW,
      targetY: row * this.dispH,
      joined:  false,
      groupId: null,
      // Tab değerleri snap kontrolü için
      topTab, rightTab, bottomTab, leftTab,
    };
  }

  /**
   * Jigsaw parça path'ini çizer.
   * ox, oy: parça sol-üst köşe (padding sonrası)
   * pw, ph: parça genişlik/yükseklik
   * top/right/bottom/left: -1..+1 tab değeri (0 = düz kenar)
   * tabSize: tab yüksekliği px
   */
  _drawPiecePath(ctx, ox, oy, pw, ph, top, right, bottom, left, tabSize) {
    ctx.beginPath();
    ctx.moveTo(ox, oy);

    // Üst kenar → sağa
    this._drawEdge(ctx, ox, oy, ox + pw, oy, top, tabSize, 'horizontal', false);
    // Sağ kenar → aşağı
    this._drawEdge(ctx, ox + pw, oy, ox + pw, oy + ph, right, tabSize, 'vertical', false);
    // Alt kenar → sola
    this._drawEdge(ctx, ox + pw, oy + ph, ox, oy + ph, bottom, tabSize, 'horizontal', true);
    // Sol kenar → yukarı
    this._drawEdge(ctx, ox, oy + ph, ox, oy, left, tabSize, 'vertical', true);

    ctx.closePath();
  }

  /**
   * Tek bir kenara jigsaw tab/blank çizer.
   * x1,y1 → x2,y2 yönünde gider.
   * tabDir: +1 dışarı, -1 içeri, 0 düz
   */
  _drawEdge(ctx, x1, y1, x2, y2, tabDir, tabSize, axis, reverse) {
    if (tabDir === 0) {
      ctx.lineTo(x2, y2);
      return;
    }

    const dx     = x2 - x1;
    const dy     = y2 - y1;
    const len    = Math.sqrt(dx * dx + dy * dy);
    const ux     = dx / len;
    const uy     = dy / len;
    // Normal (90° döndürülmüş)
    const nx     = -uy * tabDir;
    const ny     =  ux * tabDir;

    // Tab pozisyonu kenar boyunca (0.35–0.65)
    const key  = `${axis}_${reverse}`;
    const pos  = 0.5; // Merkeze sabitle (daha temiz görünür)
    const tW   = tabSize * 0.55; // Tab genişliği (yarısı her yanda)
    const tH   = tabSize;        // Tab yüksekliği

    const midX  = x1 + dx * pos;
    const midY  = y1 + dy * pos;

    // Tab başlangıç ve bitiş noktaları
    const t0x   = midX - ux * tW;
    const t0y   = midY - uy * tW;
    const t1x   = midX + ux * tW;
    const t1y   = midY + uy * tW;

    // Tab tepe noktası
    const topX  = midX + nx * tH;
    const topY  = midY + ny * tH;

    // Kenar başından tab başına
    ctx.lineTo(t0x, t0y);

    // Tab bezier eğrisi
    ctx.bezierCurveTo(
      t0x + nx * tH * 0.5,  t0y + ny * tH * 0.5,
      topX - ux * tW * 0.8, topY - uy * tW * 0.8,
      topX, topY
    );
    ctx.bezierCurveTo(
      topX + ux * tW * 0.8, topY + uy * tW * 0.8,
      t1x + nx * tH * 0.5,  t1y + ny * tH * 0.5,
      t1x, t1y
    );

    // Tab bitişinden kenar sonuna
    ctx.lineTo(x2, y2);
  }

  /** Deterministic tab değerleri (komşu simetrisi garanti) */
  _generateEdges() {
    const edges = [];
    for (let r = 0; r < this.rows; r++) {
      edges[r] = [];
      for (let c = 0; c < this.cols; c++) {
        // right: bu parça sağa, bottom: bu parça aşağıya tab/blank
        const right  = c < this.cols - 1 ? (this.rng.next() > 0.5 ? 1 : -1) : 0;
        const bottom = r < this.rows - 1 ? (this.rng.next() > 0.5 ? 1 : -1) : 0;
        edges[r][c] = { right, bottom };
      }
    }
    return edges;
  }

  // ─────────────────────────────────────────────
  // SNAP & GRUP SİSTEMİ
  // ─────────────────────────────────────────────

  /**
   * Parça bırakıldığında snap kontrolü.
   * @param {number} movedIdx - Hareket eden parça indexi
   * @param {number} snapThreshold - Snap eşiği px
   * @returns {boolean} Snap oluştu mu
   */
  checkSnap(movedIdx, snapThreshold = 18) {
    const moved   = this.pieces[movedIdx];
    const neighbors = this._getNeighbors(movedIdx);
    let snapped   = false;

    for (const { idx: neighborIdx, dir } of neighbors) {
      const neighbor = this.pieces[neighborIdx];
      if (!neighbor.joined && moved.joined) continue; // joined parçayı tekrar snap etme

      // Beklenen rölatif pozisyon
      let expectedDX = 0;
      let expectedDY = 0;
      if (dir === 'right')  expectedDX = this.dispW;
      if (dir === 'left')   expectedDX = -this.dispW;
      if (dir === 'bottom') expectedDY = this.dispH;
      if (dir === 'top')    expectedDY = -this.dispH;

      const actualDX = neighbor.x - moved.x;
      const actualDY = neighbor.y - moved.y;

      const errX = Math.abs(actualDX - expectedDX);
      const errY = Math.abs(actualDY - expectedDY);

      if (errX < snapThreshold && errY < snapThreshold) {
        // Snap! Komşuyu moved'a hizala
        neighbor.x = moved.x + expectedDX;
        neighbor.y = moved.y + expectedDY;
        this._mergeGroups(movedIdx, neighborIdx);
        snapped = true;
      }
    }
    return snapped;
  }

  /** Komşu parçaları döndürür */
  _getNeighbors(idx) {
    const { row, col } = this.pieces[idx];
    const result = [];
    if (col + 1 < this.cols) result.push({ idx: row * this.cols + col + 1, dir: 'right'  });
    if (col - 1 >= 0)        result.push({ idx: row * this.cols + col - 1, dir: 'left'   });
    if (row + 1 < this.rows) result.push({ idx: (row+1) * this.cols + col, dir: 'bottom' });
    if (row - 1 >= 0)        result.push({ idx: (row-1) * this.cols + col, dir: 'top'    });
    return result;
  }

  /** İki parçanın gruplarını birleştirir */
  _mergeGroups(idxA, idxB) {
    const pieceA = this.pieces[idxA];
    const pieceB = this.pieces[idxB];

    // Grup ID'lerini belirle
    let gA = pieceA.groupId;
    let gB = pieceB.groupId;

    if (gA === null && gB === null) {
      // İkisi de grupsuz → yeni grup
      const newId = this._nextGroup++;
      pieceA.groupId = newId;
      pieceB.groupId = newId;
      this.groups.set(newId, new Set([idxA, idxB]));
    } else if (gA !== null && gB === null) {
      pieceB.groupId = gA;
      this.groups.get(gA).add(idxB);
    } else if (gA === null && gB !== null) {
      pieceA.groupId = gB;
      this.groups.get(gB).add(idxA);
    } else if (gA !== gB) {
      // İki farklı grubu birleştir (küçüğü büyüğe ekle)
      const setA = this.groups.get(gA);
      const setB = this.groups.get(gB);
      for (const i of setB) {
        setA.add(i);
        this.pieces[i].groupId = gA;
      }
      this.groups.delete(gB);
    }
  }

  /**
   * Grup üyelerini taşır (bir parça sürüklenince tüm grup gider).
   * @param {number} idx - Sürüklenen parça
   * @param {number} dx  - Delta x
   * @param {number} dy  - Delta y
   */
  moveGroupOf(idx, dx, dy) {
    const piece = this.pieces[idx];
    if (piece.groupId !== null) {
      for (const memberIdx of this.groups.get(piece.groupId)) {
        this.pieces[memberIdx].x += dx;
        this.pieces[memberIdx].y += dy;
      }
    } else {
      piece.x += dx;
      piece.y += dy;
    }
  }

  /**
   * Tüm parçaları tamamlanmış mı kontrol et.
   */
  isComplete() {
    return this.pieces.every(p => p.joined);
  }

  /**
   * Joined sayısını döndürür.
   */
  joinedCount() {
    return this.pieces.filter(p => p.joined).length;
  }
}

window.PuzzleEngine = PuzzleEngine;
