import fs from 'node:fs';

const packageJsonPath = new URL('../package.json', import.meta.url);
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const bump = process.argv[2] || 'patch';
const versionMatch = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/.exec(packageJson.version);

if (!versionMatch) {
    throw new Error(`Unsupported current version: ${ packageJson.version }`);
}

const [major, minor, patch] = versionMatch.slice(1).map(value => Number.parseInt(value, 10));

if (/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(bump)) {
    packageJson.version = bump;
} else if (bump === 'major') {
    packageJson.version = `${ major + 1 }.0.0`;
} else if (bump === 'minor') {
    packageJson.version = `${ major }.${ minor + 1 }.0`;
} else if (bump === 'patch') {
    packageJson.version = `${ major }.${ minor }.${ patch + 1 }`;
} else {
    throw new Error(`Unsupported bump type: ${ bump }. Use patch, minor, major, or an exact semver version.`);
}

fs.writeFileSync(packageJsonPath, `${ JSON.stringify(packageJson, null, 2) }\n`);
console.log(`v${ packageJson.version }`);
