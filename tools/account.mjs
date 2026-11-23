import { spawnSync } from "node:child_process";
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const [username, ...options] = process.argv.slice(2);
if (
  !/^[a-z][a-z0-9-]{0,31}$/.test(username ?? "") ||
  options.some(
    (option) => option !== "--stdin" && !option.startsWith("--env-file="),
  )
) {
  console.error(
    "Usage: npm run account -- USERNAME [--stdin] [--env-file=NEW_FILE]",
  );
  process.exit(1);
}

const supplied = options.includes("--stdin");
if (!supplied && !process.stdout.isTTY)
  throw new Error("Use --stdin when running unattended.");
let password;
if (supplied) {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  password = Buffer.concat(chunks)
    .toString("utf8")
    .replace(/\r?\n$/, "");
  if (password.length < 16 || password.length > 256)
    throw new Error("Use 16–256 characters.");
} else {
  password = randomBytes(24).toString("base64url");
}

const salt = randomBytes(16);
const digest = pbkdf2Sync(password, salt, 100_000, 32, "sha256");
const record = [
  "v1",
  salt.toString("hex"),
  digest.toString("hex"),
  randomBytes(32).toString("hex"),
].join(".");
const name = `BOOKSHELF_USER_${username.toUpperCase().replaceAll("-", "_")}`;
const output = options.find((option) => option.startsWith("--env-file="));
if (output) {
  writeFileSync(output.slice("--env-file=".length), `${name}=${record}\n`, {
    mode: 0o600,
    flag: "wx",
  });
} else {
  const cwd = fileURLToPath(new URL("../apps/bookshelf/", import.meta.url));
  const resolver = createRequire(path.join(cwd, "package.json"));
  const manifest = resolver.resolve("wrangler/package.json");
  const cli = path.resolve(
    path.dirname(manifest),
    resolver(manifest).bin.wrangler,
  );
  const child = spawnSync(process.execPath, [cli, "secret", "put", name], {
    cwd,
    input: record,
    stdio: ["pipe", "inherit", "inherit"],
  });
  if (child.error) throw child.error;
  if (child.status !== 0) process.exit(child.status ?? 1);
}
if (!supplied)
  console.log(
    `Save this generated password for ${username} in your password manager:\n${password}`,
  );
