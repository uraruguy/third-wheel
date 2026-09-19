import {
  CORRECTION_THRESHOLD,
  DEBATE_CORRECTION_THRESHOLD,
  DEBATE_THRESHOLD,
  FOLLOWUP_THRESHOLD,
  LOOKUP_THRESHOLD,
  NEEDS_WEB_THRESHOLD,
} from "./constants";
import type { GateDecision, JevAnswers, SpeakMode } from "./types";

const MODES: SpeakMode[] = [
  "silent",
  "correction",
  "lookup",
  "addressed",
  "followup",
];

export function parseSpeakMode(value: unknown): SpeakMode {
  if (typeof value === "string" && (MODES as string[]).includes(value)) {
    return value as SpeakMode;
  }
  return "silent";
}

export function routeJevDecision(input: {
  answers: JevAnswers;
  addressed: boolean;
  inConversation: boolean;
}): GateDecision {
  const { answers, addressed, inConversation } = input;
  const useWeb = answers.needsWeb >= NEEDS_WEB_THRESHOLD;
  const isDebate = answers.isDebate ?? 0;

  if (addressed) {
    return {
      speak: true,
      mode: "addressed",
      useWeb: true,
      reason: "wake-or-addressed",
    };
  }

  if (answers.mode === "addressed") {
    return {
      speak: false,
      mode: "silent",
      useWeb: false,
      reason: "meta-not-addressed",
    };
  }

  if (
    inConversation &&
    answers.mode === "followup" &&
    answers.shouldSpeak >= FOLLOWUP_THRESHOLD
  ) {
    return {
      speak: true,
      mode: "followup",
      useWeb: true,
      reason: "followup-window",
    };
  }

  if (answers.mode === "silent") {
    return {
      speak: false,
      mode: "silent",
      useWeb: false,
      reason: "jev-silent",
    };
  }

  if (answers.mode === "correction") {
    if (isDebate >= DEBATE_THRESHOLD) {
      if (answers.shouldSpeak >= DEBATE_CORRECTION_THRESHOLD) {
        return {
          speak: true,
          mode: "correction",
          useWeb,
          reason: "correction-despite-debate",
        };
      }
      return {
        speak: false,
        mode: "silent",
        useWeb: false,
        reason: "debate",
      };
    }
    if (answers.shouldSpeak >= CORRECTION_THRESHOLD) {
      return {
        speak: true,
        mode: "correction",
        useWeb,
        reason: "correction-high-bar",
      };
    }
  }

  if (answers.mode === "lookup" && answers.shouldSpeak >= LOOKUP_THRESHOLD) {
    return {
      speak: true,
      mode: "lookup",
      useWeb: true,
      reason: "lookup-missing-fact",
    };
  }

  return {
    speak: false,
    mode: "silent",
    useWeb: false,
    reason: "below-threshold",
  };
}
