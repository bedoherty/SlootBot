import { Client } from "irc-framework";
import { getRandomQuestion, incrementUserScore } from "./Database";
import { IQuestion, IUserScores } from "./Interfaces";
import * as IRCFormat from "irc-colors";
import { shuffle, formatPingSafe } from "./Utils";

// Dereference our IRC Formatting utils
const { blue, green, bold } = IRCFormat;

const pointValues = [ 0, 10, 5, 2 ];

export default class Game {
    channel: string;
    client: Client;
    currentAnswers: string[];
    hints: string[][];
    matchHandlers: {
        [key: string]: any;
    }
    hintsGiven: number;
    running: boolean;
    hintTimeout: NodeJS.Timeout;
    nextQuestionTimeout: NodeJS.Timeout;

    constructor(client: Client, channel: string) {
        this.client = client;
        this.channel = channel;
        this.hints = [];
        this.matchHandlers = {};
        this.hintsGiven = 0;
        this.running = false;
    }

    /*
     * Game Controls
     */
    startGame = () => {
        this.running = true;
        this.askQuestion();
    }

    stopGame = () => {
        this.running = false;
        clearTimeout(this.nextQuestionTimeout);
        this.resetQuestion();
    }

    askQuestion = () => {
        getRandomQuestion().then((question: IQuestion) => {
            const { prompt, answers } = question;
            this.currentAnswers = answers;
            this.addHandlers();
            this.generateAllHints();
            this.say(`${ green(prompt) }`);
            this.giveHints();
        });
    }

    resetQuestion = () => {
        this.matchHandlers = {};
        this.hints = [];
        this.currentAnswers = [];
        this.hintsGiven = 0;
        clearTimeout(this.hintTimeout);
    }

    /*
     * Answer Handling
     */
    addHandlers = () => {
        if (this.currentAnswers.length === 1) {
            const [ answer ] = this.currentAnswers;
            let answerExp = new RegExp(answer, "i");
            this.matchHandlers[answer] = this.client.matchMessage(answerExp, this.createAnswerHandler());
        } else {
            
        }
    }

    createAnswerHandler = () => {
        return ({nick, ...rest}: any) => {
            const { length } = this.currentAnswers;
            const points = pointValues[this.hintsGiven];
            if (length === 1) {
                const [ answer ] = this.currentAnswers;
                this.resetQuestion();
                incrementUserScore(nick, points).then((userScores: IUserScores) => {
                    this.say(`YES, ${ formatPingSafe(nick) } got the correct answer, ${ bold(answer) }.  They scored ${ points } points!`)
                    this.queueNextQuestion();
                });
            } else {

            }
        }
    }

    giveHints = () => {
        if (this.hintsGiven >= 3) {
            this.handleUnanswered();
            return;
        }

        const { length } = this.currentAnswers;
        if (length === 1) {
            this.say(`Hint ${ this.hintsGiven + 1 }: ${ blue(this.hints[0][this.hintsGiven]) }`);
        } else {
            const hints = this.hints.map((hints: string[]) => {
                return hints[this.hintsGiven];
            });
            this.say(`Hint ${ this.hintsGiven + 1 }: [${ blue(hints.join(", ")) }]`);
        }
        this.hintsGiven++;
        this.hintTimeout = setTimeout(this.giveHints, 20000);
    }

    /*
     *  Hint Generation
     */
    generateAllHints = () => {
        this.hints = this.currentAnswers.map(this.generateAnswerHints);
    }

    generateAnswerHints = (answer: string) => {
        let hints = [];
        const { length } = answer;

        if (length === 1) {
            hints = ["*", "*", "*"];
        } else if (length === 2) {
            hints = ["**", "**", "**"];
        } else if (length === 3) {
            hints = ["***", "***", "***"];
        } else {
            let possibleReveals = shuffle(Array.from(Array(length).keys()));
            for (let i = 0; i < 3; i++) {
                hints.push(this.generateHint(answer, possibleReveals.slice(0, i / 3 * length)));
            }
        }

        return hints;
    }

    generateHint = (answer: string, reveals: number[]) => {
        let hint = "";
        for (let i = 0; i < answer.length; i++) {
            if (reveals.indexOf(i) >= 0) {
                hint += answer[i];
            } else {
                hint += "*";
            }
        }
        console.log(hint);
        return hint;
    }

    handleUnanswered = () => {
        const { length } = this.currentAnswers;
        if (length === 1) {
            const [ answer ] = this.currentAnswers;
            this.say(`Times up!  The answer was ${ bold(answer) }`);
        }
        this.queueNextQuestion();
    }

    queueNextQuestion = () => {
        this.resetQuestion();
        this.nextQuestionTimeout = setTimeout(this.askQuestion, 15000);
    }

    /*
     * Helper method for sending channel messages
     */
    say = (message: string) => {
        this.client.say(
            this.channel,
            message
        )
    }
}