// eval.js — Position evaluation
// Returns score in centipawns from the perspective of the side to move

import { Board, WHITE, BLACK, PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING, iterBits, fileOf, rankOf, FILE_A, FILE_H, RANK_1, RANK_8, bishopAttacks, rookAttacks, queenAttacks } from './board.js';

const PIECE_VALUES = [100, 320, 330, 500, 900, 0]; // P, N, B, R, Q, K

// Piece-square tables (from White's perspective, index = square a1=0 to h8=63)
// Flipped for Black
const PST = {
  [PAWN]: [
     0,  0,  0,  0,  0,  0,  0,  0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
     5,  5, 10, 25, 25, 10,  5,  5,
     0,  0,  0, 20, 20,  0,  0,  0,
     5, -5,-10,  0,  0,-10, -5,  5,
     5, 10, 10,-20,-20, 10, 10,  5,
     0,  0,  0,  0,  0,  0,  0,  0,
  ],
  [KNIGHT]: [
   -50,-40,-30,-30,-30,-30,-40,-50,
   -40,-20,  0,  0,  0,  0,-20,-40,
   -30,  0, 10, 15, 15, 10,  0,-30,
   -30,  5, 15, 20, 20, 15,  5,-30,
   -30,  0, 15, 20, 20, 15,  0,-30,
   -30,  5, 10, 15, 15, 10,  5,-30,
   -40,-20,  0,  5,  5,  0,-20,-40,
   -50,-40,-30,-30,-30,-30,-40,-50,
  ],
  [BISHOP]: [
   -20,-10,-10,-10,-10,-10,-10,-20,
   -10,  0,  0,  0,  0,  0,  0,-10,
   -10,  0,  5, 10, 10,  5,  0,-10,
   -10,  5,  5, 10, 10,  5,  5,-10,
   -10,  0, 10, 10, 10, 10,  0,-10,
   -10, 10, 10, 10, 10, 10, 10,-10,
   -10,  5,  0,  0,  0,  0,  5,-10,
   -20,-10,-10,-10,-10,-10,-10,-20,
  ],
  [ROOK]: [
     0,  0,  0,  0,  0,  0,  0,  0,
     5, 10, 10, 10, 10, 10, 10,  5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
     0,  0,  0,  5,  5,  0,  0,  0,
  ],
  [QUEEN]: [
   -20,-10,-10, -5, -5,-10,-10,-20,
   -10,  0,  0,  0,  0,  0,  0,-10,
   -10,  0,  5,  5,  5,  5,  0,-10,
    -5,  0,  5,  5,  5,  5,  0, -5,
     0,  0,  5,  5,  5,  5,  0, -5,
   -10,  5,  5,  5,  5,  5,  0,-10,
   -10,  0,  5,  0,  0,  0,  0,-10,
   -20,-10,-10, -5, -5,-10,-10,-20,
  ],
  [KING]: [
   -30,-40,-40,-50,-50,-40,-40,-30,
   -30,-40,-40,-50,-50,-40,-40,-30,
   -30,-40,-40,-50,-50,-40,-40,-30,
   -30,-40,-40,-50,-50,-40,-40,-30,
   -20,-30,-30,-40,-40,-30,-30,-20,
   -10,-20,-20,-20,-20,-20,-20,-10,
    20, 20,  0,  0,  0,  0, 20, 20,
    20, 30, 10,  0,  0, 10, 30, 20,
  ],
};

// King endgame table
const KING_ENDGAME = [
  -50,-40,-30,-20,-20,-30,-40,-50,
  -30,-20,-10,  0,  0,-10,-20,-30,
  -30,-10, 20, 30, 30, 20,-10,-30,
  -30,-10, 30, 40, 40, 30,-10,-30,
  -30,-10, 30, 40, 40, 30,-10,-30,
  -30,-10, 20, 30, 30, 20,-10,-30,
  -30,-30,  0,  0,  0,  0,-30,-30,
  -50,-30,-30,-30,-30,-30,-30,-50,
];

function mirrorSquare(sq) {
  return (7 - rankOf(sq)) * 8 + fileOf(sq);
}

function isEndgame(board) {
  // Simplified: endgame if no queens or total material < threshold
  const whiteQueens = board.pieces[WHITE][QUEEN];
  const blackQueens = board.pieces[BLACK][QUEEN];
  return whiteQueens === 0n && blackQueens === 0n;
}

export function evaluate(board) {
  let score = 0;
  const endgame = isEndgame(board);

  for (let color = 0; color < 2; color++) {
    const sign = color === WHITE ? 1 : -1;

    for (let piece = 0; piece < 6; piece++) {
      for (const sq of iterBits(board.pieces[color][piece])) {
        // Material
        score += sign * PIECE_VALUES[piece];

        // Piece-square table
        const pstSq = color === WHITE ? sq : mirrorSquare(sq);
        const table = (piece === KING && endgame) ? KING_ENDGAME : PST[piece];
        score += sign * table[pstSq];
      }
    }
  }

  // Bishop pair bonus
  let whiteBishops = 0, blackBishops = 0;
  for (const _ of iterBits(board.pieces[WHITE][BISHOP])) whiteBishops++;
  for (const _ of iterBits(board.pieces[BLACK][BISHOP])) blackBishops++;
  if (whiteBishops >= 2) score += 30;
  if (blackBishops >= 2) score -= 30;

  // Mobility (simplified — count legal move options)
  const occ = board.occupied();
  for (const sq of iterBits(board.pieces[WHITE][KNIGHT])) {
    score += 4; // knight mobility bonus per piece
  }
  for (const sq of iterBits(board.pieces[BLACK][KNIGHT])) {
    score -= 4;
  }

  // Return from side-to-move perspective
  return board.side === WHITE ? score : -score;
}
