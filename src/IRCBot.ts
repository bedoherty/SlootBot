// @ts-ignore
import { Client } from "irc-framework";
// @ts-ignore
import { escape } from "sqlstring";
import Request from "request";
import { shuffle } from "./Utils";
// @ts-ignore
import { Database } from "sqlite3";
// @ts-ignore
import * as config from "../settings/config.json";
const IRCFormat = require('irc-colors');

const { password, channel } = config;

// Dereference our IRC Formatting utils
const { blue, green, bold } = IRCFormat;

const charactersToHide = /[A-Za-z0-9]/g;

const pointValues = [ 0, 10, 5, 2 ];

export default class IRCBot {
    client: Client;
    triviaChannel: any;
    database: Database;
    // Store our hint timeouts for cancellation
    hintTimeout: number;
    // Store our match handler for cancellation
    matchHandler: any;
    streak: {
        user: string,
        count: number
    };
    hintsGiven: number;

    constructor() {
        console.log("Constructing bot");
        this.hintTimeout = 0;
        this.database = new Database("data/scoreboard.db");
        this.streak = {
            user: "",
            count: 0
        };
        this.hintsGiven = 1;
    }

    initializeIRCClient = () => {
        // Initialize the IRC Client
        this.client = new Client();
        this.client.connect({
            host: "irc.snoonet.org",
            port: 6667,
            nick: "SlootBot"
        });
        // When our client registers authorize our nick and connect to the trivia channel
        this.client.on("registered", () => {
            console.log("Registered");
            this.client.say("NickServ", "identify " + password);
            this.triviaChannel = this.client.channel(channel);
            this.triviaChannel.join();
            this.askQuestion();
        });
    }

    askQuestion = () => {
        Request("http://jservice.io/api/random", { json: true }, (err, res, body) => {
            // Parse out the needed information from the Trivia API
            let question = body?.[0]?.question;
            let answer = this.preprocessText(body?.[0]?.answer);
            let category = body?.[0]?.category?.title;

            if (!question || !answer || !category) {
                // If any of our needed information isn't present, abandon ship
                this.askQuestion();
                return;
            }

            let obscuredAnswer = answer.replace(charactersToHide, "*");

            this.client.say(channel, green(category + ": " + question));
            this.client.say(channel, "Hint 1: " + blue(obscuredAnswer));
            this.hintsGiven = 1;
            console.log(answer);
            let answerExp = new RegExp(answer, "i");
            this.matchHandler = this.client.matchMessage(answerExp, this.createQuestionHandler(answer).bind(this));

            this.hintTimeout = setTimeout(this.startHints, 15000, answer, obscuredAnswer);
        });
    }

    createQuestionHandler = (answer: string) => {
        return ({ nick: user, ...rest }: any) => {    
            console.log(rest);
            // Increment  score and announce the user's current score
            this.incrementUserScore(user, answer);

            // Handle our streaks
            if (this.streak.user === user) {
                this.streak = {
                    user,
                    count: this.streak.count + 1
                };

                if (this.streak.count >= 3) {
                    this.client.say(channel, bold(user) + " is on a streak of " + bold(this.streak.count) + "!");
                }
            } else {
                if (this.streak.count >= 3) {
                    this.client.say(channel, bold(user) + " broke " + bold(this.streak.user) + "'s streak of " + bold(this.streak.count) + "!");
                }

                this.streak = {
                    user,
                    count: 1
                };
            }

            // Reset our timeouts and question logic
            clearTimeout(this.hintTimeout);
            this.matchHandler.stop();
            setTimeout(this.askQuestion, 20000);
        }
    }

    startHints = (answer: string, obscuredAnswer: string) => {
        let possibleReveals = shuffle(Array.from(Array(answer.length).keys()));
        if (answer.length <= 2) {
            possibleReveals = [];
        }
        this.giveHint(answer, obscuredAnswer, possibleReveals);
    }

    giveHint = (answer: string, obscuredAnswer: string, possibleReveals: number[]) => {
        if (this.hintsGiven >= 3) {
            this.client.say(channel, "Times up!  The answer was " + bold(answer));
            clearTimeout(this.hintTimeout);
            this.matchHandler.stop();
            setTimeout(this.askQuestion, 20000);
            return;
        }
    
        const sliceIndex = Math.floor(possibleReveals.length / 3) + 1;
        const remainingReveals = possibleReveals.slice(sliceIndex);
    
        let hint = "";
        for (let i = 0; i < answer.length; i++) {
            if (remainingReveals.indexOf(i) >= 0) {
                hint += obscuredAnswer[i];
            } else {
                hint += answer[i];
            }
        }
    
        this.hintsGiven = this.hintsGiven + 1;
        this.client.say(channel, "Hint " + this.hintsGiven + ": " + blue(hint));
        this.hintTimeout = setTimeout(this.giveHint, 15000, answer, hint, remainingReveals);
    }

    announceAnswer = (winner: string, answer: string) => {
        let sql = ` SELECT lifetime
                    FROM scoreboard
                    WHERE nick = "${ winner }";`;
        return this.database.get(sql, (err, row) => {
            console.log(sql);
            console.log(err);
            console.log(row);
            if (!err && row) {
                const { lifetime } = row;
                this.client.say(channel, "YES, " + winner + " got the correct answer, " + bold(answer) + ".  They are up to " + lifetime + " points!");
            }
        });
    }

    incrementUserScore = (nick: string, answer: string) => {
        const safeNick = (nick);
        let sql = ` SELECT *
                    FROM scoreboard
                    WHERE nick = "${ safeNick }";`;

        const { announceAnswer } = this;

        const points = pointValues[this.hintsGiven];

        return this.database.get(sql, (err, row) => {
            if (!err) {
                if (row) {
                    let sql = ` Update scoreboard
                                Set lifetime = lifetime + ${ points }
                                WHERE nick = "${ safeNick }";`;
                    this.database.exec(sql, () => {
                        announceAnswer(safeNick, answer);
                    });
                } else {
                    let sql = ` INSERT INTO scoreboard (nick, lifetime, daily, weekly, monthly, yearly)
                            VALUES ("${ safeNick }", ${ points }, 0, 0, 0, 0);`;
                    this.database.exec(sql, () => {
                        announceAnswer(safeNick, answer);
                    });
                }
            }
        });
    }

    preprocessText = (question: string) => {
        let processedText = question;

        // Filter out quotes
        processedText = processedText.replace(/"/g, "");

        // Filter italicize
        processedText = processedText.replace(/<i>/g, "");
        processedText = processedText.replace(/<\/i>/g, "");
        
        // Filter out single quotes poorly escaped
        processedText = processedText.replace(/\\'/g, "");

        // Filter out extra parenthesis information
        processedText = processedText.replace(/ *\([^)]*\) */g, "");

        return processedText;
    }
}