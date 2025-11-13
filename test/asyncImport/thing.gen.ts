export async function generate({ }) {
    return `
        export const thingExport: string = "I am a generated thing!";
        export const otherThingExport: string | number = "I am another generated thing!";
    `;
}