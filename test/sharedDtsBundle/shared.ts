export interface MyInterface {
    prop1: string;
    prop2: number;
}

export function doThing(): MyInterface {
    return {
        prop1: "value1",
        prop2: 42,
    };
}