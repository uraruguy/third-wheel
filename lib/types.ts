export type SpeakMode =
  | "silent"
  | "correction"
  | "lookup"
  | "addressed"
  | "followup";

export type SpeechLanguage = "sl" | "en";

export type Source = {
  title: string;
  url: string;
};

export type TranscriptUtterance = {
  speaker: string;
  text: string;
  language: SpeechLanguage;
  startMs: number;
  endMs: number;
};

export type JevAnswers = {
  shouldSpeak: number;
  mode: SpeakMode;
  needsWeb: number;
};

export type GateDecision = {
  speak: boolean;
  mode: SpeakMode;
  useWeb: boolean;
  reason: string;
};
