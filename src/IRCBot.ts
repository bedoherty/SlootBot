import { Client } from "irc-framework";
import settings from "src/Settings";
import Game from "./Game";
import { Scoreboards, spiel } from "./Constants";
import { getTopScores, getUserScore, reportQuestion } from "./Database";
import { IUserScores } from "./Interfaces";
import { formatPingSafe, getScoreIndex, isAdmin } from "./Utils";
import * as IRCFormat from "irc-colors";

// Dereference our IRC Formatting utils
const { bold } = IRCFormat;

// Dereference our Settings Object
const { password, defaultChannels, botNick, serverAddress, serverPort, spielTimer } = settings;

export default class IRCBot {
    client: Client;
    channels: any[];
    games: {
        [key: string]: Game;
    };
    spielInterval: NodeJS.Timeout;

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
                this.startGame(channelName);
                this.channels.push(channel);
            });
            this.setupHandlers();
            this.spielInterval = setInterval(this.setupSpiels, 60000 * spielTimer);
        });
    }

    setupHandlers = () => {
        this.client.matchMessage(/^!/, this.handleCommand);
        this.client.matchMessage(/^!/, this.handleAdminCommand);
    }

    setupSpiels = () => {
        this.channels.map(this.announceSpiel);
    }

    announceSpiel = (channel: string) => {
        this.client.say(channel, spiel);
    }

    handleCommand = ({ message, target: channel }: any) => {
        let [ command, ...args ] = message.slice(1).split(" ");

        switch(command) {
            case "daily":
                this.printScoreboard(Scoreboards.DAILY, channel, args?.[0]);
                break;
            case "weekly":
                this.printScoreboard(Scoreboards.WEEKLY, channel, args?.[0]);
                break;
            case "monthly":
                this.printScoreboard(Scoreboards.MONTHLY, channel, args?.[0]);
                break;
            case "lifetime":
                this.printScoreboard(Scoreboards.LIFETIME, channel, args?.[0]);
                break;
            case "report":
                this.reportQuestion(channel, args?.[0]);
                break;
            case "help":
                this.listCommands(channel);
                break;
        }
    }

    handleAdminCommand = ({ message, target: channel, nick }: any) => {
        if (!isAdmin(nick)) {
            return;
        }

        let [ command, ...args ] = message.slice(1).split(" ");

        switch(command) {
            case "start":
                this.startGame(channel);
                break;
            case "stop":
                this.stopGame(channel);
                break;
            case "ask":
                this.askQuestion(channel, args[0]);
                break;
            case "spiel":
                this.announceSpiel(channel);
                break;
        }
    }

    listCommands = (channel: string) => {
        this.client.say(channel, bold("Available Commands: ") + "!lifetime [user], !monthly [user], !weekly [user], !daily [user], and !report");
    }

    startGame = (channel: string) => {
        if (Object.keys(this.games).indexOf(channel) < 0 || !this.games[channel].running) {
            const game = new Game(this.client, channel);
            game.startGame();
            this.games[channel] = game;
        }
    }

    stopGame = (channel: string) => {
        if (Object.keys(this.games).indexOf(channel) >= 0 && this.games[channel].running) {
            const game = new Game(this.client, channel);
            game.stopGame();
            delete this.games[channel];
        }
    }

    askQuestion = (channel: string, questionId: string) => {
        if (Object.keys(this.games).indexOf(channel) < 0 || !this.games[channel].running) {
            const game = new Game(this.client, channel);
            game.askQuestion(questionId);
            this.games[channel] = game;
        }
    }

    reportQuestion = (channel: string, questionId?: string) => {
        if (Object.keys(this.games).indexOf(channel) < 0 || !this.games[channel].running) {
            const game = new Game(this.client, channel);
            game.reportQuestion(questionId);
            this.games[channel] = game;
        }
    }

    printScoreboard = (scoreboard: Scoreboards, channel: string, nick?: string) => {
        if (nick) {
            getUserScore(scoreboard, nick)
                .then((userScores: IUserScores) => {
                    const scoreIndex = getScoreIndex(scoreboard);

                    const points = userScores?.[scoreIndex] ?? 0;

                    this.client.say(
                        channel,
                        `${ nick } has ${ points } ${ scoreboard } points`
                    );
                })
                .catch(console.log);
        } else {
            getTopScores(scoreboard)
                .then((topScores: IUserScores[]) => {
                    this.client.say(channel, topScores.map((userScores: IUserScores, index: number) => {
                        const scoreIndex = getScoreIndex(scoreboard)
                        return `${ index + 1 }. ${ bold(formatPingSafe(userScores.nick)) } ${ userScores[scoreIndex] }`
                    }).join("    "));
                })
                .catch(console.log);
        }
    }
}