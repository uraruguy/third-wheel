import {
  SONIOX_TTS_MODEL,
  SONIOX_TTS_SAMPLE_RATE,
  SONIOX_TTS_URL,
  SONIOX_TTS_VOICE,
} from "../constants";
import { pcm16ToFloat32 } from "./pcm";
import type { SpeechLanguage } from "../types";

export class SonioxTtsPlayer {
  private context: AudioContext | null = null;
  private socket: WebSocket | null = null;
  private streamId = "";
  private nextTime = 0;
  private sources: AudioBufferSourceNode[] = [];
  private playing = false;
  private ended: (() => void) | null = null;

  get isPlaying() {
    return this.playing;
  }

  async speak(
    apiKey: string,
    text: string,
    language: SpeechLanguage,
  ): Promise<void> {
    if (!text.trim()) return;
    await this.startStream(apiKey, language);
    this.sendText(text, true);
    await this.waitUntilEnded();
  }

  async startStream(apiKey: string, language: SpeechLanguage) {
    this.stopInternal(false);
    this.context = this.context ?? new AudioContext();
    if (this.context.state === "suspended") await this.context.resume();
    this.streamId = `tw-${crypto.randomUUID()}`;
    this.socket = new WebSocket(SONIOX_TTS_URL);
    await waitForOpen(this.socket);
    this.playing = true;
    this.nextTime = this.context.currentTime;
    this.socket.send(
      JSON.stringify({
        api_key: apiKey,
        model: SONIOX_TTS_MODEL,
        language,
        voice: SONIOX_TTS_VOICE,
        audio_format: "pcm_s16le",
        sample_rate: SONIOX_TTS_SAMPLE_RATE,
        stream_id: this.streamId,
      }),
    );
    this.socket.addEventListener("message", (event) => this.onMessage(String(event.data)));
  }

  sendText(text: string, end = false) {
    if (!text && !end) return;
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(
      JSON.stringify({
        stream_id: this.streamId,
        text,
        text_end: end,
      }),
    );
  }

  waitUntilIdle(timeoutMs = 20_000) {
    if (!this.playing) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const timer = window.setTimeout(() => {
        this.finish();
        resolve();
      }, timeoutMs);
      const previous = this.ended;
      this.ended = () => {
        window.clearTimeout(timer);
        previous?.();
        resolve();
      };
    });
  }

  bargeIn() {
    if (this.socket?.readyState === WebSocket.OPEN && this.streamId) {
      this.socket.send(JSON.stringify({ stream_id: this.streamId, cancel: true }));
    }
    this.stopInternal(true);
  }

  close() {
    this.bargeIn();
    void this.context?.close();
    this.context = null;
  }

  private onMessage(raw: string) {
    let data: {
      audio?: string;
      audio_end?: boolean;
      terminated?: boolean;
      error_message?: string;
    };
    try {
      data = JSON.parse(raw) as typeof data;
    } catch {
      return;
    }
    if (data.error_message) {
      this.finish();
      return;
    }
    if (data.audio) this.enqueueAudio(data.audio);
    if (data.audio_end || data.terminated) this.scheduleFinish();
  }

  private enqueueAudio(base64: string) {
    if (!this.context || !this.playing) return;
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const samples = pcm16ToFloat32(bytes);
    if (samples.length === 0) return;
    const buffer = this.context.createBuffer(1, samples.length, SONIOX_TTS_SAMPLE_RATE);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) channel[i] = samples[i] ?? 0;
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.context.destination);
    this.nextTime = Math.max(this.context.currentTime, this.nextTime);
    source.start(this.nextTime);
    this.nextTime += buffer.duration;
    this.sources.push(source);
    source.onended = () => {
      this.sources = this.sources.filter((item) => item !== source);
    };
  }

  private scheduleFinish() {
    if (!this.context) {
      this.finish();
      return;
    }
    const waitMs = Math.max(0, (this.nextTime - this.context.currentTime) * 1000) + 40;
    window.setTimeout(() => this.finish(), waitMs);
  }

  private finish() {
    if (!this.playing) return;
    this.playing = false;
    this.socket?.close();
    this.socket = null;
    this.ended?.();
    this.ended = null;
  }

  private waitUntilEnded() {
    return new Promise<void>((resolve) => {
      this.ended = () => resolve();
    });
  }

  private stopInternal(stopSources: boolean) {
    this.playing = false;
    if (stopSources) {
      for (const source of this.sources) {
        try {
          source.stop();
        } catch {
          // Already stopped.
        }
      }
      this.sources = [];
      this.nextTime = 0;
    }
    this.socket?.close();
    this.socket = null;
    this.ended?.();
    this.ended = null;
  }
}

function waitForOpen(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.addEventListener("open", () => resolve(), { once: true });
    socket.addEventListener(
      "error",
      () => reject(new Error("Could not open speech playback")),
      { once: true },
    );
  });
}
