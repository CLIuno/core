import { defineConfig } from "tsup";

export default defineConfig({
    format: ["esm"],
    entry: ["./src/app.ts"],
    dts: true,
    shims: true,
    skipNodeModulesBundle: true,
    sourcemap: true,
    clean: true,
});
