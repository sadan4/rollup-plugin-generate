import { createFilter, type FilterPattern } from "@rollup/pluginutils";
import type { LoadResult, Plugin, PluginContext, PluginImpl } from "rollup";
import { basename, join, dirname } from "node:path";
import * as esbuild from "esbuild";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

export interface GenerateOptions {
  /**
   * if true, emit a generated .d.ts file **in the same tree as the source file** for the generated result
   * @default true
   */
  emitDts?: boolean;
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

const INCLUDE_REGEX = /\.gen\.[mc]?[jt]sx?(?:[&?].+?)?$/;

function stripQueryArgs(path: string): string {
  return path.replace(/[?&][^.]*$/, "");
}

const PLUGIN_NAME = "generate";
const SYM_TRANSPILE = Symbol();
const SYM_PATH_KEY = `@@rollup-plugin-${PLUGIN_NAME}-path-key`;

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
  esbuildOptions: _esbuildOptions = {},
  emitDts = true,
}: GenerateOptions = {}): Plugin<GenerateOptions> {
  const matcher = createFilter(INCLUDE_REGEX, exclude);
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
    const tempDir = await mkdtemp(
      join(tmpdir(), `rollup-plugin-${PLUGIN_NAME}.`),
    );
    const { watchMode } = this.meta;
    const filename = basename(id);
    const dir = dirname(id);
    const outfile = join(tempDir, "file.cjs");
    const providedOptions = await getBuildOptions(id);
    const normalizedId = stripQueryArgs(id);
    const result = await esbuild.build({
      ...providedOptions,
      entryPoints: [normalizedId],
      outfile,
      bundle: true,
      minify: false,
      format: "cjs",
      platform: "node",
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
    let requireUrl =
      process.platform === "win32" ? pathToFileURL(outfile).href : outfile;
    let mod = (await import(outfile)) as GeneratorModule;
    // try to unwrap cjs default export
    if (Object.keys(mod).length === 1 && "default" in mod) {
      mod = (mod as any).default;
    }
    if (
      !mod ||
      !Object.hasOwn(mod, "generate") ||
      typeof mod.generate !== "function"
    ) {
      this.warn("read the docs for the args passed to the generator function");
      this.error(`the generator must have a named export "generate"`);
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
      transformedCode = await Promise.resolve(mod.generate(opts));
    } catch (e) {
      throw new Error(`Failed to generate module ${id}`, { cause: e });
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
    };
    const program = ts.createProgram(
      [id],
      {
        declaration: true,
        emitDeclarationOnly: true,
      },
      host,
    );
    program.emit();
    const outputDts = id.replace(/\.[mc]?[jt]sx?$/, ".d.ts");
    const dts = outputFiles.get(outputDts);
    if (!dts) {
      this.warn("failed to generate .d.ts file");
      return;
    } else {
      const outputDtsWithThing = id.replace(/\.[mc]?[jt]sx?$/, "&gen.d.ts");
      await writeFile(outputDtsWithThing, dts);
    }
  }
  return {
    name: "generate",
    async resolveId(source, importer, options) {
      try {
        const strippedSource = stripQueryArgs(source);
        const stripped = (await this.resolve(strippedSource, importer, options))
          ?.id;
        if (!stripped) {
          return null;
        }
        let resolvedSource = source;
        if (stripped?.match(/\.[^?/\\.&]+$/)) {
          resolvedSource = stripped + source.slice(strippedSource.length);
        }
        if (!matcher(resolvedSource)) {
          return null;
        }
        return {
          id: stripped,
          meta: {
            [PLUGIN_NAME]: SYM_TRANSPILE,
            [SYM_PATH_KEY]: resolvedSource,
          },
        };
      } catch (e) {
        this.error(e);
      }
    },
    async load(id): Promise<LoadResult> {
      try {
        const meta = this.getModuleInfo(id)?.meta;
        if (meta?.[PLUGIN_NAME] !== SYM_TRANSPILE) {
          return null;
        }
        const resolvedId = meta?.[SYM_PATH_KEY];
        if (!resolvedId) {
          this.error(`missing resolved id`);
        }
        const result = await transform.call(this, resolvedId);
        if (emitDts) {
          await generateAndWriteDts.call(
            this,
            stripQueryArgs(resolvedId),
            result,
          );
        }
        return {
          code: result,
        };
      } catch (e) {
        this.error(e);
      }
    },
  };
}

export default generate;
