export async function getThing() {
    return await import("./thing.gen&gen").then(module => module.thingExport);
}

export async function getAnotherThing() {
    return await import("./thing.gen&gen").then(module => module.otherThingExport);
}