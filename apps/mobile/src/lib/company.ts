const FREEMAIL = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "yahoo.com",
  "icloud.com",
  "me.com",
  "proton.me",
  "protonmail.com",
  "aol.com",
]);

export function emailDomain(email: string | null | undefined): string | null {
  const at = email?.lastIndexOf("@") ?? -1;
  if (!email || at < 1 || at === email.length - 1) return null;
  return email.slice(at + 1).toLowerCase();
}

export function companyFromDomain(domain: string): string | null {
  if (FREEMAIL.has(domain)) return null;
  const labels = domain.split(".").filter(Boolean);
  if (labels.length < 2) return null;
  const drop =
    labels.length >= 3 && labels.at(-1)!.length <= 3 && labels.at(-2)!.length <= 3 ? 2 : 1;
  const name = labels[labels.length - 1 - drop];
  return name ? name[0].toUpperCase() + name.slice(1) : null;
}

export function companyFromEmail(email: string | null | undefined): string | null {
  const domain = emailDomain(email);
  return domain ? companyFromDomain(domain) : null;
}

export function dominantCompany(emails: (string | null | undefined)[]): string | null {
  const counts = new Map<string, number>();
  for (const email of emails) {
    const company = companyFromEmail(email);
    if (company) counts.set(company, (counts.get(company) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [company, count] of counts) {
    if (count > bestCount) [best, bestCount] = [company, count];
  }
  return best;
}

export function parseEmails(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((e): e is string => typeof e === "string") : [];
  } catch {
    return [];
  }
}

export function meetingCompany(row: {
  externalEmails: string | null;
  recorders: { email?: string | null }[];
}): string | null {
  return (
    dominantCompany(parseEmails(row.externalEmails)) ??
    dominantCompany(row.recorders.map((r) => r.email))
  );
}
