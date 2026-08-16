import { Pool, type PoolClient } from "pg";
import type { AppState, SessionRecord, UserRecord } from "./store.js";

export interface PostgresPersistence {
  load(): Promise<AppState | null>;
  save(state: AppState): Promise<void>;
}

const LOCK_ID = 734_105_856;

async function migrate(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS litefx_users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL
    );
    CREATE TABLE IF NOT EXISTS litefx_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES litefx_users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL
    );
    CREATE TABLE IF NOT EXISTS litefx_trips (
      owner_id TEXT PRIMARY KEY,
      state JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS litefx_sessions_user_id_idx
      ON litefx_sessions(user_id);
    CREATE INDEX IF NOT EXISTS litefx_sessions_expires_at_idx
      ON litefx_sessions(expires_at);
  `);
}

function userFromRow(row: Record<string, unknown>): UserRecord {
  return {
    id: String(row.id),
    email: String(row.email),
    name: String(row.name),
    passwordHash: String(row.password_hash),
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

function sessionFromRow(row: Record<string, unknown>): SessionRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    tokenHash: String(row.token_hash),
    createdAt: new Date(String(row.created_at)).toISOString(),
    expiresAt: new Date(String(row.expires_at)).toISOString(),
  };
}

export async function createPostgresPersistence(
  connectionString: string,
): Promise<PostgresPersistence> {
  const pool = new Pool({
    connectionString,
    max: 3,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  const setup = await pool.connect();
  try {
    await migrate(setup);
  } finally {
    setup.release();
  }

  let writeQueue = Promise.resolve();

  return {
    async load() {
      const client = await pool.connect();
      try {
        const [users, sessions, trips] = await Promise.all([
          client.query("SELECT * FROM litefx_users ORDER BY created_at"),
          client.query("SELECT * FROM litefx_sessions ORDER BY created_at"),
          client.query("SELECT owner_id, state FROM litefx_trips"),
        ]);
        if (
          users.rowCount === 0 &&
          sessions.rowCount === 0 &&
          trips.rowCount === 0
        ) {
          return null;
        }
        return {
          version: 2,
          users: users.rows.map(userFromRow),
          sessions: sessions.rows.map(sessionFromRow),
          trips: Object.fromEntries(
            trips.rows.map((row) => [String(row.owner_id), row.state]),
          ),
        };
      } finally {
        client.release();
      }
    },

    save(state) {
      const snapshot = structuredClone(state);
      const write = async () => {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          await client.query("SELECT pg_advisory_xact_lock($1)", [LOCK_ID]);
          await client.query("DELETE FROM litefx_sessions");
          await client.query("DELETE FROM litefx_trips");
          await client.query("DELETE FROM litefx_users");

          for (const user of snapshot.users) {
            await client.query(
              `INSERT INTO litefx_users
                (id, email, name, password_hash, created_at)
               VALUES ($1, $2, $3, $4, $5)`,
              [
                user.id,
                user.email,
                user.name,
                user.passwordHash,
                user.createdAt,
              ],
            );
          }
          for (const session of snapshot.sessions) {
            await client.query(
              `INSERT INTO litefx_sessions
                (id, user_id, token_hash, created_at, expires_at)
               VALUES ($1, $2, $3, $4, $5)`,
              [
                session.id,
                session.userId,
                session.tokenHash,
                session.createdAt,
                session.expiresAt,
              ],
            );
          }
          for (const [ownerId, trip] of Object.entries(snapshot.trips)) {
            await client.query(
              `INSERT INTO litefx_trips (owner_id, state, updated_at)
               VALUES ($1, $2::jsonb, NOW())`,
              [ownerId, JSON.stringify(trip)],
            );
          }
          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      };
      writeQueue = writeQueue.then(write, write);
      return writeQueue;
    },
  };
}
