export function generate() {
    const randomNumber = 4; // chosen by fair dice roll
                            // guaranteed to be random
    return `
    export class OtherClass {
        constructor(private otherThing: string) {
            console.log("OtherClass created with", otherThing);
            console.log("generated random number: ${randomNumber}");
        }
    }
    `;
}