import esbuild from "esbuild";
import process from "process";
import { copyFileSync } from "fs";
import builtins from "builtin-modules";

const prod = process.argv[2] === "production";

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/*",
    "@lezer/*",
    ...builtins,
  ],
  format: "cjs",
  target: "es2021",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
});

if (prod) {
  await context.rebuild();
  // Copy styles.css to root for Obsidian/BRAT compatibility
  copyFileSync("styles/styles.css", "styles.css");
  process.exit(0);
} else {
  await context.watch();
}
