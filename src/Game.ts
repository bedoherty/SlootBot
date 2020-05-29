import { Client } from "irc-framework";
import { getRandomQuestion, incrementUserScore, getQuestionById, reportQuestion } from "./Database";
import { IQuestion, IUserScores } from "./Interfaces";
import * as IRCFormat from "irc-colors";
import { shuffle, formatPingSafe, getRegExpSafeString } from "./Utils";

// Dereference our IRC Formatting utils
const { blue, green, bold } = IRCFormat;

const pointValues = [ 0, 10, 5, 2 ];

const charactersToHide = new RegExp(/^[A-Za-z0-9]$/i);

export default class Game {
    channel: string;
    client: Client;
    currentAnswers: string[];
    participants: string[];
    hints: string[][];
    answersGiven: boolean[];
    matchHandlers: {
        [key: string]: any;
    }
    hintsGiven: number;
    running: boolean;
    hintTimeout: NodeJS.Timeout;
    nextQuestionTimeout: NodeJS.Timeout;
    questionId: string;

    constructor(client: Client, channel: string) {
        this.client = client;
        this.channel = channel;
        this.hints = [];
        this.matchHandlers = {};
        this.hintsGiven = 0;
        this.running = false;
        this.participants = [];
        this.answersGiven = [];
    }

    /*
     * Game Controls
     */
    startGame = () => {
        this.say("Starting Trivia Game");
        this.running = true;
        this.askQuestion();
    }

    stopGame = () => {
        this.say("Stopping Trivia Game");
        this.running = false;
        clearTimeout(this.nextQuestionTimeout);
        this.resetQuestion();
        
    }

    askQuestion = (questionId?: string) => {
        const questionCallback = (question: IQuestion) => {
            const { prompt, answers, _id } = question;
            this.questionId = _id.toHexString();
            this.currentAnswers = answers.map(this.preprocessText);
            this.answersGiven = new Array(answers.length).fill(false);
            this.addHandlers();
            this.generateAllHints();
            this.say(`${bold(_id.toHexString())}: ${ green(prompt) }`);
            this.giveHints();
        };
        if (questionId) {
            getQuestionById(questionId)
                .then(questionCallback)
                .catch(console.log);
        } else {
            getRandomQuestion()
                .then(questionCallback)
                .catch(console.log);
        }
    }

    resetQuestion = () => {
        Object.keys(this.matchHandlers).forEach((key: string) => {
            this.matchHandlers[key].stop();
        });
        this.answersGiven = [];
        this.matchHandlers = {};
        this.hints = [];
        this.currentAnswers = [];
        this.hintsGiven = 0;
        this.participants = [];
        clearTimeout(this.hintTimeout);
    }

    /*
     * Answer Handling
     */
    addHandlers = () => {
        this.currentAnswers.map((answer: string, index: number) => {
            let answerExp = new RegExp(getRegExpSafeString(answer), "i");
            this.matchHandlers[answer] = this.client.matchMessage(answerExp, this.createAnswerHandler(answer, index));
        });
    }

    createAnswerHandler = (answer: string, index: number) => {
        const { length } = this.currentAnswers;
        return ({nick, ...rest}: any) => {
            const points = pointValues[this.hintsGiven];
            if (length === 1) {
                const [ answer ] = this.currentAnswers;
                this.resetQuestion();
                incrementUserScore(nick, points)
                    .then((userScores: IUserScores) => {
                    })
                    .catch(console.log);
                    this.say(`YES, ${ formatPingSafe(nick) } got the correct answer, ${ bold(answer) }.  They scored ${ points } points!`)
                    this.queueNextQuestion();
            } else {
                incrementUserScore(nick, points);
                this.say(`${ formatPingSafe(nick) } gets ${ points } for ${ bold(answer) }`);
                this.answersGiven[index] = true;
                this.matchHandlers[answer].stop();
                delete this.matchHandlers[answer];
                if (this.participants.indexOf(nick) === -1) {
                    this.participants.push(nick);
                }
                if (this.answersGiven.reduce((prev, next) => prev && next)) {
                    this.say("All answers found!");
                    if (this.participants.length >= 2) {
                        this.say("Ten bonus points for teamwork!")
                        this.participants.map((nick: string) => {
                            incrementUserScore(nick, 10);
                        })
                    }
                    this.queueNextQuestion();
                }
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
            const hints = this.hints.map((hints: string[], index: number) => {
                if (this.answersGiven[index]) {
                    return null;
                }
                return blue(hints[this.hintsGiven]);
            }).filter((val: string) => {
                return val !== null;
            });
            this.say(`Hint ${ this.hintsGiven + 1 }: [${ hints.join(", ") }]`);
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
        for (let charIndex = 0; charIndex < answer.length; charIndex++) {
            if (reveals.indexOf(charIndex) >= 0 || !charactersToHide.test(answer[charIndex])) {
                hint += answer[charIndex];
            } else {
                hint += "*";
            }
        }
        return hint;
    }

    handleUnanswered = () => {
        const { length } = this.currentAnswers;
        if (length === 1) {
            const [ answer ] = this.currentAnswers;
            this.say(`Times up!  The answer was ${ bold(answer) }`);
        } else {
            const answers = this.currentAnswers.map((answer: string, index: number) => {
                if (this.answersGiven[index]) {
                    return null;
                }
                return bold(blue(answer));
            }).filter((val: string) => {
                return val !== null;
            })
            this.say(`Times up!  No one got [ ${ answers.join(", ") } ]`);
        }
        this.queueNextQuestion();
    }

    queueNextQuestion = () => {
        this.resetQuestion();
        this.nextQuestionTimeout = setTimeout(this.askQuestion, 15000);
    }

    reportQuestion = (questionId?: string) => {
        // Handle reported question
        this.say("Question successfully reported!");
        reportQuestion(questionId ?? this.questionId);
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

    /*
     * Helper method for removing common issues in answers
     */
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