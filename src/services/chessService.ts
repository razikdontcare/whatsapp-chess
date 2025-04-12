import { Chess } from "chess.js";
import sharp from "sharp";
import axios from "axios";
import { BOARD_IMAGE_HEIGHT, BOARD_IMAGE_QUALITY, BOARD_IMAGE_WIDTH, TEMP_IMAGE_PATH } from "../config/constants.js";
import { ActiveGame, GameMode, Player } from "../config/types.js";

export class ChessService {
    static async createBoardImage(fen: string): Promise<Buffer<ArrayBufferLike>> {
        try {
            let imageUrl = `https://lichess.org/export/fen.gif?fen=${encodeURIComponent(fen)}&theme=brown&piece=merida`;

            const alternativeUrl = [
                `https://lichess.org/export/fen.gif?fen=${encodeURIComponent(fen)}&theme=brown&piece=merida`
            ]
            
            for (const url of alternativeUrl) {
                try {
                    const response = await axios.get(url, {
                        responseType: "arraybuffer",
                        timeout: 5000,
                    })

                    if (response.status === 200) {
                        imageUrl = url;
                        break;
                    }
                } catch (error) {
                    console.warn(`Failed to fetch image from ${url}`, error);
                }
            }

            const response = await axios.get(imageUrl, { responseType: "arraybuffer" });

            return await sharp(response.data)
                .jpeg({
                    quality: BOARD_IMAGE_QUALITY,
                    mozjpeg: true
                })
                .resize(BOARD_IMAGE_WIDTH, BOARD_IMAGE_HEIGHT, {
                    fit: 'contain',
                    background: { r: 0, g: 0, b: 0, alpha: 0 }
                })
                .toBuffer();
        } catch (error) {
            console.error("Board image creation error:", error);
            throw new Error("Failed to create board image. Please try again.");
        }
    }

    static createNewGame(mode: GameMode, whitePlayer: Player, blackPlayer?: Player): ActiveGame {
        return {
            chess: new Chess(),
            players: {
                white: whitePlayer,
                black: blackPlayer || { jid: 'ai', name: 'Stockfish AI'}
            },
            currentTurn: 'w',
            mode,
            createdAt: new Date(),
        };
    }

    static validateMove(game: ActiveGame, moveNotation: string): boolean {
        try {
            return !!game.chess.move(moveNotation);
        } catch (error) {
            return false;
        }
    }

    static getGameStatus(game: ActiveGame): string {
        if (game.chess.isCheckmate()) {
            return `Checkmate! ${game.chess.turn() === 'w' ? game.players.black.name : game.players.white.name} wins!`;
        }
        if (game.chess.isDraw()) {
            return "It's a draw!";
        }
        if (game.chess.isCheck()) {
            return `Check! ${game.chess.turn() === 'w' ? game.players.black.name : game.players.white.name} is in check.`;
        }
        return `Game is ongoing. It's ${game.chess.turn() === 'w' ? game.players.white.name : game.players.black.name}'s turn.`;
    }
}