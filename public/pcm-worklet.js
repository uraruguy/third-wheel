class PcmWorklet extends AudioWorkletProcessor {
  constructor() {
    super();
    this.gain = 1;
    this.port.onmessage = (event) => {
      if (event.data && event.data.type === "gain") {
        this.gain = event.data.value;
      }
    };
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel && channel.length) {
      const copy = new Float32Array(channel.length);
      for (let i = 0; i < channel.length; i++) {
        copy[i] = channel[i] * this.gain;
      }
      this.port.postMessage(copy, [copy.buffer]);
    }
    return true;
  }
}

registerProcessor("pcm-worklet", PcmWorklet);
