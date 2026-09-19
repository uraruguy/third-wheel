export type FollowUpContext = {
  lastSpokenTurn: string;
  latestSpeech: string;
  topicWindow: string;
};

export function followUpContext(input: {
  lastSpokenTurn?: string;
  latestSpeech?: string;
  topicWindow?: string;
}): FollowUpContext {
  return {
    lastSpokenTurn: (input.lastSpokenTurn ?? "").trim(),
    latestSpeech: (input.latestSpeech ?? "").trim(),
    topicWindow: (input.topicWindow ?? "").trim(),
  };
}
