import type { RollupOptions, RollupOutput } from "rollup"; 
import { rollup } from "rollup";
import swc from "@rollup/plugin-swc";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import { generate, type GenerateOptions } from "../src";
import commonjs from "@rollup/plugin-commonjs";

type SWCOptions = (Parameters<typeof swc>[0] & {})["swc"];

export interface ExtraTextBundleOpts {
    entryExt?: `.${string}`;
    rawOutput?: boolean;
    swcOpts?: SWCOptions;
}

// echo .{m,c,}{j,t}s{x,} .json .node
export const JS_EXTENSIONS = ".mjsx .mjs .mtsx .mts .cjsx .cjs .ctsx .cts .jsx .js .tsx .ts .json .node".split(" ");

export async function testBundle(
    dir: string,
    { plugins, ...rollupOptions }: RollupOptions = {},
    pluginOptions: GenerateOptions = {},
    {
        entryExt = ".js",
        rawOutput = false,
        swcOpts = {},
    }: ExtraTextBundleOpts = {}
): Promise<RollupOutput | string[]> {
    const bundle = await rollup({
        input: `${dir}/input${entryExt}`,
        plugins: [
            ...(plugins && typeof plugins === "object" && Symbol.iterator in plugins ? plugins : [plugins]),
            generate({
                emitDts: false,
                ...pluginOptions,
            }),
            swc({
                swc: {
                    ...swcOpts,
                }
            }),
            nodeResolve({
                extensions: JS_EXTENSIONS
            })
        ],
        ...rollupOptions
    });
    const generated = await bundle.generate({
        dir: undefined,
    });
    if (rawOutput) {
        return generated as any;
    } else {
        return generated.output.map(f => f.type === "chunk" ? f.code : f.source.toString());
    }
}

export function createCJSTestBundle(dir: string, entryExt: `.${string}` = ".js") {
    return testBundle(
        dir,
        {
        plugins: [commonjs({
            transformMixedEsModules: true,
        })]
        },
        {},
        {
        entryExt,
        }
    );
}