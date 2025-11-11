import { testBundle } from "../util";

import { it, expect, describe } from "vitest";

it("handles a basic generator", async () => {
    const bundle = await testBundle(import.meta.dirname);
    expect(bundle).toMatchInlineSnapshot(`
      [
        "const bar = 42;

      console.log("The answer is:", bar);
      ",
      ]
    `)
})