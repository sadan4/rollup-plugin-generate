import type { GeneratorArgs } from "../../src";

export function generate({ emitFile, dirname }: GeneratorArgs) {
    const thing1File = emitFile({
        content: `export const thing1: string = "thing1 export";`,
    })
    const thing2File = emitFile({
        content: `
            import { MyInterface } from "./shared";
            export const thing2: MyInterface = {
                prop1: "valueFromThing2",
                prop2: 100,
            };
        `,
    })
    const thing3File = emitFile({
        content: `export const thing3: string = "thing3 export";`,
    })
    return `
        export * from "${thing1File}";
        export * from "${thing2File}";
        export * from "${thing3File}";
    `;
}