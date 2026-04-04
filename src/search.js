// search.js — Alpha-beta search with iterative deepening

import { Board, WHITE, BLACK, PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING } from './board.js';
import { evaluate } from './eval.js';

const INFINITY = 1000000;
const MATE_SCORE = 100000;

// ===== Move Ordering =====
// MVV-LVA: Most Valuable Victim - Least Valuable Attacker
const PIECE_VALUES = [100, 320, 330, 500, 900, 20000]; // P, N, B, R, Q, K

function mvvLva(move) {
  if (move.capture !== undefined) {
    return PIECE_VALUES[move.capture] * 10 - PIECE_VALUES[move.piece];
  }
  if (move.promotion !== undefined) return PIECE_VALUES[move.promotion];
  return 0;
}

function orderMoves(moves, ttMove) {
  return moves.sort((a, b) => {
    // TT move first
    if (ttMove) {
      const aIsTT = a.from === ttMove.from && a.to === ttMove.to;
      const bIsTT = b.from === ttMove.from && b.to === ttMove.to;
      if (aIsTT && !bIsTT) return -1;
      if (bIsTT && !aIsTT) return 1;
    }
    return mvvLva(b) - mvvLva(a);
  });
}

// ===== Transposition Table =====
class TTable {
  constructor(size = 1 << 20) { // ~1M entries
    this.size = size;
    this.table = new Map();
  }

  // Simple position hash based on FEN (not Zobrist, but works)
  hash(board) {
    return board.toFEN().split(' ').slice(0, 4).join(' ');
  }

  get(board) {
    return this.table.get(this.hash(board));
  }

  set(board, entry) {
    if (this.table.size >= this.size) {
      // Simple eviction: clear half
      const keys = [...this.table.keys()];
      for (let i = 0; i < keys.length / 2; i++) this.table.delete(keys[i]);
    }
    this.table.set(this.hash(board), entry);
  }

  clear() { this.table.clear(); }
}

// TT entry types
const TT_EXACT = 0;
const TT_ALPHA = 1; // upper bound (failed low)
const TT_BETA = 2;  // lower bound (failed high)

// ===== Search Engine =====
export class SearchEngine {
  constructor() {
    this.tt = new TTable();
    this.nodes = 0;
    this.maxDepth = 0;
    this.startTime = 0;
    this.timeLimit = 0;
    this.stopped = false;
  }

  // Quiescence search — resolve captures to avoid horizon effect
  quiescence(board, alpha, beta) {
    this.nodes++;

    const standPat = evaluate(board);
    if (standPat >= beta) return beta;
    if (standPat > alpha) alpha = standPat;

    const moves = board.generateLegalMoves();
    const captures = moves.filter(m => m.capture !== undefined || m.promotion !== undefined);
    orderMoves(captures, null);

    for (const move of captures) {
      const newBoard = board.makeMove(move);
      const score = -this.quiescence(newBoard, -beta, -alpha);

      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }

    return alpha;
  }

  // Alpha-beta negamax
  alphaBeta(board, depth, alpha, beta, ply = 0) {
    // Time check
    if (this.timeLimit && Date.now() - this.startTime > this.timeLimit) {
      this.stopped = true;
      return 0;
    }

    this.nodes++;

    // TT lookup
    const ttEntry = this.tt.get(board);
    if (ttEntry && ttEntry.depth >= depth) {
      if (ttEntry.type === TT_EXACT) return ttEntry.score;
      if (ttEntry.type === TT_ALPHA && ttEntry.score <= alpha) return alpha;
      if (ttEntry.type === TT_BETA && ttEntry.score >= beta) return beta;
    }

    if (depth <= 0) return this.quiescence(board, alpha, beta);

    const moves = board.generateLegalMoves();

    // Checkmate / Stalemate
    if (moves.length === 0) {
      if (board.inCheck()) return -MATE_SCORE + ply;
      return 0; // stalemate
    }

    const ttMove = ttEntry?.bestMove;
    orderMoves(moves, ttMove);

    let bestScore = -INFINITY;
    let bestMove = null;
    let ttType = TT_ALPHA;

    for (const move of moves) {
      const newBoard = board.makeMove(move);
      const score = -this.alphaBeta(newBoard, depth - 1, -beta, -alpha, ply + 1);

      if (this.stopped) return 0;

      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }

      if (score > alpha) {
        alpha = score;
        ttType = TT_EXACT;
      }

      if (alpha >= beta) {
        ttType = TT_BETA;
        break;
      }
    }

    // Store in TT
    this.tt.set(board, { depth, score: bestScore, type: ttType, bestMove });

    return bestScore;
  }

  // Iterative deepening
  search(board, options = {}) {
    const maxDepth = options.depth || 64;
    this.timeLimit = options.timeLimit || 0;
    this.startTime = Date.now();
    this.stopped = false;
    this.nodes = 0;
    this.maxDepth = 0;

    let bestMove = null;
    let bestScore = 0;

    const moves = board.generateLegalMoves();
    if (moves.length === 0) return { move: null, score: 0, depth: 0, nodes: 0 };
    if (moves.length === 1) return { move: moves[0], score: 0, depth: 0, nodes: 1 };

    for (let depth = 1; depth <= maxDepth; depth++) {
      let alpha = -INFINITY;
      let beta = INFINITY;
      let depthBest = null;
      let depthScore = -INFINITY;

      orderMoves(moves, bestMove);

      for (const move of moves) {
        const newBoard = board.makeMove(move);
        const score = -this.alphaBeta(newBoard, depth - 1, -beta, -alpha, 1);

        if (this.stopped) break;

        if (score > depthScore) {
          depthScore = score;
          depthBest = move;
        }
        if (score > alpha) alpha = score;
      }

      if (this.stopped) break;

      bestMove = depthBest;
      bestScore = depthScore;
      this.maxDepth = depth;

      // Log info
      if (options.log) {
        const elapsed = Date.now() - this.startTime;
        const nps = elapsed > 0 ? Math.floor(this.nodes / (elapsed / 1000)) : 0;
        options.log({
          depth, score: bestScore, nodes: this.nodes,
          time: elapsed, nps,
          pv: bestMove ? Board.moveToUCI(bestMove) : '',
        });
      }

      // Check for mate found
      if (Math.abs(bestScore) > MATE_SCORE - 100) break;
    }

    return {
      move: bestMove,
      score: bestScore,
      depth: this.maxDepth,
      nodes: this.nodes,
      time: Date.now() - this.startTime,
    };
  }
}

export { INFINITY, MATE_SCORE, PIECE_VALUES };
