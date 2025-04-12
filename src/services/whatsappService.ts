import {
  makeWASocket,
  useMultiFileAuthState,
  proto,
  DisconnectReason,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import { ActiveGame } from "../config/types.js";
import { ChessService } from "./chessService.js";
import { Chess } from "chess.js";
// import { StockfishService } from "./stockfishService.js";

export class WhatsAppService {
  private sock: ReturnType<typeof makeWASocket> | null = null;
  private activeGames: Map<string, ActiveGame> = new Map();
  //   private stockfish: StockfishService;

  constructor() {
    // this.stockfish = new StockfishService();
    // this.stockfish.init().catch(console.error);
  }

  async initialize() {
    const { state, saveCreds } = await useMultiFileAuthState("auth_info");

    this.sock = makeWASocket({
      printQRInTerminal: true,
      auth: state,
    });

    this.sock.ev.on("creds.update", saveCreds);
    this.sock.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect } = update;
      if (connection === "close") {
        const shouldReconnect =
          (lastDisconnect?.error as Boom)?.output?.statusCode !==
          DisconnectReason.loggedOut;

        if (shouldReconnect) {
          console.log("Connection closed. Reconnecting...");
          this.initialize();
        } else {
          console.log("Logged out. Please scan the QR code again.");
        }
      } else if (connection === "open") {
        console.log("Connected to WhatsApp");
      }
    });
    this.sock.ev.on("messages.upsert", this.handleMessage.bind(this));
  }

  private async handleMessage({
    messages,
  }: {
    messages: proto.IWebMessageInfo[];
  }) {
    for (const msg of messages) {
      if (!msg.message) continue;

      const sender = msg.key.remoteJid;
      if (!sender) continue;

      const text = this.getMessageText(msg.message);
      if (!text) continue;

      try {
        await this.handleCommand(sender, text, msg);
      } catch (error) {
        console.error("Error handling message:", error);
        await this.sendMessage(
          sender,
          "Terjadi kesalahan saat memproses pesan Anda."
        );
      }
    }
  }

  private async handleCommand(
    sender: string,
    text: string,
    msg: proto.IWebMessageInfo
  ) {
    const args = text.trim().split(" ");
    const command = args[0].toLowerCase();
    const isGroup = sender.endsWith("@g.us");

    try {
      switch (command) {
        case "!chess":
        case "!catur":
        case "!c":
          //   if (args[1]?.toLowerCase() === "ai") {
          //     await this.handleNewAIGame(sender);
          //   } else {
          // }
          await this.handleNewGame(sender, isGroup);
          break;

        case "!join":
          if (!isGroup) {
            await this.sendMessage(
              sender,
              "Perintah ini hanya dapat digunakan di grup."
            );
            return;
          }

          await this.handleJoinGame(sender, msg.key.remoteJid!);
          break;

        case "!move":
        case "!gerak":
        case "!m":
        case "!g":
          await this.handleMove(sender, args.slice(1).join(" "));
          break;

        case "!board":
        case "!papan":
        case "!b":
        case "!p":
          await this.handleShowBoard(sender);
          break;

        case "!resign":
        case "!menyerah":
        case "!r":
          await this.handleResign(sender);
          break;

        // case "!ai":
        //   await this.handleNewAIGame(sender);
        //   break;

        case "!moves":
        case "!gerakan":
        case "!langkah":
          await this.handleShowMoves(sender);
          break;

        case "!undo":
        case "!kembali":
        case "!u":
          await this.handleUndoMove(sender);
          break;

        case "!help":
        case "!bantuan":
        case "!h":
        case "!?":
          await this.handleHelp(sender, isGroup);
          break;

        default:
          if (command.startsWith("!")) {
            return await this.sendMessage(sender, "Perintah tidak dikenali.");
          }
          //   if (isGroup && this.activeGames.has(sender)) {
          //     return await this.sendMessage(
          //       sender,
          //       "Perintah tidak dikenali. Silakan gunakan !help untuk daftar perintah yang tersedia."
          //     );
          //   }
          break;
      }
    } catch (error) {
      console.error(`Error handling command "${command}":`, error);
      await this.sendMessage(
        sender,
        "Terjadi kesalahan saat memproses perintah Anda."
      );
    }
  }

  private async handleNewGame(sender: string, isGroup: boolean) {
    if (this.activeGames.has(sender)) {
      return this.sendMessage(
        sender,
        "Anda sudah memiliki permainan aktif. Silakan gunakan !resign untuk menyerah."
      );
    }

    const game: ActiveGame = {
      chess: new Chess(),
      players: {
        white: {
          jid: sender,
          name: "Player 1",
        },
        black: {
          jid: isGroup ? "" : sender,
          name: "Player 2",
        },
      },
      currentTurn: "w",
      mode: "player",
      createdAt: new Date(),
      ...(isGroup ? { groupId: sender } : {}),
    };

    this.activeGames.set(sender, game);

    if (isGroup) {
      await this.sendMessage(
        sender,
        `♟️ *Game Catur Grup Dimulai!* ♟️\n\n` +
          `Putih: @${game.players.white.name}\n` +
          `Hitam: Menunggu pemain...\n\n` +
          `Pemain lain ketik *!join* untuk bermain sebagai Hitam`
      );
    } else {
      await this.sendBoardImage(
        game,
        sender,
        "♟️ *Game Catur Dimulai!* ♟️\n\n" +
          "Anda bermain melawan diri sendiri\n" +
          "Kirim *!move [notasi]* untuk bermain\n\n" +
          "Contoh:\n" +
          "• !move e4\n" +
          "• !move Nf3\n" +
          "• !move O-O (rokade)"
      );
    }
  }

  //   private async handleNewAIGame(sender: string) {
  //     if (this.activeGames.has(sender)) {
  //       return await this.sendMessage(
  //         sender,
  //         "Anda sudah memiliki permainan aktif. Silakan gunakan !resign untuk menyerah."
  //       );
  //     }

  //     const game = ChessService.createNewGame("ai", {
  //       jid: sender,
  //       name: "Kamu",
  //     });
  //     this.activeGames.set(sender, game);

  //     await this.sendBoardImage(
  //       game,
  //       sender,
  //       "Mode VS AI dimulai! Kamu bermain sebagai putih.\nSilakan gunakan !move <notasi> untuk melakukan langkah.\n\nContoh: !move e4"
  //     );
  //   }

  private async handleJoinGame(sender: string, groupId: string) {
    const game = this.activeGames.get(groupId);
    if (!game) {
      return this.sendMessage(groupId, "Tidak ada game aktif di grup ini.");
    }

    if (game.players.black.jid !== "") {
      return this.sendMessage(
        groupId,
        "Game sudah dimulai. Tidak bisa bergabung."
      );
    }

    game.players.black = { jid: sender, name: "Player 2" };
    game.mode = "player";

    await this.sendBoardImage(
      game,
      groupId,
      `Game dimulai!\n${game.players.white.name} (Putih) vs ${game.players.black.name} (Hitam)\nSilakan gunakan !move <notasi> untuk melakukan langkah.\n\nContoh: !move e4. Giliran ${game.players.white.name} (Putih).`
    );
  }

  private async handleMove(sender: string, moveNotation: string) {
    const game = this.getUserGame(sender);
    if (!game) return;

    if (
      (game.currentTurn === "w" && sender !== game.players.white.jid) ||
      (game.currentTurn === "b" && sender !== game.players.black.jid)
    ) {
      return this.sendMessage(sender, "Giliran Anda belum tiba.");
    }

    if (!moveNotation) {
      return this.sendMessage(
        sender,
        "Format langkah tidak valid. Gunakan !move <notasi> untuk bermain.\nContoh: !move e4"
      );
    }

    try {
      const move = game.chess.move(moveNotation);
      if (!move) {
        return this.sendMessage(
          sender,
          "Langkah tidak valid. Silakan coba lagi."
        );
      }

      game.lastMove = move.san;
      game.currentTurn = game.currentTurn === "w" ? "b" : "w";

      if (game.chess.isGameOver()) {
        await this.handleGameEnd(sender, game);
        //   } else if (game.mode === "ai") {
        //     await this.handleAIMove(sender, game);
      } else {
        await this.sendBoardUpdate(sender, game);
      }
    } catch (error) {
      await this.sendMessage(
        sender,
        `Gerakan tidak valid: ${error instanceof Error ? error.message : error}`
      );
    }
  }

  private async handleShowBoard(sender: string) {
    const game = this.getUserGame(sender);
    if (!game) return;

    const status = ChessService.getGameStatus(game);
    const turnMessage = `Giliran ${
      game.currentTurn === "w" ? "Putih" : "Hitam"
    } berikutnya.`;

    await this.sendBoardImage(
      game,
      sender,
      `${
        game.lastMove ? `Gerakan terakhir: ${game.lastMove}\n` : ""
      }${status}\n${turnMessage}`
    );
  }

  private async handleResign(sender: string) {
    const game = this.getUserGame(sender);
    if (!game) return;

    const winner = game.currentTurn === "w" ? "Hitam" : "Putih";
    this.activeGames.delete(this.getGameKey(sender, game));

    await this.sendMessage(
      this.getGameKey(sender, game),
      `Anda menyerah! ${winner} menang!\n\n` +
        `Game berakhir.\n\n` +
        `Jika Anda ingin bermain lagi, gunakan !chess atau !catur.\n\n` +
        `Jika Anda ingin bermain melawan AI, gunakan !ai.`
    );
  }

  private async handleShowMoves(sender: string) {
    const game = this.getUserGame(sender);
    if (!game) return;

    const moves = game.chess.history();
    if (moves.length === 0) {
      return this.sendMessage(sender, "Belum ada langkah yang dilakukan.");
    }

    await this.sendMessage(
      sender,
      `*Daftar langkah:*\n` +
        moves.map((move, index) => `${index + 1}. ${move}`).join("\n")
    );
  }

  private async handleUndoMove(sender: string) {
    const game = this.getUserGame(sender);
    if (!game) return;

    if (game.chess.history().length === 0) {
      return this.sendMessage(
        sender,
        "Tidak ada langkah yang bisa dibatalkan."
      );
    }

    game.chess.undo();
    game.currentTurn = game.currentTurn === "w" ? "b" : "w";
    game.lastMove = game.chess.history().at(-1);

    await this.sendBoardUpdate(sender, game);
  }

  private async handleHelp(sender: string, isGroup: boolean) {
    const helpText = [
      "*ChessBot WhatsApp*",
      "",
      "Perintah dasar:",
      "• !chess / !catur - Mulai game baru",
      //   "• !chess ai / !catur ai - Main vs AI",
      //   "• !ai - Main vs AI",
      "• !move [notasi] / !gerak [notasi] - Lakukan gerakan",
      "• !board / !papan - Lihat papan saat ini",
      "• !resign / !menyerah - Menyerah",
      "• !moves / !langkah - Lihat history gerakan",
      "• !undo / !kembali - Batalkan gerakan terakhir",
      "• !help / !bantuan - Tampilkan pesan ini",
      "",
      "Contoh gerakan:",
      "• !move e4 (pawn ke e4)",
      "• !move Nf3 (kuda ke f3)",
      "• !move O-O (rokade pendek)",
      "• !move exd5 (pawn di e capture di d5)",
      "",
      isGroup
        ? "Di grup, gunakan !join untuk bergabung dengan game yang sudah dibuat"
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    await this.sendMessage(sender, helpText);
  }

  private getUserGame(sender: string): ActiveGame | undefined {
    return (
      this.activeGames.get(sender) ||
      this.activeGames.get(sender.split("@")[0] + "@g.us")
    );
  }

  private getGameKey(sender: string, game: ActiveGame): string {
    return game.mode === "player" ? game.groupId! : sender;
  }

  //   private async handleAIMove(sender: string, game: ActiveGame) {
  //     const aiMove = await this.stockfish.getBestMove(game.chess.fen());

  //     game.chess.move(aiMove);
  //     game.currentTurn = "w";
  //     game.lastMove = aiMove;

  //     if (game.chess.isGameOver()) {
  //       await this.handleGameEnd(sender, game);
  //     } else {
  //       await this.sendBoardUpdate(sender, game);
  //     }
  //   }

  private async sendBoardUpdate(sender: string, game: ActiveGame) {
    const status = ChessService.getGameStatus(game);
    const turnMessage = `Giliran ${
      game.currentTurn === "w" ? "Putih" : "Hitam"
    } berikutnya.`;

    await this.sendBoardImage(
      game,
      this.getGameKey(sender, game),
      `${
        game.lastMove ? `Gerakan terakhir: ${game.lastMove}\n` : ""
      }${status}\n${turnMessage}`
    );
  }

  private async handleGameEnd(sender: string, game: ActiveGame) {
    const status = ChessService.getGameStatus(game);
    await this.sendBoardImage(
      game,
      this.getGameKey(sender, game),
      `${game.lastMove ? `Gerakan terakhir: ${game.lastMove}\n` : ""}${status}`
    );
    this.activeGames.delete(this.getGameKey(sender, game));
  }

  private getMessageText(msg: proto.IMessage): string | undefined {
    if (msg.conversation) return msg.conversation;
    if (msg.extendedTextMessage?.text) return msg.extendedTextMessage.text;
    return undefined;
  }

  async sendMessage(recipient: string, text: string) {
    if (!this.sock) throw new Error("WhatsApp socket is not initialized");
    await this.sock.sendMessage(recipient, { text });
  }

  async sendBoardImage(game: ActiveGame, recipient: string, caption: string) {
    try {
      if (!this.sock) throw new Error("WhatsApp socket is not initialized");
      const boardImage = await ChessService.createBoardImage(game.chess.fen());
      const image = Buffer.from(boardImage);

      await this.sock.sendMessage(recipient, { image, caption });
    } catch (error) {
      console.error("Error sending board image:", error);
      await this.sendMessage(
        recipient,
        "Gagal mengirim gambar papan. Silakan coba lagi."
      );
    }
  }
}
