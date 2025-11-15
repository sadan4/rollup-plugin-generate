import { join } from "node:path";
import { testBundle } from "../util";
import { expect, it } from "vitest";
import { readFile, rm } from "node:fs/promises";

const dirname = import.meta.dirname;
it("handles a simple typescript generator", async () => {
    const bundle = await testBundle(dirname, {}, {}, { entryExt: ".ts" });
    expect(bundle).toMatchInlineSnapshot(`
      [
        "class OtherClass {
          constructor(otherThing){
              this.otherThing = otherThing;
              console.log("OtherClass created with", otherThing);
              console.log("generated random number: 4");
          }
      }

      class Foo extends OtherClass {
          constructor(thing){
              super(thing), this.thing = thing;
          }
      }

      export { Foo };
      ",
      ]
    `);
});

const DTS_PATH = join(dirname, "other.gen&gen.d.ts");

it("generates the dts for generated files", async ({onTestFinished}) => {
    const _bundle = await testBundle(dirname, {}, { emitDts: true, }, { entryExt: ".ts" });
    onTestFinished(async () => {
        await rm(DTS_PATH);
    })
    const dts = await readFile(DTS_PATH, "utf-8");
    expect(dts).toMatchInlineSnapshot(`
      "/* eslint-disable */
      export declare class OtherClass {
          private otherThing;
          constructor(otherThing: string);
      }
      "
    `);
})