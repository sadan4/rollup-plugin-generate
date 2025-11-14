import { describe, expect, it } from "vitest";
import { testBundle } from "../util";
import { join } from "node:path";
import { readFile, rm } from "node:fs/promises";
import type { RollupOutput } from "rollup";

const dirname = import.meta.dirname;

describe("DTS bundling with shared types", async ({ beforeAll, afterAll }) => {
    it("produces the correct js output", async () => {
      const bundle: RollupOutput | string[] = await testBundle(dirname, {}, {}, { entryExt: ".ts" });
        expect(bundle).toMatchInlineSnapshot(`
          [
            "function doThing() {
              return {
                  prop1: "value1",
                  prop2: 42
              };
          }

          const thing1 = "thing1 export";

          const thing2 = {
              prop1: "valueFromThing2",
              prop2: 100
          };

          function foo() {
              console.log(thing1);
              console.log(thing2);
              return doThing();
          }

          export { foo };
          ",
          ]
        `);
    });
    it("does not include the shared types in the dts bundle", async ({onTestFinished}) => {
        const DTS_PATH = join(dirname, "things.gen&gen.d.ts");
        onTestFinished(() => rm(DTS_PATH));
        const bundle: RollupOutput | string[] = await testBundle(dirname, {}, { emitDts: true }, { entryExt: ".ts" });
        const dts = await readFile(DTS_PATH, "utf8");
        expect(dts).toMatchInlineSnapshot(`
          "import { MyInterface } from './shared.ts';

          declare const thing1: string;

          declare const thing2: MyInterface;

          declare const thing3: string;

          export { thing1, thing2, thing3 };
          "
        `);
    });
})

