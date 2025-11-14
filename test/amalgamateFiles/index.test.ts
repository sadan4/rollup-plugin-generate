import { describe, expect, it } from "vitest";
import { mockRandomIds, testBundle } from "../util";
import { join } from "node:path";
import { readFile, rm } from "node:fs/promises";
import type { RollupOutput } from "rollup";

const dirname = import.meta.dirname;

mockRandomIds();

const DTS_PATH = join(dirname, "things.gen&gen.d.ts");

describe("amalgamation", async ({beforeAll, afterAll}) => {
    let bundle: RollupOutput | string[];
    beforeAll(async () => {
        bundle = await testBundle(dirname, {}, { emitDts: true }, { entryExt: ".ts", rawOutput: true });
    });
    afterAll(async () => {
        await rm(DTS_PATH);
    });
    it("amalgamates files", async () => {
        expect(bundle).toMatchInlineSnapshot(`
          {
            "output": [
              {
                "code": "const thing1 = "thing1 export";

          const thing2 = "thing2 export";

          function foo() {
              console.log(thing1);
              console.log(thing2);
          }

          export { foo };
          ",
                "dynamicImports": [],
                "exports": [
                  "foo",
                ],
                "facadeModuleId": "/home/meyer/dev/ts/rollup-plugin-generate/test/amalgamateFiles/input.ts",
                "fileName": "input.js",
                "implicitlyLoadedBefore": [],
                "importedBindings": {},
                "imports": [],
                "isDynamicEntry": false,
                "isEntry": true,
                "isImplicitEntry": false,
                "map": null,
                "moduleIds": [
                  "/home/meyer/dev/ts/rollup-plugin-generate/test/amalgamateFiles/psbnuwbswa.ts",
                  "/home/meyer/dev/ts/rollup-plugin-generate/test/amalgamateFiles/rfvkxqfs$d.ts",
                  "/home/meyer/dev/ts/rollup-plugin-generate/test/amalgamateFiles/input.ts",
                ],
                "modules": {
                  "/home/meyer/dev/ts/rollup-plugin-generate/test/amalgamateFiles/input.ts": {
                    "code": "function foo() {
              console.log(thing1);
              console.log(thing2);
          }",
                    "originalLength": 121,
                    "removedExports": [],
                    "renderedExports": [
                      "foo",
                    ],
                    "renderedLength": 68,
                  },
                  "/home/meyer/dev/ts/rollup-plugin-generate/test/amalgamateFiles/psbnuwbswa.ts": {
                    "code": "const thing1 = "thing1 export";",
                    "originalLength": 46,
                    "removedExports": [],
                    "renderedExports": [
                      "thing1",
                    ],
                    "renderedLength": 31,
                  },
                  "/home/meyer/dev/ts/rollup-plugin-generate/test/amalgamateFiles/rfvkxqfs$d.ts": {
                    "code": "const thing2 = "thing2 export";",
                    "originalLength": 46,
                    "removedExports": [],
                    "renderedExports": [
                      "thing2",
                    ],
                    "renderedLength": 31,
                  },
                },
                "name": "input",
                "preliminaryFileName": "input.js",
                "referencedFiles": [],
                "sourcemapFileName": null,
                "type": "chunk",
              },
            ],
          }
        `);
    });
    it("generates a correct dts when amalgamating files", async ({onTestFinished}) => {
        const dts = await readFile(DTS_PATH, "utf8");
        expect(dts).toMatchInlineSnapshot(`
        "export * from "psbnuwbswa";
        export * from "rfvkxqfs$d";
        export * from "atgadhjvhv";
        "
        `);
    });
})

