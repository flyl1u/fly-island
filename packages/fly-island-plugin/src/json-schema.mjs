// A small JSON Schema checker for the keywords plugins/schema/manifest.schema.json
// uses (type, required, properties, additionalProperties, enum, const, pattern,
// min/maxLength, minimum/maximum, min/maxItems, items, oneOf, anyOf, $ref to
// #/$defs). Kept here so the CLI needs no dependencies.

const typeOf = (value) => {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  return typeof value;
};

const matchesType = (value, type) => {
  const actual = typeOf(value);
  return actual === type || (type === "number" && actual === "integer");
};

const pointer = (path) => (path === "" ? "(root)" : path);

function resolve(root, schema) {
  if (typeof schema.$ref !== "string") return schema;
  const match = /^#\/\$defs\/(.+)$/.exec(schema.$ref);
  const target = match ? root.$defs?.[match[1]] : undefined;
  if (!target) throw new Error(`Unsupported $ref ${schema.$ref}`);
  return target;
}

function check(root, schemaIn, value, path, errors) {
  const schema = resolve(root, schemaIn);
  const fail = (message) => errors.push({ path: pointer(path), message });
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((type) => matchesType(value, type))) {
      fail(`must be ${types.join(" or ")}, not ${typeOf(value)}`);
      return;
    }
  }
  if ("const" in schema && value !== schema.const) fail(`must be ${JSON.stringify(schema.const)}`);
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    const shown = schema.enum.length > 12 ? `one of the ${schema.enum.length} allowed values` : `one of ${schema.enum.map((item) => JSON.stringify(item)).join(", ")}`;
    fail(`must be ${shown}, not ${JSON.stringify(value)}`);
  }
  if (typeof value === "string") {
    if (schema.minLength !== undefined && [...value].length < schema.minLength) fail(`must have at least ${schema.minLength} characters`);
    if (schema.maxLength !== undefined && [...value].length > schema.maxLength) fail(`must have at most ${schema.maxLength} characters`);
    if (schema.pattern !== undefined && !new RegExp(schema.pattern, "u").test(value)) fail(`must match ${schema.pattern}`);
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) fail(`must be at least ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) fail(`must be at most ${schema.maximum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) fail(`must have at least ${schema.minItems} items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) fail(`must have at most ${schema.maxItems} items`);
    if (schema.items) value.forEach((item, index) => check(root, schema.items, item, `${path}[${index}]`, errors));
  }
  if (typeOf(value) === "object") {
    for (const key of schema.required ?? []) {
      if (!(key in value)) fail(`is missing "${key}"`);
    }
    const properties = schema.properties ?? {};
    for (const [key, item] of Object.entries(value)) {
      const childPath = `${path}.${key}`.replace(/^\./, "");
      if (key in properties) check(root, properties[key], item, childPath, errors);
      else if (schema.additionalProperties === false) errors.push({ path: pointer(childPath), message: "is not allowed here" });
    }
  }
  for (const keyword of ["oneOf", "anyOf"]) {
    if (!Array.isArray(schema[keyword])) continue;
    const results = schema[keyword].map((option) => {
      const optionErrors = [];
      check(root, option, value, path, optionErrors);
      return optionErrors;
    });
    const passing = results.filter((list) => list.length === 0).length;
    if (keyword === "oneOf" ? passing !== 1 : passing === 0) {
      // Report the closest option, which is usually the one the author meant.
      const closest = results.reduce((best, list) => (list.length < best.length ? list : best), results[0] ?? []);
      if (passing > 1 || closest.length === 0) fail("matches more than one allowed form");
      else errors.push(...closest);
    }
  }
}

/** Checks `value` against `schema`; returns [{ path, message }], empty when it is valid. */
export function validateSchema(schema, value) {
  const errors = [];
  check(schema, schema, value, "", errors);
  return errors;
}
