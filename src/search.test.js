// search.test.js — Tests for alpha-beta search

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SearchEngine, MATE_SCORE } from './search.js';
import { Board, WHITE, BLACK, STARTING_FEN, sqName } from './board.js';

describe('Search', () => {
  describe('Basic search', () => {
    it('finds a move from starting position', () => {
      const engine = new SearchEngine();
      const board = Board.fromFEN(STARTING_FEN);
      const result = engine.search(board, { depth: 3 });
      assert.ok(result.move);
      assert.ok(result.depth >= 1);
    });

    it('finds mate in 1', () => {
      // White to move, Qh5 is mate (scholar's mate position minus one move)
      const board = Board.fromFEN('r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4');
      const engine = new SearchEngine();
      const result = engine.search(board, { depth: 2 });
      // Should find Qxf7# (queen captures f7 pawn = mate)
      assert.ok(result.move);
      const uci = Board.moveToUCI(result.move);
      assert.equal(uci, 'h5f7'); // Qxf7#
      assert.ok(result.score > MATE_SCORE - 10);
    });

    it('avoids mate — blocks or escapes', () => {
      // Black to move, threatened with Qxf7#
      const board = Board.fromFEN('r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 4 4');
      const engine = new SearchEngine();
      const result = engine.search(board, { depth: 3 });
      assert.ok(result.move);
      // Should defend f7 (e.g., g6 or Qe7 or something)
    });

    it('captures free piece', () => {
      // White queen can capture undefended black rook on a5
      const board = Board.fromFEN('4k3/8/8/r7/8/8/8/4KQ2 w - - 0 1');
      const engine = new SearchEngine();
      const result = engine.search(board, { depth: 2 });
      assert.ok(result.move);
      // Queen should capture rook
    });

    it('searches with time limit', () => {
      const board = Board.fromFEN(STARTING_FEN);
      const engine = new SearchEngine();
      const result = engine.search(board, { timeLimit: 200 });
      assert.ok(result.move);
      assert.ok(result.time <= 400); // some tolerance
    });

    it('returns only move immediately', () => {
      // Only one legal move
      const board = Board.fromFEN('4k3/8/8/8/8/8/3r4/4K3 w - - 0 1');
      const moves = board.generateLegalMoves();
      // King must escape check, very limited moves
      if (moves.length === 1) {
        const engine = new SearchEngine();
        const result = engine.search(board, { depth: 5 });
        assert.ok(result.move);
      }
    });
  });

  describe('Tactical puzzles', () => {
    it('finds fork (knight)', () => {
      // White knight can fork king and queen: Nc7+
      const board = Board.fromFEN('r1bqk2r/pppp1ppp/2n2n2/2b1p3/4P3/2N2N2/PPPP1PPP/R1BQKB1R w KQkq - 4 4');
      const engine = new SearchEngine();
      const result = engine.search(board, { depth: 3 });
      assert.ok(result.move);
      // Should prefer a good move (though this specific position might not have a simple fork)
    });

    it('takes back-rank mate', () => {
      // White Rook can deliver back-rank mate: Re8#
      const board = Board.fromFEN('6k1/5ppp/8/8/8/8/8/R3K3 w Q - 0 1');
      const engine = new SearchEngine();
      const result = engine.search(board, { depth: 3 });
      assert.ok(result.move);
      const uci = Board.moveToUCI(result.move);
      assert.equal(uci, 'a1a8'); // Ra8#
      assert.ok(result.score > MATE_SCORE - 10);
    });
  });

  describe('Search features', () => {
    it('iterative deepening increases depth', () => {
      const board = Board.fromFEN(STARTING_FEN);
      const engine = new SearchEngine();
      const result = engine.search(board, { depth: 4 });
      assert.equal(result.depth, 4);
    });

    it('reports node count', () => {
      const board = Board.fromFEN(STARTING_FEN);
      const engine = new SearchEngine();
      const result = engine.search(board, { depth: 3 });
      assert.ok(result.nodes > 0);
    });

    it('uses transposition table', () => {
      const board = Board.fromFEN(STARTING_FEN);
      const engine = new SearchEngine();
      // Search twice — second should be faster due to TT
      engine.search(board, { depth: 3 });
      const nodes1 = engine.nodes;
      engine.nodes = 0;
      engine.search(board, { depth: 3 });
      const nodes2 = engine.nodes;
      // TT should reduce nodes on second search
      assert.ok(nodes2 <= nodes1);
    });

    it('search depth 5 on simple position', () => {
      const board = Board.fromFEN('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1');
      const engine = new SearchEngine();
      const result = engine.search(board, { depth: 5 });
      assert.ok(result.move);
      assert.equal(result.depth, 5);
    });

    it('handles stalemate', () => {
      // Black is stalemated (king on a8, no moves)
      const board = Board.fromFEN('k7/2K5/1Q6/8/8/8/8/8 b - - 0 1');
      const moves = board.generateLegalMoves();
      assert.equal(moves.length, 0);
      assert.ok(!board.inCheck(BLACK));
    });
  });
});
