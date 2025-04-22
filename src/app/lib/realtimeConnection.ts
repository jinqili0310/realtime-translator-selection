import React from "react";

export const createRealtimeConnection = async (
  EPHEMERAL_KEY: string,
  audioElement: React.RefObject<HTMLAudioElement>
): Promise<{ pc: RTCPeerConnection; dc: RTCDataChannel; audioTrack: MediaStreamTrack }> => {
  const pc = new RTCPeerConnection();

  pc.addEventListener("track", (event) => {
    console.log("Received audio track");
    if (audioElement.current) {
      audioElement.current.srcObject = event.streams[0];
      console.log("Attached audio to element");
    }
  });

  // Get user media but don't automatically start capturing audio
  // The track will be enabled/disabled based on the recording state
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: true,
  });
  const audioTrack = stream.getAudioTracks()[0];
  
  // Disable the audio track initially - it will be enabled when recording starts
  audioTrack.enabled = false;
  
  pc.addTrack(audioTrack, stream);

  const dc = pc.createDataChannel("oai-events");

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  const baseUrl = "https://api.openai.com/v1/realtime";
  // const model = "gpt-4o-realtime-preview-2024-12-17";
  const model = "gpt-4o-mini-realtime-preview-2024-12-17";

  // Model parameters for strict translation with no creativity
  const params = new URLSearchParams({
    model,
    // temperature: '0',
    // top_p: '1',
    // frequency_penalty: '0',
    // presence_penalty: '0',
  });

  const sdpResponse = await fetch(`${baseUrl}?${params.toString()}`, {
    method: "POST",
    body: offer.sdp,
    headers: {
      Authorization: `Bearer ${EPHEMERAL_KEY}`,
      "Content-Type": "application/sdp",
    },
  });

  const answerSdp = await sdpResponse.text();
  const answer: RTCSessionDescriptionInit = {
    type: "answer",
    sdp: answerSdp,
  };

  await pc.setRemoteDescription(answer);

  return { pc, dc, audioTrack };
}; 