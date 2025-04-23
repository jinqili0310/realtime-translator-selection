"use client";

import React, { useEffect, useRef, useState } from 'react';

interface AudioWaveAnimationProps {
  isRecording: boolean;
  className?: string;
}

const AudioWaveAnimation: React.FC<AudioWaveAnimationProps> = ({ isRecording, className = '' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const [audioData, setAudioData] = useState<Uint8Array | null>(null);
  const [recordingStartTime, setRecordingStartTime] = useState<number | null>(null);
  const [recordingDuration, setRecordingDuration] = useState<number>(0);

  // Initialize audio analyzer
  useEffect(() => {
    // Only run this effect when recording state changes
    if (isRecording) {
      // Set the recording start time
      setRecordingStartTime(Date.now());
      
      // Create Audio Context if it doesn't exist
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      const setupAudioAnalyzer = async () => {
        try {
          // Get microphone stream
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          
          const audioContext = audioContextRef.current;
          if (!audioContext) return;
          
          // Clean up previous source if it exists
          if (sourceRef.current) {
            sourceRef.current.disconnect();
          }
          
          // Create source from microphone stream
          const source = audioContext.createMediaStreamSource(stream);
          sourceRef.current = source;
          
          // Create analyzer
          const analyser = audioContext.createAnalyser();
          analyser.fftSize = 128; // Smaller FFT size for simpler visualization
          analyserRef.current = analyser;
          
          // Connect source to analyzer
          source.connect(analyser);
          
          // Create data array for analyzer
          const bufferLength = analyser.frequencyBinCount;
          const dataArray = new Uint8Array(bufferLength);
          dataArrayRef.current = dataArray;
          
          // Start animation loop
          animationRef.current = requestAnimationFrame(updateAnimation);
        } catch (err) {
          console.error("Error accessing microphone:", err);
          // Fallback to a simpler animation if we can't access the microphone
        }
      };
      
      setupAudioAnalyzer();
    } else {
      // Clean up when recording stops
      if (sourceRef.current) {
        sourceRef.current.disconnect();
        sourceRef.current = null;
      }
      
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      
      // Reset recording time
      setRecordingStartTime(null);
      setRecordingDuration(0);
      
      // Reset audio data
      setAudioData(null);
    }
    
    return () => {
      // Clean up on component unmount
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      
      if (sourceRef.current) {
        sourceRef.current.disconnect();
      }
    };
  }, [isRecording]);

  // Animation update function
  const updateAnimation = () => {
    if (!isRecording) return;
    
    const analyser = analyserRef.current;
    const dataArray = dataArrayRef.current;
    
    if (analyser && dataArray) {
      // Get frequency data
      analyser.getByteFrequencyData(dataArray);
      
      // Update state with new data
      setAudioData(new Uint8Array(dataArray));
    }
    
    // Update the recording duration
    if (recordingStartTime) {
      setRecordingDuration(Math.floor((Date.now() - recordingStartTime) / 1000));
    }
    
    // Continue animation loop
    animationRef.current = requestAnimationFrame(updateAnimation);
  };

  // Drawing function based on canvas and audio data
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear the canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Set the dimensions
    const width = canvas.width;
    const height = canvas.height;
    const centerY = height / 2;
    
    if (!isRecording || !audioData) {
      // When not recording, draw a flat line
      ctx.beginPath();
      ctx.moveTo(0, centerY);
      ctx.lineTo(width, centerY);
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(220, 38, 38, 0.5)'; // red-600 with opacity
      ctx.stroke();
      return;
    }
    
    // iPhone Voice Memo style waveform
    const barWidth = 3; // Width of each bar
    const barGap = 2; // Gap between bars
    const bars = Math.floor(width / (barWidth + barGap)); // Number of bars that fit the canvas
    
    ctx.fillStyle = 'rgba(220, 38, 38, 0.9)'; // Single red color (red-600)
    
    for (let i = 0; i < bars; i++) {
      const x = i * (barWidth + barGap);
      
      // Map the bar index to the data array
      const dataIndex = Math.floor((i / bars) * (audioData?.length || 1));
      
      // Get the amplitude value (0-1)
      let amplitude = 0.1; // Minimum amplitude
      
      if (audioData && dataIndex < audioData.length) {
        // Normalize value (0-1)
        amplitude = audioData[dataIndex] / 255;
        
        // Add slight randomness for more natural look
        const jitter = Math.random() * 0.1;
        amplitude = Math.max(0.1, (amplitude * 0.8) + jitter);
      }
      
      // Calculate the bar height
      const maxBarHeight = height * 0.8; // 80% of canvas height
      const barHeight = maxBarHeight * amplitude;
      
      // Draw the bar from center
      const startY = centerY - (barHeight / 2);
      ctx.fillRect(x, startY, barWidth, barHeight);
    }
    
    // Add recording time indicator (iPhone style)
    if (recordingDuration > 0) {
      const timeText = formatTime(recordingDuration);
      ctx.font = '16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillStyle = 'rgba(220, 38, 38, 0.9)'; // red-600
      
      // Draw time text at the left side
      ctx.fillText(timeText, 10, height / 2 + 5);
    }
  }, [audioData, isRecording, recordingDuration]);

  // Format seconds into mm:ss
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className={`relative w-full ${className}`}>
      <canvas 
        ref={canvasRef}
        className="w-full h-12"
        width={500}
        height={60}
      />
    </div>
  );
};

export default AudioWaveAnimation; 