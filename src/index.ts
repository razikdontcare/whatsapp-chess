import { WhatsAppService } from "./services/whatsappService.js";
import { StockfishService } from "./services/stockfishService.js";

class ChessBot {
  private whatsappService: WhatsAppService;
  private stockfishService: StockfishService;

  constructor() {
    this.whatsappService = new WhatsAppService();
    this.stockfishService = new StockfishService();
  }

  async start() {
    await this.stockfishService.init();
    await this.whatsappService.initialize();
    console.log("Chess Bot is running...");
  }
}

const chessBot = new ChessBot();
chessBot.start().catch(console.error);
