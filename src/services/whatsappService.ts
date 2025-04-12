import {
  makeWASocket,
  useMultiFileAuthState,
  proto,
} from "@whiskeysockets/baileys";
import { ActiveGame, Player } from "../config/types.js";
import { ChessService } from "./chessService.js";

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
  ) {}

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
