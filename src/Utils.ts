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