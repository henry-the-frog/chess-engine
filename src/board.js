// board.js — Chess board with bitboard representation
// Uses BigInt for 64-bit bitboards (one bit per square)
// Square mapping: a1=0, b1=1, ..., h1=7, a2=8, ..., h8=63

// ===== Constants =====
export const WHITE = 0;
export const BLACK = 1;

export const PAWN = 0;
export const KNIGHT = 1;
export const BISHOP = 2;
export const ROOK = 3;
export const QUEEN = 4;
export const KING = 5;

const PIECE_CHARS = 'PNBRQKpnbrqk';
const PIECE_NAMES = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'];

// Files and ranks as bitboards
export const FILE_A = 0x0101010101010101n;
export const FILE_B = 0x0202020202020202n;
export const FILE_G = 0x4040404040404040n;
export const FILE_H = 0x8080808080808080n;
export const RANK_1 = 0x00000000000000FFn;
export const RANK_2 = 0x000000000000FF00n;
export const RANK_4 = 0x00000000FF000000n;
export const RANK_5 = 0x000000FF00000000n;
export const RANK_7 = 0x00FF000000000000n;
export const RANK_8 = 0xFF00000000000000n;
const ALL = 0xFFFFFFFFFFFFFFFFn;

// Castling flags
export const CASTLE_WK = 1;  // White kingside
export const CASTLE_WQ = 2;  // White queenside
export const CASTLE_BK = 4;  // Black kingside
export const CASTLE_BQ = 8;  // Black queenside

// ===== Utility =====
export function sq(file, rank) { return rank * 8 + file; }
export function fileOf(sq) { return sq & 7; }
export function rankOf(sq) { return sq >> 3; }
export function bit(sq) { return 1n << BigInt(sq); }
export function sqName(sq) { return 'abcdefgh'[fileOf(sq)] + (rankOf(sq) + 1); }

export function parseSq(name) {
  const file = name.charCodeAt(0) - 97; // 'a'
  const rank = name.charCodeAt(1) - 49; // '1'
  return sq(file, rank);
}

function popCount(bb) {
  let count = 0;
  while (bb) { bb &= bb - 1n; count++; }
  return count;
}

function bitScan(bb) {
  // Returns index of least significant bit
  if (bb === 0n) return -1;
  let n = 0;
  let b = bb;
  if ((b & 0xFFFFFFFFn) === 0n) { n += 32; b >>= 32n; }
  if ((b & 0xFFFFn) === 0n) { n += 16; b >>= 16n; }
  if ((b & 0xFFn) === 0n) { n += 8; b >>= 8n; }
  if ((b & 0xFn) === 0n) { n += 4; b >>= 4n; }
  if ((b & 0x3n) === 0n) { n += 2; b >>= 2n; }
  if ((b & 0x1n) === 0n) { n += 1; }
  return n;
}

export function* iterBits(bb) {
  while (bb) {
    const sq = bitScan(bb);
    yield sq;
    bb &= bb - 1n; // clear LSB
  }
}

// ===== Precomputed attack tables =====
const knightAttacks = new Array(64);
const kingAttacks = new Array(64);
const pawnAttacks = [new Array(64), new Array(64)]; // [WHITE][sq], [BLACK][sq]

function initAttackTables() {
  for (let s = 0; s < 64; s++) {
    const b = bit(s);
    // Knight
    let n = 0n;
    n |= (b << 17n) & ~FILE_A;
    n |= (b << 15n) & ~FILE_H;
    n |= (b << 10n) & ~(FILE_A | FILE_B);
    n |= (b << 6n) & ~(FILE_G | FILE_H);
    n |= (b >> 17n) & ~FILE_H;
    n |= (b >> 15n) & ~FILE_A;
    n |= (b >> 10n) & ~(FILE_G | FILE_H);
    n |= (b >> 6n) & ~(FILE_A | FILE_B);
    knightAttacks[s] = n & ALL;

    // King
    let k = 0n;
    k |= (b << 1n) & ~FILE_A;
    k |= (b >> 1n) & ~FILE_H;
    k |= (b << 8n);
    k |= (b >> 8n);
    k |= (b << 9n) & ~FILE_A;
    k |= (b << 7n) & ~FILE_H;
    k |= (b >> 9n) & ~FILE_H;
    k |= (b >> 7n) & ~FILE_A;
    kingAttacks[s] = k & ALL;

    // Pawn attacks (captures only)
    pawnAttacks[WHITE][s] = (((b << 7n) & ~FILE_H) | ((b << 9n) & ~FILE_A)) & ALL;
    pawnAttacks[BLACK][s] = (((b >> 7n) & ~FILE_A) | ((b >> 9n) & ~FILE_H)) & ALL;
  }
}
initAttackTables();

// Sliding piece rays (bishop, rook, queen)
function slidingAttacks(sq, occupied, directions) {
  let attacks = 0n;
  for (const [df, dr] of directions) {
    let f = fileOf(sq) + df;
    let r = rankOf(sq) + dr;
    while (f >= 0 && f < 8 && r >= 0 && r < 8) {
      const s = r * 8 + f;
      const b = 1n << BigInt(s);
      attacks |= b;
      if (occupied & b) break; // blocked
      f += df;
      r += dr;
    }
  }
  return attacks;
}

const BISHOP_DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const ROOK_DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

export function bishopAttacks(sq, occ) { return slidingAttacks(sq, occ, BISHOP_DIRS); }
export function rookAttacks(sq, occ) { return slidingAttacks(sq, occ, ROOK_DIRS); }
export function queenAttacks(sq, occ) { return slidingAttacks(sq, occ, [...BISHOP_DIRS, ...ROOK_DIRS]); }

// ===== Board =====
export class Board {
  constructor() {
    // Bitboards: [color][piece]
    this.pieces = [
      [0n, 0n, 0n, 0n, 0n, 0n], // white: P, N, B, R, Q, K
      [0n, 0n, 0n, 0n, 0n, 0n], // black
    ];
    this.side = WHITE;
    this.castling = CASTLE_WK | CASTLE_WQ | CASTLE_BK | CASTLE_BQ;
    this.epSquare = -1;
    this.halfmove = 0;
    this.fullmove = 1;
    this.hash = 0n; // Zobrist (TODO)
  }

  // Derived bitboards
  colorBB(color) {
    const p = this.pieces[color];
    return p[0] | p[1] | p[2] | p[3] | p[4] | p[5];
  }

  occupied() { return this.colorBB(WHITE) | this.colorBB(BLACK); }
  empty() { return ~this.occupied() & ALL; }

  pieceAt(sq) {
    const b = bit(sq);
    for (let color = 0; color < 2; color++) {
      for (let piece = 0; piece < 6; piece++) {
        if (this.pieces[color][piece] & b) return { color, piece };
      }
    }
    return null;
  }

  // ===== FEN =====
  static fromFEN(fen) {
    const board = new Board();
    const parts = fen.split(' ');
    const rows = parts[0].split('/').reverse();

    for (let rank = 0; rank < 8; rank++) {
      let file = 0;
      for (const ch of rows[rank]) {
        if (ch >= '1' && ch <= '8') {
          file += parseInt(ch);
        } else {
          const idx = PIECE_CHARS.indexOf(ch);
          const color = idx < 6 ? WHITE : BLACK;
          const piece = idx % 6;
          board.pieces[color][piece] |= bit(sq(file, rank));
          file++;
        }
      }
    }

    board.side = parts[1] === 'b' ? BLACK : WHITE;
    board.castling = 0;
    if (parts[2].includes('K')) board.castling |= CASTLE_WK;
    if (parts[2].includes('Q')) board.castling |= CASTLE_WQ;
    if (parts[2].includes('k')) board.castling |= CASTLE_BK;
    if (parts[2].includes('q')) board.castling |= CASTLE_BQ;
    board.epSquare = parts[3] === '-' ? -1 : parseSq(parts[3]);
    board.halfmove = parseInt(parts[4] || '0');
    board.fullmove = parseInt(parts[5] || '1');

    return board;
  }

  toFEN() {
    let fen = '';
    for (let rank = 7; rank >= 0; rank--) {
      let empty = 0;
      for (let file = 0; file < 8; file++) {
        const p = this.pieceAt(sq(file, rank));
        if (p) {
          if (empty) { fen += empty; empty = 0; }
          fen += PIECE_CHARS[p.color * 6 + p.piece];
        } else {
          empty++;
        }
      }
      if (empty) fen += empty;
      if (rank > 0) fen += '/';
    }

    fen += ' ' + (this.side === WHITE ? 'w' : 'b');
    let castle = '';
    if (this.castling & CASTLE_WK) castle += 'K';
    if (this.castling & CASTLE_WQ) castle += 'Q';
    if (this.castling & CASTLE_BK) castle += 'k';
    if (this.castling & CASTLE_BQ) castle += 'q';
    fen += ' ' + (castle || '-');
    fen += ' ' + (this.epSquare >= 0 ? sqName(this.epSquare) : '-');
    fen += ' ' + this.halfmove;
    fen += ' ' + this.fullmove;

    return fen;
  }

  clone() {
    const b = new Board();
    b.pieces = [
      [...this.pieces[0]],
      [...this.pieces[1]],
    ];
    b.side = this.side;
    b.castling = this.castling;
    b.epSquare = this.epSquare;
    b.halfmove = this.halfmove;
    b.fullmove = this.fullmove;
    return b;
  }

  // ===== Move Execution =====
  makeMove(move) {
    const b = this.clone();
    const { from, to, piece, color, capture, promotion, castling: castle, epCapture } = move;
    const fromBit = bit(from);
    const toBit = bit(to);

    // Remove piece from source
    b.pieces[color][piece] &= ~fromBit;

    // Remove captured piece
    if (capture !== undefined) {
      const capSq = epCapture ? (color === WHITE ? to - 8 : to + 8) : to;
      b.pieces[1 - color][capture] &= ~bit(capSq);
    }

    // Place piece at destination (or promoted piece)
    const placePiece = promotion !== undefined ? promotion : piece;
    b.pieces[color][placePiece] |= toBit;

    // Castling: move rook
    if (castle) {
      if (castle === 'K') { b.pieces[WHITE][ROOK] &= ~bit(7); b.pieces[WHITE][ROOK] |= bit(5); }
      else if (castle === 'Q') { b.pieces[WHITE][ROOK] &= ~bit(0); b.pieces[WHITE][ROOK] |= bit(3); }
      else if (castle === 'k') { b.pieces[BLACK][ROOK] &= ~bit(63); b.pieces[BLACK][ROOK] |= bit(61); }
      else if (castle === 'q') { b.pieces[BLACK][ROOK] &= ~bit(56); b.pieces[BLACK][ROOK] |= bit(59); }
    }

    // Update castling rights
    if (piece === KING) {
      if (color === WHITE) b.castling &= ~(CASTLE_WK | CASTLE_WQ);
      else b.castling &= ~(CASTLE_BK | CASTLE_BQ);
    }
    if (piece === ROOK || capture === ROOK) {
      if (from === 0 || to === 0) b.castling &= ~CASTLE_WQ;
      if (from === 7 || to === 7) b.castling &= ~CASTLE_WK;
      if (from === 56 || to === 56) b.castling &= ~CASTLE_BQ;
      if (from === 63 || to === 63) b.castling &= ~CASTLE_BK;
    }

    // En passant square
    if (piece === PAWN && Math.abs(to - from) === 16) {
      b.epSquare = color === WHITE ? from + 8 : from - 8;
    } else {
      b.epSquare = -1;
    }

    // Halfmove clock
    if (piece === PAWN || capture !== undefined) b.halfmove = 0;
    else b.halfmove = this.halfmove + 1;

    if (color === BLACK) b.fullmove = this.fullmove + 1;
    b.side = 1 - color;

    return b;
  }

  // ===== Attack Detection =====
  isSquareAttacked(sq, byColor) {
    const occ = this.occupied();
    const them = this.pieces[byColor];

    if (pawnAttacks[1 - byColor][sq] & them[PAWN]) return true;
    if (knightAttacks[sq] & them[KNIGHT]) return true;
    if (bishopAttacks(sq, occ) & (them[BISHOP] | them[QUEEN])) return true;
    if (rookAttacks(sq, occ) & (them[ROOK] | them[QUEEN])) return true;
    if (kingAttacks[sq] & them[KING]) return true;

    return false;
  }

  inCheck(color = this.side) {
    const kingBB = this.pieces[color][KING];
    if (!kingBB) return false;
    const kingSq = bitScan(kingBB);
    return this.isSquareAttacked(kingSq, 1 - color);
  }

  // ===== Move Generation =====
  generateMoves() {
    const moves = [];
    const us = this.side;
    const them = 1 - us;
    const ourPieces = this.colorBB(us);
    const theirPieces = this.colorBB(them);
    const occ = ourPieces | theirPieces;
    const empty = ~occ & ALL;

    // --- Pawns ---
    const pawns = this.pieces[us][PAWN];
    if (us === WHITE) {
      // Single push
      let pushes = (pawns << 8n) & empty;
      for (const to of iterBits(pushes)) {
        if (rankOf(to) === 7) { // promotion
          for (const promo of [QUEEN, ROOK, BISHOP, KNIGHT])
            moves.push({ from: to - 8, to, piece: PAWN, color: us, promotion: promo });
        } else {
          moves.push({ from: to - 8, to, piece: PAWN, color: us });
        }
      }
      // Double push
      let doubles = ((pawns & RANK_2) << 8n) & empty;
      doubles = (doubles << 8n) & empty;
      for (const to of iterBits(doubles)) {
        moves.push({ from: to - 16, to, piece: PAWN, color: us });
      }
      // Captures
      let leftCap = (pawns << 7n) & ~FILE_H & theirPieces;
      for (const to of iterBits(leftCap)) {
        const cap = this.pieceAt(to);
        if (rankOf(to) === 7) {
          for (const promo of [QUEEN, ROOK, BISHOP, KNIGHT])
            moves.push({ from: to - 7, to, piece: PAWN, color: us, capture: cap.piece, promotion: promo });
        } else {
          moves.push({ from: to - 7, to, piece: PAWN, color: us, capture: cap.piece });
        }
      }
      let rightCap = (pawns << 9n) & ~FILE_A & theirPieces;
      for (const to of iterBits(rightCap)) {
        const cap = this.pieceAt(to);
        if (rankOf(to) === 7) {
          for (const promo of [QUEEN, ROOK, BISHOP, KNIGHT])
            moves.push({ from: to - 9, to, piece: PAWN, color: us, capture: cap.piece, promotion: promo });
        } else {
          moves.push({ from: to - 9, to, piece: PAWN, color: us, capture: cap.piece });
        }
      }
      // En passant
      if (this.epSquare >= 0) {
        const epBit = bit(this.epSquare);
        let epLeft = (pawns << 7n) & ~FILE_H & epBit;
        if (epLeft) moves.push({ from: this.epSquare - 7, to: this.epSquare, piece: PAWN, color: us, capture: PAWN, epCapture: true });
        let epRight = (pawns << 9n) & ~FILE_A & epBit;
        if (epRight) moves.push({ from: this.epSquare - 9, to: this.epSquare, piece: PAWN, color: us, capture: PAWN, epCapture: true });
      }
    } else { // BLACK
      let pushes = (pawns >> 8n) & empty;
      for (const to of iterBits(pushes)) {
        if (rankOf(to) === 0) {
          for (const promo of [QUEEN, ROOK, BISHOP, KNIGHT])
            moves.push({ from: to + 8, to, piece: PAWN, color: us, promotion: promo });
        } else {
          moves.push({ from: to + 8, to, piece: PAWN, color: us });
        }
      }
      let doubles = ((pawns & RANK_7) >> 8n) & empty;
      doubles = (doubles >> 8n) & empty;
      for (const to of iterBits(doubles)) {
        moves.push({ from: to + 16, to, piece: PAWN, color: us });
      }
      let leftCap = (pawns >> 9n) & ~FILE_H & theirPieces;
      for (const to of iterBits(leftCap)) {
        const cap = this.pieceAt(to);
        if (rankOf(to) === 0) {
          for (const promo of [QUEEN, ROOK, BISHOP, KNIGHT])
            moves.push({ from: to + 9, to, piece: PAWN, color: us, capture: cap.piece, promotion: promo });
        } else {
          moves.push({ from: to + 9, to, piece: PAWN, color: us, capture: cap.piece });
        }
      }
      let rightCap = (pawns >> 7n) & ~FILE_A & theirPieces;
      for (const to of iterBits(rightCap)) {
        const cap = this.pieceAt(to);
        if (rankOf(to) === 0) {
          for (const promo of [QUEEN, ROOK, BISHOP, KNIGHT])
            moves.push({ from: to + 7, to, piece: PAWN, color: us, capture: cap.piece, promotion: promo });
        } else {
          moves.push({ from: to + 7, to, piece: PAWN, color: us, capture: cap.piece });
        }
      }
      if (this.epSquare >= 0) {
        const epBit = bit(this.epSquare);
        let epLeft = (pawns >> 9n) & ~FILE_H & epBit;
        if (epLeft) moves.push({ from: this.epSquare + 9, to: this.epSquare, piece: PAWN, color: us, capture: PAWN, epCapture: true });
        let epRight = (pawns >> 7n) & ~FILE_A & epBit;
        if (epRight) moves.push({ from: this.epSquare + 7, to: this.epSquare, piece: PAWN, color: us, capture: PAWN, epCapture: true });
      }
    }

    // --- Knights ---
    for (const from of iterBits(this.pieces[us][KNIGHT])) {
      let targets = knightAttacks[from] & ~ourPieces;
      for (const to of iterBits(targets)) {
        const cap = this.pieceAt(to);
        moves.push({ from, to, piece: KNIGHT, color: us, ...(cap ? { capture: cap.piece } : {}) });
      }
    }

    // --- Bishops ---
    for (const from of iterBits(this.pieces[us][BISHOP])) {
      let targets = bishopAttacks(from, occ) & ~ourPieces;
      for (const to of iterBits(targets)) {
        const cap = this.pieceAt(to);
        moves.push({ from, to, piece: BISHOP, color: us, ...(cap ? { capture: cap.piece } : {}) });
      }
    }

    // --- Rooks ---
    for (const from of iterBits(this.pieces[us][ROOK])) {
      let targets = rookAttacks(from, occ) & ~ourPieces;
      for (const to of iterBits(targets)) {
        const cap = this.pieceAt(to);
        moves.push({ from, to, piece: ROOK, color: us, ...(cap ? { capture: cap.piece } : {}) });
      }
    }

    // --- Queens ---
    for (const from of iterBits(this.pieces[us][QUEEN])) {
      let targets = queenAttacks(from, occ) & ~ourPieces;
      for (const to of iterBits(targets)) {
        const cap = this.pieceAt(to);
        moves.push({ from, to, piece: QUEEN, color: us, ...(cap ? { capture: cap.piece } : {}) });
      }
    }

    // --- King ---
    for (const from of iterBits(this.pieces[us][KING])) {
      let targets = kingAttacks[from] & ~ourPieces;
      for (const to of iterBits(targets)) {
        const cap = this.pieceAt(to);
        moves.push({ from, to, piece: KING, color: us, ...(cap ? { capture: cap.piece } : {}) });
      }
    }

    // --- Castling ---
    if (us === WHITE) {
      if ((this.castling & CASTLE_WK) && !(occ & (bit(5) | bit(6)))) {
        if (!this.isSquareAttacked(4, them) && !this.isSquareAttacked(5, them) && !this.isSquareAttacked(6, them)) {
          moves.push({ from: 4, to: 6, piece: KING, color: WHITE, castling: 'K' });
        }
      }
      if ((this.castling & CASTLE_WQ) && !(occ & (bit(1) | bit(2) | bit(3)))) {
        if (!this.isSquareAttacked(4, them) && !this.isSquareAttacked(3, them) && !this.isSquareAttacked(2, them)) {
          moves.push({ from: 4, to: 2, piece: KING, color: WHITE, castling: 'Q' });
        }
      }
    } else {
      if ((this.castling & CASTLE_BK) && !(occ & (bit(61) | bit(62)))) {
        if (!this.isSquareAttacked(60, them) && !this.isSquareAttacked(61, them) && !this.isSquareAttacked(62, them)) {
          moves.push({ from: 60, to: 62, piece: KING, color: BLACK, castling: 'k' });
        }
      }
      if ((this.castling & CASTLE_BQ) && !(occ & (bit(57) | bit(58) | bit(59)))) {
        if (!this.isSquareAttacked(60, them) && !this.isSquareAttacked(59, them) && !this.isSquareAttacked(58, them)) {
          moves.push({ from: 60, to: 58, piece: KING, color: BLACK, castling: 'q' });
        }
      }
    }

    return moves;
  }

  // Generate only legal moves (filter pseudo-legal by checking for check)
  generateLegalMoves() {
    const moves = this.generateMoves();
    return moves.filter(m => {
      const newBoard = this.makeMove(m);
      return !newBoard.inCheck(this.side); // our king must not be in check after our move
    });
  }

  // ===== Move notation =====
  static moveToUCI(move) {
    let uci = sqName(move.from) + sqName(move.to);
    if (move.promotion !== undefined) {
      uci += 'nbrq'[move.promotion - 1]; // Knight=1->n, Bishop=2->b, Rook=3->r, Queen=4->q
    }
    return uci;
  }

  findMoveFromUCI(uci) {
    const from = parseSq(uci.slice(0, 2));
    const to = parseSq(uci.slice(2, 4));
    const promo = uci.length > 4 ? [0, KNIGHT, BISHOP, ROOK, QUEEN]['nbrq'.indexOf(uci[4]) + 1] : undefined;
    const moves = this.generateLegalMoves();
    return moves.find(m => m.from === from && m.to === to && m.promotion === promo);
  }
}

export const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export { popCount, bitScan, knightAttacks, kingAttacks, pawnAttacks };
