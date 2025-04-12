import { Chess } from "chess.js";
import { proto } from "@whiskeysockets/baileys";

export type Player = {
    jid: string;
    name: string;
    rating?: number;
};

export type GameMode = "ai" | "player";

export type ActiveGame = {
    chess: Chess;
    players: {
        white: Player;
        black: Player;
    };
    currentTurn: "w" | "b";
    groupId?: string;
    mode: GameMode;
    lastMove?: string;
    createdAt: Date;
    clock?: {
        white: number;
        black: number;
        lastMoveTime: Date;
    },
    lichessGameId?: string;
};

export type MessageData = {
    text: string;
    message: proto.IWebMessageInfo;
}