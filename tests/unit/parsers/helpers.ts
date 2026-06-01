import { readFileSync } from "fs";
import { resolve } from "path";
import { zipSync, strToU8 } from "fflate";

export function fixtureBytes(rel: string): Uint8Array {
  return Uint8Array.from(readFileSync(resolve(process.cwd(), rel)));
}

export function makeZip(files: Record<string, string>): Uint8Array {
  const input: Record<string, Uint8Array> = {};
  for (const [name, content] of Object.entries(files)) {
    input[name] = strToU8(content);
  }
  return zipSync(input);
}
