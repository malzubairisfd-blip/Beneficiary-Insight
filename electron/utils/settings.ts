import path from "path";
import fs from "fs/promises";
import { app } from "electron";

const FILE_NAME = "settings.json";
const DIR_NAME = "beneficiary-cache";

async function settingsDir() {
  const base = app.getPath("userData");
  const dir = path.join(base, DIR_NAME);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function readSettingsFile() {
  const dir = await settingsDir();
  const file = path.join(dir, FILE_NAME);
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    // return null if not found
    return null;
  }
}

export async function writeSettingsFile(settings: any) {
  const dir = await settingsDir();
  const file = path.join(dir, FILE_NAME);
  await fs.writeFile(file, JSON.stringify(settings, null, 2), "utf8");
  return file;
}
