import { CONVERSATION_WINDOW_MS } from "../constants";
import { looksLikeEcho, spokenTextForTts } from "../echo";
import {
  pruneTranscript,
  recentSpeechWindow,
  topicSummary,
  topicWindow,
} from "../transcript-window";
import type { Source, SpeakMode, SpeechLanguage, TranscriptUtterance } from "../types";
import { detectFollowUp, detectWakePhrase } from "../wake-phrase";
import { startMicCapture, type CaptureHandle } from "./mic";
import { SonioxSttClient } from "./stt";
import { SonioxTtsPlayer } from "./tts";

export type Phase = "idle" | "listening" | "thinking" | "speaking";

export type SpokenTurn = {
  text: string;
  sources: Source[];
  mode: SpeakMode;
};

export type SessionSnapshot = {
  phase: Phase;
  partial: string;
  spoken: SpokenTurn | null;
  error: string | null;
  inConversation: boolean;
};

const DUCK_GAIN = 0.1;

export class ThirdWheelSession {
  private capture: CaptureHandle | null = null;
  private stt: SonioxSttClient | null = null;
  private tts = new SonioxTtsPlayer();
  private utterances: TranscriptUtterance[] = [];
  private phase: Phase = "idle";
  private partial = "";
  private spoken: SpokenTurn | null = null;
  private error: string | null = null;
  private conversationUntil = 0;
  private conversationTimer: number | null = null;
  private lastSpokenText = "";
  private generation = 0;
  private wakeLockUntil = 0;
  private ignoreJevUntil = 0;
  private running = false;

  constructor(private onChange: (snapshot: SessionSnapshot) => void) {}

  get snapshot(): SessionSnapshot {
    return {
      phase: this.phase,
      partial: this.partial,
      spoken: this.spoken,
      error: this.error,
      inConversation: Date.now() < this.conversationUntil,
    };
  }

  async start() {
    if (this.running) return;
    this.running = true;
    this.error = null;
    this.setPhase("listening");
    try {
      const sttKey = await fetchTempKey("transcribe_websocket");
      this.stt = new SonioxSttClient({
        onPartial: (text) => this.onPartial(text),
        onEndpoint: (utterance) => this.onEndpoint(utterance),
        onError: (message) => this.fail(message),
      });
      await this.stt.connect(sttKey);
      this.capture = await startMicCapture((pcm) => this.stt?.sendPcm(pcm));
    } catch {
      this.fail("Microphone or speech service is unavailable");
      this.stop();
    }
  }

  stop() {
    this.running = false;
    this.generation += 1;
    this.capture?.stop();
    this.capture = null;
    this.stt?.close();
    this.stt = null;
    this.tts.close();
    if (this.conversationTimer) window.clearTimeout(this.conversationTimer);
    this.conversationTimer = null;
    this.conversationUntil = 0;
    this.phase = "idle";
    this.partial = "";
    this.emit();
  }

  private onPartial(text: string) {
    this.partial = text;
    this.emit();
    if (!text || !this.running) return;

    const wake = detectWakePhrase(text);
    if (wake.matched && Date.now() > this.wakeLockUntil) {
      this.wakeLockUntil = Date.now() + 4000;
      void this.speakNow({
        mode: "addressed",
        latestSpeech: text,
        followUpQuery: wake.remainder || undefined,
        useWeb: true,
      });
      return;
    }

    if (this.inConversation) {
      const follow = detectFollowUp(text);
      if (follow.matched) {
        void this.speakNow({
          mode: "followup",
          latestSpeech: text,
          followUpQuery: follow.query,
          useWeb: true,
        });
      }
    }
  }

  private onEndpoint(utterance: TranscriptUtterance) {
    const now = Date.now();
    if (this.tts.isPlaying && looksLikeEcho(utterance.text, this.lastSpokenText)) {
      return;
    }
    if (now < this.ignoreJevUntil && looksLikeEcho(utterance.text, this.lastSpokenText)) {
      return;
    }

    this.utterances = pruneTranscript([...this.utterances, utterance], now);
    this.partial = "";
    this.emit();

    if (Date.now() < this.wakeLockUntil) return;

    const follow = detectFollowUp(utterance.text);
    if (this.inConversation && follow.matched) {
      void this.speakNow({
        mode: "followup",
        latestSpeech: utterance.text,
        followUpQuery: follow.query,
        useWeb: true,
      });
      return;
    }

    if (this.tts.isPlaying || this.phase === "thinking" || this.phase === "speaking") {
      return;
    }

    void this.decide(utterance);
  }

  private async decide(utterance: TranscriptUtterance) {
    const generation = ++this.generation;
    this.setPhase("thinking");
    const now = Date.now();
    try {
      const response = await fetch("/api/decide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recentSpeech: recentSpeechWindow(this.utterances, now) || utterance.text,
          topicSummary: topicSummary(this.utterances, now),
          inConversation: this.inConversation,
          addressed: false,
        }),
      });
      const decision = (await response.json()) as {
        speak?: boolean;
        mode?: SpeakMode;
        useWeb?: boolean;
      };
      if (generation !== this.generation || !this.running) return;
      if (!decision.speak) {
        this.setPhase("listening");
        return;
      }
      await this.speakNow({
        mode: decision.mode ?? "lookup",
        latestSpeech: utterance.text,
        useWeb: decision.useWeb !== false,
        language: utterance.language,
        generation,
      });
    } catch {
      if (generation === this.generation) this.setPhase("listening");
    }
  }

  private async speakNow(input: {
    mode: SpeakMode;
    latestSpeech: string;
    followUpQuery?: string;
    useWeb: boolean;
    language?: SpeechLanguage;
    generation?: number;
  }) {
    if (this.tts.isPlaying) this.tts.bargeIn();
    const generation = input.generation ?? ++this.generation;
    this.setPhase("speaking");

    const language =
      input.language ??
      this.utterances.at(-1)?.language ??
      inferLatestLanguage(input.latestSpeech);

    let assembled = "";
    let sources: Source[] = [];
    let aborted = false;
    let endedSent = false;
    let ttsReady = false;
    let sentToTts = "";
    let spoke = false;

    const ensureTts = async () => {
      if (ttsReady) return;
      this.capture?.setGain(DUCK_GAIN);
      this.ignoreJevUntil = Date.now() + 60_000;
      const ttsKey = await fetchTempKey("tts_rt");
      if (generation !== this.generation) return;
      await this.tts.startStream(ttsKey, language);
      ttsReady = true;
    };

    const flushTts = async (full: string, done = false) => {
      const speakable = spokenTextForTts(full);
      if (!speakable) {
        if (done && ttsReady && !endedSent) {
          this.tts.sendText("", true);
          endedSent = true;
        }
        return;
      }
      await ensureTts();
      if (generation !== this.generation || !ttsReady) return;
      const next = speakable.slice(sentToTts.length);
      if (next || done) {
        this.tts.sendText(next, done);
        sentToTts = speakable;
        if (done) endedSent = true;
      }
    };

    try {
      const response = await fetch("/api/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topicWindow: topicWindow(this.utterances, Date.now()),
          latestSpeech: input.latestSpeech,
          mode: input.mode,
          useWeb: input.useWeb,
          language,
          followUpQuery: input.followUpQuery,
        }),
      });

      if (!response.body) throw new Error("empty");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const line = part
            .split("\n")
            .filter((item) => item.startsWith("data:"))
            .map((item) => item.slice(5).trim())
            .join("");
          if (!line) continue;
          let event: { type?: string; text?: string; sources?: Source[] };
          try {
            event = JSON.parse(line) as {
              type?: string;
              text?: string;
              sources?: Source[];
            };
          } catch {
            continue;
          }
          if (event.type === "no_speak") {
            aborted = true;
            this.tts.bargeIn();
            break;
          }
          if (event.type === "delta" && event.text) {
            assembled += event.text;
            this.spoken = {
              text: spokenTextForTts(assembled) || assembled,
              sources,
              mode: input.mode,
            };
            this.emit();
            await flushTts(assembled, false);
          }
          if (event.type === "done") {
            assembled = event.text || assembled;
            sources = event.sources ?? sources;
            this.spoken = {
              text: spokenTextForTts(assembled),
              sources,
              mode: input.mode,
            };
            this.emit();
            await flushTts(assembled, true);
          }
        }
        if (aborted) break;
      }

      const finalText = spokenTextForTts(assembled);
      if (!aborted && finalText) {
        if (!endedSent) await flushTts(assembled, true);
        this.lastSpokenText = finalText;
        this.spoken = {
          text: finalText,
          sources,
          mode: input.mode,
        };
        spoke = true;
        await this.tts.waitUntilIdle();
      }
    } catch {
      this.tts.bargeIn();
    } finally {
      this.capture?.setGain(1);
      this.ignoreJevUntil = Date.now() + 1200;
      if (generation === this.generation && this.running) {
        if (spoke) this.openConversationWindow();
        this.setPhase("listening");
      }
    }
  }

  private openConversationWindow() {
    this.conversationUntil = Date.now() + CONVERSATION_WINDOW_MS;
    if (this.conversationTimer) window.clearTimeout(this.conversationTimer);
    this.conversationTimer = window.setTimeout(() => {
      this.conversationUntil = 0;
      this.emit();
    }, CONVERSATION_WINDOW_MS);
    this.emit();
  }

  private get inConversation() {
    return Date.now() < this.conversationUntil || this.tts.isPlaying;
  }

  private setPhase(phase: Phase) {
    this.phase = phase;
    this.emit();
  }

  private fail(message: string) {
    this.error = message;
    this.phase = "idle";
    this.emit();
  }

  private emit() {
    this.onChange(this.snapshot);
  }
}

async function fetchTempKey(usageType: "transcribe_websocket" | "tts_rt") {
  const response = await fetch("/api/soniox/temporary-key", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usageType }),
  });
  const data = (await response.json()) as { apiKey?: string };
  if (!response.ok || !data.apiKey) {
    throw new Error("Temporary key unavailable");
  }
  return data.apiKey;
}

function inferLatestLanguage(text: string): SpeechLanguage {
  return /[čšžćđ]/i.test(text) ? "sl" : "en";
}
