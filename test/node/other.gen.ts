import { join } from "node:path";
import type { GeneratorArgs } from "../../src";

export function generate({dirname, filename}: GeneratorArgs) {
    const fullpath = join(dirname, filename);
    return `
        export const fullPath: string = "${fullpath}";
    `;
}
