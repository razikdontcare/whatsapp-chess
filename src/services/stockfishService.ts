import { Chess } from "chess.js";
import { STOCKFISH_LEVEL } from "../config/constants.js";

declare const Stockfish: any;

export class StockfishService {
  private engine: any;

  constructor() {
    this.engine = new Stockfish();
    this.engine.onmessage = (msg: string) => {
      console.log("Stockfish: ", msg);
    };
  }

  async init(): Promise<void> {
    return new Promise((resolve) => {
      this.engine.onmessage = (msg: string) => {
        if (msg === "uciok") resolve();
      };
      this.engine.postMessage("uci");
    });
  }

  async getBestMove(
    fen: string,
    level: number = STOCKFISH_LEVEL
  ): Promise<string> {
    return new Promise((resolve) => {
      this.engine.postMessage(`position fen ${fen}`);
      this.engine.postMessage(`setoption name Skill Level value ${level}`);
      this.engine.postMessage("go movetime 1000");

      this.engine.onmessage = (msg: string) => {
        if (msg.startsWith("bestmove")) {
          const bestMove = msg.split(" ")[1];
          resolve(bestMove);
        }
      };
    });
  }
}
