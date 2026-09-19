import { requireEnv } from "./env";

export type SonioxUsageType = "transcribe_websocket" | "tts_rt";

export async function createTemporarySonioxKey(usageType: SonioxUsageType) {
  const response = await fetch("https://api.soniox.com/v1/auth/temporary-api-key", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireEnv("SONIOX_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      usage_type: usageType,
      expires_in_seconds: 3600,
      single_use: true,
      max_session_duration_seconds: 3600,
    }),
  });

  if (!response.ok) {
    throw new Error("Could not create a temporary Soniox key");
  }

  const data = (await response.json()) as {
    api_key?: string;
    expires_at?: string;
  };

  if (!data.api_key) {
    throw new Error("Soniox temporary key response was empty");
  }

  return { apiKey: data.api_key, expiresAt: data.expires_at ?? null };
}
