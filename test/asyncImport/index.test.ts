import { expect, it } from "vitest";
import { testBundle } from "../util";
import { join } from "path";
import { readFile, rm } from "fs/promises";

const dirname = import.meta.dirname;

it("handles async imports", async () => {
    const bundle = await testBundle(dirname, {}, {}, { entryExt: ".ts" });
    expect(bundle).toMatchInlineSnapshot(`
      [
        "async function getThing() {
          return await import('./thing.gen-BzB0W28E.js').then((module)=>module.thingExport);
      }
      async function getAnotherThing() {
          return await import('./thing.gen-BzB0W28E.js').then((module)=>module.otherThingExport);
      }

      export { getAnotherThing, getThing };
      ",
        "const thingExport = "I am a generated thing!";
      const otherThingExport = "I am another generated thing!";

      export { otherThingExport, thingExport };
      ",
      ]
    `);
});
it("generates dts for async imports", async ({onTestFinished}) => {
    const DTS_PATH = join(dirname, "thing.gen&gen.d.ts");
    await testBundle(dirname, {}, { emitDts: true }, { entryExt: ".ts" });
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
