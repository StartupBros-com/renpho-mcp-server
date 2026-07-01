import { LRUCache } from 'lru-cache';
import type {
  RenphoUser,
  RenphoMeasurement,
  RenphoScaleUser,
  RenphoWeightTrend,
  RenphoBodyComposition,
  RenphoScaleTable,
  RenphoSyncDiagnostics
} from '../../types/renpho.js';
import { authenticateWithCredentials } from './auth.js';
import { classifyBMI, classifyBodyFat, classifyVisceralFat } from './classifications.js';
import { postEncrypted as sendEncryptedRequest, postEncryptedRaw as sendEncryptedRawRequest } from './http-client.js';
import { collectMeasurementsForTable, parseMeasurementPageResponse } from './measurement-paging.js';
import {
  dedupeAndSortMeasurements,
  mapMeasurement as mapMeasurementRecord,
  selectMeasurementsForCurrentUser
} from './measurements.js';
import type { CachedSession, FamilyMemberResponse } from './types.js';

export class RenphoApiService {
  private email: string;
  private password: string;
  private sessionCache: CachedSession | null = null;
  private measurementCache: LRUCache<string, RenphoMeasurement[]>;

  constructor(email: string, password: string) {
    this.email = email;
    this.password = password;
    this.measurementCache = new LRUCache<string, RenphoMeasurement[]>({
      max: 100,
      ttl: 5 * 60 * 1000 // 5 minutes
    });
  }

  invalidateCaches(): void {
    this.sessionCache = null;
    this.measurementCache.clear();
  }

  private async postEncryptedRaw(
    path: string,
    session: CachedSession,
    requestBody: Record<string, unknown> | null,
    emptyBody: boolean = false
  ): Promise<string> {
    return sendEncryptedRawRequest(path, session, requestBody, emptyBody);
  }

  private async postEncrypted<T>(
    path: string,
    session: CachedSession,
    requestBody: Record<string, unknown> | null,
    emptyBody: boolean = false
  ): Promise<T> {
    return sendEncryptedRequest(path, session, requestBody, emptyBody);
  }

  private async authenticate(): Promise<CachedSession> {
    const session = await authenticateWithCredentials(this.email, this.password, this.sessionCache);
    this.sessionCache = session;
    return session;
  }

  async getCurrentUser(): Promise<RenphoUser> {
    const session = await this.authenticate();
    return session.user;
  }

  async getFamilyMembers(): Promise<RenphoUser[]> {
    const session = await this.authenticate();
    const familyMembers = await this.postEncrypted<FamilyMemberResponse[] | { list?: FamilyMemberResponse[] }>(
      'RenphoHealth/centerUser/queryFamilyMemberList',
      session,
      null,
      true
    );

    const members = Array.isArray(familyMembers) ? familyMembers : (familyMembers.list || []);

    return members.map(member => ({
      id: member.id ? String(member.id) : '',
      email: member.email || '',
      account_name: member.accountName,
      birthday: member.birthday,
      gender: member.gender,
      height: member.height,
      height_unit: member.heightUnit,
      weight_unit: member.weightUnit,
      weight_goal: member.weightGoal,
      locale: member.locale,
      area_code: member.areaCode,
      first_name: member.firstName,
      last_name: member.lastName
    }));
  }

  async getScaleUsers(): Promise<RenphoScaleUser[]> {
    const session = await this.authenticate();

    return session.scaleTables.flatMap(scaleTable =>
      scaleTable.user_ids.map((userId, index) => ({
        id: `${scaleTable.table_name}:${userId}`,
        user_id: userId,
        table_name: scaleTable.table_name,
        count: scaleTable.count,
        index,
        method: 0
      }))
    );
  }

  private async fetchMeasurementPage(
    session: CachedSession,
    tableName: string,
    userIds: string[],
    pageNum: number,
    pageSize: number
  ): Promise<Array<Record<string, any>>> {
    const rawResponse = await this.postEncryptedRaw(
      'RenphoHealth/scale/queryAllMeasureDataList',
      session,
      {
        pageNum,
        pageSize,
        userIds,
        tableName
      }
    );

    return parseMeasurementPageResponse(rawResponse);
  }

  private async fetchMeasurementsForTable(
    session: CachedSession,
    table: RenphoScaleTable,
    userIds: string[],
    limit: number,
    lastAt?: number
  ): Promise<Array<Record<string, any>>> {
    return collectMeasurementsForTable(
      (pageNum, pageSize) => this.fetchMeasurementPage(session, table.table_name, userIds, pageNum, pageSize),
      table,
      limit,
      lastAt
    );
  }

  private mapMeasurement(m: Record<string, any>): RenphoMeasurement {
    return mapMeasurementRecord(m);
  }

  private async getAssociatedMeasurements(lastAt?: number, limit: number = 100): Promise<RenphoMeasurement[]> {
    const session = await this.authenticate();
    const cacheKey = `associated-measurements-${lastAt || 'all'}-${limit}`;
    const cached = this.measurementCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const perTableLimit = Math.max(limit, 50);
    const rawResults = await Promise.all(
      session.scaleTables.map(scaleTable =>
        this.fetchMeasurementsForTable(session, scaleTable, scaleTable.user_ids, perTableLimit, lastAt)
      )
    );

    let measurements = dedupeAndSortMeasurements(rawResults.flat().map(entry => this.mapMeasurement(entry)));

    if (lastAt) {
      measurements = measurements.filter(measurement => measurement.time_stamp >= lastAt);
    }

    if (measurements.length > limit) {
      measurements = measurements.slice(0, limit);
    }

    this.measurementCache.set(cacheKey, measurements);
    return measurements;
  }

  async getMeasurements(
    userId?: string,
    lastAt?: number,
    limit: number = 100
  ): Promise<RenphoMeasurement[]> {
    const session = await this.authenticate();

    if (!userId) {
      const associatedMeasurements = await this.getAssociatedMeasurements(lastAt, Math.max(limit, 200));
      const selected = selectMeasurementsForCurrentUser(associatedMeasurements, session);
      return selected.slice(0, limit);
    }

    const cacheKey = `measurements-${userId}-${lastAt || 'all'}-${limit}`;
    const cached = this.measurementCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const candidateTables = session.scaleTables.filter(scaleTable => scaleTable.user_ids.includes(userId));
    const tablesToQuery = candidateTables.length > 0
      ? candidateTables
      : session.scaleTables;

    const rawResults = await Promise.all(
      tablesToQuery.map(scaleTable =>
        this.fetchMeasurementsForTable(session, scaleTable, [userId], Math.max(limit, 50), lastAt)
      )
    );

    let measurements = dedupeAndSortMeasurements(rawResults.flat().map(entry => this.mapMeasurement(entry)));

    if (lastAt) {
      measurements = measurements.filter(measurement => measurement.time_stamp >= lastAt);
    }

    if (measurements.length > limit) {
      measurements = measurements.slice(0, limit);
    }

    this.measurementCache.set(cacheKey, measurements);
    return measurements;
  }

  async getLatestMeasurement(): Promise<RenphoMeasurement | null> {
    const measurements = await this.getMeasurements(undefined, undefined, 1);
    return measurements.length > 0 ? measurements[0] : null;
  }

  async getBodyComposition(): Promise<RenphoBodyComposition | null> {
    const measurement = await this.getLatestMeasurement();
    if (!measurement) return null;

    const user = await this.getCurrentUser();
    const isMale = user.gender === 1;

    return {
      measurement,
      formatted: {
        weight: `${measurement.weight?.toFixed(1) || 'N/A'} kg`,
        bmi: measurement.bmi?.toFixed(1) || 'N/A',
        bodyfat: `${measurement.bodyfat?.toFixed(1) || 'N/A'}%`,
        muscle: `${measurement.muscle?.toFixed(1) || 'N/A'}%`,
        water: `${measurement.water?.toFixed(1) || 'N/A'}%`,
        bone: `${measurement.bone?.toFixed(2) || 'N/A'} kg`,
        visceral_fat: measurement.visceral_fat?.toString() || 'N/A',
        metabolic_age: measurement.metabolic_age?.toString() || measurement.body_age?.toString() || 'N/A',
        bmr: `${measurement.bmr?.toFixed(0) || 'N/A'} kcal`,
        protein: `${measurement.protein?.toFixed(1) || 'N/A'}%`,
        subcutaneous_fat: `${measurement.subcutaneous_fat?.toFixed(1) || 'N/A'}%`,
        skeletal_muscle: `${measurement.skeletal_muscle?.toFixed(1) || 'N/A'}%`,
        heart_rate: measurement.heart_rate ? `${measurement.heart_rate} bpm` : 'N/A'
      },
      classifications: {
        bmi_category: classifyBMI(measurement.bmi),
        bodyfat_category: classifyBodyFat(measurement.bodyfat, isMale),
        visceral_fat_category: classifyVisceralFat(measurement.visceral_fat)
      }
    };
  }

  async getWeightTrend(days: number = 30): Promise<RenphoWeightTrend | null> {
    const startTimestamp = Math.floor((Date.now() - days * 24 * 60 * 60 * 1000) / 1000);
    const measurements = await this.getMeasurements(undefined, startTimestamp, 500);

    if (measurements.length === 0) return null;

    const sorted = [...measurements].sort((a, b) => a.time_stamp - b.time_stamp);
    const weights = sorted.map(m => m.weight).filter((w): w is number => w != null);

    if (weights.length === 0) return null;

    const startWeight = weights[0];
    const endWeight = weights[weights.length - 1];
    const change = endWeight - startWeight;
    const changePercent = (change / startWeight) * 100;
    const minWeight = Math.min(...weights);
    const maxWeight = Math.max(...weights);
    const avgWeight = weights.reduce((a, b) => a + b, 0) / weights.length;

    return {
      period: `${days} days`,
      start_weight: startWeight,
      end_weight: endWeight,
      change,
      change_percent: changePercent,
      min_weight: minWeight,
      max_weight: maxWeight,
      avg_weight: avgWeight,
      measurement_count: measurements.length
    };
  }

  async getSyncDiagnostics(days: number = 7): Promise<RenphoSyncDiagnostics> {
    const session = await this.authenticate();
    const startTimestamp = Math.floor((Date.now() - days * 24 * 60 * 60 * 1000) / 1000);
    const [familyMembers, associatedMeasurements] = await Promise.all([
      this.getFamilyMembers().catch(() => []),
      this.getAssociatedMeasurements(startTimestamp, 50)
    ]);

    const visibleMeasurements = selectMeasurementsForCurrentUser(associatedMeasurements, session);
    const visibleLatestMeasurement = visibleMeasurements[0] || null;
    const latestAssociatedMeasurement = associatedMeasurements[0] || null;
    const hiddenAssociatedMeasurements = associatedMeasurements
      .filter(measurement => !visibleMeasurements.some(visible => visible.id === measurement.id))
      .slice(0, 5);

    const latestMeasurementAgeHours = visibleLatestMeasurement
      ? (Date.now() / 1000 - visibleLatestMeasurement.time_stamp) / 3600
      : undefined;

    return {
      user: session.user,
      family_members: familyMembers,
      scale_tables: session.scaleTables,
      visible_latest_measurement: visibleLatestMeasurement,
      latest_associated_measurement: latestAssociatedMeasurement,
      hidden_associated_measurements: hiddenAssociatedMeasurements,
      latest_measurement_age_hours: latestMeasurementAgeHours
    };
  }
}