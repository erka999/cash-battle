document.addEventListener("DOMContentLoaded", () => {
  const boardEl = document.getElementById("board");
  const statusEl = document.getElementById("status");
  const hintEl = document.getElementById("hint");
  const restartBtn = document.getElementById("restart");

  if (!boardEl || !statusEl || !hintEl || !restartBtn) {
    console.error("Missing required elements: #board, #status, #hint, #restart");
    return;
  }

  // ===== OPTIONAL MODE BUTTONS (in your HTML) =====
  // <button id="modeHuman">👥 Human vs Human</button>
  // <button id="modeBot">🤖 Play vs Bot</button>
  // <button id="findMatch">🔎 Find Opponent</button>
  const modeHumanBtn = document.getElementById("modeHuman");
  const modeBotBtn = document.getElementById("modeBot");
  const findMatchBtn = document.getElementById("findMatch");

  restartBtn.addEventListener("click", () => init(true));

  // ===== BOT SETTINGS =====
  // MODE: "human" => 2 хүн (нэг утсан дээр ээлжилж)
  // MODE: "bot"   => Bot автоматаар нүүнэ
  let MODE = "human";
  let BOT_COLOR = "b"; // bot plays black by default

  /**
   * 8x8, play only on dark squares
   * piece: { c:'w'|'b', k:boolean }
   */
  let S = {
    turn: "w",
    board: [],
    selected: null, // {r,c}
    legal: [],      // {from:{r,c}, to:{r,c}, cap:[{r,c},...]}
    mustCapture: false,
    chainFrom: null // multi-capture continuation piece
  };

  function emptyBoard() {
    return Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => null));
  }

  function setHint(t) { hintEl.textContent = t; }
  function inBounds(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }
  function isDark(r, c) { return (r + c) % 2 === 1; }

  function pieceAt(r, c) { return S.board[r][c]; }
  function setPiece(r, c, p) { S.board[r][c] = p; }

  function dirsFor(piece) {
    // normal: white goes up (r-), black goes down (r+)
    if (piece.k) return [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    return piece.c === "w" ? [[-1, 1], [-1, -1]] : [[1, 1], [1, -1]];
  }

  function init(first = false) {
    S.turn = "w";
    S.board = emptyBoard();
    S.selected = null;
    S.legal = [];
    S.chainFrom = null;

    // Standard setup: black top, white bottom
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 8; c++) {
        if (isDark(r, c)) S.board[r][c] = { c: "b", k: false };
      }
    }
    for (let r = 5; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (isDark(r, c)) S.board[r][c] = { c: "w", k: false };
      }
    }

    recomputeMustCapture();
    render();
    setHint("Tap a piece → then tap a highlighted square to move");

    // If bot mode and bot starts first (if BOT_COLOR = "w")
    maybeBotTurn();
  }

  function render() {
    boardEl.innerHTML = "";

    const turnText = S.turn === "w" ? "White" : "Black";
    const modeText = MODE === "bot" ? ` — (Bot: ${BOT_COLOR === "w" ? "White" : "Black"})` : "";
    statusEl.textContent = `Turn: ${turnText}${S.mustCapture ? " — (Capture required)" : ""}${modeText}`;

    const legalMap = new Map();
    for (const m of S.legal) legalMap.set(`${m.to.r},${m.to.c}`, m);

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const sq = document.createElement("div");
        sq.className = `square ${(r + c) % 2 === 0 ? "light" : "dark"}`;
        sq.dataset.r = String(r);
        sq.dataset.c = String(c);

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

        // ✅ click (desktop)
        sq.addEventListener("click", onSquareClick);

        // ✅ pointerdown (Telegram/WebView дээр илүү найдвартай)
        sq.addEventListener(
          "pointerdown",
          (ev) => {
            ev.preventDefault();
            onSquareClick(ev);
          },
          { passive: false }
        );

        boardEl.appendChild(sq);
      }
    }
  }

  function onSquareClick(e) {
    const r = Number(e.currentTarget.dataset.r);
    const c = Number(e.currentTarget.dataset.c);

    // If bot mode and it's bot's turn -> block user input
    if (MODE === "bot" && S.turn === BOT_COLOR) {
      setHint("Bot is thinking... Please wait.");
      return;
    }

    const p = pieceAt(r, c);

    // If in multi-capture chain, only allow landing squares from legal list
    if (S.chainFrom) {
      const move = S.legal.find(m => m.to.r === r && m.to.c === c);
      if (move) return applyMove(move);
      return;
    }

    // Select your piece
    if (p && p.c === S.turn) {
      S.selected = { r, c };
      S.legal = legalMovesFor(r, c);
      render();
      setHint("Now tap a highlighted square to move");
      return;
    }

    // Move to a legal square
    if (S.selected) {
      const move = S.legal.find(m => m.to.r === r && m.to.c === c);
      if (move) return applyMove(move);
    }
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

    // Captures first
    const caps = captureMovesFrom(r, c, p);
    if (caps.length > 0) return caps;

    // If any capture exists for this turn, block normal moves
    if (S.mustCapture) return [];

    return simpleMovesFrom(r, c, p);
  }

  function simpleMovesFrom(r, c, p) {
    const res = [];
    if (p.k) {
      // King: any distance diagonally
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
      // King capture: jump over exactly one enemy then land on any empty square after it
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
            if (cur.c === p.c) break; // blocked by own piece
            if (seenEnemy) break;      // cannot jump two enemies in a line at once
            seenEnemy = { r: rr, c: cc };
          }

          rr += dr; cc += dc;
        }
      }
      return res;
    }

    // Normal piece capture: allow capture in all 4 diagonal directions
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
    return res;
  }

  function applyMove(move) {
    const p = pieceAt(move.from.r, move.from.c);
    if (!p) return;

    // Move
    setPiece(move.from.r, move.from.c, null);
    setPiece(move.to.r, move.to.c, p);

    // Capture
    for (const cap of move.cap) setPiece(cap.r, cap.c, null);

    // King promotion
    if (!p.k) {
      if (p.c === "w" && move.to.r === 0) p.k = true;
      if (p.c === "b" && move.to.r === 7) p.k = true;
    }

    // Multi-capture continuation
    if (move.cap.length > 0) {
      const moreCaps = captureMovesFrom(move.to.r, move.to.c, p);
      if (moreCaps.length > 0) {
        S.selected = { r: move.to.r, c: move.to.c };
        S.legal = moreCaps;
        S.chainFrom = { r: move.to.r, c: move.to.c };
        render();
        setHint("Another capture is available — continue capturing");
        return;
      }
    }

    // Switch turn
    S.chainFrom = null;
    S.selected = null;
    S.turn = (S.turn === "w") ? "b" : "w";
    recomputeMustCapture();
    S.legal = [];
    render();
    setHint("Tap a piece → then tap a highlighted square to move");

    // After turn switch -> maybe bot plays
    maybeBotTurn();
  }

  // ======================================================================
  // ====================== STRONG BOT (REPLACED) =========================
  // ======================================================================

  // Хүч/хурд тохируулга (утас удааширвал BOT_TIME_MS-г багасга)
  const BOT_TIME_MS = 650;   // 450~900ms
  const BOT_DEPTH_MAX = 9;   // 7~10
  const TT = new Map();      // transposition table

  function cloneBoard(board) {
    return board.map(row => row.map(p => (p ? { c: p.c, k: !!p.k } : null)));
  }

  function boardKey(board, turn) {
    let s = turn + "|";
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (!p) s += ".";
        else s += (p.c === "w" ? "w" : "b") + (p.k ? "K" : "m");
      }
    }
    return s;
  }

  function getPieceB(board, r, c) { return board[r][c]; }
  function setPieceB(board, r, c, p) { board[r][c] = p; }
  function inBoundsB(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }
  function isDarkB(r, c) { return (r + c) % 2 === 1; }

  function dirsForB(piece) {
    if (piece.k) return [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    return piece.c === "w" ? [[-1, 1], [-1, -1]] : [[1, 1], [1, -1]];
  }

  function simpleMovesFromB(board, r, c, p) {
    const res = [];
    if (p.k) {
      for (const [dr, dc] of dirsForB(p)) {
        let rr = r + dr, cc = c + dc;
        while (inBoundsB(rr, cc) && isDarkB(rr, cc) && !getPieceB(board, rr, cc)) {
          res.push({ from: { r, c }, to: { r: rr, c: cc }, cap: [] });
          rr += dr; cc += dc;
        }
      }
    } else {
      for (const [dr, dc] of dirsForB(p)) {
        const rr = r + dr, cc = c + dc;
        if (inBoundsB(rr, cc) && isDarkB(rr, cc) && !getPieceB(board, rr, cc)) {
          res.push({ from: { r, c }, to: { r: rr, c: cc }, cap: [] });
        }
      }
    }
    return res;
  }

  function captureMovesFromB(board, r, c, p) {
    const res = [];

    if (p.k) {
      for (const [dr, dc] of dirsForB(p)) {
        let rr = r + dr, cc = c + dc;
        let seenEnemy = null;
        while (inBoundsB(rr, cc) && isDarkB(rr, cc)) {
          const cur = getPieceB(board, rr, cc);
          if (!cur) {
            if (seenEnemy) res.push({ from: { r, c }, to: { r: rr, c: cc }, cap: [seenEnemy] });
          } else {
            if (cur.c === p.c) break;
            if (seenEnemy) break;
            seenEnemy = { r: rr, c: cc };
          }
          rr += dr; cc += dc;
        }
      }
      return res;
    }

    const allDirs = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (const [dr, dc] of allDirs) {
      const midR = r + dr, midC = c + dc;
      const toR = r + 2 * dr, toC = c + 2 * dc;
      if (!inBoundsB(toR, toC) || !isDarkB(toR, toC)) continue;

      const mid = getPieceB(board, midR, midC);
      if (mid && mid.c !== p.c && !getPieceB(board, toR, toC)) {
        res.push({ from: { r, c }, to: { r: toR, c: toC }, cap: [{ r: midR, c: midC }] });
      }
    }
    return res;
  }

  function applyMoveBoard(board, move) {
    const b = cloneBoard(board);
    const p = getPieceB(b, move.from.r, move.from.c);
    if (!p) return b;

    setPieceB(b, move.from.r, move.from.c, null);
    setPieceB(b, move.to.r, move.to.c, p);
    for (const cap of move.cap || []) setPieceB(b, cap.r, cap.c, null);

    if (!p.k) {
      if (p.c === "w" && move.to.r === 0) p.k = true;
      if (p.c === "b" && move.to.r === 7) p.k = true;
    }
    return b;
  }

  // нэг capture -> цааш үргэлжлэх бүх multi-capture-ийг нэг "нүүдэл" болгож гаргана
  function expandCaptureSequences(board, move) {
    const b1 = applyMoveBoard(board, move);
    const p = getPieceB(b1, move.to.r, move.to.c);
    if (!p) return [move];

    const nextCaps = captureMovesFromB(b1, move.to.r, move.to.c, p);
    if (!nextCaps.length) return [move];

    const out = [];
    for (const nxt of nextCaps) {
      const chained = {
        from: move.from,
        to: nxt.to,
        cap: [...(move.cap || []), ...(nxt.cap || [])],
      };
      out.push(...expandCaptureSequences(b1, chained));
    }
    return out;
  }

  function generateMoves(board, turn) {
    const captures = [];
    const moves = [];

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = getPieceB(board, r, c);
        if (!p || p.c !== turn) continue;

        const caps = captureMovesFromB(board, r, c, p);
        if (caps.length) {
          for (const m of caps) captures.push(...expandCaptureSequences(board, m));
        } else {
          moves.push(...simpleMovesFromB(board, r, c, p));
        }
      }
    }

    return captures.length ? captures : moves; // must-capture
  }

  function evaluateBoard(board, botColor) {
    let score = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = getPieceB(board, r, c);
        if (!p) continue;

        const base = p.k ? 220 : 120;
        let prog = 0;
        if (!p.k) prog = (p.c === "b") ? r * 4 : (7 - r) * 4;
        const center = (r >= 2 && r <= 5 && c >= 2 && c <= 5) ? 6 : 0;

        const v = base + prog + center;
        score += (p.c === botColor) ? v : -v;
      }
    }
    return score;
  }

  function orderMoves(moves) {
    return moves.slice().sort((a, b) => {
      const ac = (a.cap?.length || 0), bc = (b.cap?.length || 0);
      if (ac !== bc) return bc - ac; // more captures first
      const ad = Math.abs(a.to.r - a.from.r) + Math.abs(a.to.c - a.from.c);
      const bd = Math.abs(b.to.r - b.from.r) + Math.abs(b.to.c - b.from.c);
      return bd - ad;
    });
  }

  function alphabeta(board, turn, depth, alpha, beta, botColor, deadline) {
    if (Date.now() > deadline) return { score: evaluateBoard(board, botColor), timeout: true };

    const key = boardKey(board, turn) + "|d=" + depth;
    const tt = TT.get(key);
    if (tt && tt.depth >= depth) return { score: tt.score, timeout: false };

    const moves = generateMoves(board, turn);
    if (depth === 0 || moves.length === 0) {
      if (moves.length === 0) {
        const losing = (turn === botColor);
        const sc = losing ? -999999 : 999999;
        return { score: sc, timeout: false };
      }
      return { score: evaluateBoard(board, botColor), timeout: false };
    }

    const nextTurn = (turn === "w") ? "b" : "w";
    const maximizing = (turn === botColor);
    const ordered = orderMoves(moves);

    let bestScore = maximizing ? -Infinity : Infinity;

    for (const m of ordered) {
      const nb = applyMoveBoard(board, m);
      const res = alphabeta(nb, nextTurn, depth - 1, alpha, beta, botColor, deadline);
      if (res.timeout) return { score: bestScore, timeout: true };

      const sc = res.score;
      if (maximizing) {
        if (sc > bestScore) bestScore = sc;
        alpha = Math.max(alpha, bestScore);
        if (beta <= alpha) break;
      } else {
        if (sc < bestScore) bestScore = sc;
        beta = Math.min(beta, bestScore);
        if (beta <= alpha) break;
      }
    }

    TT.set(key, { score: bestScore, depth });
    return { score: bestScore, timeout: false };
  }

  function findBestMoveStrong(board, turn, botColor) {
    const moves = generateMoves(board, turn);
    if (!moves.length) return null;

    const deadline = Date.now() + BOT_TIME_MS;
    let best = moves[0];

    for (let d = 1; d <= BOT_DEPTH_MAX; d++) {
      if (Date.now() > deadline) break;

      let bestMove = best;
      let bestScore = -Infinity;

      const ordered = orderMoves(moves);
      for (const m of ordered) {
        const nb = applyMoveBoard(board, m);
        const nextTurn = (turn === "w") ? "b" : "w";
        const res = alphabeta(nb, nextTurn, d - 1, -Infinity, Infinity, botColor, deadline);
        if (res.timeout) break;

        if (res.score > bestScore) {
          bestScore = res.score;
          bestMove = m;
        }
      }
      best = bestMove;
    }

    return best;
  }

  function botMove() {
    if (MODE !== "bot" || S.turn !== BOT_COLOR) return;

    if (TT.size > 20000) TT.clear();

    const move = findBestMoveStrong(S.board, S.turn, BOT_COLOR);
    if (!move) {
      setHint("Game over");
      return;
    }

    applyMove(move);

    // Bot олон үсрэлт үргэлжилж байвал bot дахин нүүнэ
    if (MODE === "bot" && S.chainFrom && S.turn === BOT_COLOR) {
      maybeBotTurn();
    }
  }

  function maybeBotTurn() {
    if (MODE === "bot" && S.turn === BOT_COLOR) {
      setHint("Bot thinking...");
      setTimeout(botMove, 120);
    }
  }

  // ===== QUICK MATCH FALLBACK (NO SERVER) =====
  // Энэ нь жинхэнэ онлайн match биш (serverгүй болохоор боломжгүй).
  // Харин UX: "хүн хайж байна" гэж 10 сек хүлээгээд олдохгүй бол Bot горим руу автоматаар шилжинэ.
  let matchTimer = null;

  function startFindingOpponent() {
    MODE = "human";
    BOT_COLOR = "b";
    init(true);

    setHint("Finding opponent... (if no one joins, switching to Bot in 10s)");

    if (matchTimer) clearTimeout(matchTimer);
    matchTimer = setTimeout(() => {
      MODE = "bot";
      BOT_COLOR = "b";
      init(true);
      setHint("No opponent found — switched to Bot mode (Bot = Black)");
    }, 10000);
  }

  // ===== OPTIONAL BUTTON WIRING =====
  if (modeHumanBtn) {
    modeHumanBtn.addEventListener("click", () => {
      if (matchTimer) clearTimeout(matchTimer);
      MODE = "human";
      setHint("Mode: Human vs Human");
      render();
    });
  }

  if (modeBotBtn) {
    modeBotBtn.addEventListener("click", () => {
      if (matchTimer) clearTimeout(matchTimer);
      MODE = "bot";
      BOT_COLOR = "b"; // bot plays black
      init(true);      // restart
      setHint("Mode: Play vs Bot (Bot = Black)");
    });
  }

  if (findMatchBtn) {
    findMatchBtn.addEventListener("click", startFindingOpponent);
  }

  init(true);
});
