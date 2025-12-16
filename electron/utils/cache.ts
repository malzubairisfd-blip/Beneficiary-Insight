import path from "path";
import fs from "fs/promises";
import { app } from "electron";

const CACHE_DIR_NAME = "beneficiary-cache";

export async function ensureCacheDir() {
  const base = app.getPath("userData");
  const dir = path.join(base, CACHE_DIR_NAME);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function cacheDirPath() {
  const base = app.getPath("userData");
  return path.join(base, CACHE_DIR_NAME);
}

export async function writeCacheFile(cacheId: string, payload: any) {
  const dir = await cacheDirPath();
  const file = path.join(dir, `${cacheId}.json`);
  await fs.writeFile(file, JSON.stringify(payload, null, 2), "utf8");
  return file;
}

export async function readCacheFile(cacheId: string) {
  const dir = await cacheDirPath();
  const file = path.join(dir, `${cacheId}.json`);
  const raw = await fs.readFile(file, "utf8");
  return JSON.parse(raw);
}
