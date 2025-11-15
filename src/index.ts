import { createFilter, type FilterPattern } from "@rollup/pluginutils";
import type { LoadResult, Plugin, PluginContext, ResolveIdResult, SourceDescription } from "rollup";
import { basename, join, dirname } from "node:path";
import * as esbuild from "esbuild";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { generateAndWriteDts } from "./dtsBundler";
import { customAlphabet } from "nanoid/non-secure";

const makeRandomId = customAlphabet("abcdefghijklmnopqrstuvwxyz_$", 10);

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
   * Banner to add to the top of generated .d.ts files
   * @default /* eslint-disable *\/
   */
  dtsBanner?: string;
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
const SYM_VIRTUAL = Symbol();
const SYM_PATH_KEY = `@@rollup-plugin-${PLUGIN_NAME}-path-key`;
const SYM_VIRTUAL_KEY = `@@rollup-plugin-${PLUGIN_NAME}-virtual-key`;

export interface EmitFileArgs {
  /**
   * without the leading .
   * @default ts
   */
  extension?: string;
  /**
   * @default ""
   */
  nameHint?: string;
  /**
   */
  hasSideEffects?: SourceDescription["moduleSideEffects"];
  /**
   * content of virtual file
   */
  content: string;
}

/**
 * @internal
 */
export interface NormalizedEmittedFile {
  id: string;
  content: string;
  referenceId: string;
  ref: string;
  hasSideEffects?: SourceDescription["moduleSideEffects"];
}

export interface GeneratorArgs {
  watch(path: string): void;
  dirname: string;
  filename: string;
  error(msg: string | Error): never;
  warn(msg: string): void;
  info(msg: string): void;
  debug(msg: string): void;
  /**
   * @returns a unique import specifier that references this file
   */
  emitFile(args: EmitFileArgs): string;
  emitChunk(args: Omit<EmitFileArgs, "hasSideEffects">): string;
}

export interface GeneratorModule {
  generate(args: GeneratorArgs): Promise<string> | string;
}

/**
 * export this from your generator module to set the moduleSideEffects of the generated module
 * @default null
 */
export type GeneratorExportModuleSideEffects = SourceDescription["moduleSideEffects"];

/**
 * @internal
 */
export class VirtualFileManager {
  private _files = new Map<string, NormalizedEmittedFile>();
  public get files(): ReadonlyMap<string, NormalizedEmittedFile> {
    return this._files;
  }
  public constructor() { }
  public register({ extension = "ts", nameHint = "", ...rest }: EmitFileArgs, id: string): string {
    const baseDir = dirname(id);
    const ref = makeRandomId();
    const name = `${ref}${nameHint ? `_${nameHint}` : ""}.${extension}`;
    this._files.set(ref, {
      ...rest,
      id: join(baseDir, name),
      referenceId: id,
      ref,
    });
    return ref;
  }
  public registerEmitFile(ref: string, file: NormalizedEmittedFile) {
    this._files.set(ref, file);
  }
  public isVirtualFile(ref: any): boolean {
    return this._files.has(ref);
  }
  public resolveVirtualFile(ctx: PluginContext, ref: string): ResolveIdResult {
    if (!this._files.has(ref)) {
      ctx.error(`could not resolve virtual file with id ${ref}`);
    }
    const file = this._files.get(ref)!;
    return {
      id: file.id,
      moduleSideEffects: file.hasSideEffects ?? null,
      meta: {
        [PLUGIN_NAME]: SYM_VIRTUAL,
        [SYM_VIRTUAL_KEY]: ref,
      }
    }
  }
  public generatedFilesFromMainId(id: string): NormalizedEmittedFile[] {
    return Array.from(this._files.values())
      .filter((file) => file.referenceId === id)
  }
  public hasGeneratedFiles(id: string): boolean {
    return Array.from(this._files.values())
      .some(file => file.referenceId === id);
  }
  public shouldLoadVirtualFile(ctx: PluginContext, id: string): boolean {
    const meta = ctx.getModuleInfo(id)?.meta ?? {};
    return meta?.[PLUGIN_NAME] === SYM_VIRTUAL;
  }
  public loadVirtualFile(ctx: PluginContext, id: string): LoadResult {
    const meta = ctx.getModuleInfo(id)?.meta ?? {};
    const ref = meta?.[SYM_VIRTUAL_KEY];
    if (!this.isVirtualFile(ref)) {
      ctx.error(`could not load virtual file with id ${id}`);
    }
    const file = this._files.get(ref)!;
    return {
      code: file.content,
    };
  }
  public tsconfigPaths(): Record<string, string[]> {
    return Object.fromEntries(Array.from(this._files.entries()).map(([key, { id }]) => [key, [id]]));
  }
  public reverseMap(): Map<string, string> {
    return new Map(Array.from(this._files.entries()).map(([key, { id }]) => [id, key]));
  }
  public refToContent(ref: string) {
    if (!this._files.has(ref)) {
      throw new Error(`could not find virtual file with ref ${ref}`);
    }
    return this._files.get(ref)!.content;
  }
}

export function generate({
  exclude,
  esbuildOptions: _esbuildOptions = {},
  emitDts = true,
  dtsBanner = "/* eslint-disable */",
}: GenerateOptions = {}): Plugin<GenerateOptions>[] {
  const matcher = createFilter(INCLUDE_REGEX, exclude);
  const virtualFiles = new VirtualFileManager();
  function getBuildOptions(
    id: string,
  ): Promise<esbuild.BuildOptions> | esbuild.BuildOptions {
    if (typeof _esbuildOptions === "object") {
      return _esbuildOptions ?? {};
    } else {
      return _esbuildOptions(id);
    }
  }
  async function transform(this: PluginContext, id: string): Promise<SourceDescription> {
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
      sourcemap: "inline",
      sourceRoot: process.platform === "win32" ? "C:\\" : "/",
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
      const { outputs } = metafile;
      for (const path of Object.keys(outputs)) {
        this.addWatchFile(path);
      }
    }
    let requireUrl =
      process.platform === "win32" ? pathToFileURL(outfile).href : outfile;
    let mod = (await import(requireUrl)) as GeneratorModule;
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
      emitFile: (args) => virtualFiles.register(args, stripQueryArgs(id)),
      emitChunk: (args) => {
        const ref = virtualFiles.register(args, stripQueryArgs(id));
        const file = virtualFiles.files.get(ref)!;
        const emitRef = this.emitFile({
          type: "chunk",
          id: ref,
          importer: stripQueryArgs(id),
          name: args.nameHint,
        })
        virtualFiles.registerEmitFile(emitRef, {
          ...file,
          ref: emitRef,
        });
        return emitRef;
      }
    };
    let transformedCode: string;
    let moduleSideEffects: SourceDescription["moduleSideEffects"] = null;
    try {
      transformedCode = await Promise.resolve(mod.generate(opts));
      if ("moduleSideEffects" in mod) {
        moduleSideEffects = (mod as any).moduleSideEffects;
      }
    } catch (e) {
      throw new Error(`Failed to generate module ${id}`, { cause: e });
    }
    return {
      code: transformedCode,
      moduleSideEffects,
    }
  }
  return [{
    name: PLUGIN_NAME,
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
            result.code,
            virtualFiles,
            dtsBanner
          );
        }
        return result;
      } catch (e) {
        this.error(e);
      }
    },
  },
  {
    name: `${PLUGIN_NAME}-virtual-files`,
    resolveId(source, importer, options) {
      if (virtualFiles.isVirtualFile(source)) {
        return virtualFiles.resolveVirtualFile(this, source);
      }
    },
    load(id) {
      if (virtualFiles.shouldLoadVirtualFile(this, id)) {
        return virtualFiles.loadVirtualFile(this, id);
      }
    },
  }
  ];
}

export default generate;
