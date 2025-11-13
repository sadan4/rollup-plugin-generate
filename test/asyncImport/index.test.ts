import { expect, it } from "vitest";
import { testBundle } from "../util";
import { join } from "path";
import { readFile, rm } from "fs/promises";

const dirname = import.meta.dirname;

it("handles async imports", async () => {
    const bundle = await testBundle(dirname, {}, {}, { rawOutput: true, entryExt: ".ts" });
    expect(bundle).toMatchInlineSnapshot(`
      {
        "output": [
          {
            "code": "async function getThing() {
          return await import('./thing.gen-BzB0W28E.js').then((module)=>module.thingExport);
      }
      async function getAnotherThing() {
          return await import('./thing.gen-BzB0W28E.js').then((module)=>module.otherThingExport);
      }

      export { getAnotherThing, getThing };
      ",
            "dynamicImports": [
              "thing.gen-BzB0W28E.js",
              "thing.gen-BzB0W28E.js",
            ],
            "exports": [
              "getAnotherThing",
              "getThing",
            ],
            "facadeModuleId": "/home/meyer/dev/ts/rollup-plugin-generate/test/asyncImport/input.ts",
            "fileName": "input.js",
            "implicitlyLoadedBefore": [],
            "importedBindings": {},
            "imports": [],
            "isDynamicEntry": false,
            "isEntry": true,
            "isImplicitEntry": false,
            "map": null,
            "moduleIds": [
              "/home/meyer/dev/ts/rollup-plugin-generate/test/asyncImport/input.ts",
            ],
            "modules": {
              "/home/meyer/dev/ts/rollup-plugin-generate/test/asyncImport/input.ts": {
                "code": "async function getThing() {
          return await import('./thing.gen-!~{001}~.js').then((module)=>module.thingExport);
      }
      async function getAnotherThing() {
          return await import('./thing.gen-!~{001}~.js').then((module)=>module.otherThingExport);
      }",
                "originalLength": 244,
                "removedExports": [],
                "renderedExports": [
                  "getThing",
                  "getAnotherThing",
                ],
                "renderedLength": 245,
              },
            },
            "name": "input",
            "preliminaryFileName": "input.js",
            "referencedFiles": [],
            "sourcemapFileName": null,
            "type": "chunk",
          },
          {
            "code": "const thingExport = "I am a generated thing!";
      const otherThingExport = "I am another generated thing!";

      export { otherThingExport, thingExport };
      ",
            "dynamicImports": [],
            "exports": [
              "otherThingExport",
              "thingExport",
            ],
            "facadeModuleId": "/home/meyer/dev/ts/rollup-plugin-generate/test/asyncImport/thing.gen.ts",
            "fileName": "thing.gen-BzB0W28E.js",
            "implicitlyLoadedBefore": [],
            "importedBindings": {},
            "imports": [],
            "isDynamicEntry": true,
            "isEntry": false,
            "isImplicitEntry": false,
            "map": null,
            "moduleIds": [
              "/home/meyer/dev/ts/rollup-plugin-generate/test/asyncImport/thing.gen.ts",
            ],
            "modules": {
              "/home/meyer/dev/ts/rollup-plugin-generate/test/asyncImport/thing.gen.ts": {
                "code": "const thingExport = "I am a generated thing!";
      const otherThingExport = "I am another generated thing!";",
                "originalLength": 165,
                "removedExports": [],
                "renderedExports": [
                  "thingExport",
                  "otherThingExport",
                ],
                "renderedLength": 104,
              },
            },
            "name": "thing.gen",
            "preliminaryFileName": "thing.gen-!~{001}~.js",
            "referencedFiles": [],
            "sourcemapFileName": null,
            "type": "chunk",
          },
        ],
      }
    `);
});
const DTS_PATH = join(dirname, "thing.gen&gen.d.ts");
it("generates dts for async imports", async ({onTestFinished}) => {
    const bundle = await testBundle(dirname, {}, { emitDts: true }, { rawOutput: true, entryExt: ".ts" });
    const dts = await readFile(DTS_PATH, "utf8");
    onTestFinished(async () => {
        await rm(DTS_PATH);
    });
    expect(dts).toMatchInlineSnapshot(`
      "export declare const thingExport: string;
      export declare const otherThingExport: string | number;
      "
    `);
});
