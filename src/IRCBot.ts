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

const { password } = config;

// Dereference our IRC Formatting utils
const { blue, green, bold } = IRCFormat;

var charactersToHide = /[A-Za-z0-9]/g;

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
    }

    constructor() {
        this.hintTimeout = 0;
        this.database = new Database("data/scoreboard.db");
        this.streak = {
            user: "",
            count: 0
        };
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
            this.triviaChannel = this.client.channel("#sloottest");
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

            this.client.say("#sloottest", green(category + ": " + question));
            this.client.say("#sloottest", "Hint 1: " + blue(obscuredAnswer));
            console.log(answer);
            let answerExp = new RegExp(answer, "i");
            this.matchHandler = this.client.matchMessage(answerExp, this.createQuestionHandler(answer).bind(this));

            this.hintTimeout = setTimeout(this.startHints, 15000, answer, obscuredAnswer);
        });
    }

    createQuestionHandler = (answer: string) => {
        return ({ nick: user }: any) => {
            // Increment  score and announce the user's current score
            this.incrementUserScore(user, answer);

            // Handle our streaks
            if (this.streak.user === user) {
                this.streak = {
                    user,
                    count: this.streak.count + 1
                };

                if (this.streak.count >= 3) {
                    this.client.say("#sloottest", bold(user) + " is on a streak of " + bold(this.streak.count) + "!");
                }
            } else {
                if (this.streak.count >= 3) {
                    this.client.say("#sloottest", bold(user) + " broke " + bold(this.streak.user) + "'s streak of " + bold(this.streak.count) + "!");
                }

                this.streak = {
                    user,
                    count: 1
                };
            }

            // Reset our timeouts and question logic
            clearTimeout(this.hintTimeout);
            this.matchHandler.stop();
            setTimeout(this.askQuestion, 25000);
        }
    }

    startHints = (answer: string, obscuredAnswer: string) => {
        let possibleReveals = shuffle(Array.from(Array(answer.length).keys()));
        this.giveHint(answer, obscuredAnswer, possibleReveals, 2);
    }

    giveHint = (answer: string, obscuredAnswer: string, possibleReveals: number[], hintNumber: number) => {
        if (hintNumber === 4) {
            this.client.say("#sloottest", "Times up!  The answer was " + bold(answer));
            clearTimeout(this.hintTimeout);
            this.matchHandler.stop();
            setTimeout(this.askQuestion, 25000);
            return;
        }
    
        const sliceIndex = Math.floor(possibleReveals.length / 4) + 1;
        const remainingReveals = possibleReveals.slice(sliceIndex);
    
        let hint = "";
        for (let i = 0; i < answer.length; i++) {
            if (remainingReveals.indexOf(i) >= 0) {
                hint += obscuredAnswer[i];
            } else {
                hint += answer[i];
            }
        }
    
        this.client.say("#sloottest", "Hint " + hintNumber + ": " + blue(hint));
    
        this.hintTimeout = setTimeout(this.giveHint, 15000, answer, hint, remainingReveals, hintNumber + 1);
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
                this.client.say("#sloottest", "YES, " + winner + " got the correct answer, " + bold(answer) + ".  They are up to " + lifetime + " points!");
            }
        });
    }

    incrementUserScore = (nick: string, answer: string) => {
        const safeNick = (nick);
        let sql = ` SELECT *
                    FROM scoreboard
                    WHERE nick = "${ safeNick }";`;

        const { announceAnswer } = this;

        return this.database.get(sql, (err, row) => {
            if (!err) {
                if (row) {
                    let sql = ` Update scoreboard
                                Set lifetime = lifetime + 1
                                WHERE nick = "${ safeNick }";`;
                    this.database.exec(sql, () => {
                        announceAnswer(safeNick, answer);
                    });
                } else {
                    let sql = ` INSERT INTO scoreboard (nick, lifetime, daily, weekly, monthly, yearly)
                            VALUES ("${ safeNick }", 1, 0, 0, 0, 0);`;
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