const boardEl = document.getElementById("board");
const statusEl = document.getElementById("status");
const hintEl = document.getElementById("hint");
document.getElementById("restart").addEventListener("click", () => init(true));

/**
 * 8x8, зөвхөн хар нүд дээр тоглоно
 * piece: { c:'w'|'b', k:boolean }
 */
let S = {
  turn: "w",
  board: [],
  selected: null, // {r,c}
  legal: [],      // {to:{r,c}, cap:[{r,c},...]} cap массив нь идэх чулуунууд
  mustCapture: false,
  chainFrom: null // олон үсрэлтийн үед нэг чулуу үргэлжлүүлэх
};

function emptyBoard(){
  return Array.from({length:8}, () => Array.from({length:8}, () => null));
}

function init(first=false){
  S.turn = "w";
  S.board = emptyBoard();
  S.selected = null;
  S.legal = [];
  S.chainFrom = null;

  // Стандарт байрлал: дээд талд хар, доод талд цагаан
  for(let r=0;r<3;r++){
    for(let c=0;c<8;c++){
      if((r+c)%2===1) S.board[r][c] = {c:"b", k:false};
    }
  }
  for(let r=5;r<8;r++){
    for(let c=0;c<8;c++){
      if((r+c)%2===1) S.board[r][c] = {c:"w", k:false};
    }
  }
  recomputeMustCapture();
  render();
  setHint("Чулуу дээр дар → боломжит нүүдэл сонго");
}

function setHint(t){ hintEl.textContent = t; }

function inBounds(r,c){ return r>=0 && r<8 && c>=0 && c<8; }
function isDark(r,c){ return (r+c)%2===1; }
function clonePos(p){ return {r:p.r, c:p.c}; }

function pieceAt(r,c){ return S.board[r][c]; }
function setPiece(r,c,p){ S.board[r][c]=p; }

function dirsFor(piece){
  // энгийн чулуу: цагаан дээш (r-), хар доош (r+)
  if(piece.k) return [[1,1],[1,-1],[-1,1],[-1,-1]];
  return piece.c==="w" ? [[-1,1],[-1,-1]] : [[1,1],[1,-1]];
}

function render(){
  boardEl.innerHTML = "";
  const turnText = S.turn==="w" ? "⚪ Цагаан" : "⚫ Хар";
  statusEl.textContent = `Ээлж: ${turnText}${S.mustCapture ? " — (Идэх заавал)" : ""}`;

  // legal move map
  const legalMap = new Map();
  for(const m of S.legal){
    legalMap.set(`${m.to.r},${m.to.c}`, m);
  }

  for(let r=0;r<8;r++){
    for(let c=0;c<8;c++){
      const sq = document.createElement("div");
      sq.className = `square ${(r+c)%2===0 ? "light":"dark"}`;
      sq.dataset.r = r;
      sq.dataset.c = c;

      if(S.selected && S.selected.r===r && S.selected.c===c){
        sq.classList.add("selected");
      }

      const lm = legalMap.get(`${r},${c}`);
      if(lm){
        if(lm.cap.length>0) sq.classList.add("capture");
        else sq.classList.add("move");
      }

      const p = pieceAt(r,c);
      if(p){
        const el = document.createElement("div");
        el.className = `piece ${p.c==="w"?"white":"black"} ${p.k?"king":""}`;
        sq.appendChild(el);
      }

      sq.addEventListener("click", onSquareClick);
      boardEl.appendChild(sq);
    }
  }
}

function onSquareClick(e){
  const r = Number(e.currentTarget.dataset.r);
  const c = Number(e.currentTarget.dataset.c);
  const p = pieceAt(r,c);

  // Хэрвээ олон үсрэлт үргэлжилж байгаа бол зөвхөн тухайн чулууг үргэлжлүүлнэ
  if(S.chainFrom){
    if(S.selected && S.selected.r===r && S.selected.c===c) return;
    // зөвхөн нүүх боломжит газар дээр дарж болно
    const move = S.legal.find(m => m.to.r===r && m.to.c===c);
    if(move) return applyMove(move);
    return;
  }

  // Өөрийн чулуу дээр дарвал сонгоно
  if(p && p.c===S.turn){
    S.selected = {r,c};
    S.legal = legalMovesFor(r,c);
    render();
    setHint("Одоо боломжит нүд дээр дарж нүүдэл хийнэ");
    return;
  }

  // Сонгосон чулууны боломжит нүүдэл дээр дарвал нүүнэ
  if(S.selected){
    const move = S.legal.find(m => m.to.r===r && m.to.c===c);
    if(move) return applyMove(move);
  }
}

function recomputeMustCapture(){
  const all = allMovesFor(S.turn);
  S.mustCapture = all.some(m => m.cap.length>0);
}

function allMovesFor(color){
  const out=[];
  for(let r=0;r<8;r++){
    for(let c=0;c<8;c++){
      const p = pieceAt(r,c);
      if(p && p.c===color){
        out.push(...legalMovesFor(r,c));
      }
    }
  }
  return out;
}

function legalMovesFor(r,c){
  const p = pieceAt(r,c);
  if(!p) return [];

  // эхлээд capture боломжууд
  const caps = captureMovesFrom(r,c,p);
  if(caps.length>0) return caps;

  // Хэрвээ "заавал идэх" идэлт байгаа бол энгийн нүүдэл хийлгэхгүй
  if(S.mustCapture) return [];

  // энгийн нүүдлүүд
  return simpleMovesFrom(r,c,p);
}

function simpleMovesFrom(r,c,p){
  const res=[];
  if(p.k){
    // хатан: диагональ дагуу аль ч зайд
    for(const [dr,dc] of dirsFor(p)){
      let rr=r+dr, cc=c+dc;
      while(inBounds(rr,cc) && isDark(rr,cc) && !pieceAt(rr,cc)){
        res.push({from:{r,c}, to:{r:rr,c:cc}, cap:[]});
        rr+=dr; cc+=dc;
      }
    }
  } else {
    for(const [dr,dc] of dirsFor(p)){
      const rr=r+dr, cc=c+dc;
      if(inBounds(rr,cc) && isDark(rr,cc) && !pieceAt(rr,cc)){
        res.push({from:{r,c}, to:{r:rr,c:cc}, cap:[]});
      }
    }
  }
  return res;
}

function captureMovesFrom(r,c,p){
  const res=[];
  if(p.k){
    // хатан идэлт: диагональд нэг дайснаа "алгасаад" цааш хоосон газар бууна
    for(const [dr,dc] of dirsFor(p)){
      let rr=r+dr, cc=c+dc;
      let seenEnemy = null; // {r,c}
      while(inBounds(rr,cc) && isDark(rr,cc)){
        const cur = pieceAt(rr,cc);
        if(!cur){
          if(seenEnemy){
            // enemy-г давж буух боломж
            res.push({from:{r,c}, to:{r:rr,c:cc}, cap:[seenEnemy]});
          }
        } else {
          if(cur.c===p.c) break; // өөрийн чулуу хаана
          if(seenEnemy) break;   // 2 дахь enemy гарвал болохгүй
          seenEnemy = {r:rr,c:cc};
        }
        rr+=dr; cc+=dc;
      }
    }
  } else {
    // энгийн идэлт: 2 алхам диагональ
    const allDirs = [[1,1],[1,-1],[-1,1],[-1,-1]]; // идэлтэд бүх чиг зөвшөөрнө (олон дүрэмтэй даамд түгээмэл)
    for(const [dr,dc] of allDirs){
      const midR=r+dr, midC=c+dc;
      const toR=r+2*dr, toC=c+2*dc;
      if(!inBounds(toR,toC) || !isDark(toR,toC)) continue;
      const mid = pieceAt(midR,midC);
      if(mid && mid.c!==p.c && !pieceAt(toR,toC)){
        res.push({from:{r,c}, to:{r:toR,c:toC}, cap:[{r:midR,c:midC}]});
      }
    }
  }
  return res;
}

function applyMove(move){
  const p = pieceAt(move.from.r, move.from.c);
  if(!p) return;

  // нүүлгэнэ
  setPiece(move.from.r, move.from.c, null);
  setPiece(move.to.r, move.to.c, p);

  // идэлт
  for(const cap of move.cap){
    setPiece(cap.r, cap.c, null);
  }

  // хатан болгох
  if(!p.k){
    if(p.c==="w" && move.to.r===0) p.k=true;
    if(p.c==="b" && move.to.r===7) p.k=true;
  }

  // хэрвээ идэлт байсан бол олон үсрэлт шалгана
  if(move.cap.length>0){
    // дахин идэх боломж байна уу?
    const moreCaps = captureMovesFrom(move.to.r, move.to.c, p);
    if(moreCaps.length>0){
      S.selected = {r:move.to.r, c:move.to.c};
      S.legal = moreCaps;
      S.chainFrom = {r:move.to.r, c:move.to.c};
      render();
      setHint("Дахин идэлт байна — үргэлжлүүлж үсэрнэ");
      return;
    }
  }

  // ээлж солих
  S.chainFrom = null;
  S.selected = null;
  S.turn = (S.turn==="w") ? "b" : "w";
  recomputeMustCapture();
  S.legal = [];
  render();
  setHint("Чулуу дээр дар → боломжит нүүдэл сонго");
}

init(true);