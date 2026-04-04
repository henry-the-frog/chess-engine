#!/usr/bin/env node
// uci.js — Universal Chess Interface protocol handler

import { createInterface } from 'node:readline';
import { Board, STARTING_FEN } from './board.js';
import { SearchEngine } from './search.js';

const ENGINE_NAME = 'HenryChess 1.0';
const ENGINE_AUTHOR = 'Henry';

let board = Board.fromFEN(STARTING_FEN);
const engine = new SearchEngine();

const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: false });

function send(msg) {
  process.stdout.write(msg + '\n');
}

rl.on('line', (line) => {
  const tokens = line.trim().split(/\s+/);
  const cmd = tokens[0];

  switch (cmd) {
    case 'uci':
      send(`id name ${ENGINE_NAME}`);
      send(`id author ${ENGINE_AUTHOR}`);
      send('option name Depth type spin default 6 min 1 max 20');
      send('option name MoveTime type spin default 1000 min 100 max 60000');
      send('uciok');
      break;

    case 'isready':
      send('readyok');
      break;

    case 'ucinewgame':
      board = Board.fromFEN(STARTING_FEN);
      engine.tt.clear();
      break;

    case 'position': {
      let idx = 1;
      if (tokens[idx] === 'startpos') {
        board = Board.fromFEN(STARTING_FEN);
        idx++;
      } else if (tokens[idx] === 'fen') {
        idx++;
        const fenParts = [];
        while (idx < tokens.length && tokens[idx] !== 'moves') {
          fenParts.push(tokens[idx]);
          idx++;
        }
        board = Board.fromFEN(fenParts.join(' '));
      }

      if (tokens[idx] === 'moves') {
        idx++;
        while (idx < tokens.length) {
          const move = board.findMoveFromUCI(tokens[idx]);
          if (move) {
            board = board.makeMove(move);
          }
          idx++;
        }
      }
      break;
    }

    case 'go': {
      let depth = 6;
      let moveTime = 0;
      let wtime = 0, btime = 0, winc = 0, binc = 0;

      for (let i = 1; i < tokens.length; i += 2) {
        switch (tokens[i]) {
          case 'depth': depth = parseInt(tokens[i + 1]); break;
          case 'movetime': moveTime = parseInt(tokens[i + 1]); break;
          case 'wtime': wtime = parseInt(tokens[i + 1]); break;
          case 'btime': btime = parseInt(tokens[i + 1]); break;
          case 'winc': winc = parseInt(tokens[i + 1]); break;
          case 'binc': binc = parseInt(tokens[i + 1]); break;
          case 'infinite': depth = 20; break;
          case 'perft': {
            const d = parseInt(tokens[i + 1]);
            const count = perft(board, d);
            send(`info nodes ${count}`);
            return;
          }
        }
      }

      // Calculate time from clock
      if (!moveTime && (wtime || btime)) {
        const ourTime = board.side === 0 ? wtime : btime;
        const ourInc = board.side === 0 ? winc : binc;
        moveTime = Math.max(100, Math.floor(ourTime / 30 + ourInc / 2));
      }

      const result = engine.search(board, {
        depth: moveTime ? 20 : depth,
        timeLimit: moveTime || 0,
        log: (info) => {
          const scoreStr = Math.abs(info.score) > 90000
            ? `mate ${info.score > 0 ? Math.ceil((100001 - info.score) / 2) : -Math.ceil((100001 + info.score) / 2)}`
            : `cp ${info.score}`;
          send(`info depth ${info.depth} score ${scoreStr} nodes ${info.nodes} time ${info.time} nps ${info.nps} pv ${info.pv}`);
        }
      });

      if (result.move) {
        send(`bestmove ${Board.moveToUCI(result.move)}`);
      } else {
        send('bestmove 0000');
      }
      break;
    }

    case 'd':
    case 'display':
      send(board.toFEN());
      printBoard(board);
      break;

    case 'perft': {
      const d = parseInt(tokens[1]) || 1;
      const t0 = Date.now();
      const count = perft(board, d);
      const elapsed = Date.now() - t0;
      send(`Perft(${d}) = ${count} (${elapsed}ms)`);
      break;
    }

    case 'quit':
      process.exit(0);
      break;
  }
});

function perft(board, depth) {
  if (depth === 0) return 1;
  const moves = board.generateLegalMoves();
  let nodes = 0;
  for (const move of moves) {
    nodes += perft(board.makeMove(move), depth - 1);
  }
  return nodes;
}

function printBoard(board) {
  const pieces = '.PNBRQKpnbrqk';
  for (let rank = 7; rank >= 0; rank--) {
    let row = `${rank + 1} `;
    for (let file = 0; file < 8; file++) {
      const p = board.pieceAt(rank * 8 + file);
      if (p) {
        row += pieces[p.color * 6 + p.piece + 1] + ' ';
      } else {
        row += '. ';
      }
    }
    send(row);
  }
  send('  a b c d e f g h');
}
