import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { COUNTRIES, MATCHES, USERS, type Country, type Match, type User } from './worldcup.seed';
import { OfficialResult } from './schemas/official-result.schema';
import { Prediction } from './schemas/prediction.schema';

type UserView = User & { country: Country | null };
type MatchView = Match & {
  homeTeam: Country | null;
  awayTeam: Country | null;
};

type GroupOrder = Record<string, string[]>;
type KnockoutPrediction = {
  r32: string[];
  r16: string[];
  qf: string[];
  sf: string[];
  final: string[];
  champion: string[];
};

type PredictionPayload = {
  groupOrder: GroupOrder;
  knockout: KnockoutPrediction;
};

type KnockoutDraftPrediction = {
  r32: Array<string | null>;
  r16: Array<string | null>;
  qf: Array<string | null>;
  sf: Array<string | null>;
  final: Array<string | null>;
  champion: Array<string | null>;
};

type PredictionDraftPayload = {
  groupOrder?: GroupOrder;
  knockout?: KnockoutDraftPrediction;
};

type StoredPrediction = {
  discordId: string;
  username: string;
  payload: PredictionDraftPayload;
  points: number;
  createdAt: string;
  updatedAt: string;
};

type OfficialGroupOrder = Record<string, Array<string | null>>;
type OfficialKnockout = {
  r32: Array<string | null>;
  r16: Array<string | null>;
  qf: Array<string | null>;
  sf: Array<string | null>;
  final: Array<string | null>;
  champion: Array<string | null>;
};

type OfficialResults = {
  groupOrder: OfficialGroupOrder;
  knockout: OfficialKnockout;
  updatedAt: string;
  updatedBy: string;
};

type PredictionRecord = {
  _id?: unknown;
  discordId: string;
  username: string;
  payload: PredictionDraftPayload;
  points?: number;
  createdAt?: Date;
  updatedAt?: Date;
};

type OfficialResultRecord = {
  key: string;
  groupOrder: OfficialGroupOrder;
  knockout: OfficialKnockout;
  updatedAt?: Date;
  updatedBy?: string;
};

type OfficialResultsPayload = {
  groupOrder?: OfficialGroupOrder;
  knockout?: OfficialKnockout;
};

@Injectable()
export class WorldcupService {
  private readonly countries = COUNTRIES;
  private readonly usersByDiscordId = new Map(USERS.map((user) => [user.discordId, user]));
  private readonly matches = MATCHES;
  private readonly adminDiscordId = '179134666626826241';

  private readonly groupNames = [
    'Grupo A',
    'Grupo B',
    'Grupo C',
    'Grupo D',
    'Grupo E',
    'Grupo F',
    'Grupo G',
    'Grupo H',
    'Grupo I',
    'Grupo J',
    'Grupo K',
    'Grupo L',
  ];

  private readonly knockoutStages: Array<keyof OfficialKnockout> = ['r32', 'r16', 'qf', 'sf', 'final', 'champion'];

  constructor(
    @InjectModel(Prediction.name) private readonly predictionModel: Model<Prediction>,
    @InjectModel(OfficialResult.name) private readonly officialResultModel: Model<OfficialResult>,
  ) {}

  getCountries(): Country[] {
    return [...this.countries].sort((left, right) => left.name.localeCompare(right.name));
  }

  getCountryByCode(code: string): Country {
    const country = this.countries.find((item) => item.code.toLowerCase() === code.toLowerCase());

    if (!country) {
      throw new NotFoundException(`Country ${code} not found`);
    }

    return country;
  }

  private normalizeCode(code: string | null | undefined): string | null {
    if (typeof code !== 'string') {
      return null;
    }

    const normalized = code.trim().toUpperCase();
    return normalized.length ? normalized : null;
  }

  private calculatePoints(payload: PredictionDraftPayload, officialResults: OfficialResults): number {
    let points = 0;

    this.groupNames.forEach((groupName) => {
      const predictedCodes = payload.groupOrder?.[groupName] ?? [];
      const officialCodes = officialResults.groupOrder[groupName] ?? [];

      for (let index = 0; index < 4; index += 1) {
        const officialCode = this.normalizeCode(officialCodes[index]);

        if (!officialCode) {
          continue;
        }

        const predictedCode = this.normalizeCode(predictedCodes[index]);

        if (predictedCode && predictedCode === officialCode) {
          points += 1;
        }
      }
    });

    this.knockoutStages.forEach((stage) => {
      const predictedCodes = payload.knockout?.[stage] ?? [];
      const officialCodes = officialResults.knockout[stage] ?? [];

      for (let index = 0; index < officialCodes.length; index += 1) {
        const officialCode = this.normalizeCode(officialCodes[index]);

        if (!officialCode) {
          continue;
        }

        const predictedCode = this.normalizeCode(predictedCodes[index]);

        if (predictedCode && predictedCode === officialCode) {
          points += 1;
        }
      }
    });

    return points;
  }

  private mapPredictionToUserView(record: PredictionRecord): UserView {
    const seedUser = this.usersByDiscordId.get(record.discordId);

    return {
      discordId: record.discordId,
      username: record.username,
      avatar: seedUser?.avatar ?? '',
      countryCode: seedUser?.countryCode ?? '',
      points: record.points ?? 0,
      country: seedUser ? this.countries.find((country) => country.code === seedUser.countryCode) ?? null : null,
    };
  }

  async getUsers(): Promise<UserView[]> {
    const records = await this.predictionModel
      .find()
      .sort({ points: -1, updatedAt: 1, username: 1 })
      .lean<PredictionRecord[]>()
      .exec();

    return records.map((record) => this.mapPredictionToUserView(record));
  }

  async getUserByDiscordId(discordId: string): Promise<UserView> {
    const record = await this.predictionModel.findOne({ discordId }).lean<PredictionRecord>().exec();

    if (record) {
      return this.mapPredictionToUserView(record);
    }

    const seedUser = this.usersByDiscordId.get(discordId);

    if (!seedUser) {
      throw new NotFoundException(`User ${discordId} not found`);
    }

    return {
      ...seedUser,
      points: 0,
      country: this.countries.find((country) => country.code === seedUser.countryCode) ?? null,
    };
  }

  getMatches(): MatchView[] {
    return [...this.matches].map((match) => ({
      ...match,
      homeTeam: this.countries.find((country) => country.code === match.homeCountryCode) ?? null,
      awayTeam: this.countries.find((country) => country.code === match.awayCountryCode) ?? null,
    }));
  }

  getMatchById(id: string): MatchView {
    const match = this.matches.find((item) => item.id === id);

    if (!match) {
      throw new NotFoundException(`Match ${id} not found`);
    }

    return {
      ...match,
      homeTeam: this.countries.find((country) => country.code === match.homeCountryCode) ?? null,
      awayTeam: this.countries.find((country) => country.code === match.awayCountryCode) ?? null,
    };
  }

  async getDashboard() {
    return {
      users: await this.getUsers(),
      countries: this.getCountries(),
      matches: this.getMatches(),
    };
  }

  private createEmptyKnockout(): OfficialKnockout {
    return {
      r32: Array(32).fill(null),
      r16: Array(16).fill(null),
      qf: Array(8).fill(null),
      sf: Array(4).fill(null),
      final: Array(2).fill(null),
      champion: Array(1).fill(null),
    };
  }

  private createEmptyOfficialResults(): OfficialResults {
    const groupOrder = this.groupNames.reduce<OfficialGroupOrder>((accumulator, groupName) => {
      accumulator[groupName] = Array(4).fill(null);
      return accumulator;
    }, {});

    return {
      groupOrder,
      knockout: this.createEmptyKnockout(),
      updatedAt: '',
      updatedBy: '',
    };
  }

  private isStringArrayWithLength(value: unknown, expectedLength: number): value is string[] {
    return Array.isArray(value) && value.length === expectedLength && value.every((item) => typeof item === 'string' && item.length > 0);
  }

  private isNullableStringArrayWithLength(value: unknown, expectedLength: number): value is Array<string | null> {
    return Array.isArray(value) && value.length === expectedLength && value.every((item) => item === null || (typeof item === 'string' && item.length > 0));
  }

  private validatePayload(payload: Record<string, unknown>): PredictionPayload {
    const groupOrderRaw = payload.groupOrder;
    const knockoutRaw = payload.knockout;

    if (!groupOrderRaw || typeof groupOrderRaw !== 'object' || Array.isArray(groupOrderRaw)) {
      throw new BadRequestException('groupOrder es invalido.');
    }

    if (!knockoutRaw || typeof knockoutRaw !== 'object' || Array.isArray(knockoutRaw)) {
      throw new BadRequestException('knockout es invalido.');
    }

    const groupOrder = groupOrderRaw as Record<string, unknown>;
    const groupEntries = Object.entries(groupOrder);

    if (groupEntries.length !== 12) {
      throw new BadRequestException('Debes enviar los 12 grupos completos.');
    }

    const seenCodes = new Set<string>();

    groupEntries.forEach(([groupName, codes]) => {
      if (!this.isStringArrayWithLength(codes, 4)) {
        throw new BadRequestException(`Grupo invalido: ${groupName}.`);
      }

      codes.forEach((code) => {
        if (seenCodes.has(code)) {
          throw new BadRequestException(`Codigo repetido en grupos: ${code}.`);
        }

        seenCodes.add(code);
      });
    });

    const knockout = knockoutRaw as Record<string, unknown>;
    const normalizedKnockout: KnockoutPrediction = {
      r32: [],
      r16: [],
      qf: [],
      sf: [],
      final: [],
      champion: [],
    };

    const knockoutShape: Array<{ key: keyof KnockoutPrediction; size: number }> = [
      { key: 'r32', size: 32 },
      { key: 'r16', size: 16 },
      { key: 'qf', size: 8 },
      { key: 'sf', size: 4 },
      { key: 'final', size: 2 },
      { key: 'champion', size: 1 },
    ];

    knockoutShape.forEach(({ key, size }) => {
      const value = knockout[key];

      if (!this.isStringArrayWithLength(value, size)) {
        throw new BadRequestException(`Ronda invalida: ${key}.`);
      }

      normalizedKnockout[key] = value;
    });

    return {
      groupOrder: groupOrder as GroupOrder,
      knockout: normalizedKnockout,
    };
  }

  private validateDraftGroupOrder(value: unknown): GroupOrder | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('groupOrder es invalido.');
    }

    const groupOrder = value as Record<string, unknown>;
    const groupEntries = Object.entries(groupOrder);

    if (groupEntries.length > 12) {
      throw new BadRequestException('groupOrder no puede tener mas de 12 grupos.');
    }

    const seenCodes = new Set<string>();

    groupEntries.forEach(([groupName, codes]) => {
      if (!this.isStringArrayWithLength(codes, 4)) {
        throw new BadRequestException(`Grupo invalido: ${groupName}.`);
      }

      codes.forEach((code) => {
        if (seenCodes.has(code)) {
          throw new BadRequestException(`Codigo repetido en grupos: ${code}.`);
        }

        seenCodes.add(code);
      });
    });

    return groupOrder as GroupOrder;
  }

  private validateDraftKnockout(value: unknown): KnockoutDraftPrediction | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('knockout es invalido.');
    }

    const knockout = value as Record<string, unknown>;
    const normalizeRound = (round: unknown, key: string, size: number): Array<string | null> => {
      if (!Array.isArray(round) || round.length !== size) {
        throw new BadRequestException(`Ronda invalida: ${key}.`);
      }

      return round.map((slot) => {
        if (slot === null || (typeof slot === 'string' && slot.length > 0)) {
          return slot;
        }

        throw new BadRequestException(`Ronda invalida: ${key}.`);
      });
    };

    return {
      r32: normalizeRound(knockout.r32, 'r32', 32),
      r16: normalizeRound(knockout.r16, 'r16', 16),
      qf: normalizeRound(knockout.qf, 'qf', 8),
      sf: normalizeRound(knockout.sf, 'sf', 4),
      final: normalizeRound(knockout.final, 'final', 2),
      champion: normalizeRound(knockout.champion, 'champion', 1),
    };
  }

  private validateDraftPayload(payload: Record<string, unknown>): PredictionDraftPayload {
    const groupOrder = this.validateDraftGroupOrder(payload.groupOrder);
    const knockout = this.validateDraftKnockout(payload.knockout);

    if (!groupOrder && !knockout) {
      throw new BadRequestException('Debes enviar groupOrder, knockout o ambos.');
    }

    return {
      ...(groupOrder ? { groupOrder } : {}),
      ...(knockout ? { knockout } : {}),
    };
  }

  private validateOfficialGroupOrder(value: unknown): OfficialGroupOrder | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('groupOrder es invalido.');
    }

    const groupOrder = value as Record<string, unknown>;
    const groupEntries = Object.entries(groupOrder);

    if (groupEntries.length > 12) {
      throw new BadRequestException('groupOrder no puede tener mas de 12 grupos.');
    }

    const seenCodes = new Set<string>();

    groupEntries.forEach(([groupName, codes]) => {
      if (!this.isNullableStringArrayWithLength(codes, 4)) {
        throw new BadRequestException(`Grupo invalido: ${groupName}.`);
      }

      codes.forEach((code) => {
        if (!code) {
          return;
        }

        if (seenCodes.has(code)) {
          throw new BadRequestException(`Codigo repetido en grupos: ${code}.`);
        }

        seenCodes.add(code);
      });
    });

    return groupOrder as OfficialGroupOrder;
  }

  private validateOfficialKnockout(value: unknown): OfficialKnockout | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('knockout es invalido.');
    }

    const knockout = value as Record<string, unknown>;
    const shape: Array<{ key: keyof OfficialKnockout; size: number }> = [
      { key: 'r32', size: 32 },
      { key: 'r16', size: 16 },
      { key: 'qf', size: 8 },
      { key: 'sf', size: 4 },
      { key: 'final', size: 2 },
      { key: 'champion', size: 1 },
    ];

    const normalized = this.createEmptyKnockout();

    shape.forEach(({ key, size }) => {
      const round = knockout[key];

      if (!this.isNullableStringArrayWithLength(round, size)) {
        throw new BadRequestException(`Ronda invalida: ${String(key)}.`);
      }

      const seenCodes = new Set<string>();

      round.forEach((code) => {
        if (!code) {
          return;
        }

        if (seenCodes.has(code)) {
          throw new BadRequestException(`Codigo repetido en ronda: ${String(key)}.`);
        }

        seenCodes.add(code);
      });

      normalized[key] = round;
    });

    return normalized;
  }

  private validateOfficialResultsPayload(payload: Record<string, unknown>): OfficialResultsPayload {
    const groupOrder = this.validateOfficialGroupOrder(payload.groupOrder);
    const knockout = this.validateOfficialKnockout(payload.knockout);

    if (!groupOrder && !knockout) {
      throw new BadRequestException('Debes enviar groupOrder, knockout o ambos.');
    }

    return {
      ...(groupOrder ? { groupOrder } : {}),
      ...(knockout ? { knockout } : {}),
    };
  }

  private toIsoDate(value?: Date): string {
    if (!value || Number.isNaN(value.getTime())) {
      return '';
    }

    return value.toISOString();
  }

  private mapPredictionRecord(record: PredictionRecord | null): StoredPrediction | null {
    if (!record) {
      return null;
    }

    return {
      discordId: record.discordId,
      username: record.username,
      payload: record.payload ?? {},
      points: record.points ?? 0,
      createdAt: this.toIsoDate(record.createdAt),
      updatedAt: this.toIsoDate(record.updatedAt),
    };
  }

  private async recalculateAllPredictionPoints(officialResults: OfficialResults): Promise<void> {
    const predictions = await this.predictionModel.find().lean<PredictionRecord[]>().exec();

    if (!predictions.length) {
      return;
    }

    const operations = predictions.map((prediction) => ({
        updateOne: {
          filter: { discordId: prediction.discordId },
          update: {
            $set: {
              points: this.calculatePoints(prediction.payload ?? {}, officialResults),
            },
          },
        },
      }));

    if (!operations.length) {
      return;
    }

    await this.predictionModel.collection.bulkWrite(operations);
  }

  private mapOfficialResultRecord(record: OfficialResultRecord | null): OfficialResults {
    const fallback = this.createEmptyOfficialResults();

    if (!record) {
      return fallback;
    }

    return {
      groupOrder: record.groupOrder ?? fallback.groupOrder,
      knockout: record.knockout ?? fallback.knockout,
      updatedAt: this.toIsoDate(record.updatedAt),
      updatedBy: record.updatedBy ?? '',
    };
  }

  private async readOfficialResultsRecord(): Promise<OfficialResultRecord | null> {
    const record = await this.officialResultModel.findOne({ key: 'active' }).lean<OfficialResultRecord>().exec();
    return record ?? null;
  }

  private async upsertPrediction(input: {
    discordId: string;
    username: string;
    payload: PredictionDraftPayload;
  }): Promise<StoredPrediction> {
    const now = new Date();
    const existing = await this.predictionModel.findOne({ discordId: input.discordId }).lean<PredictionRecord>().exec();
    const officialResults = this.mapOfficialResultRecord(await this.readOfficialResultsRecord());

    const mergedPayload: PredictionDraftPayload = {
      ...(existing?.payload ?? {}),
      ...input.payload,
    };

    const points = this.calculatePoints(mergedPayload, officialResults);

    await this.predictionModel
      .updateOne(
        { discordId: input.discordId },
        {
          $set: {
            username: input.username,
            payload: mergedPayload,
            points,
            updatedAt: now,
          },
          $setOnInsert: {
            createdAt: now,
          },
        },
        { upsert: true },
      )
      .exec();

    const updated = await this.predictionModel.findOne({ discordId: input.discordId }).lean<PredictionRecord>().exec();
    const mapped = this.mapPredictionRecord(updated ?? null);

    if (!mapped) {
      throw new NotFoundException('No se pudo guardar la prediccion.');
    }

    return mapped;
  }

  async getPredictionByDiscordId(discordId: string): Promise<StoredPrediction | null> {
    const prediction = await this.predictionModel.findOne({ discordId }).lean<PredictionRecord>().exec();
    return this.mapPredictionRecord(prediction ?? null);
  }

  async getPredictions(): Promise<StoredPrediction[]> {
    const predictions = await this.predictionModel.find().sort({ updatedAt: -1 }).lean<PredictionRecord[]>().exec();

    return predictions
      .map((prediction) => this.mapPredictionRecord(prediction))
      .filter((prediction): prediction is StoredPrediction => prediction !== null);
  }

  async getOfficialResults(): Promise<OfficialResults> {
    const record = await this.readOfficialResultsRecord();
    return this.mapOfficialResultRecord(record);
  }

  private isAdmin(discordId: string): boolean {
    return discordId === this.adminDiscordId;
  }

  async saveDraftPrediction(input: {
    discordId: string;
    username: string;
    payload: Record<string, unknown>;
  }): Promise<StoredPrediction> {
    const validatedPayload = this.validateDraftPayload(input.payload);
    return this.upsertPrediction({
      discordId: input.discordId,
      username: input.username,
      payload: validatedPayload,
    });
  }

  async savePrediction(input: {
    discordId: string;
    username: string;
    payload: Record<string, unknown>;
  }): Promise<StoredPrediction> {
    const validatedPayload = this.validatePayload(input.payload);
    return this.upsertPrediction({
      discordId: input.discordId,
      username: input.username,
      payload: validatedPayload,
    });
  }

  async saveOfficialResults(input: {
    discordId: string;
    payload: Record<string, unknown>;
  }): Promise<OfficialResults> {
    if (!this.isAdmin(input.discordId)) {
      throw new ForbiddenException('No tienes permiso para editar los resultados oficiales.');
    }

    const validatedPayload = this.validateOfficialResultsPayload(input.payload);
    const current = await this.readOfficialResultsRecord();
    const fallback = this.createEmptyOfficialResults();
    const now = new Date();

    const updated: OfficialResultRecord = {
      key: 'active',
      groupOrder: validatedPayload.groupOrder ?? current?.groupOrder ?? fallback.groupOrder,
      knockout: validatedPayload.knockout ?? current?.knockout ?? fallback.knockout,
      updatedAt: now,
      updatedBy: input.discordId,
    };

    await this.officialResultModel
      .updateOne(
        { key: 'active' },
        {
          $set: updated,
        },
        { upsert: true },
      )
      .exec();

    const mapped = this.mapOfficialResultRecord(updated);
    await this.recalculateAllPredictionPoints(mapped);

    return mapped;
  }
}