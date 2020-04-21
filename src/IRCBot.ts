// @ts-ignore
import { Client } from "irc-framework";
import Request from "request";
import { shuffle } from "./Utils";
// @ts-ignore
import { Database } from "sqlite3";
// @ts-ignore
import { password, channel, botNick } from "../settings/config.json";
const IRCFormat = require('irc-colors');
import { CronJob } from "cron";

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
    dailyClear: CronJob;
    weeklyClear: CronJob;
    monthlyClear: CronJob;

    constructor() {
        console.log("Constructing bot");
        this.hintTimeout = 0;
        this.database = new Database("data/scoreboard.db");
        this.streak = {
            user: "",
            count: 0
        };
        this.hintsGiven = 1;

        this.dailyClear = new CronJob(
            "00 04 * * *", 
            this.resetScores("daily"), 
            null, 
            true, 
            "America/Chicago"
        );

        this.weeklyClear = new CronJob(
            "00 04 * * 0", 
            this.resetScores("weekly"),
            null, 
            true, 
            "America/Chicago"
        );

        this. monthlyClear = new CronJob(
            "00 04 1 * *", 
            this.resetScores("monthly"),
            null, 
            true, 
            "America/Chicago"
        );
    }

    resetScores = (column: string) => {
        return () => {
            let sql = ` UPDATE scoreboard
                        SET ${ column } = 0;`;
            this.database.exec(sql, () => {
                console.log("Resetting Scoreboard: " + column);
            });
        }
    }

    initializeIRCClient = () => {
        // Initialize the IRC Client
        this.client = new Client();
        this.client.connect({
            host: "irc.snoonet.org",
            port: 6667,
            nick: botNick
        });
        // When our client registers authorize our nick and connect to the trivia channel
        this.client.on("registered", () => {
            console.log("Registered");
            this.client.say("NickServ", "identify " + password);
            this.client.matchMessage(/^!/, this.handleCommand);
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

    handleCommand = ({ message }: any) => {
        let [ command, ...args ] = message.slice(1).split(" ");
        switch(command) {
            case "help":
                this.listCommands(); 
                break;
            case "score":
                this.announceScore(args[0]); 
                break;
            case "lifetime":
                this.announceLeaderboard("lifetime");
                break;
            case "monthly":
                this.announceLeaderboard("monthly");
                break;
            case "weekly":
                this.announceLeaderboard("weekly");
                break;
            case "daily":
                this.announceLeaderboard("daily");
                break;
        }
    }

    listCommands = () => {
        this.client.say(channel, bold("Available Commands: ") + "!score [user], !lifetime, !monthly, !weekly, !daily");
    }

    createQuestionHandler = (answer: string) => {
        return ({ nick: user, ...rest }: any) => {    
            // Increment  score and announce the user's current score
            this.incrementUserScore(user, answer);

            // Handle our streaks
            if (this.streak.user === user) {
                this.streak = {
                    user,
                    count: this.streak.count + 1
                };

                if (this.streak.count >= 3) {
                    this.client.say(channel, bold(this.formatPingSafe(user)) + " is on a streak of " + bold(this.streak.count) + "!");
                }
            } else {
                if (this.streak.count >= 3) {
                    this.client.say(channel, bold(this.formatPingSafe(user)) + " broke " + bold(this.formatPingSafe(this.streak.user)) + "'s streak of " + bold(this.streak.count) + "!");
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

    announceAnswer = (winner: string, answer: string, points: number) => {
        this.client.say(channel, "YES, " + this.formatPingSafe(winner) + " got the correct answer, " + bold(answer) + ".  They scored " + points + " points!");
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
                    let sql = ` UPDATE scoreboard
                                SET 
                                    lifetime = lifetime + ${ points },
                                    daily = daily + ${ points },
                                    weekly = weekly + ${ points },
                                    monthly = monthly + ${ points }
                                WHERE nick = "${ safeNick }";`;
                    this.database.exec(sql, () => {
                        announceAnswer(safeNick, answer, points);
                    });
                } else {
                    let sql = ` INSERT INTO scoreboard (nick, lifetime, daily, weekly, monthly, yearly)
                            VALUES ("${ safeNick }", ${ points }, 0, 0, 0, 0);`;
                    this.database.exec(sql, () => {
                        announceAnswer(safeNick, answer, points);
                    });
                }
            }
        });
    }

    announceScore = (nick: string) => {
        let sql = ` SELECT lifetime
                    FROM scoreboard
                    WHERE nick = "${ nick }";`;
        return this.database.get(sql, (err, row) => {
            if (!err && row) {
                const { lifetime } = row;
                this.client.say(channel, this.formatPingSafe(nick) + " has a lifetime score of " + bold(lifetime) + " points!");
            }
        });
    }

    announceLeaderboard = (column: string) => {
        let sql = ` SELECT *
                    FROM scoreboard
                    WHERE ${ column } != 0
                    ORDER BY ${ column } DESC
                    LIMIT 10;`;
        return this.database.all(sql, (err, rows) => {
            if (!err && rows) {
                let leaderPrintout = rows.map((row, index) => {
                    return (index + 1) + ". " + bold(this.formatPingSafe(row.nick)) + " " + row[column]
                }).join("    ");
                this.client.say(channel, leaderPrintout);
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

    formatPingSafe(value: string) {
        return value.slice(0,1) + "\u200B" + value.slice(1);
    }
}