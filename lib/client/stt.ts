import {
  SONIOX_STT_MODEL,
  SONIOX_STT_SAMPLE_RATE,
  SONIOX_STT_URL,
} from "../constants";
import { inferLanguage } from "../language";
import type { SpeechLanguage, TranscriptUtterance } from "../types";

type SttToken = {
  text?: string;
  is_final?: boolean;
  speaker?: string;
  language?: string;
  start_ms?: number;
  end_ms?: number;
};

export type SttHandlers = {
  onPartial: (text: string) => void;
  onEndpoint: (utterance: TranscriptUtterance) => void;
  onError: (message: string) => void;
};

export class SonioxSttClient {
  private socket: WebSocket | null = null;
  private keepalive: number | null = null;
  private finals = "";
  private speaker = "1";
  private language: SpeechLanguage = "en";
  private startMs = 0;
  private endMs = 0;
  private ready = false;

  constructor(private handlers: SttHandlers) {}

  async connect(apiKey: string) {
    this.socket = new WebSocket(SONIOX_STT_URL);
    await waitForOpen(this.socket);
    this.socket.send(
      JSON.stringify({
        api_key: apiKey,
        model: SONIOX_STT_MODEL,
        audio_format: "pcm_s16le",
        sample_rate: SONIOX_STT_SAMPLE_RATE,
        num_channels: 1,
        language_hints: ["sl", "en"],
        enable_speaker_diarization: true,
        enable_language_identification: true,
        enable_endpoint_detection: true,
        max_endpoint_delay_ms: 1500,
        endpoint_sensitivity: 0.15,
        context: {
          terms: ["Third Wheel", "hey Third Wheel", "hej Third Wheel"],
          general: [
            {
              key: "product",
              value: "Third Wheel, a quiet table companion that speaks rarely",
            },
          ],
        },
      }),
    );
    this.ready = true;
    this.socket.addEventListener("message", (event) => this.onMessage(event.data));
    this.socket.addEventListener("error", () =>
      this.handlers.onError("Speech recognition disconnected"),
    );
    this.keepalive = window.setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({ type: "keepalive" }));
      }
    }, 15_000);
  }

  sendPcm(pcm: Int16Array) {
    if (!this.ready || this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength));
  }

  close() {
    this.ready = false;
    if (this.keepalive) window.clearInterval(this.keepalive);
    this.keepalive = null;
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(new Uint8Array());
    }
    this.socket?.close();
    this.socket = null;
  }

  private onMessage(raw: string) {
    let data: { tokens?: SttToken[]; error_message?: string };
    try {
      data = JSON.parse(raw) as { tokens?: SttToken[]; error_message?: string };
    } catch {
      return;
    }
    if (data.error_message) {
      this.handlers.onError("Speech recognition error");
      return;
    }

    const tokens = data.tokens ?? [];
    let nonFinal = "";
    let sawEndpoint = false;

    for (const token of tokens) {
      const text = token.text ?? "";
      if (!text) continue;
      if (token.speaker) this.speaker = token.speaker;
      if (token.language) this.language = inferLanguage("", token.language);
      if (typeof token.start_ms === "number" && !this.startMs) {
        this.startMs = token.start_ms;
      }
      if (typeof token.end_ms === "number") this.endMs = token.end_ms;

      if (text === "<end>") {
        sawEndpoint = true;
        continue;
      }

      if (token.is_final) this.finals += text;
      else nonFinal += text;
    }

    const partial = `${this.finals}${nonFinal}`.replace(/\s+/g, " ").trim();
    this.handlers.onPartial(partial);

    if (sawEndpoint) {
      const text = this.finals.replace(/\s+/g, " ").trim();
      this.finals = "";
      if (!text) return;
      const utterance: TranscriptUtterance = {
        speaker: this.speaker,
        text,
        language: inferLanguage(text, this.language),
        startMs: this.startMs || this.endMs,
        endMs: this.endMs || Date.now(),
      };
      this.startMs = 0;
      this.handlers.onEndpoint(utterance);
    }
  }
}

function waitForOpen(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.addEventListener("open", () => resolve(), { once: true });
    socket.addEventListener(
      "error",
      () => reject(new Error("Could not open speech recognition")),
      { once: true },
    );
  });
}
