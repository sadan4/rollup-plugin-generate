
export async function foo(i: number) {
    if (i % 2 === 0) {
        return (await import("./things.gen")).thing1;
    } else {
        return import("./things.gen").then(mod => mod.thing2)
    }
}