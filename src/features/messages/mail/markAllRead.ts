import type { MailMessage } from "./api";

/** Work on a snapshot of this list, serially; a failed message remains unread and can be retried. */
export async function markUnreadMailRead(
  email: string,
  items: readonly MailMessage[],
  markRead: (email: string, id: string) => Promise<boolean>,
): Promise<number> {
  let failed = 0;
  for (const item of items.filter((message) => message.unread)) {
    if (!await markRead(email, item.id)) failed += 1;
  }
  return failed;
}
