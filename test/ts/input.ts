import {OtherClass} from "./other.gen&gen"

export class Foo extends OtherClass {
    constructor(protected thing: string) {
        super(thing);
    }
}
