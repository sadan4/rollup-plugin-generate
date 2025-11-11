import { expect, it } from "vitest";
import { createCJSTestBundle, testBundle } from "../util";
import { join } from "path";

const dirname = import.meta.dirname;

function createTestBundle(dir: string, entryExt: `.${string}` = ".js") {
  return createCJSTestBundle(join(dirname, dir), entryExt);
}

it("handles a generated cjs module", async () => {
    const bundle = await createTestBundle("generated");
    expect(bundle).toMatchInlineSnapshot(`
      [
        "var thing_gen = {};

      var hasRequiredThing_gen;
      function requireThing_gen() {
          if (hasRequiredThing_gen) return thing_gen;
          hasRequiredThing_gen = 1;
          thing_gen.thing = 'generated cjs without extension';
          return thing_gen;
      }

      var thing_genExports = requireThing_gen();

      console.log("The thing is:", thing_genExports.thing);
      ",
      ]
    `)
});
it("handles a generated cjs module with extension", async () => {
    const bundle = await createTestBundle("generated-with-ext");
    expect(bundle).toMatchInlineSnapshot(`
      [
        "var thing_gen = {};

      var hasRequiredThing_gen;
      function requireThing_gen() {
          if (hasRequiredThing_gen) return thing_gen;
          hasRequiredThing_gen = 1;
          thing_gen.thing = 'generated cjs with extension';
          return thing_gen;
      }

      var thing_genExports = requireThing_gen();

      console.log("The thing is:", thing_genExports.thing);
      ",
      ]
    `)
})