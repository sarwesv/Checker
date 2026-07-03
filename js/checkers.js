/* Checkers rules engine (American / English draughts).
   Board is an 8x8 grid; only dark squares ((r+c)%2===1) are playable.
   Red starts on rows 0-2 and moves toward row 7 (crowning row).
   Black starts on rows 5-7 and moves toward row 0 (crowning row). */

const RED = 'red';
const BLACK = 'black';

const RED_DIRS = [[1, -1], [1, 1]];
const BLACK_DIRS = [[-1, -1], [-1, 1]];
const KING_DIRS = [[1, -1], [1, 1], [-1, -1], [-1, 1]];

function createInitialBoard() {
  const board = Array.from({ length: 8 }, () => Array(8).fill(null));
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 === 1) board[r][c] = { player: RED, king: false };
    }
  }
  for (let r = 5; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 === 1) board[r][c] = { player: BLACK, king: false };
    }
  }
  return board;
}

function cloneBoard(board) {
  return board.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
}

function inBounds(r, c) {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

function opponent(player) {
  return player === RED ? BLACK : RED;
}

function crowningRow(player) {
  return player === RED ? 7 : 0;
}

function dirsForPiece(piece) {
  if (piece.king) return KING_DIRS;
  return piece.player === RED ? RED_DIRS : BLACK_DIRS;
}

/** Recursively finds every maximal capture sequence starting from (r,c). */
function findCaptureSequences(board, r, c, piece, capturedSoFar, path) {
  const dirs = dirsForPiece(piece);
  const sequences = [];
  for (const [dr, dc] of dirs) {
    const mr = r + dr;
    const mc = c + dc;
    const lr = r + 2 * dr;
    const lc = c + 2 * dc;
    if (!inBounds(lr, lc)) continue;
    const midPiece = board[mr][mc];
    if (!midPiece || midPiece.player === piece.player) continue;
    if (capturedSoFar.some((p) => p.r === mr && p.c === mc)) continue;
    if (board[lr][lc] !== null) continue;

    const wasKing = piece.king;
    const becomesKing = !wasKing && lr === crowningRow(piece.player);
    const nextPiece = becomesKing ? { ...piece, king: true } : piece;
    const nextCaptured = [...capturedSoFar, { r: mr, c: mc }];
    const nextPath = [...path, { r: lr, c: lc }];

    if (becomesKing) {
      // Promotion ends the turn immediately (standard simplified rule).
      sequences.push({ path: nextPath, captured: nextCaptured, endsKing: true });
      continue;
    }

    const deeper = findCaptureSequences(board, lr, lc, nextPiece, nextCaptured, nextPath);
    if (deeper.length === 0) {
      sequences.push({ path: nextPath, captured: nextCaptured, endsKing: false });
    } else {
      sequences.push(...deeper);
    }
  }
  return sequences;
}

function getSimpleMoves(board, r, c, piece) {
  const dirs = dirsForPiece(piece);
  const moves = [];
  for (const [dr, dc] of dirs) {
    const nr = r + dr;
    const nc = c + dc;
    if (inBounds(nr, nc) && board[nr][nc] === null) {
      moves.push({ from: { r, c }, path: [{ r: nr, c: nc }], captured: [] });
    }
  }
  return moves;
}

/** Returns all legal moves for `player`, enforcing the mandatory-capture rule. */
function getAllLegalMoves(board, player) {
  const captureMoves = [];
  const simpleMoves = [];

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (!piece || piece.player !== player) continue;

      const sequences = findCaptureSequences(board, r, c, piece, [], []);
      for (const seq of sequences) {
        captureMoves.push({ from: { r, c }, path: seq.path, captured: seq.captured });
      }
      if (sequences.length === 0) {
        simpleMoves.push(...getSimpleMoves(board, r, c, piece));
      }
    }
  }

  return captureMoves.length > 0 ? captureMoves : simpleMoves;
}

/** Applies a move to a cloned board and returns the new board. */
function applyMove(board, move) {
  const next = cloneBoard(board);
  const piece = next[move.from.r][move.from.c];
  next[move.from.r][move.from.c] = null;

  for (const cap of move.captured) {
    next[cap.r][cap.c] = null;
  }

  const dest = move.path[move.path.length - 1];
  const crowned = !piece.king && dest.r === crowningRow(piece.player);
  next[dest.r][dest.c] = { ...piece, king: piece.king || crowned };

  return next;
}

function countPieces(board, player) {
  let men = 0;
  let kings = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && p.player === player) {
        if (p.king) kings++;
        else men++;
      }
    }
  }
  return { men, kings, total: men + kings };
}

function isGameOver(board, currentPlayer) {
  const moves = getAllLegalMoves(board, currentPlayer);
  if (moves.length === 0) return { over: true, winner: opponent(currentPlayer) };
  const counts = countPieces(board, currentPlayer);
  if (counts.total === 0) return { over: true, winner: opponent(currentPlayer) };
  return { over: false, winner: null };
}

// Exposed as a plain global namespace for a build-free static site.
window.Checkers = {
  RED,
  BLACK,
  createInitialBoard,
  cloneBoard,
  getAllLegalMoves,
  applyMove,
  countPieces,
  isGameOver,
  opponent,
};
