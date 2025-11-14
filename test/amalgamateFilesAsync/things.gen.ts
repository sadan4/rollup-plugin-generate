import { join } from "node:path";
import type { GeneratorArgs } from "../../src";

export function generate({ emitFile, dirname }: GeneratorArgs) {
    const ids: string[] = [];
    const thing1File = emitFile({
        content: `export const thing1: string = "thing1 export";`,
    })
    const thing2File = emitFile({
        content: `export const thing2: string = "thing2 export";`,
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