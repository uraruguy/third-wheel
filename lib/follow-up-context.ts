import { isClarifyingAsk } from "./no-speak";
import { normalizeSpeech } from "./wake-phrase";

export type FollowUpContext = {
  lastSpokenTurn: string;
  latestSpeech: string;
  topicWindow: string;
  priorUtterance: string;
  currentUtterance: string;
  useLastSpoken: boolean;
};

export function followUpContext(input: {
  lastSpokenTurn?: string;
  latestSpeech?: string;
  topicWindow?: string;
  followUpQuery?: string;
}): FollowUpContext {
  const latestSpeech = (input.latestSpeech ?? "").trim();
  const topicWindow = (input.topicWindow ?? "").trim();
  const lastSpokenTurn = (input.lastSpokenTurn ?? "").trim();
  const ask = `${input.followUpQuery ?? ""} ${latestSpeech}`;
  return {
    lastSpokenTurn,
    latestSpeech,
    topicWindow,
    priorUtterance: priorUtteranceFromWindow(topicWindow, latestSpeech),
    currentUtterance: latestSpeech,
    useLastSpoken: isClarifyingAsk(ask),
  };
}

export function priorUtteranceFromWindow(
  topicWindow: string,
  latestSpeech: string,
): string {
  const current = normalizeSpeech(latestSpeech);
  const lines = topicWindow
    .split("\n")
    .map((line) => line.replace(/^Speaker\s+\d+:\s*/i, "").trim())
    .filter(Boolean);
  return (
    [...lines]
      .reverse()
      .find((line) => normalizeSpeech(line) !== current) ?? ""
  );
}
