import { SONIOX_STT_SAMPLE_RATE } from "../constants";

export function downsampleToPcm16(
  input: Float32Array,
  inputSampleRate: number,
  gain = 1,
): Int16Array {
  if (input.length === 0) return new Int16Array(0);
  const ratio = inputSampleRate / SONIOX_STT_SAMPLE_RATE;
  const outLength = Math.floor(input.length / ratio);
  const out = new Int16Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const position = i * ratio;
    const index = Math.floor(position);
    const fraction = position - index;
    const a = input[index] ?? 0;
    const b = input[index + 1] ?? a;
    const sample = (a * (1 - fraction) + b * fraction) * gain;
    const clipped = Math.max(-1, Math.min(1, sample));
    out[i] = clipped < 0 ? clipped * 0x8000 : clipped * 0x7fff;
  }
  return out;
}

export function pcm16ToFloat32(bytes: Uint8Array): Float32Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const samples = new Float32Array(Math.floor(bytes.byteLength / 2));
  for (let i = 0; i < samples.length; i++) {
    samples[i] = view.getInt16(i * 2, true) / 0x8000;
  }
  return samples;
}
