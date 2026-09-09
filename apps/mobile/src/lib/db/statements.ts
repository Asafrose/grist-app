import type { Db } from "./index";

type NativeStatement = { finalizeSync?: () => void };

type PreparedQuery = Record<string, unknown> & { stmt?: NativeStatement };

type Session = Record<PrepareMethod, (...args: unknown[]) => PreparedQuery>;

type PrepareMethod = "prepareQuery" | "prepareOneTimeQuery";

const PREPARE_METHODS = ["prepareQuery", "prepareOneTimeQuery"] as const;

const EXECUTE_METHODS = ["run", "all", "get", "values"] as const;

const wrapped = new WeakSet<PreparedQuery>();

function wrapPrepared(query: PreparedQuery): PreparedQuery {
  if (wrapped.has(query)) return query;
  wrapped.add(query);
  let finalized = false;
  const finalize = () => {
    if (finalized) return;
    finalized = true;
    query.stmt?.finalizeSync?.();
  };
  for (const method of EXECUTE_METHODS) {
    const execute = query[method];
    if (typeof execute !== "function") continue;
    query[method] = (...args: unknown[]) => {
      try {
        return (execute as (...a: unknown[]) => unknown).apply(query, args);
      } finally {
        finalize();
      }
    };
  }
  return query;
}

export function finalizeStatementsAfterExecute<T extends Db>(db: T): T {
  const session = (db as unknown as { session: Session }).session;
  for (const method of PREPARE_METHODS) {
    const prepare = session[method].bind(session);
    session[method] = (...args: unknown[]) => wrapPrepared(prepare(...args));
  }
  return db;
}
