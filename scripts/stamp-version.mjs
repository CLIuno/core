// Keep every version marker in sync with package.json:
//   - `metadata.version` in each packaged SKILL.md (so `cliuno skills status` can detect stale copies)
//   - `version` in .claude-plugin/plugin.json (the Claude Code plugin manifest)
// Runs on `pnpm build` (prebuild) and after `changeset version`.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { version } = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

const skillsDir = path.join(root, "skills");
for (const name of fs.readdirSync(skillsDir)) {
    const file = path.join(skillsDir, name, "SKILL.md");
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    const end = text.indexOf("\n---", 3);
    if (!text.startsWith("---") || end === -1) throw new Error(`${file}: missing frontmatter`);
    let front = text.slice(0, end);
    const body = text.slice(end);
    if (/^metadata:\s*$/m.test(front)) {
        front = /^\s+version:/m.test(front)
            ? front.replace(/^(\s+version:\s*).*$/m, `$1${version}`)
            : front.replace(/^metadata:\s*$/m, `metadata:\n  version: ${version}`);
    } else {
        front = `${front}\nmetadata:\n  version: ${version}`;
    }
    const next = front + body;
    if (next !== text) {
        fs.writeFileSync(file, next);
        console.log(`stamped ${name} → ${version}`);
    }
}

const pluginFile = path.join(root, ".claude-plugin", "plugin.json");
const plugin = JSON.parse(fs.readFileSync(pluginFile, "utf8"));
if (plugin.version !== version) {
    const next = { name: plugin.name, version, ...plugin };
    next.version = version;
    fs.writeFileSync(pluginFile, `${JSON.stringify(next, null, 4)}\n`);
    console.log(`stamped plugin.json → ${version}`);
}
