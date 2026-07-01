/** Extract large integer IDs as strings to avoid JavaScript precision loss */
export function extractIdAsString(json: string, key: string): string | null {
  const regex = new RegExp(`"${key}":(\\d+)`);
  const match = json.match(regex);
  return match ? match[1] : null;
}

export function extractIdsAsStrings(json: string, key: string): string[] {
  const regex = new RegExp(`"${key}":(\\d+)`, 'g');
  return Array.from(json.matchAll(regex), match => match[1]);
}

/** Extract all userIds arrays as string arrays to avoid precision loss */
export function extractUserIdGroupsAsStrings(json: string): string[][] {
  const matches = json.matchAll(/"userIds":\[(\d+(?:,\d+)*)\]/g);
  return Array.from(matches, match => match[1].split(','));
}