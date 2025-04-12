import {
  makeWASocket,
  useMultiFileAuthState,
  proto,
} from "@whiskeysockets/baileys";
import { ActiveGame, Player } from "../config/types.js";
import { ChessService } from "./chessService.js";
import { Chess } from "chess.js";

export class WhatsAppService {
  private sock: ReturnType<typeof makeWASocket> | null = null;
  private activeGames: Map<string, ActiveGame> = new Map();

  async initialize() {
    const { state, saveCreds } = await useMultiFileAuthState("auth_info");

    this.sock = makeWASocket({
      printQRInTerminal: true,
      auth: state,
    });

    this.sock.ev.on("creds.update", saveCreds);
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
          if (args[1]?.toLowerCase() === "ai") {
            await this.handleNewAIGame(sender);
          } else {
            await this.handleNewGame(sender, isGroup);
          }
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

        case "!ai":
          await this.handleNewAIGame(sender);
          break;

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
            await this.sendMessage(sender, "Perintah tidak dikenali.");
          }
          if (isGroup && this.activeGames.has(sender)) {
            await this.sendMessage(
              sender,
              "Perintah tidak dikenali. Silakan gunakan !help untuk daftar perintah yang tersedia."
            );
          }
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

  private async handleNewAIGame(sender: string) {
    if (this.activeGames.has(sender)) {
      return await this.sendMessage(
        sender,
        "Anda sudah memiliki permainan aktif. Silakan gunakan !resign untuk menyerah."
      );
    }

    const game = ChessService.createNewGame("ai", {
      jid: sender,
      name: "Kamu",
    });
    this.activeGames.set(sender, game);

    await this.sendBoardImage(
      game,
      sender,
      "Mode VS AI dimulai! Kamu bermain sebagai putih.\nSilakan gunakan !move <notasi> untuk melakukan langkah.\n\nContoh: !move e4"
    );
  }

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

  private async handleMove(sender: string, moveNotation: string) {}
  private async handleShowBoard(sender: string) {}
  private async handleResign(sender: string) {}
  private async handleShowMoves(sender: string) {}
  private async handleUndoMove(sender: string) {}
  private async handleHelp(sender: string, isGroup: boolean) {}

  private getUserGame(sender: string): ActiveGame | undefined {}
  private getGameKey(sender: string): string | undefined {}
  private handleAIMove(sender: string, game: ActiveGame) {}
  private sendBoardUpdate(sender: string, game: ActiveGame) {}
  private handleGameEnd(sender: string, game: ActiveGame) {}

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
