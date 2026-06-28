import type { RenphoScaleTable } from '../../types/renpho.js';
import { DEFAULT_PAGE_SIZE, MAX_MEASUREMENT_SCAN } from './constants.js';
import { extractIdsAsStrings } from './json-extract.js';

export function parseMeasurementPageResponse(rawResponse: string): Array<Record<string, any>> {
  const parsed = JSON.parse(rawResponse) as Array<Record<string, any>>;
  const ids = extractIdsAsStrings(rawResponse, 'id');
  const boundUserIds = extractIdsAsStrings(rawResponse, 'bUserId');
  const scaleUserIds = extractIdsAsStrings(rawResponse, 'subUserId');

  return parsed.map((entry, index) => ({
    ...entry,
    __idString: ids[index] || (entry.id != null ? String(entry.id) : undefined),
    __bUserIdString: boundUserIds[index] || (entry.bUserId != null ? String(entry.bUserId) : undefined),
    __subUserIdString: scaleUserIds[index] || (entry.subUserId != null ? String(entry.subUserId) : undefined)
  }));
}

export async function collectMeasurementsForTable(
  fetchPage: (pageNum: number, pageSize: number) => Promise<Array<Record<string, any>>>,
  table: RenphoScaleTable,
  limit: number,
  lastAt?: number
): Promise<Array<Record<string, any>>> {
  const pageSize = Math.min(DEFAULT_PAGE_SIZE, Math.max(50, limit));
  const tableCount = Math.max(table.count || 0, 0);
  const totalPages = Math.max(1, Math.ceil(Math.max(tableCount, pageSize) / pageSize));
  const collected: Array<Record<string, any>> = [];

  if (lastAt) {
    for (let pageNum = totalPages; pageNum >= 1; pageNum--) {
      const page = await fetchPage(pageNum, pageSize);
      if (page.length === 0) break;

      collected.push(...page);

      const newestTimestampInPage = Math.max(...page.map(entry => Number(entry.timeStamp || 0)));
      const recentCount = collected.filter(entry => Number(entry.timeStamp || 0) >= lastAt).length;
      if (recentCount >= limit || newestTimestampInPage < lastAt || collected.length >= MAX_MEASUREMENT_SCAN) {
        break;
      }
    }

    return collected;
  }

  const pagesNeeded = Math.max(1, Math.ceil(limit / pageSize));
  const startPage = Math.max(1, totalPages - pagesNeeded + 1);

  for (let pageNum = startPage; pageNum <= totalPages; pageNum++) {
    const page = await fetchPage(pageNum, pageSize);
    if (page.length === 0) break;
    collected.push(...page);
  }

  return collected;
}