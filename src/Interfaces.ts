import { ObjectId } from "mongodb";

export interface IQuestion {
    _id: ObjectId;
    prompt: string;
    answers: string[];
    category: string;
    reported: boolean;
}

export interface IUserScores {
    nick: string;
    lifetime: number;
}