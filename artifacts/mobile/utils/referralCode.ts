export function normalizeReferralCode(value: string): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[^A-Za-z0-9_-]/g, "")
    .toUpperCase();
}

function extractFromUrl(raw: string): string {
  try {
    const url = new URL(raw);
    const keys = ["code", "ref", "referral", "referralCode"];
    for (const key of keys) {
      const value = url.searchParams.get(key);
      if (value) return normalizeReferralCode(value);
    }

    const pathCode = url.pathname.split("/").filter(Boolean).pop();
    if (pathCode) return normalizeReferralCode(pathCode);

    if (url.protocol !== "http:" && url.protocol !== "https:" && url.host) {
      return normalizeReferralCode(url.host);
    }
  } catch {
    return "";
  }
  return "";
}

export function extractReferralCode(payload: string): string {
  const raw = String(payload ?? "").trim();
  if (!raw) return "";

  const fromUrl = extractFromUrl(raw);
  if (fromUrl) return fromUrl;

  const labelled = raw.match(/(?:code|ref|referral|referralCode)\s*[:=]\s*([A-Za-z0-9_-]{4,64})/i);
  if (labelled?.[1]) return normalizeReferralCode(labelled[1]);

  const direct = raw.match(/[A-Za-z0-9_-]{4,64}/);
  return normalizeReferralCode(direct?.[0] ?? raw);
}
