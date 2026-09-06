import {
  companyFromDomain,
  dominantCompany,
  emailDomain,
  meetingCompany,
  parseEmails,
} from "@/lib/company";

describe("emailDomain", () => {
  it.each([
    ["zara.lind@acme.example", "acme.example"],
    ["Mixed@Case.COM", "case.com"],
    ["no-at-sign", null],
    ["@nolocal.com", null],
    ["trailing@", null],
    [null, null],
    [undefined, null],
  ])("%s -> %s", (email, expected) => {
    expect(emailDomain(email)).toBe(expected);
  });
});

describe("companyFromDomain", () => {
  it.each([
    ["acme.example", "Acme"],
    ["treyresearch.example", "Treyresearch"],
    ["mail.contoso.co.uk", "Contoso"],
    ["sub.fabrikam.com", "Fabrikam"],
    ["gmail.com", null],
    ["localhost", null],
  ])("%s -> %s", (domain, expected) => {
    expect(companyFromDomain(domain)).toBe(expected);
  });
});

describe("dominantCompany", () => {
  it("picks the most frequent company and ignores freemail and nulls", () => {
    expect(
      dominantCompany([
        "a@litware.example",
        "b@acme.example",
        "c@litware.example",
        "d@gmail.com",
        null,
      ]),
    ).toBe("Litware");
    expect(dominantCompany(["x@gmail.com", null])).toBeNull();
    expect(dominantCompany([])).toBeNull();
  });
});

describe("parseEmails", () => {
  it("reads the json array produced by the recordings query", () => {
    expect(parseEmails('["a@b.com","c@d.com"]')).toEqual(["a@b.com", "c@d.com"]);
    expect(parseEmails('["a@b.com", 3, null]')).toEqual(["a@b.com"]);
    expect(parseEmails(null)).toEqual([]);
    expect(parseEmails("not json")).toEqual([]);
    expect(parseEmails("{}")).toEqual([]);
  });
});

describe("meetingCompany", () => {
  const recorders = [{ email: "marcus@treyresearch.example" }];
  it("prefers external participants, falls back to the recorder's company", () => {
    expect(meetingCompany({ externalEmails: '["z@acme.example"]', recorders })).toBe("Acme");
    expect(meetingCompany({ externalEmails: "[]", recorders })).toBe("Treyresearch");
    expect(meetingCompany({ externalEmails: null, recorders: [{ email: null }] })).toBeNull();
  });
});
