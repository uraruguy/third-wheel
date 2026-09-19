export const BUFFER_MAX_MS = 5 * 60 * 1000;
export const RECENT_SPEECH_MS = 20 * 1000;
export const TOPIC_SUMMARY_MS = 2.5 * 60 * 1000;
export const TOPIC_WINDOW_MS = 90 * 1000;
export const CONVERSATION_WINDOW_MS = 18 * 1000;

export const JEV_MODEL = "typesafe/jev-1.13";
export const SPEAK_MODEL = "google/gemini-3.1-flash-lite";

export const SONIOX_STT_URL = "wss://stt-rt.soniox.com/transcribe-websocket";
export const SONIOX_TTS_URL = "wss://tts-rt.soniox.com/tts-websocket";
export const SONIOX_STT_MODEL = "stt-rt-v5";
export const SONIOX_TTS_MODEL = "tts-rt-v2";
export const SONIOX_TTS_VOICE = "Mina";
export const SONIOX_TTS_SAMPLE_RATE = 24_000;
export const SONIOX_STT_SAMPLE_RATE = 16_000;

export const CORRECTION_THRESHOLD = 0.82;
export const LOOKUP_THRESHOLD = 0.25;
export const FOLLOWUP_THRESHOLD = 0.4;
export const NEEDS_WEB_THRESHOLD = 0.5;
