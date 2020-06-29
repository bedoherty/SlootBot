import moment = require("moment");
import { Scoreboards } from "./Constants";
import settings from "src/Settings";

const { admins } = settings;

// Helper function to parse base64 encoded strings
export function parse64(encodedString: string) {
    let buffer = new Buffer(encodedString, 'base64');
    return buffer.toString("ascii");
}

export function shuffle(array: Array<any>) {
    var currentIndex = array.length, temporaryValue, randomIndex;

    // While there remain elements to shuffle...
    while (0 !== currentIndex) {

        // Pick a remaining element...
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex -= 1;

        // And swap it with the current element.
        temporaryValue = array[currentIndex];
        array[currentIndex] = array[randomIndex];
        array[randomIndex] = temporaryValue;
    }

    return array;
}

export const formatPingSafe = (value: string) => {
    return value.slice(0,1) + "\u200B" + value.slice(1);
}

export const getDailyString = () => {
    return "daily-" + moment().format("YYYYMMDD");
}

export const getWeeklyString = () => {
    return "weekly-" + moment().format("YYYYWW");
}

export const getMonthlyString = () => {
    return "monthly-" + moment().format("YYYYMM");
}

export const getScoreIndex = (scoreboard: Scoreboards) => {
    switch (scoreboard) {
        case Scoreboards.LIFETIME:
            return "lifetime";
        case Scoreboards.DAILY:
            return getDailyString();
        case Scoreboards.WEEKLY:
            return getWeeklyString();
        case Scoreboards.MONTHLY:
            return getMonthlyString();
    }
}

export const isAdmin = (nick: string) => {
    return admins.indexOf(nick) >= 0;
}

export const getRegExpSafeString = (input: string) => {
    return input.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}