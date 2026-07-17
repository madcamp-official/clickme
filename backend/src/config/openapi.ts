import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import YAML from "yaml";

export const openApiDocument = YAML.parse(
  readFileSync(resolve(process.cwd(), "docs/openapi.yaml"), "utf8")
) as Record<string, unknown>;
