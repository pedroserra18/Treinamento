import { randomUUID } from "node:crypto";

import { env } from "../../config/env";
import { redisClient } from "../../config/redis";

type OAuthStateMode = "login" | "link";

type OAuthStatePayload = {
  mode: OAuthStateMode;
  userId?: string;
};

const memoryStateStore = new Map<string, { payload: OAuthStatePayload; expiresAt: number }>();

function buildRedisKey(state: string): string {
  return `oauth:state:${state}`;
}

export async function createOAuthState(payload: OAuthStatePayload): Promise<string> {
  const state = randomUUID();
  const expiresAt = Date.now() + env.oauthStateTtlMin * 60 * 1000;

  if (redisClient) {
    await redisClient.set(
      buildRedisKey(state),
      JSON.stringify(payload),
      "EX",
      env.oauthStateTtlMin * 60
    );
    return state;
  }

  memoryStateStore.set(state, { payload, expiresAt });
  return state;
}

export async function consumeOAuthState(state: string): Promise<OAuthStatePayload | null> {
  if (redisClient) {
    const key = buildRedisKey(state);
    const raw = await redisClient.get(key);
    if (!raw) {
      return null;
    }

    await redisClient.del(key);
    return JSON.parse(raw) as OAuthStatePayload;
  }

  const stored = memoryStateStore.get(state);
  if (!stored) {
    return null;
  }

  memoryStateStore.delete(state);
  if (stored.expiresAt <= Date.now()) {
    return null;
  }

  return stored.payload;
}
