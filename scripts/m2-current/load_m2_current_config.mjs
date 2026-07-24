import { readFileSync } from "node:fs";
import path from "node:path";

export function loadM2CurrentConfigSync(root, relativePath, seen = new Set()) {
  const configRoot = path.resolve(root, "config");
  const absolutePath = path.resolve(root, relativePath);
  const relation = path.relative(configRoot, absolutePath);
  if (
    relation === ""
    || relation.startsWith(`..${path.sep}`)
    || path.isAbsolute(relation)
    || path.extname(absolutePath) !== ".json"
  ) {
    throw new Error("m2_current_config_path_invalid");
  }
  if (seen.has(absolutePath)) {
    throw new Error("m2_current_config_extends_cycle");
  }
  const nextSeen = new Set(seen).add(absolutePath);
  const current = JSON.parse(readFileSync(absolutePath, "utf8"));
  if (!current.extends) {
    return current;
  }
  const parent = loadM2CurrentConfigSync(
    root,
    String(current.extends),
    nextSeen
  );
  return mergeConfig(parent, current);
}

function mergeConfig(parent, child) {
  const output = { ...parent };
  for (const [key, value] of Object.entries(child)) {
    if (
      isPlainObject(value)
      && isPlainObject(parent[key])
    ) {
      output[key] = mergeConfig(parent[key], value);
    } else {
      output[key] = value;
    }
  }
  delete output.extends;
  return output;
}

function isPlainObject(value) {
  return (
    value !== null
    && typeof value === "object"
    && !Array.isArray(value)
  );
}
