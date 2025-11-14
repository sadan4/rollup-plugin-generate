import type { PluginContext, ResolveIdResult } from "rollup";
import type { VirtualFileManager } from ".";
import { normalize, resolve } from "path";
import { writeFile } from "fs/promises";
let ts: typeof import("typescript");
export async function generateDtsViaRollup(
    ctx: PluginContext,
    input: string,
    rootDts: string,
    virtualFiles: VirtualFileManager,
): Promise<string> {
    const {rollup} = await import("rollup");
    const {dts} = await import("rollup-plugin-dts");
    const reverseMap = virtualFiles.reverseMap();
	function _readFile(
		path: string,
		options?: { encoding?: null; flag?: string | number; signal?: AbortSignal }
	): Promise<Uint8Array>;
	function _readFile(
		path: string,
		options?: { encoding: BufferEncoding; flag?: string | number; signal?: AbortSignal }
	): Promise<string>;
	function _readFile(
		path: string,
		options?: { encoding?: BufferEncoding | null; flag?: string | number; signal?: AbortSignal }
	): Promise<string | Uint8Array> {
        const resolvedPath = resolve(path);
        if (resolvedPath === resolve(input)) {
            return resolveString(rootDts);
        } else if (reverseMap.has(resolvedPath)) {
            const ref = reverseMap.get(resolvedPath)!;
            const content = virtualFiles.refToContent(ref);
            return resolveString(content);
        }
        return ctx.fs.readFile(path, options as any);
        function resolveString(code: string): Promise<string | Uint8Array> {
            if (options?.encoding) {
                return Promise.resolve(code);
            } else {
                const arr: Uint8Array = Buffer.from(code);
                return Promise.resolve(arr);
            }
        }
    }
    const tsconfigPaths = virtualFiles.tsconfigPaths();
    const bundle = await rollup({
        fs: {
            ...ctx.fs,
            readFile: _readFile,
        },
        input,
        plugins: [
            {
                name: "rollup-plugin-generate:virtual-dts-bundler",
                resolveId(source, importer, options): ResolveIdResult {
                    if (source === input) {
                        return source;
                    }
                    if (!importer || options.isEntry) {
                        return;
                    }
                    if (source in tsconfigPaths) {
                        const [target] = tsconfigPaths[source]!;
                        return {
                            id: target!,
                            external: false,
                        }
                    }
                },
                load(id) {
                    if (id === input) {
                        return rootDts;
                    }
                    if (reverseMap.has(id)) {
                        const ref = reverseMap.get(id)!;
                        const content = virtualFiles.refToContent(ref);
                        return content;
                    }
                }
            },
            dts(),
        ]
    });
    const {output} = await bundle.generate({
    });
    if (output.length !== 1) {
        ctx.error("failed to generate .d.ts bundle for generated file");
    }
    const [{code}] = output;
    return code;
}
export async function generateAndWriteDts(
  this: PluginContext,
  id: string,
  code: string,
  virtualFiles: VirtualFileManager
) {
    try {
        ts ??= await import("typescript");
        let generatedDts = generateDtsNoBundle(this, id, code, virtualFiles);
        if (virtualFiles.hasGeneratedFiles(id)) {
            const dtsInputPath = normalize(id.replace(/\.[mc]?[jt]sx?$/, ".d.ts"));
            generatedDts = await generateDtsViaRollup(this, dtsInputPath, generatedDts, virtualFiles);
        }
        const dtsOutputPath = id.replace(/\.[mc]?[jt]sx?$/, "&gen.d.ts");
        await writeFile(dtsOutputPath, generatedDts);
    } catch (e) {
        this.error(e);
    }
    return;
}

function generateDtsNoBundle(ctx: PluginContext, id: string, code: string, virtualFiles: VirtualFileManager) {
    const host = ts.createCompilerHost({
        declaration: true,
        emitDeclarationOnly: true,
    });
    const vfs = new Map<string, string>();
    const origRead = host.readFile;
    const origExists = host.fileExists;
    const reverseMap = virtualFiles.reverseMap();
    host.fileExists = (fileName) => {
        if (reverseMap.has(normalize(fileName))) {
            return true;
        }
        return origExists(fileName);
    }
    host.readFile = (fileName) => {
        if (normalize(fileName) === normalize(id)) {
            return code;
        } else if (reverseMap.has(normalize(fileName))) {
            const ref = reverseMap.get(normalize(fileName))!;
            return virtualFiles.refToContent(ref);
        } else {
            return origRead(fileName);
        }
    }
    host.writeFile = (fileName, contents) => {
        vfs.set(normalize(fileName), contents);
    }
    const program = ts.createProgram(
        [id],
        {
            declaration: true,
            emitDeclarationOnly: true,
            paths: virtualFiles.tsconfigPaths(),
            traceResolution: true,
        },
        host,
    );
    program.emit();
    const outputDtsPath = normalize(id.replace(/\.[mc]?[jt]sx?$/, ".d.ts"));
    const dts = vfs.get(outputDtsPath);
    if (!dts) {
        ctx.warn("failed to generate .d.ts file");
        return "";
    } else {
        // const outputDtsPath = id.replace(/\.[mc]?[jt]sx?$/, "&gen.d.ts");
        return dts;
    }
}