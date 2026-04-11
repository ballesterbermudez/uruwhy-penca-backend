import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';

type StoredPrediction = {
  discordId: string;
  username: string;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

type OfficialResults = {
  groupOrder: Record<string, Array<string | null>>;
  knockout: {
    r32: Array<string | null>;
    r16: Array<string | null>;
    qf: Array<string | null>;
    sf: Array<string | null>;
    final: Array<string | null>;
    champion: Array<string | null>;
  };
  updatedAt: string;
  updatedBy: string;
};

const GROUP_NAMES = [
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
] as const;

const KNOCKOUT_STAGES = ['r32', 'r16', 'qf', 'sf', 'final', 'champion'] as const;

function normalizeCode(code: string | null | undefined): string | null {
  if (typeof code !== 'string') {
    return null;
  }

  const normalized = code.trim().toUpperCase();
  return normalized.length ? normalized : null;
}

function calculatePoints(payload: Record<string, unknown>, official: OfficialResults | null): number {
  if (!official) {
    return 0;
  }

  const groupOrder = (payload.groupOrder as Record<string, Array<string | null>> | undefined) ?? {};
  const knockout =
    (payload.knockout as Record<(typeof KNOCKOUT_STAGES)[number], Array<string | null> | undefined> | undefined) ?? {};

  let points = 0;

  GROUP_NAMES.forEach((groupName) => {
    const predicted = groupOrder[groupName] ?? [];
    const officialCodes = official.groupOrder[groupName] ?? [];

    for (let index = 0; index < 4; index += 1) {
      const officialCode = normalizeCode(officialCodes[index]);

      if (!officialCode) {
        continue;
      }

      if (normalizeCode(predicted[index]) === officialCode) {
        points += 1;
      }
    }
  });

  KNOCKOUT_STAGES.forEach((stage) => {
    const predicted = knockout[stage] ?? [];
    const officialCodes = official.knockout[stage] ?? [];
    const remaining = new Map<string, number>();

    officialCodes.forEach((code) => {
      const normalized = normalizeCode(code);

      if (!normalized) {
        return;
      }

      remaining.set(normalized, (remaining.get(normalized) ?? 0) + 1);
    });

    predicted.forEach((code) => {
      const normalized = normalizeCode(code);

      if (!normalized) {
        return;
      }

      const current = remaining.get(normalized) ?? 0;

      if (current <= 0) {
        return;
      }

      points += 1;
      remaining.set(normalized, current - 1);
    });
  });

  return points;
}

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function run() {
  dotenv.config();

  const mongoUri = process.env.DB_URI;
  const dbName = process.env.DB_NAME || 'penca';

  if (!mongoUri) {
    throw new Error('DB_URI no esta definido en .env');
  }

  const dataDir = resolve(process.cwd(), 'data');
  const predictionsPath = resolve(dataDir, 'predictions.json');
  const officialPath = resolve(dataDir, 'official-results.json');

  const predictions = await readJson<StoredPrediction[]>(predictionsPath, []);
  const officialResults = await readJson<OfficialResults | null>(officialPath, null);

  const client = new MongoClient(mongoUri);
  await client.connect();

  try {
    const db = client.db(dbName);
    const predictionsCollection = db.collection('predictions');
    const officialCollection = db.collection('official_results');

    await predictionsCollection.createIndex({ discordId: 1 }, { unique: true });
    await officialCollection.createIndex({ key: 1 }, { unique: true });

    let migratedPredictions = 0;

    for (const prediction of predictions) {
      if (!prediction?.discordId) {
        continue;
      }

      await predictionsCollection.updateOne(
        { discordId: prediction.discordId },
        {
          $set: {
            username: prediction.username,
            payload: prediction.payload,
            points: calculatePoints(prediction.payload, officialResults),
            createdAt: prediction.createdAt ? new Date(prediction.createdAt) : new Date(),
            updatedAt: prediction.updatedAt ? new Date(prediction.updatedAt) : new Date(),
          },
        },
        { upsert: true },
      );

      migratedPredictions += 1;
    }

    if (officialResults) {
      await officialCollection.updateOne(
        { key: 'active' },
        {
          $set: {
            key: 'active',
            groupOrder: officialResults.groupOrder,
            knockout: officialResults.knockout,
            updatedAt: officialResults.updatedAt ? new Date(officialResults.updatedAt) : new Date(),
            updatedBy: officialResults.updatedBy || '',
          },
        },
        { upsert: true },
      );
    }

    console.log(`Predicciones migradas: ${migratedPredictions}`);
    console.log(`Resultados oficiales migrados: ${officialResults ? 'si' : 'no (archivo inexistente o vacio)'}`);
    console.log(`Base objetivo: ${dbName}`);
  } finally {
    await client.close();
  }
}

run().catch((error: unknown) => {
  console.error('Fallo la migracion JSON -> MongoDB:', error);
  process.exit(1);
});
