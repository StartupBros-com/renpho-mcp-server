import { API_BASE } from './constants.js';
import { decryptAES, encryptAES, encryptEmptyBytes } from './crypto.js';
import type { CachedSession } from './types.js';

export async function postEncryptedRaw(
  path: string,
  session: CachedSession,
  requestBody: Record<string, unknown> | null,
  emptyBody: boolean = false
): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'token': session.token,
        'userId': session.userId,
        'appVersion': '7.0.0',
        'platform': 'android'
      },
      body: JSON.stringify({
        encryptData: emptyBody
          ? encryptEmptyBytes()
          : encryptAES(JSON.stringify(requestBody ?? {}))
      })
    });
  } catch (networkError) {
    throw new Error(`Network error calling ${path}: ${(networkError as Error).message}`);
  }

  let responseJson: { code: number; msg?: string; data?: string };
  try {
    responseJson = await response.json() as { code: number; msg?: string; data?: string };
  } catch (parseError) {
    throw new Error(`Failed to parse API response from ${path}: ${(parseError as Error).message}, status: ${response.status}`);
  }

  if (responseJson.code !== 101) {
    throw new Error(`API call failed for ${path}: code=${responseJson.code}, msg=${responseJson.msg}, full=${JSON.stringify(responseJson)}`);
  }

  if (!responseJson.data) {
    throw new Error(`API call failed for ${path}: No data in response`);
  }

  return decryptAES(responseJson.data);
}

export async function postEncrypted<T>(
  path: string,
  session: CachedSession,
  requestBody: Record<string, unknown> | null,
  emptyBody: boolean = false
): Promise<T> {
  const rawResponse = await postEncryptedRaw(path, session, requestBody, emptyBody);
  return JSON.parse(rawResponse) as T;
}