import { ObjectId } from "mongodb";

export interface IQuestion {
    _id: ObjectId;
    prompt: string;
    answers: string[];
}

export interface IUserScores {
    nick: string;
    lifetime: number;
    // [key: string]: number;
}