import { Client } from "irc-framework";
import { password, defaultChannels, botNick, serverAddress, serverPort } from "../settings/config.json";
import Game from "./Game";
import { Scoreboards } from "./Constants";
import { getTopScores } from "./Database";
import { IUserScores } from "./Interfaces";
import { formatPingSafe, getScoreIndex } from "./Utils";
import * as IRCFormat from "irc-colors";

// Dereference our IRC Formatting utils
const { bold } = IRCFormat;

export default class IRCBot {
    client: Client;
    channels: any[];
    games: {
        [key: string]: Game;
    }

    constructor() {
        this.channels = [];
        this.games = {};
    }

    initializeIRCClient = () => {
        this.client = new Client();
        this.client.connect({
            host: serverAddress,
            port: serverPort,
            nick: botNick
        });

        this.client.on("registered", () => {
            this.client.say("NickServ", "identify " + password);
            defaultChannels.map((channelName: string) => {
                const channel = this.client.channel(channelName);
                this.channels.push(channel);
            });
            this.setupHandlers();
        });
    }

    setupHandlers = () => {
        this.client.matchMessage(/^!/, this.handleCommand);
    }

    handleCommand = ({ message, target: channel, ...rest }: any) => {
        let [ command, ...args ] = message.slice(1).split(" ");
        console.log(rest);
        switch(command) {
            case "start":
                this.startGame(channel);
                break;
            case "stop":
                // this.stopGame(channel);
                break;
            case "daily":
                this.printScoreboard(Scoreboards.DAILY, channel);
                break;
            case "weekly":
                this.printScoreboard(Scoreboards.WEEKLY, channel);
                break;
            case "monthly":
                this.printScoreboard(Scoreboards.MONTHLY, channel);
                break;
            case "lifetime":
                this.printScoreboard(Scoreboards.LIFETIME, channel);
                break;
        }
    }

    startGame = (channel: string) => {
        if (Object.keys(this.games).indexOf(channel) < 0 || !this.games[channel].running) {
            const game = new Game(this.client, channel);
            game.startGame();
            this.games[channel] = game;
        }
    }

    printScoreboard = (scoreboard: Scoreboards, channel: string) => {
        getTopScores(scoreboard)
            .then((topScores: IUserScores[]) => {
                this.client.say(channel, topScores.map((userScores: IUserScores, index: number) => {
                    console.log(userScores);
                    const scoreIndex = getScoreIndex(scoreboard)
                    return `${ index + 1 }. ${ bold(formatPingSafe(userScores.nick)) } ${ userScores[scoreIndex] }`
                }).join("    "));
            });
    }
}