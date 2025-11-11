import { expect, it } from "vitest";
import { JS_EXTENSIONS, testBundle } from "../util";
import { describe } from "node:test";
import { join } from "node:path";
import commonJs from "@rollup/plugin-commonjs";

const dirname = import.meta.dirname;

it("handles cjs generators without an extension", async () => {
    const bundle = await testBundle(join(dirname, "generator"));
    expect(bundle).toMatchInlineSnapshot(`
      [
        "const thing = 'thing var value';

      console.log("The thing is:", thing);
      ",
      ]
    `);
})
it("handles cjs generators with an extension", async () => {
    const bundle = await testBundle(join(dirname, "generator-with-ext"));
    expect(bundle).toMatchInlineSnapshot(`
      [
        "const thing = 'generator-with-ext-value';

      console.log("The thing is:", thing);
      ",
      ]
    `);
})