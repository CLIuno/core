import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** The `skills/` directory shipped inside the npm package (dist/ sibling) or the repo (src/skills sibling). */
export function packagedSkillsDir(): string {
    const here = path.dirname(fileURLToPath(import.meta.url));
    for (const candidate of [path.resolve(here, "../skills"), path.resolve(here, "../../skills")]) {
        if (
            fs.existsSync(path.join(candidate, "cliuno-make", "SKILL.md")) ||
            fs.existsSync(path.join(candidate, "cliuno-scaffold", "SKILL.md"))
        ) {
            return candidate;
        }
    }
    throw new Error("Packaged skills directory not found.");
}
