// zobrist.js — Zobrist hashing for fast transposition table lookups
// Uses random 64-bit BigInt values XOR'd together based on piece placement

// Generate random 64-bit BigInt
function rand64() {
  // Combine two 32-bit randoms
  const hi = BigInt(Math.floor(Math.random() * 0xFFFFFFFF)) << 32n;
  const lo = BigInt(Math.floor(Math.random() * 0xFFFFFFFF));
  return hi | lo;
}

// Pre-generate random values
// pieces[color][piece][square] — 2 * 6 * 64 = 768 values
const pieces = [];
for (let color = 0; color < 2; color++) {
  pieces[color] = [];
  for (let piece = 0; piece < 6; piece++) {
    pieces[color][piece] = [];
    for (let sq = 0; sq < 64; sq++) {
      pieces[color][piece][sq] = rand64();
    }
  }
}

const sideToMove = rand64(); // XOR when it's black's turn
const castlingRights = [rand64(), rand64(), rand64(), rand64()]; // WK, WQ, BK, BQ
const enPassantFile = []; // 8 files
for (let f = 0; f < 8; f++) {
  enPassantFile.push(rand64());
}

export function computeHash(board) {
  let hash = 0n;

  // Pieces
  for (let color = 0; color < 2; color++) {
    for (let piece = 0; piece < 6; piece++) {
      let bb = board.pieces[color][piece];
      while (bb) {
        const sq = bitScan64(bb);
        hash ^= pieces[color][piece][sq];
        bb &= bb - 1n;
      }
    }
  }

  // Side to move
  if (board.side === 1) hash ^= sideToMove;

  // Castling rights
  if (board.castling & 1) hash ^= castlingRights[0];
  if (board.castling & 2) hash ^= castlingRights[1];
  if (board.castling & 4) hash ^= castlingRights[2];
  if (board.castling & 8) hash ^= castlingRights[3];

  // En passant file
  if (board.epSquare >= 0) {
    hash ^= enPassantFile[board.epSquare & 7];
  }

  return hash;
}

// Incremental hash update for makeMove
export function updateHash(hash, move, board) {
  const { from, to, piece, color, capture, promotion, castling: castle, epCapture } = move;

  // Remove piece from source
  hash ^= pieces[color][piece][from];

  // Add piece at destination (or promoted piece)
  const placePiece = promotion !== undefined ? promotion : piece;
  hash ^= pieces[color][placePiece][to];

  // Remove captured piece
  if (capture !== undefined) {
    const capSq = epCapture ? (color === 0 ? to - 8 : to + 8) : to;
    hash ^= pieces[1 - color][capture][capSq];
  }

  // Castling rook movement
  if (castle) {
    switch (castle) {
      case 'K': hash ^= pieces[0][3][7]; hash ^= pieces[0][3][5]; break;
      case 'Q': hash ^= pieces[0][3][0]; hash ^= pieces[0][3][3]; break;
      case 'k': hash ^= pieces[1][3][63]; hash ^= pieces[1][3][61]; break;
      case 'q': hash ^= pieces[1][3][56]; hash ^= pieces[1][3][59]; break;
    }
  }

  // Flip side to move
  hash ^= sideToMove;

  // Update castling rights (need old and new to know which changed)
  // Handled by XOR'ing out old and XOR'ing in new
  return hash;
}

function bitScan64(bb) {
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

export { pieces, sideToMove, castlingRights, enPassantFile };
