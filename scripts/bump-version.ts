#!/usr/bin/env bun

/**
 * Bump Version
 *
 * Sets the app version in package.json and the Helm chart's appVersion.
 * Usage: bun run bump-version [version]
 *
 * With no argument, the version comes from the current git-flow release
 * branch (release/X.Y.Z). Chart.yaml's own `version` (the chart version) is
 * left alone.
 */

const ROOT = `${import.meta.dir}/..`;
const SEMVER = /^\d+\.\d+\.\d+$/;

function fail(message: string): never {
    console.error(`bump-version: ${message}`);
    process.exit(1);
}

function resolveVersion(arg: string | undefined): string {
    if (arg) {
        if (!SEMVER.test(arg)) fail(`"${arg}" is not a semver version (X.Y.Z)`);
        return arg;
    }

    const git = Bun.spawnSync(["git", "rev-parse", "--abbrev-ref", "HEAD"], { cwd: ROOT });
    if (git.exitCode !== 0) fail("could not read the current git branch");
    const branch = git.stdout.toString().trim();

    const match = branch.match(/^release\/(\d+\.\d+\.\d+)$/);
    if (!match) fail(`current branch "${branch}" is not a release/X.Y.Z branch; pass a version explicitly`);
    return match[1];
}

async function replaceOnce(path: string, pattern: RegExp, replacement: string): Promise<void> {
    const file = Bun.file(path);
    const text = await file.text();
    if (!pattern.test(text)) fail(`no version line found in ${path}`);
    await Bun.write(path, text.replace(pattern, replacement));
}

const version = resolveVersion(process.argv[2]);

// Only the top-level "version" field: the first line that matches the 2-space indent.
await replaceOnce(`${ROOT}/package.json`, /^(  "version": )"[^"]*"/m, `$1"${version}"`);
await replaceOnce(`${ROOT}/chart/Chart.yaml`, /^(appVersion: )"[^"]*"/m, `$1"${version}"`);

console.log(`Bumped package.json and chart/Chart.yaml appVersion to ${version}`);
