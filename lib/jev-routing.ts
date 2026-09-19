import {
  CORRECTION_THRESHOLD,
  FOLLOWUP_THRESHOLD,
  LOOKUP_THRESHOLD,
  NEEDS_WEB_THRESHOLD,
} from "./constants";
import {
  assertsCheckableWorldFact,
  bothSidesAlreadyStated,
  selfCorrectedInLine,
} from "./correction-context";
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
  latestSpeech?: string;
  recentSpeech?: string;
}): GateDecision {
  const { answers, addressed, inConversation } = input;
  const latestSpeech = input.latestSpeech ?? "";
  const recentSpeech = input.recentSpeech ?? latestSpeech;
  const useWeb = answers.needsWeb >= NEEDS_WEB_THRESHOLD;

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
    if (selfCorrectedInLine(latestSpeech)) {
      return {
        speak: false,
        mode: "silent",
        useWeb: false,
        reason: "self-corrected",
      };
    }
    if (bothSidesAlreadyStated(recentSpeech)) {
      return {
        speak: false,
        mode: "silent",
        useWeb: false,
        reason: "debate",
      };
    }
    if (assertsCheckableWorldFact(latestSpeech)) {
      return {
        speak: true,
        mode: "correction",
        useWeb: true,
        reason: "correction-world-fact",
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
