import type { Recording, Transcript } from "@grist/grain-api";
import page from "@grist/grain-api/fixtures/recordings.json";
import transcript from "@grist/grain-api/fixtures/transcript.json";
import type { Db } from "@/lib/db";
import { searchRecordings, searchTranscripts, setTranscript, upsertRecordings } from "@/lib/db";
import { finalizeStatementsAfterExecute } from "@/lib/db/statements";
import { testDb } from "@/test/db";

const recs = page.recordings as Recording[];
const NOW = "2026-09-06T10:00:00Z";

type Stmt = { stmt: { finalizeSync?: () => void } };

type Prepared = {
  stmt: { finalizeSync: () => void };
  run: () => string;
  all: () => string[];
  get: () => string;
  values: () => string[][];
};

function fakeDb(options: { throws?: boolean } = {}) {
  const finalized: number[] = [];
  let next = 0;
  const make = (): Prepared => {
    const id = next++;
    let alive = true;
    return {
      stmt: {
        finalizeSync: () => {
          if (!alive) throw new Error("Access to closed/finalized statement");
          alive = false;
          finalized.push(id);
        },
      },
      run: () => "run",
      all: () => {
        if (options.throws) throw new Error("boom");
        if (!alive) throw new Error("Access to closed/finalized statement");
        return ["all"];
      },
      get: () => "get",
      values: () => [["values"]],
    };
  };
  const session = {
    prepareQuery: (): Prepared => make(),
    prepareOneTimeQuery: (): Prepared => session.prepareQuery(),
  };
  return { db: { session } as unknown as Db, session, finalized };
}

describe("finalizeStatementsAfterExecute", () => {
  it("finalizes a one-time query's statement after it executes", () => {
    const { db, session, finalized } = fakeDb();
    finalizeStatementsAfterExecute(db);

    const query = session.prepareOneTimeQuery();
    expect(finalized).toEqual([]);
    expect(query.all()).toEqual(["all"]);
    expect(finalized).toEqual([0]);
  });

  it("finalizes once when prepareOneTimeQuery delegates to prepareQuery", () => {
    const { db, session, finalized } = fakeDb();
    finalizeStatementsAfterExecute(db);

    for (const query of [session.prepareOneTimeQuery(), session.prepareOneTimeQuery()]) {
      expect(query.run()).toBe("run");
    }

    expect(finalized).toEqual([0, 1]);
  });

  it("finalizes once per statement, whichever execute method runs", () => {
    const { db, session, finalized } = fakeDb();
    finalizeStatementsAfterExecute(db);

    expect(session.prepareQuery().run()).toBe("run");
    expect(session.prepareOneTimeQuery().get()).toBe("get");
    expect(session.prepareQuery().values()).toEqual([["values"]]);

    expect(finalized).toEqual([0, 1, 2]);
  });

  it("finalizes when the query throws", () => {
    const { db, session, finalized } = fakeDb({ throws: true });
    finalizeStatementsAfterExecute(db);

    expect(() => session.prepareQuery().all()).toThrow("boom");
    expect(finalized).toEqual([0]);
  });

  it("does not support re-executing a held prepared query", () => {
    const { db, session, finalized } = fakeDb();
    finalizeStatementsAfterExecute(db);

    const held = session.prepareQuery();
    expect(held.all()).toEqual(["all"]);
    expect(() => held.all()).toThrow("finalized statement");
    expect(finalized).toEqual([0]);
  });

  it("finalizes each statement exactly once on the real driver", () => {
    const db = testDb();
    const session = (db as unknown as { session: { prepareQuery: (...a: unknown[]) => Stmt } })
      .session;
    const prepare = session.prepareQuery.bind(session);
    let finalizeCalls = 0;
    session.prepareQuery = (...args: unknown[]) => {
      const query = prepare(...args);
      let alive = true;
      query.stmt.finalizeSync = () => {
        if (!alive) throw new Error("Access to closed/finalized statement");
        alive = false;
        finalizeCalls += 1;
      };
      return query;
    };
    finalizeStatementsAfterExecute(db);

    upsertRecordings(db, recs, NOW);
    setTranscript(db, recs[0].id, transcript as Transcript, NOW);
    expect(searchTranscripts(db, "ingestion cost").length).toBeGreaterThan(0);

    expect(finalizeCalls).toBeGreaterThan(0);
  });

  it("leaves FTS5 queries working against the real driver", () => {
    const db = finalizeStatementsAfterExecute(testDb());
    upsertRecordings(db, recs, NOW);
    setTranscript(db, recs[0].id, transcript as Transcript, NOW);

    expect(searchRecordings(db, recs[0].title.split(" ")[0]).map((r) => r.id)).toContain(
      recs[0].id,
    );
    const hits = searchTranscripts(db, "ingestion cost");
    expect(hits.length).toBeGreaterThan(0);
    expect(searchTranscripts(db, "ingestion cost")).toEqual(hits);
  });
});
