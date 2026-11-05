/** What the compose view starts with; `replyTo` is the listed message being answered. */
export type ComposeDraft = { to: string; subject: string; replyTo?: string };

/** "a@x.com, b@y.com；c@z.com" into addresses: split on commas, semicolons (also full-width) and spaces. */
export function splitRecipients(text: string): string[] {
  return text.split(/[,;，；\s]+/).map((part) => part.trim()).filter(Boolean);
}
