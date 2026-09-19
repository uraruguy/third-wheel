import { downsampleToPcm16 } from "./pcm";

export type CaptureHandle = {
  stop: () => void;
  setGain: (value: number) => void;
  stream: MediaStream;
};

export async function startMicCapture(
  onPcm: (pcm: Int16Array) => void,
): Promise<CaptureHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
    },
  });

  const context = new AudioContext();
  await context.audioWorklet.addModule("/pcm-worklet.js");
  const source = context.createMediaStreamSource(stream);
  const worklet = new AudioWorkletNode(context, "pcm-worklet");
  const mute = context.createGain();
  mute.gain.value = 0;
  source.connect(worklet);
  worklet.connect(mute);
  mute.connect(context.destination);

  worklet.port.onmessage = (event: MessageEvent<Float32Array>) => {
    const pcm = downsampleToPcm16(event.data, context.sampleRate);
    if (pcm.length > 0) onPcm(pcm);
  };

  if (context.state === "suspended") {
    await context.resume();
  }

  return {
    stream,
    setGain(value: number) {
      worklet.port.postMessage({ type: "gain", value });
    },
    stop() {
      worklet.port.onmessage = null;
      source.disconnect();
      worklet.disconnect();
      mute.disconnect();
      stream.getTracks().forEach((track) => track.stop());
      void context.close();
    },
  };
}
