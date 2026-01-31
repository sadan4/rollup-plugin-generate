import { createFilter, makeLegalIdentifier, type FilterPattern } from "@rollup/pluginutils";
import type { LoadResult, Plugin, PluginContext, ResolveIdResult, SourceDescription } from "rollup";
import { basename, join, dirname, resolve } from "node:path";
import * as esbuild from "esbuild";
import { mkdtemp, stat, readFile, unlink, writeFile } from "node:fs/promises"
import { ensureDir, exists } from "fs-extra";
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
   * the path of the cache folder, relative to the project root
   *
   * @default "node_modules/.rollup-plugin-generate-cache"
   */
  cachePath?: string;

   // * verify: load the cached files right away, and generate a new copy. if they differ, print a warning and trigger a rebuild.
  /**
   * cache strategy for generated content
   *
   * filesystem: load the files and assume they are correct.
   * NOTE: this mode will not trigger rebuilds for any files that the generator watches (changes to the generator itself will be tracked)
   * 
   * off: disable caching
   */
  cache?: {
    /**
     * @default "filesystem"
     */
    watch?: "filesystem" | "off";
    /**
     * @default "off"
     */
    build?: "filesystem" | "off";
  };
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

export interface EmitChunkArgs extends Omit<EmitFileArgs, "hasSideEffects"> {

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
  emitChunk(args: EmitChunkArgs): string;
  /**
   * Starts the debugger, then spins;
   */
  inspectBrk(): void;
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

const CURRENT_VERSION = 3;

export function generate({
  exclude,
  esbuildOptions: _esbuildOptions = {},
  emitDts = true,
  dtsBanner = "/* eslint-disable */",
  cachePath = join("node_modules", ".rollup-plugin-generate-cache"),
  cache: { watch: watchCacheMode = "filesystem", build: buildCacheMode = "off" } = {},
}: GenerateOptions = {}): Plugin<GenerateOptions>[] {
  const matcher = createFilter(INCLUDE_REGEX, exclude);
  const virtualFiles: VirtualFileManager = new VirtualFileManager();
  function _emitFile(args: EmitFileArgs, normalizedId: string): string {
    const refId = virtualFiles.register(args, normalizedId);
    return refId;
  }
  function _emitChunk(args: EmitChunkArgs, ctx: PluginContext, normalizedId: string): string {
    const ref = virtualFiles.register(args, normalizedId);
    const file = virtualFiles.files.get(ref)!;
    const refId = ctx.emitFile({
      type: "chunk",
      id: ref,
      importer: normalizedId,
      name: args.nameHint,
    })
    virtualFiles.registerEmitFile(refId, {
      ...file,
      ref: refId,
    });
    return refId;
  }
  // files in this list have been loaded from the cache already and should be generated the next time they are requested
  const usedCacheFiles = new Set<string>();
  let resolvedCacheDirBase: string;
  let cacheMode: (GenerateOptions["cache"] & {})[keyof (GenerateOptions["cache"] & {})] & {};
  function getBuildOptions(
    id: string,
  ): Promise<esbuild.BuildOptions> | esbuild.BuildOptions {
    if (typeof _esbuildOptions === "object") {
      return _esbuildOptions ?? {};
    } else {
      return _esbuildOptions(id);
    }
  }
  // TODO: store previously generated watched files in cache
  async function transform(ctx: PluginContext, id: string): Promise<[{ fromCache: boolean; }, SourceDescription]> {
    interface CachedEmitFile extends EmitFileArgs {
      refId: string;
      entryType: "file";
    }
    interface CachedEmitChunk extends EmitChunkArgs {
      refId: string;
      entryType: "chunk";
    }
    type CachedEmitEntry = CachedEmitFile | CachedEmitChunk;
    interface CacheFile {
      version: number;
      code: string;
      moduleSideEffects: SourceDescription["moduleSideEffects"];
      emitEntries: CachedEmitEntry[];
    }
    const tempDir = await mkdtemp(
      join(tmpdir(), `rollup-plugin-${PLUGIN_NAME}.`),
    );
    const { watchMode } = ctx.meta;
    const filename = basename(id);
    const dir = dirname(id);
    const outfile = join(tempDir, "file.cjs");
    const providedOptions = await getBuildOptions(id);
    const normalizedId = stripQueryArgs(id);
    const cacheFilePath = join(resolvedCacheDirBase, `${makeLegalIdentifier(normalizedId)}.json`);
    const usedCacheAlready = usedCacheFiles.has(cacheFilePath);
    using _ = defer(() => {
      usedCacheFiles.add(cacheFilePath);
    });
    if (watchMode) {
      // we want to watch the generator input file regardless of the input mode
      ctx.addWatchFile(normalizedId);
    } else if (usedCacheAlready) {
      ctx.error("bug: usedCacheFiles should be empty in build mode");
    }
    if (cacheMode === "filesystem") {
      if (await exists(cacheFilePath)) {
        if (!(await stat(cacheFilePath)).isFile()) {
          ctx.error(`cache file path ${cacheFilePath} is not a file`);
        }
        const content = JSON.parse(await readFile(cacheFilePath, "utf8")) as CacheFile;
        // Version mismatch, delete and regenerate
        if (content.version !== CURRENT_VERSION) {
          ctx.warn(`cache file version mismatch for ${cacheFilePath}, removing`);
          await unlink(cacheFilePath);
        } else {
          ctx.debug(`cache hit for ${id} at ${cacheFilePath}`);
          type Old = string;
          type New = string;
          const refIdMap = new Map<Old, New>();
          // register the original emit files/chunks
          // they need to be registered in the order that they were create 
          // so later emit entries can reference earlier ones
          const { length } = content.emitEntries;

          for (let i = 0; i < length;) {
            const { entryType, refId, ...args } = content.emitEntries[i]!;
            const newRefId = entryType === "file"
              ? _emitFile(args as EmitFileArgs, normalizedId)
              : _emitChunk(args as EmitChunkArgs, ctx, normalizedId);

            refIdMap.set(refId, newRefId);

            for (let j = ++i; j < length; ++j) {
              const e = content.emitEntries[j]!;
              for (const [oldRef, newRef] of refIdMap) {
                // Function in replaceAll to avoid issues with `$$` -> `$`
                e.content = e.content.replaceAll(oldRef, () => newRef);
              }
            }
          }

          for (const [oldRef, newRef] of refIdMap) {
            // Function in replaceAll to avoid issues with `$$` -> `$`
            content.code = content.code.replaceAll(oldRef, () => newRef);
          }

          return [{ fromCache: true }, {
            code: content.code,
            moduleSideEffects: content.moduleSideEffects,
          }]
        }
      } else {
        ctx.debug(`cache miss for ${id}`)
      }
    }
    const cacheEntry: CacheFile = {
      version: CURRENT_VERSION,
      code: null!,
      moduleSideEffects: "ERROR: Not generated yet" as never,
      emitEntries: [],
    };
    const buildResult = await esbuild.build({
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
      const { metafile } = buildResult;
      if (!metafile) {
        ctx.error("ESBuild Metafile is undefined");
      }
      const { outputs } = metafile;
      for (const path of Object.keys(outputs)) {
        ctx.addWatchFile(path);
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
      ctx.warn("read the docs for the args passed to the generator function");
      ctx.error(`the generator must have a named export "generate"`);
    }
    const generatorCtx: GeneratorArgs = {
      error: (msg) => ctx.error(msg),
      warn: (msg) => ctx.warn(msg),
      info: (msg) => ctx.info(msg),
      debug: (msg) => ctx.debug(msg),
      filename,
      dirname: dir,
      watch: (path) => ctx.addWatchFile(path),
      emitFile: (args) => {
        const refId = _emitFile(args, normalizedId);
        cacheEntry.emitEntries.push({
          ...args,
          refId,
          entryType: "file",
        });
        return refId;
      },
      emitChunk: (args) => {
        const refId = _emitChunk(args, ctx, normalizedId);
        cacheEntry.emitEntries.push({
          ...args,
          refId,
          entryType: "chunk",
        });
        return refId;
      },
      inspectBrk: inspectBrk,
    };
    let transformedCode: string;
    let moduleSideEffects: SourceDescription["moduleSideEffects"] = null;
    try {
      transformedCode = await Promise.resolve(mod.generate(generatorCtx));
      if ("moduleSideEffects" in mod) {
        moduleSideEffects = (mod as any).moduleSideEffects;
      }
    } catch (e) {
      throw new Error(`Failed to generate module ${id}`, { cause: e });
    }

    cacheEntry.code = transformedCode;
    cacheEntry.moduleSideEffects = moduleSideEffects;

    if (cacheMode === "filesystem") {
      await writeFile(cacheFilePath, JSON.stringify(cacheEntry), "utf8");
    }
    return [{ fromCache: false }, {
      code: transformedCode,
      moduleSideEffects,
    }]
  }
  return [{
    name: PLUGIN_NAME,
    buildStart() {
      usedCacheFiles.clear();
      const { watchMode } = this.meta;
      const cacheSubFolder = watchMode ? "watch" : "build";
      resolvedCacheDirBase = resolve(
        cachePath,
        cacheSubFolder,
      )
      cacheMode = watchMode ? watchCacheMode : buildCacheMode;
      return ensureDir(resolvedCacheDirBase)
    },
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
    // vite passes an object with options that has ssr
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
        const [{fromCache}, sourceDesc] = await transform(this, resolvedId);
        if (emitDts && !fromCache) {
          await generateAndWriteDts.call(
            this,
            stripQueryArgs(resolvedId),
            sourceDesc.code,
            virtualFiles,
            dtsBanner
          );
        }
        return sourceDesc;
      } catch (e) {
        this.error(e);
      }
    },
  },
  {
    name: `${PLUGIN_NAME}:virtual-files`,
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

function inspectBrk(): void {
  process.kill(process.pid, "SIGUSR1");
  let spinning = true;

  function stopSpinning() {
    spinning = false;
  }

  while (spinning) {
    if (!(Math.random() || Math.random())) {
      stopSpinning();
    }
  }
}

function defer(f: () => void): Disposable {
  return {
    [Symbol.dispose]() {
      f();
    }
  }
}

export default generate;
