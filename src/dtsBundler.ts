import type { PluginContext, ResolveIdResult } from "rollup";
import type { VirtualFileManager } from ".";
import { normalize } from "node:path";
import { writeFile } from "node:fs/promises";
import type { CompilerHost } from "typescript";

interface DTSBundle {
    entry: string;
    files: Map<string, string>;
    aliases: Map<string, string>;
}

async function generateDtsViaRollup(
    ctx: PluginContext,
    {entry, files, aliases}: DTSBundle,
): Promise<string> {
    const {rollup} = await import("rollup");
    const {dts} = await import("rollup-plugin-dts");
    const bundle = await rollup({
        fs: {
            ...ctx.fs,
        },
        input: entry,
        plugins: [
            {
                name: "rollup-plugin-generate:virtual-dts-resolver",
                async resolveId(source, importer, options): Promise<ResolveIdResult> {
                    if (source === entry) {
                        return source;
                    }
                    if (!importer || options.isEntry) {
                        return;
                    }
                    if (aliases.has(source)) {
                        const resolved = aliases.get(source)!;
                        return {
                            id: resolved,
                            external: false,
                        }
                    } else {
                        const resolvedResult = await this.resolve(source, importer, { skipSelf: true, ...options });
                        if (resolvedResult) {
                            return {
                                ...resolvedResult,
                                external: "relative",
                            }
                        }
                    }
                },
                load(id) {
                    if (files.has(id)) {
                        return files.get(id)!;
                    }
                    this.error(`trying to load non-virtual file during dts bundle ${id}`)
                }
            },
            dts(),
        ]
    });
    const {output} = await bundle.generate({});
    if (output.length !== 1) {
        ctx.error("failed to generate .d.ts bundle for generated file");
    }
    const [{code}] = output;
    return code;
}
/**
 * @internal
 */
export async function generateAndWriteDts(
  this: PluginContext,
  id: string,
  code: string,
  virtualFiles: VirtualFileManager,
  banner: string = "",
) {
    try {
        let generatedFs = await generateDtsNoBundle(this, id, code, virtualFiles);
        const mainDtsPath = pathToDtsPath(id);
        let result: string = "";
        if (!virtualFiles.hasGeneratedFiles(id)) {
            result = generatedFs.get(mainDtsPath) ?? "";
        } else {
            result = await generateDtsViaRollup(this, {
                    entry: mainDtsPath,
                    files: generatedFs,
                    aliases: new Map(
                        Array.from(virtualFiles.files.entries())
                            .map(([ref, {id}]) => {
                                return [ref, pathToDtsPath(normalize(id))];
                            })
                    ),
                });
        }
        const dtsOutputPath = id.replace(/\.[mc]?[jt]sx?$/, "&gen.d.ts");
        if (banner) {
            result = `${banner}\n${result}`;
        }
        await writeFile(dtsOutputPath, result);
    } catch (e) {
        this.error(e);
    }
}

async function generateDtsNoBundle(ctx: PluginContext, id: string, code: string, virtualFiles: VirtualFileManager) {
    const ts = await import("typescript");
    const host = ts.createCompilerHost({
        declaration: true,
        emitDeclarationOnly: true,
    });
    const vfs = setupHostVFS(host);
    for (const [fileName, ref] of virtualFiles.reverseMap()) {
        const content = virtualFiles.refToContent(ref);
        vfs.set(fileName, content);
    }
    vfs.set(normalize(id), code);
    const program = ts.createProgram(
        [id],
        {
            declaration: true,
            emitDeclarationOnly: true,
            paths: virtualFiles.tsconfigPaths(),
        },
        host,
    );
    program.emit();
    return vfs;
}

function pathToDtsPath(path: string) {
    return path.replace(/\.[mc]?[jt]sx?$/, ".d.ts");
}

function setupHostVFS(host: CompilerHost, fallbackToSystem = true): Map<string, string> {
    const vfs = new Map<string, string>();
    const originalReadFile = host.readFile;
    const originalFileExists = host.fileExists;
    host.writeFile = (fileName, contents) => {
        vfs.set(normalize(fileName), contents);
    }
    host.readFile = (fileName) => {
        const n = normalize(fileName);
        if (vfs.has(n)) {
            return vfs.get(n);
        } else if (fallbackToSystem) {
            return originalReadFile(fileName);
        }
    }
    host.fileExists = (fileName) => {
        return vfs.has(normalize(fileName)) || (fallbackToSystem && originalFileExists(fileName));
    }
    return vfs;
}