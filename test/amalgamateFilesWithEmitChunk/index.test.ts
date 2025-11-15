import { describe, expect, it } from "vitest";
import { testBundle } from "../util";
import { join } from "node:path";
import { readFile, rm } from "node:fs/promises";
import type { RollupOutput } from "rollup";

const dirname = import.meta.dirname;

describe("amalgamation with emitChunk", () => {
    it("amalgamates files", async () => {
      const bundle = (await testBundle(dirname, {}, {}, { entryExt: ".ts" }) as string[]).map(file => {
        return file.replace(/(?<=import \{ thing2 \} from '\.\/)[a-z_$]{10}-[a-zA-Z0-9_]{8}(?=.js';)/, "random-chunk-name");
      });
        expect(bundle).toMatchInlineSnapshot(`
          [
            "import { thing2 } from './random-chunk-name.js';

          const thing1 = "thing1 export";

          function foo() {
              console.log(thing1);
              console.log(thing2);
          }

          export { foo };
          ",
            "const thing2 = "thing2 export";

          export { thing2 };
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
          "/* eslint-disable */
          declare const thing1: string;

          declare const thing2: string;

          declare const thing3: string;

          export { thing1, thing2, thing3 };
          "
        `);
    });
})

