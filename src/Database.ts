import { MongoClient, Db, WriteOpResult, UpdateWriteOpResult, ObjectId } from "mongodb";
import { IQuestion } from "./Interfaces";
import { getDailyString, getWeeklyString, getMonthlyString, getScoreIndex } from "./Utils";
import { Scoreboards } from "./Constants";
// Helper function for DB access
const executeDB = (callback: (db:  Db) => void) => {
    return new Promise((resolve, reject) => {
        MongoClient.connect("mongodb://localhost:27017", (err, client) => {
            if (err) {
                console.log(err);
                reject(err);
            }

            resolve(callback(client.db("develop")));
            client.close();
        });
    });
}

export const getRandomQuestion = () => {
    return new Promise((resolve, reject) => {
        executeDB((db: Db) => { 
            db.collection("questions").aggregate([
                {
                    $sample: {
                        size: 100
                    }
                },
                {
                    $match: {
                        reported: false
                    }
                }
            ])
            .toArray()
            .then((values: IQuestion[]) => {
                if (values && values.length > 0) {
                    resolve(values[0]);
                }
                reject();
            })
            .catch(reject);
        });
    });
}

export const incrementUserScore = (nick: string, points: number) => {
    return new Promise((resolve, reject) => {
        executeDB((db: Db) => {
            db
                .collection("scores")
                .updateOne(
                    {
                        nick
                    },
                    {
                        $inc: {
                            lifetime: points,
                            [getDailyString()]: points,
                            [getWeeklyString()]: points,
                            [getMonthlyString()]: points
                        }
                    },
                    {
                        upsert: true
                    }
                )
                .then(resolve)
                .catch(reject);
        });
    });
}

export const getTopScores = (scoreboard: Scoreboards) => {
    let index = getScoreIndex(scoreboard);

    return new Promise((resolve, reject) => {
        executeDB((db: Db) => {
            db
                .collection("scores")
                .find()
                .sort({
                    [index]: -1
                })
                .limit(10)
                .toArray()
                .then(resolve)
                .catch(reject);
        });
    });
}

export const getUserScore = (scoreboard: Scoreboards, nick: string) => {
    let index = getScoreIndex(scoreboard);
    return new Promise((resolve, reject) => {
        executeDB((db: Db) => {
            db
                .collection("scores")
                .findOne({
                    nick
                })
                .then(resolve)
                .catch(reject);
        });
    });
}

export const getQuestionById = (questionId: string) => {
    return new Promise((resolve, reject) => {
        executeDB((db: Db) => {
            db
                .collection("questions")
                .findOne({
                    _id: new ObjectId(questionId)
                })
                .then(resolve)
                .catch(reject);
        });
    });
}

export const reportQuestion = (questionId: string) => {
    return new Promise((resolve, reject) => {
        executeDB((db: Db) => {
            db
                .collection("questions")
                .updateOne({
                    _id: new ObjectId(questionId)
                }, {
                    reported: true
                }, {
                    upsert: true
                })
                .then(resolve)
                .catch(reject);
        });
    });
}