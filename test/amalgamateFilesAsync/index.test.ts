import { describe, expect, it } from "vitest";
import { testBundle } from "../util";
import { join } from "path";
import { readFile, rm } from "fs/promises";

const dirname = import.meta.dirname;

describe("amalgamation async imports", () => {
  it("amalgamates files when used from an async import", async () => {
      const bundle = await testBundle(dirname, {}, {}, { entryExt: ".ts" });
      expect(bundle).toMatchInlineSnapshot(`
        [
          "async function foo(i) {
            if (i % 2 === 0) {
                return (await import('./things.gen-B4qXdtQk.js')).thing1;
            } else {
                return import('./things.gen-B4qXdtQk.js').then((mod)=>mod.thing2);
            }
        }

        export { foo };
        ",
          "const thing1 = "thing1 export";

        const thing2 = "thing2 export";

        export { thing1, thing2 };
        ",
        ]
      `);
  });
  it("generates .d.ts files for amalgamated async imports", async ({onTestFinished}) => {
    await testBundle(dirname, {}, { emitDts: true }, { entryExt: ".ts" });
    const DTS_PATH = join(dirname, "things.gen&gen.d.ts");
    onTestFinished(() => rm(DTS_PATH));
    const dts = await readFile(DTS_PATH, "utf-8");
    expect(dts).toMatchInlineSnapshot(`
      "declare const thing1: string;

      declare const thing2: string;

      declare const thing3: string;

      export { thing1, thing2, thing3 };
      "
    `);
  });
});