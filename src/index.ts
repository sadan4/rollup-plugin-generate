import { createFilter, type FilterPattern } from "@rollup/pluginutils";
import type { LoadResult, Plugin, PluginContext, PluginImpl } from "rollup";
import { basename, join, dirname } from "node:path";
import * as esbuild from "esbuild";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

export interface GenerateOptions {
  /**
   * if true, emit a generated .d.ts file **in the same tree as the source file** for the generated result
   * @default true
   */
  emitDts?: boolean;
  /**
   * only run against files that match this pattern
   * @default /\.gen\.[mc]?[jt]sx?(?:\?.+?)?$/
   * @see https://github.com/micromatch/picomatch#globbing-features
   */
  include?: FilterPattern;
  /**
   * don't run against files that match this pattern
   * @default undefined
   */
  exclude?: FilterPattern;
  /**
   * Options to use with esbuild while transpiling the source file, if said source file is typescript.
   */
  esbuildOptions?:
    | esbuild.BuildOptions
    | ((id: string) => Promise<esbuild.BuildOptions> | esbuild.BuildOptions);
  /**
   * Evalualate the generator in a worker
   * @default false
   */
    useWorker?: boolean;
}

const DEFAULT_INCLUDE_REGEX = /\.gen\.[mc]?[jt]sx?(?:\?.+?)?$/;

function stripQueryArgs(path: string): string {
  return path.replace(/\?.*$/, "");
}

const SYM_TRANSPILE = Symbol();
const PLUGIN_NAME = "generate";

export interface GeneratorArgs {
    watch(path: string): void;
    dirname: string;
    filename: string;
    error(msg: string | Error): never;
    warn(msg: string): void;
    info(msg: string): void;
    debug(msg: string): void;

}

export interface GeneratorModule {
    generate(args: GeneratorArgs): Promise<string> | string;
}


export function generate({
  exclude,
  include = DEFAULT_INCLUDE_REGEX,
  esbuildOptions: _esbuildOptions = {},
  emitDts = true,
}: GenerateOptions = {}): Plugin<GenerateOptions> {
  const matcher = createFilter(include, exclude);
  function getBuildOptions(
    id: string,
  ): Promise<esbuild.BuildOptions> | esbuild.BuildOptions {
    if (typeof _esbuildOptions === "object") {
      return _esbuildOptions ?? {};
    } else {
      return _esbuildOptions(id);
    }
  }
  async function transform(this: PluginContext, id: string) {
        const tempDir = await mkdtemp(join(tmpdir(), `rollup-plugin-${PLUGIN_NAME}.`));
        const { watchMode } = this.meta;
        const filename = basename(id);
        const dir = dirname(id);
        const outfile = join(tempDir, "file.mjs");
        const providedOptions = await getBuildOptions(id);
        const result = await esbuild.build({
          ...providedOptions,
          entryPoints: [id],
          outfile,
          bundle: true,
          minify: false,
          format: "esm",
          ...(watchMode
            ? {
                absPaths: [...(providedOptions.absPaths ?? []), "metafile"],
                metafile: true,
              }
            : {}),
        });
        if (watchMode) {
          const { metafile } = result;
          if (!metafile) {
            this.error("ESBuild Metafile is undefined");
          }
          // typescript is dumb and doesnt recognize the above `this.error` as never returning, depsite it being correctly typed
          const { outputs } = metafile as esbuild.Metafile;
          for (const path of Object.keys(outputs)) {
            this.addWatchFile(path);
          }
        }
        let mod = (await import(outfile)) as GeneratorModule;
        // try to unwrap cjs default export
        if (Object.keys(mod).length === 1 && "default" in mod) {
          mod = (mod as any).default;
        }
          if (!mod || !Object.hasOwn(mod, "generate") || typeof mod.generate !== "function") {
              this.warn("read the docs for the args passed to the generator function");
              this.error(`the generator must have a named export "generate"`)
          }
          const opts: GeneratorArgs = {
              error: (msg) => this.error(msg),
              warn: (msg) => this.warn(msg),
              info: (msg) => this.info(msg),
              debug: (msg) => this.debug(msg),
              filename,
              dirname: dir,
              watch: (path) => this.addWatchFile(path),
          };
              let transformedCode;
          try {
              transformedCode = await Promise.resolve(mod.generate(opts))
          } catch (e) {
              throw new Error(`Failed to generate module ${id}`, {cause: e})
          }
        return transformedCode;
  }
  async function generateAndWriteDts(
    this: PluginContext,
    id: string,
    code: string,
  ) {
    const ts = await import("typescript");
    const outputFiles = new Map<string, string>();
    const host = ts.createCompilerHost({
      declaration: true,
      emitDeclarationOnly: true,
    });
    const origReadFile = host.readFile;
    host.readFile = (filename) => {
      if (filename === id) {
        return code;
      } else {
        return origReadFile(filename);
      }
    };
    host.writeFile = (filename, contents) => {
      outputFiles.set(filename, contents);
    }
    const program = ts.createProgram(
      [id],
      {
        declaration: true,
        emitDeclarationOnly: true,
      },
      host
    );
    program.emit();
    const outputDts = id.replace(/\.[mc]?[jt]sx?$/, ".d.ts");
    const dts = outputFiles.get(outputDts);
    if (!dts) {
      this.warn("failed to generate .d.ts file");
      return;
    } else {
      const outputDtsWithThing = id.replace(/\.[mc]?[jt]sx?$/, "?gen.d.ts");
      await writeFile(outputDtsWithThing, dts);
    }
  }
  return {
    name: "generate",
    async load(id): Promise<LoadResult> {
      if (!matcher(id)) {
        return null;
      }
      const result = await transform.call(this, id);
      if (emitDts) {
        await generateAndWriteDts.call(this, stripQueryArgs(id), result);
      }
      return {
        code: result,
        meta: {
          [PLUGIN_NAME]: SYM_TRANSPILE,
        },
      };
    },
  };
}

export default generate;
