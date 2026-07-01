import type { RenphoScaleTable, RenphoUser } from '../../types/renpho.js';

export interface CachedSession {
  token: string;
  userId: string;
  scaleUserIds: string[];
  scaleTables: RenphoScaleTable[];
  user: RenphoUser;
  expires_at: number;
}

export interface DeviceInfo {
  scale: Array<{
    userIds: Array<string | number>;
    count: number;
    tableName: string;
  }>;
}

export interface FamilyMemberResponse {
  id?: string | number;
  email?: string;
  accountName?: string;
  birthday?: string;
  gender?: number;
  height?: number;
  heightUnit?: number;
  weightUnit?: number;
  weightGoal?: number;
  locale?: string;
  areaCode?: string;
  firstName?: string;
  lastName?: string;
}