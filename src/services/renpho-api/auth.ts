import type { RenphoScaleTable } from '../../types/renpho.js';
import { API_BASE } from './constants.js';
import { decryptAES, encryptAES } from './crypto.js';
import { extractIdAsString, extractUserIdGroupsAsStrings, unique } from './json-extract.js';
import { postEncryptedRaw } from './http-client.js';
import type { CachedSession, DeviceInfo } from './types.js';

export async function authenticateWithCredentials(
  email: string,
  password: string,
  cachedSession: CachedSession | null
): Promise<CachedSession> {
  if (cachedSession && cachedSession.expires_at > Date.now()) {
    return cachedSession;
  }

  const loginData = {
    questionnaire: {},
    login: {
      password,
      areaCode: 'US',
      appRevision: '7.0.0',
      cellphoneType: 'MCP-Server',
      systemType: '11',
      email,
      platform: 'android'
    },
    bindingList: { deviceTypes: ['2'] }
  };

  const loginResponse = await fetch(`${API_BASE}/renpho-aggregation/user/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ encryptData: encryptAES(JSON.stringify(loginData)) })
  });

  const loginJson = await loginResponse.json() as { code: number; msg: string; data: string };

  if (loginJson.code !== 101) {
    throw new Error(`Authentication failed: ${loginJson.msg}`);
  }

  const rawLoginData = decryptAES(loginJson.data);
  const userData = JSON.parse(rawLoginData) as { login: Record<string, any> };
  const login = userData.login;

  const userId = extractIdAsString(rawLoginData, 'id') || String(login.id);

  const temporarySession: CachedSession = {
    token: login.token,
    userId,
    scaleUserIds: [],
    scaleTables: [],
    user: {
      id: userId,
      email: login.email,
      account_name: login.accountName,
      birthday: login.birthday,
      gender: login.gender,
      height: login.height,
      height_unit: login.heightUnit,
      weight_unit: login.weightUnit,
      weight_goal: login.weightGoal,
      locale: login.locale,
      area_code: login.areaCode,
      first_name: login.firstName,
      last_name: login.lastName,
      measure_last_time: login.measureLastTime,
      measure_last_weight: login.measureLastWeight,
      user_uuid: login.userUuid
    },
    expires_at: Date.now() + 50 * 60 * 1000
  };

  const rawDeviceData = await postEncryptedRaw(
    'renpho-aggregation/device/count',
    temporarySession,
    null,
    true
  );
  const deviceData = JSON.parse(rawDeviceData) as DeviceInfo;
  const extractedUserIdGroups = extractUserIdGroupsAsStrings(rawDeviceData);

  if (!deviceData.scale || deviceData.scale.length === 0) {
    throw new Error('No scale devices found');
  }

  const scaleTables: RenphoScaleTable[] = deviceData.scale.map((scaleInfo, index) => ({
    table_name: scaleInfo.tableName,
    count: scaleInfo.count,
    user_ids: extractedUserIdGroups[index] || (scaleInfo.userIds || []).map(String)
  }));

  return {
    ...temporarySession,
    scaleTables,
    scaleUserIds: unique(scaleTables.flatMap(scale => scale.user_ids))
  };
}