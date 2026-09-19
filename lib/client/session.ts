import { CONVERSATION_WINDOW_MS } from "../constants";
import { looksLikeEcho, spokenTextForTts } from "../echo";
import {
  pruneTranscript,
  recentSpeechWindow,
  topicSummary,
  topicWindow,
} from "../transcript-window";
import type { Source, SpeakMode, SpeechLanguage, TranscriptUtterance } from "../types";
import {
  actionForIncoming,
  commitSpoken,
  spokenAfterInterrupt,
  type IncomingKind,
} from "../turn-lock";
import { detectFollowUp, detectWakePhrase, planUtterance } from "../wake-phrase";
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
  private lastWakePartialAt = 0;
  private pendingNameOnly = false;
  private ignoreJevUntil = 0;
  private inFlight = false;
  private running = false;
  private sessionId = "";

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
    this.sessionId = crypto.randomUUID();
    this.pendingNameOnly = false;
    this.inFlight = false;
    this.error = null;
    this.setPhase("listening");
    try {
      const sttKey = await fetchTempKey("transcribe_websocket", this.sessionId);
      this.stt = new SonioxSttClient({
        onPartial: (text) => this.onPartial(text),
        onEndpoint: (utterance) => this.onEndpoint(utterance),
        onError: (message) => {
          this.postDebug("error", { source: "stt", message });
          this.fail(message);
        },
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
    this.pendingNameOnly = false;
    this.inFlight = false;
    this.sessionId = "";
    this.phase = "idle";
    this.partial = "";
    this.spoken = spokenAfterInterrupt(this.spoken);
    this.emit();
  }

  private onPartial(text: string) {
    this.partial = text;
    this.emit();
    if (!text || !this.running) return;

    const wake = detectWakePhrase(text);
    const echo = looksLikeEcho(text, this.lastSpokenText);
    if (wake.matched && !echo) {
      this.postDebug("wake", {
        source: "partial",
        text,
        remainder: wake.remainder,
        nameOnly: wake.nameOnly,
        phrase: wake.phrase,
      });
      if (this.tts.isPlaying && Date.now() - this.lastWakePartialAt > 400) {
        this.tts.bargeIn();
      }
      this.lastWakePartialAt = Date.now();
    }

    if (this.inConversation && !this.inFlight) {
      const follow = detectFollowUp(text);
      if (follow.matched && !echo) {
        this.postDebug("follow_up", { source: "partial", query: follow.query, text });
        if (this.tts.isPlaying) this.tts.bargeIn();
      }
    }
  }

  private onEndpoint(utterance: TranscriptUtterance) {
    const now = Date.now();
    const echo = looksLikeEcho(utterance.text, this.lastSpokenText);
    this.postDebug("stt_endpoint", {
      text: utterance.text,
      echo,
      pendingNameOnly: this.pendingNameOnly,
      ttsPlaying: this.tts.isPlaying,
      inFlight: this.inFlight,
      phase: this.phase,
    });

    const plan = planUtterance({
      text: utterance.text,
      lastSpokenText: this.lastSpokenText,
      pendingNameOnly: this.pendingNameOnly,
      isEcho: echo,
    });

    if (plan.action === "ignore-echo") {
      return;
    }

    this.utterances = pruneTranscript([...this.utterances, utterance], now);
    this.partial = "";
    this.emit();

    if (plan.action === "wait-for-question") {
      this.beginTurn("name-call", utterance.text);
      this.pendingNameOnly = true;
      this.inFlight = false;
      this.postDebug("wake", {
        source: "endpoint",
        nameOnly: true,
        text: utterance.text,
      });
      this.setPhase("listening");
      return;
    }

    if (plan.action === "speak-addressed") {
      this.beginTurn("name-call", utterance.text);
      this.pendingNameOnly = false;
      this.postDebug("wake", {
        source: "endpoint",
        question: plan.question,
        text: utterance.text,
      });
      void this.speakNow({
        mode: "addressed",
        latestSpeech: utterance.text,
        followUpQuery: plan.question,
        useWeb: true,
        language: utterance.language,
      });
      return;
    }

    const follow = detectFollowUp(utterance.text);
    if (this.inConversation && follow.matched) {
      if (!this.beginTurn("followup", utterance.text)) return;
      this.postDebug("follow_up", { source: "endpoint", query: follow.query });
      void this.speakNow({
        mode: "followup",
        latestSpeech: utterance.text,
        followUpQuery: follow.query,
        useWeb: true,
        language: utterance.language,
      });
      return;
    }

    this.pendingNameOnly = false;

    if (now - this.lastWakePartialAt < 2500) return;

    if (!this.beginTurn("jev", utterance.text)) return;
    if (now < this.ignoreJevUntil) {
      this.inFlight = false;
      return;
    }

    void this.decide(utterance);
  }

  private beginTurn(kind: IncomingKind, text = ""): boolean {
    const action = actionForIncoming(this.inFlight, kind);
    if (action === "drop") {
      this.postDebug("turn_drop", { kind, text });
      return false;
    }
    if (action === "barge") {
      this.generation += 1;
      this.tts.bargeIn();
      this.spoken = spokenAfterInterrupt(this.spoken);
    }
    this.inFlight = true;
    return true;
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
          topicWindow: topicWindow(this.utterances, now),
          latestSpeech: utterance.text,
          lastSpokenTurn: this.lastSpokenText,
          inConversation: this.inConversation,
          addressed: false,
          sessionId: this.sessionId,
        }),
      });
      const decision = (await response.json()) as {
        speak?: boolean;
        mode?: SpeakMode;
        useWeb?: boolean;
      };
      if (generation !== this.generation || !this.running) return;
      if (!decision.speak) {
        this.inFlight = false;
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
      this.postDebug("error", { source: "decide" });
      if (generation === this.generation) {
        this.inFlight = false;
        this.setPhase("listening");
      }
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
    this.inFlight = true;
    this.setPhase("speaking");

    const language =
      input.language ??
      this.utterances.at(-1)?.language ??
      inferLatestLanguage(input.latestSpeech);

    const previousSpoken = this.spoken;
    let assembled = "";
    let sources: Source[] = [];
    let aborted = false;
    let endedSent = false;
    let ttsReady = false;
    let sentToTts = "";
    let spoke = false;
    let turnCommitted = false;

    const ensureTts = async () => {
      if (ttsReady) return;
      this.capture?.setGain(DUCK_GAIN);
      const ttsKey = await fetchTempKey("tts_rt", this.sessionId);
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
          lastSpokenTurn: this.lastSpokenText,
          sessionId: this.sessionId,
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
            if (!turnCommitted) this.spoken = previousSpoken;
            this.emit();
            break;
          }
          if (event.type === "delta" && event.text) {
            assembled += event.text;
            const preview = spokenTextForTts(assembled) || assembled;
            this.spoken = commitSpoken(this.spoken, {
              text: preview,
              sources,
              mode: input.mode,
            });
            this.emit();
          }
          if (event.type === "done") {
            assembled = event.text || assembled;
            sources = event.sources ?? sources;
            const finalText = spokenTextForTts(assembled);
            this.spoken = commitSpoken(previousSpoken, {
              text: finalText,
              sources,
              mode: input.mode,
            });
            if (this.spoken) {
              this.lastSpokenText = this.spoken.text;
              turnCommitted = true;
            }
            this.emit();
          }
        }
        if (aborted) break;
      }

      const finalText = spokenTextForTts(assembled);
      if (!aborted && finalText) {
        this.spoken = commitSpoken(previousSpoken, {
          text: finalText,
          sources,
          mode: input.mode,
        });
        if (this.spoken) this.lastSpokenText = this.spoken.text;
        turnCommitted = true;
        this.emit();
        if (!endedSent) await flushTts(assembled, true);
        spoke = true;
        await this.tts.waitUntilIdle();
      } else if (!turnCommitted) {
        this.spoken = spokenAfterInterrupt(previousSpoken);
        this.emit();
      }
    } catch {
      this.postDebug("error", { source: "speak" });
      this.tts.bargeIn();
      if (!turnCommitted) this.spoken = spokenAfterInterrupt(previousSpoken);
    } finally {
      if (generation === this.generation) {
        this.capture?.setGain(1);
        this.ignoreJevUntil = Date.now() + 1200;
        this.inFlight = false;
        this.spoken = spokenAfterInterrupt(this.spoken);
        if (this.running) {
          if (spoke) this.openConversationWindow();
          this.setPhase("listening");
        }
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
    this.postDebug("error", { source: "session", message });
    this.error = message;
    this.phase = "idle";
    this.emit();
  }

  private postDebug(event: string, fields: Record<string, unknown> = {}) {
    void fetch("/api/debug/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event,
        sessionId: this.sessionId,
        ...fields,
      }),
    }).catch(() => {});
  }

  private emit() {
    this.onChange(this.snapshot);
  }
}

async function fetchTempKey(
  usageType: "transcribe_websocket" | "tts_rt",
  sessionId: string,
) {
  const response = await fetch("/api/soniox/temporary-key", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usageType, sessionId }),
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
