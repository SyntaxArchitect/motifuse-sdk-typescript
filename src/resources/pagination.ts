import type { Page } from "../types.js";

export async function* paginate<T>(
  fetchPage: (cursor?: string) => Promise<Page<T>>,
): AsyncGenerator<T, void, undefined> {
  let cursor: string | undefined;
  do {
    const page = await fetchPage(cursor);
    for (const item of page.data) yield item;
    if (!page.has_more || !page.next_cursor) return;
    cursor = page.next_cursor;
  } while (cursor);
}
