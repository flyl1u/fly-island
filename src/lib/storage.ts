// localStorage 的安全读写。存储被禁用、配额已满或数据损坏时都不抛异常，
// 由调用方（各目录的 storage.ts）决定回退值；数据格式校验在调用方的 normalize 中完成。

/** 读取字符串；不存在或存储不可用时返回 null。 */
export function readString(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** 写入字符串；失败时返回 false，不抛异常。 */
export function writeString(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** 删除条目；失败时返回 false，不抛异常。 */
export function removeItem(key: string): boolean {
  try {
    window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

/**
 * 读取并解析 JSON。不存在、存储不可用或解析失败时返回 undefined。
 * 返回值是未经校验的 unknown，必须经过 normalize 后再使用。
 */
export function readJson(key: string): unknown {
  const stored = readString(key);
  if (stored === null) return undefined;
  try {
    return JSON.parse(stored) as unknown;
  } catch {
    return undefined;
  }
}

/** 序列化并写入 JSON；序列化或写入失败时返回 false，不抛异常。 */
export function writeJson(key: string, value: unknown): boolean {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return false;
  }
  if (serialized === undefined) return false;
  return writeString(key, serialized);
}
