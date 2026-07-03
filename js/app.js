/* UI controller: rendering, interaction, game modes, hints, sound. */

(function () {
  const HUMAN_PLAYER = Checkers.RED; // In "vs. Bot" mode the human always plays Red.
  const HINT_DEPTH = 6;

  const boardEl = document.getElementById('board');
  const statusEl = document.getElementById('statusText');
  const redCapturedEl = document.getElementById('redCaptured');
  const blackCapturedEl = document.getElementById('blackCaptured');
  const moveLogEl = document.getElementById('moveLog');
  const hintTextEl = document.getElementById('hintText');
  const winOverlay = document.getElementById('winOverlay');
  const winText = document.getElementById('winText');
  const difficultySection = document.getElementById('difficultySection');
  const difficultySlider = document.getElementById('difficultySlider');
  const difficultyLabel = document.getElementById('difficultyLabel');
  const difficultyValue = document.getElementById('difficultyValue');

  const DIFFICULTY_LABELS = {
    1: 'Total Beginner', 2: 'Beginner', 3: 'Casual', 4: 'Amateur', 5: 'Club Player',
    6: 'Strong Amateur', 7: 'Tournament', 8: 'Expert', 9: 'Master', 10: 'Grandmaster',
  };

  const SAVE_KEY = 'vintageCheckersSave_v1';

  let state = null; // set by newGame()

  function newGame(mode) {
    state = {
      board: Checkers.createInitialBoard(),
      currentPlayer: Checkers.RED,
      mode: mode || (state ? state.mode : 'bot'),
      difficulty: Number(difficultySlider.value),
      selection: null, // { from, remaining: [{path, captured}], consumedPath, consumedCaptured }
      history: [], // stack of { board, currentPlayer, captured } for undo
      captured: { red: 0, black: 0 },
      moveLog: [],
      gameOver: false,
      winner: null,
      inputLocked: false,
    };
    winOverlay.classList.add('hidden');
    moveLogEl.innerHTML = '';
    hintTextEl.textContent = '';
    clearHintHighlights();
    updateModeUI();
    render();
    updateStatus();
    saveGame();
  }

  // ---------- Save / resume (localStorage) ----------

  function saveGame() {
    if (!state) return;
    try {
      const data = {
        board: state.board,
        currentPlayer: state.currentPlayer,
        mode: state.mode,
        difficulty: state.difficulty,
        captured: state.captured,
        moveLog: state.moveLog,
        gameOver: state.gameOver,
        winner: state.winner,
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch (e) {
      // localStorage unavailable (private browsing, quota, etc.) - progress just won't persist.
    }
  }

  function loadSavedGame() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || !Array.isArray(data.board)) return null;
      return data;
    } catch (e) {
      return null;
    }
  }

  function restoreGame(data) {
    state = {
      board: data.board,
      currentPlayer: data.currentPlayer,
      mode: data.mode || 'bot',
      difficulty: data.difficulty || 5,
      selection: null,
      history: [],
      captured: data.captured || { red: 0, black: 0 },
      moveLog: Array.isArray(data.moveLog) ? data.moveLog : [],
      gameOver: !!data.gameOver,
      winner: data.winner || null,
      inputLocked: false,
    };
    difficultySlider.value = String(state.difficulty);
    difficultyLabel.textContent = DIFFICULTY_LABELS[state.difficulty];
    difficultyValue.textContent = `${state.difficulty} / 10`;
    moveLogEl.innerHTML = '';
    state.moveLog.forEach((label) => {
      const li = document.createElement('li');
      li.textContent = label;
      moveLogEl.appendChild(li);
    });
    moveLogEl.scrollTop = moveLogEl.scrollHeight;
    updateModeUI();
    hintTextEl.textContent = '';
    winOverlay.classList.add('hidden');
    render();
    updateStatus();
    if (state.gameOver) {
      showWinOverlay(state.winner);
    } else {
      maybeTriggerBot();
    }
  }

  function updateModeUI() {
    document.querySelectorAll('.seg-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.mode === state.mode);
    });
    difficultySection.style.display = state.mode === 'bot' ? '' : 'none';
  }

  // ---------- Rendering ----------

  function buildBoardSkeleton() {
    boardEl.innerHTML = '';
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const sq = document.createElement('div');
        const isDark = (r + c) % 2 === 1;
        sq.className = 'square ' + (isDark ? 'dark' : 'light');
        sq.dataset.r = r;
        sq.dataset.c = c;
        if (isDark) {
          sq.addEventListener('click', () => onSquareClick(r, c));
        }
        boardEl.appendChild(sq);
      }
    }
    const labelsTop = document.getElementById('labelsTop');
    const labelsBottom = document.getElementById('labelsBottom');
    const labelsLeft = document.getElementById('labelsLeft');
    const labelsRight = document.getElementById('labelsRight');
    const cols = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    [labelsTop, labelsBottom].forEach((el) => {
      el.innerHTML = '';
      cols.forEach((l) => {
        const s = document.createElement('span');
        s.textContent = l;
        el.appendChild(s);
      });
    });
    [labelsLeft, labelsRight].forEach((el) => {
      el.innerHTML = '';
      for (let r = 0; r < 8; r++) {
        const s = document.createElement('span');
        s.textContent = String(r + 1);
        el.appendChild(s);
      }
    });
  }

  function squareEl(r, c) {
    return boardEl.querySelector(`.square[data-r="${r}"][data-c="${c}"]`);
  }

  function render() {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const sq = squareEl(r, c);
        if (!sq) continue;
        sq.classList.remove('selected', 'legal-target', 'capture-target', 'selectable');
        sq.innerHTML = '';

        const piece = state.board[r][c];
        if (piece) {
          const pieceEl = document.createElement('div');
          pieceEl.className = 'piece ' + piece.player + (piece.king ? ' king' : '');
          sq.appendChild(pieceEl);
        }
      }
    }

    if (state.selection) {
      const { from, remaining } = state.selection;
      squareEl(from.r, from.c).classList.add('selected');
      const pieceDiv = squareEl(from.r, from.c).querySelector('.piece');
      if (pieceDiv) pieceDiv.classList.add('selected-piece');

      const seen = new Set();
      remaining.forEach((cand) => {
        const step = cand.path[0];
        const key = step.r + ',' + step.c;
        if (seen.has(key)) return;
        seen.add(key);
        const target = squareEl(step.r, step.c);
        target.classList.add('legal-target', 'selectable');
        if (cand.captured.length > 0) target.classList.add('capture-target');
      });
    } else if (!state.gameOver && !state.inputLocked && isHumanTurn()) {
      // Highlight pieces that can legally move (helps the player see their options).
      const moves = Checkers.getAllLegalMoves(state.board, state.currentPlayer);
      const froms = new Set(moves.map((m) => m.from.r + ',' + m.from.c));
      froms.forEach((key) => {
        const [r, c] = key.split(',').map(Number);
        squareEl(r, c).classList.add('selectable');
      });
    }
  }

  function isHumanTurn() {
    if (state.mode === 'local') return true;
    return state.currentPlayer === HUMAN_PLAYER;
  }

  // ---------- Interaction ----------

  function onSquareClick(r, c) {
    if (state.gameOver || state.inputLocked) return;
    if (!isHumanTurn()) return;
    clearHintHighlights();

    if (state.selection) {
      const matched = tryAdvanceSelection(r, c);
      if (matched) return;
      // Clicking elsewhere: if it's a fresh piece of the current player and we're not
      // mid-forced-jump (i.e. no captures consumed yet), allow reselecting.
      if (state.selection.consumedPath.length === 0) {
        trySelectPiece(r, c);
      }
      return;
    }

    trySelectPiece(r, c);
  }

  function trySelectPiece(r, c) {
    const piece = state.board[r][c];
    if (!piece || piece.player !== state.currentPlayer) return;

    const allMoves = Checkers.getAllLegalMoves(state.board, state.currentPlayer);
    const movesForPiece = allMoves.filter((m) => m.from.r === r && m.from.c === c);
    if (movesForPiece.length === 0) return; // this piece has no legal move (capture forced elsewhere)

    state.selection = {
      from: { r, c },
      remaining: movesForPiece.map((m) => ({ path: m.path.slice(), captured: m.captured.slice() })),
      consumedPath: [],
      consumedCaptured: [],
    };
    render();
  }

  function tryAdvanceSelection(r, c) {
    const sel = state.selection;
    const matches = sel.remaining.filter((cand) => cand.path[0].r === r && cand.path[0].c === c);
    if (matches.length === 0) return false;

    sel.consumedPath.push({ r, c });
    if (matches[0].captured.length > 0) {
      sel.consumedCaptured.push(matches[0].captured[0]);
    }

    const nextRemaining = matches
      .map((cand) => ({ path: cand.path.slice(1), captured: cand.captured.slice(1) }))
      .filter((cand) => cand.path.length > 0);

    if (nextRemaining.length === 0) {
      // Sequence complete: commit the full move.
      const move = { from: sel.from, path: sel.consumedPath, captured: sel.consumedCaptured };
      commitMove(move);
    } else {
      sel.remaining = nextRemaining;
      render();
    }
    return true;
  }

  function commitMove(move) {
    state.history.push({
      board: Checkers.cloneBoard(state.board),
      currentPlayer: state.currentPlayer,
      captured: { ...state.captured },
      moveLogLength: state.moveLog.length,
    });

    const mover = state.board[move.from.r][move.from.c].player;
    const wasKingBefore = state.board[move.from.r][move.from.c].king;
    const squareSize = boardEl.clientWidth / 8;
    const overlayClones = createCaptureOverlays(move.captured, squareSize);

    state.board = Checkers.applyMove(state.board, move);
    state.selection = null;

    const capturedCount = move.captured.length;
    if (capturedCount > 0) {
      if (mover === Checkers.RED) state.captured.black += capturedCount;
      else state.captured.red += capturedCount;
    }
    const dest = move.path[move.path.length - 1];
    const crowned = !wasKingBefore && state.board[dest.r][dest.c].king;
    logMove(mover, move, capturedCount, crowned);
    playSound(capturedCount > 0 ? 'capture' : 'move', crowned);

    const nextPlayer = Checkers.opponent(mover);
    state.currentPlayer = nextPlayer;

    render();
    animateMoveVisual(move, dest, squareSize, crowned);
    fadeOutCaptureOverlays(overlayClones);
    saveGame();

    const status = Checkers.isGameOver(state.board, nextPlayer);
    if (status.over) {
      endGame(status.winner);
      return;
    }

    updateStatus();
    maybeTriggerBot();
  }

  // ---------- GSAP-driven animation ----------

  function createCaptureOverlays(capturedList, squareSize) {
    return capturedList
      .map((cap) => {
        const originalPiece = squareEl(cap.r, cap.c).querySelector('.piece');
        if (!originalPiece) return null;
        const overlay = document.createElement('div');
        overlay.className = 'overlay-piece';
        overlay.style.width = squareSize + 'px';
        overlay.style.height = squareSize + 'px';
        overlay.style.left = cap.c * squareSize + 'px';
        overlay.style.top = cap.r * squareSize + 'px';
        const clone = originalPiece.cloneNode(true);
        clone.classList.remove('selected-piece');
        overlay.appendChild(clone);
        boardEl.appendChild(overlay);
        return overlay;
      })
      .filter(Boolean);
  }

  function fadeOutCaptureOverlays(overlays) {
    if (overlays.length === 0) return;
    if (window.gsap) {
      gsap.to(overlays, {
        opacity: 0,
        scale: 0.25,
        duration: 0.35,
        ease: 'power1.in',
        stagger: 0.07,
        onComplete: () => overlays.forEach((el) => el.remove()),
      });
    } else {
      overlays.forEach((el) => el.remove());
    }
  }

  function animateMoveVisual(move, dest, squareSize, crowned) {
    if (!window.gsap) return;
    const destEl = squareEl(dest.r, dest.c).querySelector('.piece');
    if (!destEl) return;

    const waypoints = [move.from, ...move.path];
    const tl = gsap.timeline();
    waypoints.forEach((wp, i) => {
      const dx = (wp.c - dest.c) * squareSize;
      const dy = (wp.r - dest.r) * squareSize;
      if (i === 0) {
        tl.set(destEl, { x: dx, y: dy });
      } else {
        tl.to(destEl, { x: dx, y: dy, duration: 0.22, ease: 'power1.inOut' });
      }
    });
    if (crowned) {
      tl.to(destEl, { scale: 1.35, duration: 0.16, ease: 'power1.out' });
      tl.to(destEl, { scale: 1, duration: 0.3, ease: 'back.out(2.5)' });
    }
  }

  function maybeTriggerBot() {
    if (state.mode !== 'bot' || state.currentPlayer === HUMAN_PLAYER || state.gameOver) return;
    state.inputLocked = true;
    statusEl.textContent = 'Black (Bot) is thinking…';
    render();
    const thinkTime = 350 + Math.random() * 400;
    setTimeout(() => {
      const move = CheckersAI.getBotMove(state.board, state.currentPlayer, state.difficulty);
      state.inputLocked = false;
      if (move) commitMove(move);
    }, thinkTime);
  }

  function endGame(winner) {
    state.gameOver = true;
    state.winner = winner;
    updateStatus();
    saveGame();
    showWinOverlay(winner);
  }

  function showWinOverlay(winner) {
    winText.textContent = (winner === Checkers.RED ? 'Red' : 'Black') + ' Wins!';
    winOverlay.classList.remove('hidden');
    const card = winOverlay.querySelector('.win-card');
    if (window.gsap && card) {
      gsap.fromTo(
        card,
        { opacity: 0, scale: 0.82, y: 12 },
        { opacity: 1, scale: 1, y: 0, duration: 0.45, ease: 'back.out(1.7)' }
      );
    }
  }

  function updateStatus() {
    if (state.gameOver) {
      statusEl.textContent = (state.winner === Checkers.RED ? 'Red' : 'Black') + ' wins the game!';
    } else if (state.inputLocked) {
      statusEl.textContent = 'Black (Bot) is thinking…';
    } else {
      const label = state.currentPlayer === Checkers.RED ? 'Red' : 'Black';
      const who = state.mode === 'bot' && state.currentPlayer !== HUMAN_PLAYER ? ' (Bot)' : '';
      statusEl.textContent = label + who + ' to move';
    }
    redCapturedEl.textContent = state.captured.red;
    blackCapturedEl.textContent = state.captured.black;
  }

  function logMove(player, move, capturedCount, crowned) {
    const cols = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const from = move.from;
    const dest = move.path[move.path.length - 1];
    const notation = `${cols[from.c]}${from.r + 1} ${capturedCount > 0 ? '×' : '→'} ${cols[dest.c]}${dest.r + 1}`;
    const label = (player === Checkers.RED ? 'Red' : 'Black') + ': ' + notation +
      (capturedCount > 0 ? ` (captured ${capturedCount})` : '') + (crowned ? ' — crowned!' : '');
    state.moveLog.push(label);
    const li = document.createElement('li');
    li.textContent = label;
    moveLogEl.appendChild(li);
    moveLogEl.scrollTop = moveLogEl.scrollHeight;
  }

  // ---------- Undo ----------

  function undo() {
    if (state.history.length === 0 || state.inputLocked) return;
    let snapshot = state.history.pop();
    // In bot mode, a human undo should also roll back the bot's automatic reply,
    // landing back on the human's turn.
    if (state.mode === 'bot' && snapshot.currentPlayer !== HUMAN_PLAYER && state.history.length > 0) {
      snapshot = state.history.pop();
    }
    state.board = snapshot.board;
    state.currentPlayer = snapshot.currentPlayer;
    state.captured = snapshot.captured;
    state.selection = null;
    state.gameOver = false;
    state.winner = null;
    state.moveLog.length = snapshot.moveLogLength;
    moveLogEl.innerHTML = '';
    state.moveLog.forEach((label) => {
      const li = document.createElement('li');
      li.textContent = label;
      moveLogEl.appendChild(li);
    });
    winOverlay.classList.add('hidden');
    render();
    updateStatus();
    saveGame();
  }

  // ---------- Hint ----------

  function clearHintHighlights() {
    boardEl.querySelectorAll('.hint-from, .hint-to').forEach((el) => {
      el.classList.remove('hint-from', 'hint-to');
    });
  }

  function showHint() {
    if (state.gameOver || state.inputLocked || !isHumanTurn()) return;
    const move = CheckersAI.getBestMove(state.board, state.currentPlayer, HINT_DEPTH);
    if (!move) return;
    clearHintHighlights();
    squareEl(move.from.r, move.from.c).classList.add('hint-from');
    const dest = move.path[move.path.length - 1];
    squareEl(dest.r, dest.c).classList.add('hint-to');
    const cols = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const capNote = move.captured.length > 0 ? ` and capture ${move.captured.length} piece(s)` : ' to improve your position';
    hintTextEl.textContent = `Try ${cols[move.from.c]}${move.from.r + 1} → ${cols[dest.c]}${dest.r + 1}${capNote}.`;
    setTimeout(clearHintHighlights, 4500);
  }

  // ---------- Sound ----------

  let audioCtx = null;
  let soundOn = true;

  function ensureAudio() {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) audioCtx = new Ctx();
    }
    return audioCtx;
  }

  function playSound(kind, crowned) {
    if (!soundOn) return;
    const ctx = ensureAudio();
    if (!ctx) return;
    const now = ctx.currentTime;

    const beep = (freq, start, dur, gainPeak) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + start);
      gain.gain.exponentialRampToValueAtTime(gainPeak, now + start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + start);
      osc.stop(now + start + dur + 0.02);
    };

    if (kind === 'capture') {
      beep(220, 0, 0.09, 0.18);
      beep(160, 0.07, 0.12, 0.15);
    } else {
      beep(340, 0, 0.07, 0.12);
    }
    if (crowned) {
      beep(520, 0.1, 0.1, 0.15);
      beep(660, 0.2, 0.14, 0.15);
    }
  }

  // ---------- Controls wiring ----------

  document.getElementById('modeSegmented').addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    const mode = btn.dataset.mode;
    if (mode === state.mode) return;
    newGame(mode);
  });

  difficultySlider.addEventListener('input', () => {
    const v = Number(difficultySlider.value);
    state.difficulty = v;
    difficultyValue.textContent = `${v} / 10`;
    difficultyLabel.textContent = DIFFICULTY_LABELS[v];
    saveGame();
  });

  document.getElementById('newGameBtn').addEventListener('click', () => newGame(state.mode));
  document.getElementById('winNewGame').addEventListener('click', () => newGame(state.mode));
  document.getElementById('undoBtn').addEventListener('click', undo);
  document.getElementById('hintBtn').addEventListener('click', showHint);
  document.getElementById('soundBtn').addEventListener('click', (e) => {
    soundOn = !soundOn;
    e.currentTarget.setAttribute('aria-pressed', String(soundOn));
    e.currentTarget.textContent = (soundOn ? '♪ Sound' : '♪ Sound (Off)');
  });

  // ---------- Init ----------

  buildBoardSkeleton();
  const saved = loadSavedGame();
  if (saved) {
    restoreGame(saved);
  } else {
    difficultyLabel.textContent = DIFFICULTY_LABELS[Number(difficultySlider.value)];
    difficultyValue.textContent = `${difficultySlider.value} / 10`;
    newGame('bot');
  }
})();
