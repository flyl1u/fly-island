import type { LocalApiResponse } from "./api";

export type LocalApiHandler = (params: unknown) => LocalApiResponse | Promise<LocalApiResponse>;
/** Handlers keyed by method name, e.g. `todos.add`. Supplied by the features that own the data. */
export type LocalApiHandlers = Record<string, LocalApiHandler>;

/** Runs one request; never throws, so the native side always gets an answer. */
export async function dispatchLocalApiRequest(
  handlers: LocalApiHandlers,
  method: string,
  params: unknown,
): Promise<LocalApiResponse> {
  const handler = Object.prototype.hasOwnProperty.call(handlers, method) ? handlers[method] : undefined;

  if (!handler) {
    return { ok: false, status: 404, error: `Unknown method "${method}".` };
  }

  try {
    return await handler(params);
  } catch (error) {
    return {
      ok: false,
      status: 500,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
