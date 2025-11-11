import { testBundle } from "../util";
import { expect, it } from "vitest";

const dirname = import.meta.dirname;
it("properly bundles builtin node modules", async () => {
    const bundle = await testBundle(dirname, {}, {}, { entryExt: ".ts" });
    expect(bundle).toMatchInlineSnapshot(`
      [
        "const fullPath = "/home/meyer/dev/ts/rollup-plugin-generate/test/node/other.gen.ts?gen";

      console.log("full path is ", fullPath);
      ",
      ]
    `);
});

