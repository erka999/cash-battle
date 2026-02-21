// ===== Safe DOM ready (Telegram WebView friendly) =====
document.addEventListener("DOMContentLoaded", () => {
  const boardEl = document.getElementById("board");
  const statusEl = document.getElementById("status");
  const hintEl = document.getElementById("hint");
  const restartBtn = document.getElementById("restart");

  if (!boardEl || !statusEl || !hintEl || !restartBtn) {
    console.error("Missing required elements: #board, #status, #hint, #restart");
    return;
  }

  restartBtn.addEventListener("click", () => init(true));

  /**
   * 8x8 board, only dark squares are playable.
   * piece: { c:'w'|'b', k:boolean }
   */
  let S = {
    turn: "w",
    board: [],
    selected: null, // {r,c}
    legal: [],      // {from:{r,c}, to:{r,c}, cap:[{r,c},...]}
    mustCapture: false,
    chainFrom: null
  };

  function emptyBoard() {
    return Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => null));
  }

  function setHint(t) {
    hintEl.textContent = t;
  }

  function inBounds(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }
  function isDark(r, c) { return (r + c) % 2 === 1; }

  function pieceAt(r, c) { return S.board[r][c]; }
  function setPiece(r, c, p) { S.board[r][c] = p; }

  function dirsFor(piece) {
    if (piece.k) return [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    return piece.c === "w" ? [[-1, 1], [-1, -1]] : [[1, 1], [1, -1]];
  }

  function init(first = false) {
    S.turn = "w";
    S.board = emptyBoard();
    S.selected = null;
    S.legal = [];
    S.chainFrom = null;

    // Standard setup: Black on top, White on bottom
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 8; c++) {
        if ((r + c) % 2 === 1) S.board[r][c] = { c: "b", k: false };
      }
    }
    for (let r = 5; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if ((r + c) % 2 === 1) S.board[r][c] = { c: "w", k: false };
      }
    }

    recomputeMustCapture();
    render();
    setHint("Tap a piece → then tap a highlighted square to move.");
  }

  function recomputeMustCapture() {
    const all = allMovesFor(S.turn);
    S.mustCapture = all.some(m => m.cap.length > 0);
  }

  function allMovesFor(color) {
    const out = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = pieceAt(r, c);
        if (p && p.c === color) out.push(...legalMovesFor(r, c));
      }
    }
    return out;
  }

  function legalMovesFor(r, c) {
    const p = pieceAt(r, c);
    if (!p) return [];

    const caps = captureMovesFrom(r, c, p);
    if (caps.length > 0) return caps;

    if (S.mustCapture) return [];
    return simpleMovesFrom(r, c, p);
  }

  function simpleMovesFrom(r, c, p) {
    const res = [];
    if (p.k) {
      for (const [dr, dc] of dirsFor(p)) {
        let rr = r + dr, cc = c + dc;
        while (inBounds(rr, cc) && isDark(rr, cc) && !pieceAt(rr, cc)) {
          res.push({ from: { r, c }, to: { r: rr, c: cc }, cap: [] });
          rr += dr; cc += dc;
        }
      }
    } else {
      for (const [dr, dc] of dirsFor(p)) {
        const rr = r + dr, cc = c + dc;
        if (inBounds(rr, cc) && isDark(rr, cc) && !pieceAt(rr, cc)) {
          res.push({ from: { r, c }, to: { r: rr, c: cc }, cap: [] });
        }
      }
    }
    return res;
  }

  function captureMovesFrom(r, c, p) {
    const res = [];

    if (p.k) {
      for (const [dr, dc] of dirsFor(p)) {
        let rr = r + dr, cc = c + dc;
        let seenEnemy = null;

        while (inBounds(rr, cc) && isDark(rr, cc)) {
          const cur = pieceAt(rr, cc);

          if (!cur) {
            if (seenEnemy) {
              res.push({ from: { r, c }, to: { r: rr, c: cc }, cap: [seenEnemy] });
            }
          } else {
            if (cur.c === p.c) break;
            if (seenEnemy) break;
            seenEnemy = { r: rr, c: cc };
          }

          rr += dr; cc += dc;
        }
      }
    } else {
      const allDirs = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
      for (const [dr, dc] of allDirs) {
        const midR = r + dr, midC = c + dc;
        const toR = r + 2 * dr, toC = c + 2 * dc;

        if (!inBounds(toR, toC) || !isDark(toR, toC)) continue;

        const mid = pieceAt(midR, midC);
        if (mid && mid.c !== p.c && !pieceAt(toR, toC)) {
          res.push({ from: { r, c }, to: { r: toR, c: toC }, cap: [{ r: midR, c: midC }] });
        }
      }
    }

    return res;
  }

  function render() {
    boardEl.innerHTML = "";

    const turnText = S.turn === "w" ? "⚪ White" : "⚫ Black";
    statusEl.textContent = `Turn: ${turnText}${S.mustCapture ? " — (Capture required)" : ""}`;

    const legalMap = new Map();
    for (const m of S.legal) legalMap.set(`${m.to.r},${m.to.c}`, m);

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const sq = document.createElement("div");
        sq.className = `square ${(r + c) % 2 === 0 ? "light" : "dark"}`;
        sq.dataset.r = r;
        sq.dataset.c = c;

        // Mobile: make tap reliable
        sq.style.touchAction = "manipulation";

        if (S.selected && S.selected.r === r && S.selected.c === c) {
          sq.classList.add("selected");
        }

        const lm = legalMap.get(`${r},${c}`);
        if (lm) {
          if (lm.cap.length > 0) sq.classList.add("capture");
          else sq.classList.add("move");
        }

        const p = pieceAt(r, c);
        if (p) {
          const el = document.createElement("div");
          el.className = `piece ${p.c === "w" ? "white" : "black"} ${p.k ? "king" : ""}`;
          sq.appendChild(el);
        }

        // IMPORTANT: use pointerdown instead of click (Telegram WebView fix)
        sq.addEventListener("pointerdown", onSquareTap, { passive: false });

        boardEl.appendChild(sq);
      }
    }
  }

  function onSquareTap(e) {
    e.preventDefault();

    const r = Number(e.currentTarget.dataset.r);
    const c = Number(e.currentTarget.dataset.c);
    const p = pieceAt(r, c);

    if (S.chainFrom) {
      const move = S.legal.find(m => m.to.r === r && m.to.c === c);
      if (move) return applyMove(move);
      return;
    }

    if (p && p.c === S.turn) {
      S.selected = { r, c };
      S.legal = legalMovesFor(r, c);
      render();
      setHint("Now tap a highlighted square to make your move.");
      return;
    }

    if (S.selected) {
      const move = S.legal.find(m => m.to.r === r && m.to.c === c);
      if (move) return applyMove(move);
    }
  }

  function applyMove(move) {
    const p = pieceAt(move.from.r, move.from.c);
    if (!p) return;

    setPiece(move.from.r, move.from.c, null);
    setPiece(move.to.r, move.to.c, p);

    for (const cap of move.cap) setPiece(cap.r, cap.c, null);

    if (!p.k) {
      if (p.c === "w" && move.to.r === 0) p.k = true;
      if (p.c === "b" && move.to.r === 7) p.k = true;
    }

    if (move.cap.length > 0) {
      const moreCaps = captureMovesFrom(move.to.r, move.to.c, p);
      if (moreCaps.length > 0) {
        S.selected = { r: move.to.r, c: move.to.c };
        S.legal = moreCaps;
        S.chainFrom = { r: move.to.r, c: move.to.c };
        render();
        setHint("Multi-capture available — you must continue jumping.");
        return;
      }
    }

    S.chainFrom = null;
    S.selected = null;
    S.turn = (S.turn === "w") ? "b" : "w";

    recomputeMustCapture();
    S.legal = [];
    render();
    setHint("Tap a piece → then tap a highlighted square to move.");
  }

  // Start
  init(true);
});
