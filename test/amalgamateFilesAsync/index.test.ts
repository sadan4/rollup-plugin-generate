import { describe, expect, it } from "vitest";
import { mockRandomIds, testBundle } from "../util";
import type { RollupOutput } from "rollup";
import { join } from "path";
import { readFile, rm } from "fs/promises";

const dirname = import.meta.dirname;

mockRandomIds();

describe("amalgamation async imports", ({beforeAll, afterAll}) => {
  const DTS_PATH = join(dirname, "things.gen&gen.d.ts");
  let bundle: RollupOutput | string[];
  beforeAll(async () => {
      bundle = await testBundle(dirname, {}, { emitDts: true }, { entryExt: ".ts", rawOutput: true });
  })
  afterAll(async () => {
      await rm(DTS_PATH);
  });
  it("amalgamates files when used from an async import", async () => {
      expect(bundle).toMatchInlineSnapshot(`
        {
          "output": [
            {
              "code": "async function foo(i) {
            if (i % 2 === 0) {
                return (await import('./things.gen-B4qXdtQk.js')).thing1;
            } else {
                return (await import('./things.gen-B4qXdtQk.js')).thing2;
            }
        }

        export { foo };
        ",
              "dynamicImports": [
                "things.gen-B4qXdtQk.js",
                "things.gen-B4qXdtQk.js",
              ],
              "exports": [
                "foo",
              ],
              "facadeModuleId": "/home/meyer/dev/ts/rollup-plugin-generate/test/amalgamateFilesAsync/input.ts",
              "fileName": "input.js",
              "implicitlyLoadedBefore": [],
              "importedBindings": {},
              "imports": [],
              "isDynamicEntry": false,
              "isEntry": true,
              "isImplicitEntry": false,
              "map": null,
              "moduleIds": [
                "/home/meyer/dev/ts/rollup-plugin-generate/test/amalgamateFilesAsync/input.ts",
              ],
              "modules": {
                "/home/meyer/dev/ts/rollup-plugin-generate/test/amalgamateFilesAsync/input.ts": {
                  "code": "async function foo(i) {
            if (i % 2 === 0) {
                return (await import('./things.gen-!~{001}~.js')).thing1;
            } else {
                return (await import('./things.gen-!~{001}~.js')).thing2;
            }
        }",
                  "originalLength": 191,
                  "removedExports": [],
                  "renderedExports": [
                    "foo",
                  ],
                  "renderedLength": 199,
                },
              },
              "name": "input",
              "preliminaryFileName": "input.js",
              "referencedFiles": [],
              "sourcemapFileName": null,
              "type": "chunk",
            },
            {
              "code": "const thing1 = "thing1 export";

        const thing2 = "thing2 export";

        export { thing1, thing2 };
        ",
              "dynamicImports": [],
              "exports": [
                "thing1",
                "thing2",
              ],
              "facadeModuleId": "/home/meyer/dev/ts/rollup-plugin-generate/test/amalgamateFilesAsync/things.gen.ts",
              "fileName": "things.gen-B4qXdtQk.js",
              "implicitlyLoadedBefore": [],
              "importedBindings": {},
              "imports": [],
              "isDynamicEntry": true,
              "isEntry": false,
              "isImplicitEntry": false,
              "map": null,
              "moduleIds": [
                "/home/meyer/dev/ts/rollup-plugin-generate/test/amalgamateFilesAsync/psbnuwbswa.ts",
                "/home/meyer/dev/ts/rollup-plugin-generate/test/amalgamateFilesAsync/rfvkxqfs$d.ts",
                "/home/meyer/dev/ts/rollup-plugin-generate/test/amalgamateFilesAsync/things.gen.ts",
              ],
              "modules": {
                "/home/meyer/dev/ts/rollup-plugin-generate/test/amalgamateFilesAsync/psbnuwbswa.ts": {
                  "code": "const thing1 = "thing1 export";",
                  "originalLength": 46,
                  "removedExports": [],
                  "renderedExports": [
                    "thing1",
                  ],
                  "renderedLength": 31,
                },
                "/home/meyer/dev/ts/rollup-plugin-generate/test/amalgamateFilesAsync/rfvkxqfs$d.ts": {
                  "code": "const thing2 = "thing2 export";",
                  "originalLength": 46,
                  "removedExports": [],
                  "renderedExports": [
                    "thing2",
                  ],
                  "renderedLength": 31,
                },
                "/home/meyer/dev/ts/rollup-plugin-generate/test/amalgamateFilesAsync/things.gen.ts": {
                  "code": null,
                  "originalLength": 113,
                  "removedExports": [],
                  "renderedExports": [],
                  "renderedLength": 0,
                },
              },
              "name": "things.gen",
              "preliminaryFileName": "things.gen-!~{001}~.js",
              "referencedFiles": [],
              "sourcemapFileName": null,
              "type": "chunk",
            },
          ],
        }
      `);
  });
  it("generates .d.ts files for amalgamated async imports", async () => {
    const dts = await readFile(DTS_PATH, "utf-8");
    expect(dts).toMatchInlineSnapshot(`
      "declare const thing1: string = "thing1 export";

      declare const thing2: string = "thing2 export";

      declare const thing3: string = "thing3 export";

      export { thing1, thing2, thing3 };
      "
    `);
  });
});