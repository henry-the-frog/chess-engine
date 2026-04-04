// board.test.js — Tests for chess board and move generation

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Board, WHITE, BLACK, PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING, STARTING_FEN, sqName, parseSq } from './board.js';

describe('Board', () => {
  describe('FEN parsing', () => {
    it('parses starting position', () => {
      const b = Board.fromFEN(STARTING_FEN);
      assert.equal(b.side, WHITE);
      assert.equal(b.castling, 15); // KQkq
      assert.equal(b.epSquare, -1);
      assert.equal(b.toFEN(), STARTING_FEN);
    });

    it('roundtrips FEN', () => {
      const fens = [
        STARTING_FEN,
        'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
        'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
        '8/8/8/8/8/8/8/4K2k w - - 0 1',
      ];
      for (const fen of fens) {
        assert.equal(Board.fromFEN(fen).toFEN(), fen);
      }
    });

    it('identifies pieces correctly', () => {
      const b = Board.fromFEN(STARTING_FEN);
      const e1 = b.pieceAt(parseSq('e1'));
      assert.deepStrictEqual(e1, { color: WHITE, piece: KING });
      const e8 = b.pieceAt(parseSq('e8'));
      assert.deepStrictEqual(e8, { color: BLACK, piece: KING });
      const d2 = b.pieceAt(parseSq('d2'));
      assert.deepStrictEqual(d2, { color: WHITE, piece: PAWN });
      const e4 = b.pieceAt(parseSq('e4'));
      assert.equal(e4, null);
    });
  });

  describe('Move generation — starting position', () => {
    it('generates 20 legal moves from starting position', () => {
      const b = Board.fromFEN(STARTING_FEN);
      const moves = b.generateLegalMoves();
      assert.equal(moves.length, 20);
    });

    it('16 pawn moves + 4 knight moves', () => {
      const b = Board.fromFEN(STARTING_FEN);
      const moves = b.generateLegalMoves();
      const pawnMoves = moves.filter(m => m.piece === PAWN);
      const knightMoves = moves.filter(m => m.piece === KNIGHT);
      assert.equal(pawnMoves.length, 16);
      assert.equal(knightMoves.length, 4);
    });
  });

  describe('Move generation — specific positions', () => {
    it('knight in center has 8 moves on empty board', () => {
      const b = Board.fromFEN('8/8/8/8/3N4/8/8/4K2k w - - 0 1');
      const moves = b.generateLegalMoves();
      const knightMoves = moves.filter(m => m.piece === KNIGHT);
      assert.equal(knightMoves.length, 8);
    });

    it('generates pawn captures', () => {
      const b = Board.fromFEN('8/8/8/3p4/4P3/8/8/4K2k w - - 0 1');
      const moves = b.generateLegalMoves();
      const captures = moves.filter(m => m.capture !== undefined);
      assert.equal(captures.length, 1);
      assert.equal(captures[0].piece, PAWN);
    });

    it('generates en passant', () => {
      const b = Board.fromFEN('8/8/8/4Pp2/8/8/8/4K2k w - f6 0 1');
      const moves = b.generateLegalMoves();
      const epMoves = moves.filter(m => m.epCapture);
      assert.equal(epMoves.length, 1);
      assert.equal(sqName(epMoves[0].to), 'f6');
    });

    it('generates pawn promotion', () => {
      const b = Board.fromFEN('8/4P3/8/8/8/8/8/4K2k w - - 0 1');
      const moves = b.generateLegalMoves();
      const promos = moves.filter(m => m.promotion !== undefined);
      assert.equal(promos.length, 4); // Q, R, B, N
    });

    it('generates promotion captures', () => {
      const b = Board.fromFEN('3r4/4P3/8/8/8/8/8/4K2k w - - 0 1');
      const moves = b.generateLegalMoves();
      const promoCaptures = moves.filter(m => m.promotion !== undefined && m.capture !== undefined);
      assert.equal(promoCaptures.length, 4);
    });
  });

  describe('Castling', () => {
    it('allows kingside castling', () => {
      const b = Board.fromFEN('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1');
      const moves = b.generateLegalMoves();
      const castles = moves.filter(m => m.castling);
      assert.equal(castles.length, 2); // K and Q
    });

    it('blocks castling through check', () => {
      // Bishop on b4 attacks d2 which is between e1 and c1 — but also attacks the path
      const b = Board.fromFEN('r3k2r/pppppppp/8/8/8/5n2/PPPPPPPP/R3K2R w KQkq - 0 1');
      const moves = b.generateLegalMoves();
      const castles = moves.filter(m => m.castling);
      // f3 knight attacks e1? No — knight on f3 doesn't attack e1
      // Actually f3 knight attacks d2, e1, g1, h2, d4, e5, g5, h4
      // It attacks e1! So king is in check, no castling at all
      assert.equal(castles.length, 0);
    });

    it('blocks castling when in check', () => {
      const b = Board.fromFEN('4k3/8/8/8/8/8/4r3/R3K2R w KQ - 0 1');
      const moves = b.generateLegalMoves();
      const castles = moves.filter(m => m.castling);
      assert.equal(castles.length, 0); // In check from e2 rook
    });

    it('executes castling correctly', () => {
      const b = Board.fromFEN('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1');
      const move = b.generateLegalMoves().find(m => m.castling === 'K');
      assert.ok(move);
      const after = b.makeMove(move);
      assert.equal(sqName(6), 'g1');
      const king = after.pieceAt(parseSq('g1'));
      assert.deepStrictEqual(king, { color: WHITE, piece: KING });
      const rook = after.pieceAt(parseSq('f1'));
      assert.deepStrictEqual(rook, { color: WHITE, piece: ROOK });
    });

    it('removes castling rights after king move', () => {
      const b = Board.fromFEN('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1');
      const kingMove = b.generateLegalMoves().find(m => m.piece === KING && !m.castling);
      const after = b.makeMove(kingMove);
      assert.equal(after.castling & 3, 0); // White castling gone
    });
  });

  describe('Check detection', () => {
    it('detects check from rook', () => {
      const b = Board.fromFEN('4k3/8/8/8/8/8/4r3/4K3 w - - 0 1');
      assert.ok(b.inCheck(WHITE));
    });

    it('detects check from knight', () => {
      const b = Board.fromFEN('4k3/8/8/8/8/3n4/8/4K3 w - - 0 1');
      assert.ok(b.inCheck(WHITE));
    });

    it('detects check from bishop', () => {
      const b = Board.fromFEN('4k3/8/8/8/8/2b5/8/4K3 w - - 0 1');
      assert.ok(b.inCheck(WHITE));
    });

    it('detects check from pawn', () => {
      const b = Board.fromFEN('4k3/8/8/8/8/8/3p4/4K3 w - - 0 1');
      assert.ok(b.inCheck(WHITE));
    });

    it('no check in starting position', () => {
      const b = Board.fromFEN(STARTING_FEN);
      assert.ok(!b.inCheck(WHITE));
      assert.ok(!b.inCheck(BLACK));
    });

    it('filters illegal moves that leave king in check', () => {
      // King on e1, enemy rook on e8 — can't move to e2
      const b = Board.fromFEN('4r3/8/8/8/8/8/8/4K3 w - - 0 1');
      const moves = b.generateLegalMoves();
      const illegalE2 = moves.find(m => sqName(m.to) === 'e2');
      assert.equal(illegalE2, undefined);
    });
  });

  describe('Perft (move generation correctness)', () => {
    // Perft counts all leaf nodes at a given depth
    function perft(board, depth) {
      if (depth === 0) return 1;
      const moves = board.generateLegalMoves();
      let nodes = 0;
      for (const move of moves) {
        const newBoard = board.makeMove(move);
        nodes += perft(newBoard, depth - 1);
      }
      return nodes;
    }

    it('starting position depth 1 = 20', () => {
      assert.equal(perft(Board.fromFEN(STARTING_FEN), 1), 20);
    });

    it('starting position depth 2 = 400', () => {
      assert.equal(perft(Board.fromFEN(STARTING_FEN), 2), 400);
    });

    it('starting position depth 3 = 8902', () => {
      assert.equal(perft(Board.fromFEN(STARTING_FEN), 3), 8902);
    });

    it('starting position depth 4 = 197281', () => {
      assert.equal(perft(Board.fromFEN(STARTING_FEN), 4), 197281);
    });

    it('Kiwipete position depth 1 = 48', () => {
      const b = Board.fromFEN('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
      assert.equal(perft(b, 1), 48);
    });

    it('Kiwipete position depth 2 = 2039', () => {
      const b = Board.fromFEN('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
      assert.equal(perft(b, 2), 2039);
    });

    it('Position 3 (EP + promo) depth 1 = 14', () => {
      const b = Board.fromFEN('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1');
      assert.equal(perft(b, 1), 14);
    });

    it('Position 3 depth 2 = 191', () => {
      const b = Board.fromFEN('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1');
      assert.equal(perft(b, 2), 191);
    });
  });

  describe('UCI move parsing', () => {
    it('finds e2e4 from starting position', () => {
      const b = Board.fromFEN(STARTING_FEN);
      const move = b.findMoveFromUCI('e2e4');
      assert.ok(move);
      assert.equal(move.piece, PAWN);
      assert.equal(sqName(move.from), 'e2');
      assert.equal(sqName(move.to), 'e4');
    });

    it('finds promotion move', () => {
      const b = Board.fromFEN('8/4P3/8/8/8/8/8/4K2k w - - 0 1');
      const move = b.findMoveFromUCI('e7e8q');
      assert.ok(move);
      assert.equal(move.promotion, QUEEN);
    });
  });
});

describe('Perft depth 5 (slow)', () => {
  function perft(board, depth) {
    if (depth === 0) return 1;
    const moves = board.generateLegalMoves();
    let nodes = 0;
    for (const move of moves) nodes += perft(board.makeMove(move), depth - 1);
    return nodes;
  }

  it('starting position depth 5 = 4865609', { timeout: 60000 }, () => {
    assert.equal(perft(Board.fromFEN(STARTING_FEN), 5), 4865609);
  });

  it('Kiwipete depth 3 = 97862', () => {
    const b = Board.fromFEN('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
    assert.equal(perft(b, 3), 97862);
  });

  it('Position 3 depth 3 = 2812', () => {
    const b = Board.fromFEN('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1');
    assert.equal(perft(b, 3), 2812);
  });

  it('Position 4 depth 3 = 9467', () => {
    const b = Board.fromFEN('r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1');
    assert.equal(perft(b, 3), 9467);
  });

  it('Position 5 depth 2 = 1486', () => {
    const b = Board.fromFEN('rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8');
    assert.equal(perft(b, 2), 1486);
  });
});
