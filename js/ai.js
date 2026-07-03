/* Minimax + alpha-beta AI opponent, tuned by a 1-10 difficulty slider. */

const MAN_VALUE = 100;
const KING_VALUE = 165;
const WIN_SCORE = 100000;

function depthForDifficulty(difficulty) {
  const table = { 1: 1, 2: 1, 3: 2, 4: 2, 5: 3, 6: 4, 7: 4, 8: 5, 9: 6, 10: 7 };
  return table[difficulty] || 3;
}

function blunderChanceForDifficulty(difficulty) {
  // Weaker settings occasionally play a random legal move instead of the best one.
  return Math.max(0, (6 - difficulty) * 0.11);
}

function evaluateBoard(board, botPlayer) {
  const human = Checkers.opponent(botPlayer);
  let score = 0;
  let botMoves = 0;
  let humanMoves = 0;

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (!piece) continue;
      const sign = piece.player === botPlayer ? 1 : -1;
      let value = piece.king ? KING_VALUE : MAN_VALUE;

      if (!piece.king) {
        const advancement = piece.player === Checkers.RED ? r : 7 - r;
        value += advancement * 3;
      }
      if (c === 0 || c === 7) value += 4; // edge columns are un-jumpable from outside
      if (c >= 2 && c <= 5) value += 2; // center control
      if ((piece.player === Checkers.RED && r === 0) || (piece.player === Checkers.BLACK && r === 7)) {
        value += 5; // occupying the home row denies opponent kinging there
      }

      score += sign * value;
    }
  }

  botMoves = Checkers.getAllLegalMoves(board, botPlayer).length;
  humanMoves = Checkers.getAllLegalMoves(board, human).length;
  score += (botMoves - humanMoves) * 1.5;

  return score;
}

function minimax(board, player, botPlayer, depth, alpha, beta) {
  const moves = Checkers.getAllLegalMoves(board, player);

  if (moves.length === 0) {
    const score = player === botPlayer ? -WIN_SCORE : WIN_SCORE;
    return { score, move: null };
  }
  if (depth === 0) {
    return { score: evaluateBoard(board, botPlayer), move: null };
  }

  const maximizing = player === botPlayer;
  let best = maximizing ? -Infinity : Infinity;
  let bestMove = moves[0];

  for (const move of moves) {
    const nextBoard = Checkers.applyMove(board, move);
    const result = minimax(nextBoard, Checkers.opponent(player), botPlayer, depth - 1, alpha, beta);
    if (maximizing) {
      if (result.score > best) {
        best = result.score;
        bestMove = move;
      }
      alpha = Math.max(alpha, best);
    } else {
      if (result.score < best) {
        best = result.score;
        bestMove = move;
      }
      beta = Math.min(beta, best);
    }
    if (alpha >= beta) break;
  }

  return { score: best, move: bestMove };
}

/** Picks a move for `player`, at a fixed search depth (used for hints). */
function getBestMove(board, player, depth) {
  const moves = Checkers.getAllLegalMoves(board, player);
  if (moves.length === 0) return null;
  if (moves.length === 1) return moves[0];
  const result = minimax(board, player, player, depth, -Infinity, Infinity);
  return result.move || moves[0];
}

/** Picks the bot's move for `player` honoring the 1-10 difficulty slider. */
function getBotMove(board, player, difficulty) {
  const moves = Checkers.getAllLegalMoves(board, player);
  if (moves.length === 0) return null;
  if (moves.length === 1) return moves[0];

  if (Math.random() < blunderChanceForDifficulty(difficulty)) {
    return moves[Math.floor(Math.random() * moves.length)];
  }

  const depth = depthForDifficulty(difficulty);
  const result = minimax(board, player, player, depth, -Infinity, Infinity);
  return result.move || moves[0];
}

window.CheckersAI = {
  getBotMove,
  getBestMove,
  depthForDifficulty,
};
