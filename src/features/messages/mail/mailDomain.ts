// Web addresses that follow from a mailbox address. The Rust side connects to
// imap.<domain>; the browser link mirrors it with mail.<domain>.

const QQ_DOMAINS = new Set(["qq.com", "foxmail.com", "vip.qq.com"]);

function domainOf(email: string | null | undefined): string | null {
  const domain = email?.trim().toLowerCase().split("@")[1];
  return domain && /^[a-z0-9.-]+\.[a-z0-9-]+$/.test(domain) ? domain : null;
}

/** The webmail page for an address; QQ Mail when there is no usable address yet. */
export function mailWebUrl(email: string | null | undefined): string {
  const domain = domainOf(email);
  if (!domain || QQ_DOMAINS.has(domain)) return "https://mail.qq.com/";
  return `https://mail.${domain}/`;
}

/** The IMAP / authorization-code help page only covers QQ Mail. */
export function hasQQMailHelp(email: string | null | undefined): boolean {
  const domain = domainOf(email);
  return domain === null || QQ_DOMAINS.has(domain);
}
