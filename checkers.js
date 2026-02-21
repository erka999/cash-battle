document.addEventListener("DOMContentLoaded", () => {
  const boardEl = document.getElementById("board");
  const statusEl = document.getElementById("status");
  const hintEl = document.getElementById("hint");
  const restartBtn = document.getElementById("restart");

  const modeHumanBtn = document.getElementById("modeHuman");
  const modeBotBtn = document.getElementById("modeBot");
  const findMatchBtn = document.getElementById("findMatch");

  if (!boardEl || !statusEl || !hintEl || !restartBtn) {
    console.error("Missing required elements: #board, #status, #hint, #restart");
    return;
  }

  restartBtn.addEventListener("click", () => init(true));

  // MODE: "human" => 2 хүн нэг утсан дээр ээлжилж
  // MODE: "bot"   => Bot автоматаар нүүнэ
  let MODE = "human";
  let BOT_COLOR = "b"; // Bot plays black by default

  let S = {
    turn: "w",
    board: [],
    selected: null,
    legal: [],
    mustCapture: false,
    chainFrom: null
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
    if (piece.k) return [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    return piece.c === "w" ? [[-1, 1], [-1, -1]] : [[1, 1], [1, -1]];
  }

  function init(first = false) {
    S.turn = "w";
    S.board = emptyBoard();
    S.selected = null;
    S.legal = [];
    S.chainFrom = null;

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

          // ✅ add base for pawn look
          const base = document.createElement("div");
          base.className = "base";
          el.appendChild(base);

          sq.appendChild(el);
        }

        sq.addEventListener("click", onSquareClick);
        sq.addEventListener("pointerdown", (ev) => {
          ev.preventDefault();
          onSquareClick(ev);
        }, { passive: false });

        boardEl.appendChild(sq);
      }
    }
  }

  function onSquareClick(e) {
    const r = Number(e.currentTarget.dataset.r);
    const c = Number(e.currentTarget.dataset.c);

    if (MODE === "bot" && S.turn === BOT_COLOR) {
      setHint("Bot is thinking... Please wait.");
      return;
    }

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
      setHint("Now tap a highlighted square to move");
      return;
    }

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
      return res;
    }

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
        setHint("Another capture is available — continue capturing");
        return;
      }
    }

    S.chainFrom = null;
    S.selected = null;
    S.turn = (S.turn === "w") ? "b" : "w";
    recomputeMustCapture();
    S.legal = [];
    render();
    setHint("Tap a piece → then tap a highlighted square to move");
    maybeBotTurn();
  }

  // ===== STRONGER BOT (still lightweight) =====
  // 1) Capture > non-capture
  // 2) Prefer moves that promote to king
  // 3) Prefer moves that increase material safety (simple heuristic)
  function scoreMove(m) {
    let s = 0;
    if (m.cap && m.cap.length) s += 100 + 10 * m.cap.length;
    // promotion
    const p = pieceAt(m.from.r, m.from.c);
    if (p && !p.k) {
      if (p.c === "w" && m.to.r === 0) s += 60;
      if (p.c === "b" && m.to.r === 7) s += 60;
    }
    // center-ish preference
    s += (3.5 - Math.abs(3.5 - m.to.c)) * 2;
    return s;
  }

  function botPickMove() {
    const moves = allMovesFor(S.turn);
    if (!moves.length) return null;

    const captures = moves.filter(m => m.cap && m.cap.length > 0);
    const list = captures.length ? captures : moves;

    // pick best scored, random tie-break
    let best = -Infinity;
    let bestMoves = [];
    for (const m of list) {
      const sc = scoreMove(m);
      if (sc > best) { best = sc; bestMoves = [m]; }
      else if (sc === best) bestMoves.push(m);
    }
    return bestMoves[Math.floor(Math.random() * bestMoves.length)];
  }

  function botMove() {
    if (MODE !== "bot" || S.turn !== BOT_COLOR) return;

    const move = botPickMove();
    if (!move) {
      setHint("Game over");
      return;
    }
    applyMove(move);

    if (MODE === "bot" && S.chainFrom && S.turn === BOT_COLOR) {
      maybeBotTurn();
    }
  }

  function maybeBotTurn() {
    if (MODE === "bot" && S.turn === BOT_COLOR) {
      setHint("Bot thinking...");
      setTimeout(botMove, 350);
    }
  }

  // ===== FIND OPPONENT (serverгүй fallback) =====
  let matchTimer = null;

  function startFindingOpponent() {
    // UX: хайж байгаа мэт үзүүлээд, олдохгүй бол bot
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

  if (modeHumanBtn) {
    modeHumanBtn.addEventListener("click", () => {
      if (matchTimer) clearTimeout(matchTimer);
      MODE = "human";
      setHint("Mode: 2 Players (Local)");
      render();
    });
  }

  if (modeBotBtn) {
    modeBotBtn.addEventListener("click", () => {
      if (matchTimer) clearTimeout(matchTimer);
      MODE = "bot";
      BOT_COLOR = "b";
      init(true);
      setHint("Mode: Play vs Bot (Bot = Black)");
    });
  }

  if (findMatchBtn) {
    findMatchBtn.addEventListener("click", startFindingOpponent);
  }

  init(true);
});
