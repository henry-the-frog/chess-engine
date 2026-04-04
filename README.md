# chess-engine

A chess engine built from scratch in JavaScript with bitboard move generation, alpha-beta search, and UCI protocol support.

Zero dependencies. Pure JavaScript. Plays real chess.

## Features

### Board Representation
- **Bitboards**: 64-bit integers (BigInt) for piece placement — one bitboard per piece type per color
- **Precomputed attack tables**: Knight and king attacks, pawn attack tables
- **Sliding piece attacks**: On-the-fly ray generation for bishops, rooks, queens
- **Complete move generation**: All pieces, castling (KQkq), en passant, pawn promotions

### Search
- **Alpha-beta negamax** with fail-soft window
- **Iterative deepening** for time management
- **Quiescence search** to resolve captures and avoid horizon effect
- **Transposition table** (FEN-hashed) for search tree reduction
- **MVV-LVA move ordering** (Most Valuable Victim - Least Valuable Attacker)

### Evaluation
- **Material counting** with standard piece values
- **Piece-square tables** for positional play (pawns center control, knights centralization, etc.)
- **Endgame detection** with separate king PST
- **Bishop pair bonus**

### UCI Protocol
- Full UCI command support: `uci`, `isready`, `position`, `go`, `quit`
- Time management with `wtime`/`btime`/`winc`/`binc`
- Depth-limited and time-limited search
- `perft` command for move generation validation
- Info output with depth, score, nodes, NPS, PV

## Usage

### UCI Mode (for chess GUIs)

```bash
node src/uci.js
```

Then send UCI commands:
```
uci
position startpos moves e2e4 e7e5
go depth 6
```

### Quick Play

```javascript
import { Board, STARTING_FEN } from './src/board.js';
import { SearchEngine } from './src/search.js';

const board = Board.fromFEN(STARTING_FEN);
const engine = new SearchEngine();
const result = engine.search(board, { depth: 6 });
console.log(`Best move: ${Board.moveToUCI(result.move)}`);
console.log(`Score: ${result.score}cp, Depth: ${result.depth}, Nodes: ${result.nodes}`);
```

## Correctness

Move generation is validated using **perft** (performance test) — counting all legal positions at each depth:

| Position | Depth | Expected | Status |
|----------|-------|----------|--------|
| Starting | 1 | 20 | ✅ |
| Starting | 2 | 400 | ✅ |
| Starting | 3 | 8,902 | ✅ |
| Starting | 4 | 197,281 | ✅ |
| Kiwipete | 1 | 48 | ✅ |
| Kiwipete | 2 | 2,039 | ✅ |
| Position 3 | 1 | 14 | ✅ |
| Position 3 | 2 | 191 | ✅ |

## Test Summary

| Module | Tests | Description |
|--------|-------|-------------|
| Board | 31 | FEN, move generation, castling, en passant, check, perft |
| Search | 13 | Mate finding, capture priority, time limits, TT |
| **Total** | **44** | |

## Running Tests

```bash
node --test
```

## Architecture

```
Position (FEN)
    │
    ▼
┌──────────┐     ┌──────────┐     ┌──────────┐
│  Board    │────▶│  Search   │────▶│  Eval    │
│ (bitboards│     │ (α-β, TT, │     │ (PST,    │
│  movegen) │     │  ID, QS)  │     │  material)│
└──────────┘     └──────────┘     └──────────┘
    │                 │
    ▼                 ▼
┌──────────┐     ┌──────────┐
│  Perft    │     │   UCI    │
│ (testing) │     │ (protocol)│
└──────────┘     └──────────┘
```

## Design Decisions

1. **BigInt bitboards**: JavaScript doesn't have native 64-bit integers, so we use BigInt. Slower than typed arrays but cleaner code and exact bit manipulation.

2. **FEN-based TT**: Using FEN strings as hash keys instead of Zobrist hashing. Simpler to implement, works correctly, but slower for deep searches. A future optimization would be incremental Zobrist hashing.

3. **Exception-free search**: Unlike many engines that use longjmp/exceptions for time outs, we check a flag after each move and unwind naturally.

4. **Perft validation**: Every change to move generation is validated against known perft values, catching subtle bugs in castling, en passant, and promotion logic.
