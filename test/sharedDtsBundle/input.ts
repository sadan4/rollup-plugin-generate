import { doThing } from "./shared";
import * as gen from "./things.gen";

export function foo() {
    console.log(gen.thing1);
    console.log(gen.thing2);
    return doThing();
}