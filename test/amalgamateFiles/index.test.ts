import { describe, expect, it } from "vitest";
import { testBundle } from "../util";
import { join } from "node:path";
import { readFile, rm } from "node:fs/promises";
import type { RollupOutput } from "rollup";

const dirname = import.meta.dirname;

describe("amalgamation", () => {
    it("amalgamates files", async () => {
        const bundle = await testBundle(dirname, {}, {}, { entryExt: ".ts" });
        expect(bundle).toMatchInlineSnapshot(`
          [
            "const thing1 = "thing1 export";

          const thing2 = "thing2 export";

          function foo() {
              console.log(thing1);
              console.log(thing2);
          }

          export { foo };
          ",
          ]
        `);
    });
    it("generates a correct dts when amalgamating files", async ({onTestFinished}) => {
        await testBundle(dirname, {}, { emitDts: true }, { entryExt: ".ts" });
      const DTS_PATH = join(dirname, "things.gen&gen.d.ts");
      onTestFinished(() => rm(DTS_PATH));
        const dts = await readFile(DTS_PATH, "utf8");

        expect(dts).toMatchInlineSnapshot(`
          "declare const thing1: string;

          declare const thing2: string;

          declare const thing3: string;

          export { thing1, thing2, thing3 };
          "
        `);
    });
})

