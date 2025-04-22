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
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.5)'; // blue-500 with opacity
      ctx.stroke();
      return;
    }
    
    // Classic recording app style with vertical bars
    const bars = 30; // Number of bars to display
    const barWidth = Math.floor((width - (bars * 2)) / bars); // Width of each bar with small gap
    const barGap = 2; // Gap between bars
    
    // Calculate the average of all frequency data for smoother visualization
    let summedData = 0;
    if (audioData) {
      for (let i = 0; i < audioData.length; i++) {
        summedData += audioData[i];
      }
    }
    // We'll use this for the pulse effect in the background
    const avgAmplitude = summedData / (audioData?.length || 1);
    
    // Add subtle pulsing background effect based on average amplitude
    if (isRecording && avgAmplitude > 0) {
      const normalizedAmplitude = avgAmplitude / 255; // 0-1 range
      const pulseOpacity = 0.05 + (normalizedAmplitude * 0.1); // Subtle effect
      
      // Draw a subtle pulsing background
      ctx.fillStyle = `rgba(239, 68, 68, ${pulseOpacity})`;
      ctx.fillRect(0, 0, width, height);
    }
    
    // Draw the bars
    for (let i = 0; i < bars; i++) {
      // Calculate x position
      const x = i * (barWidth + barGap);
      
      // Map the bar index to the data array
      const dataIndex = Math.floor((i / bars) * (audioData?.length || 1));
      
      // Get the frequency value
      let value = 0.1; // Minimum height factor (10% of max height)
      
      if (audioData && dataIndex < audioData.length) {
        // Get normalized value (0-1)
        const rawValue = audioData[dataIndex] / 255;
        
        // Add some variation based on position for a more natural look
        const positionFactor = 0.5 + (0.5 * Math.sin(i * 0.4));
        
        // Combine actual value with some randomness for a more dynamic look
        value = Math.max(0.1, (rawValue * 0.7) + (positionFactor * 0.3));
      }
      
      // Calculate bar height based on value (25% to 90% of half height)
      const minHeight = height * 0.25;
      const maxHeight = height * 0.9;
      const barHeight = minHeight + (value * (maxHeight - minHeight));
      
      // Draw mirrored bars (top and bottom from center)
      const halfBarHeight = barHeight / 2;
      
      // Top bar
      ctx.fillStyle = `rgba(239, 68, 68, ${0.7 + (value * 0.3)})`; // red-500 with dynamic opacity
      ctx.fillRect(x, centerY - halfBarHeight, barWidth, halfBarHeight);
      
      // Bottom bar (slightly lighter)
      ctx.fillStyle = `rgba(239, 68, 68, ${0.6 + (value * 0.3)})`; // red-500 with dynamic opacity
      ctx.fillRect(x, centerY, barWidth, halfBarHeight);
    }
    
    // Add recording time indicator
    if (recordingDuration > 0) {
      const timeText = formatTime(recordingDuration);
      ctx.font = '14px sans-serif';
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      const textWidth = ctx.measureText(timeText).width;
      const padding = 6;
      
      // Draw time background at the right side
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.fillRect(
        width - textWidth - (padding * 2), 
        0, 
        textWidth + (padding * 2), 
        24
      );
      
      // Draw time text
      ctx.fillStyle = isRecording ? 'rgba(239, 68, 68, 0.9)' : 'rgba(0, 0, 0, 0.7)';
      ctx.fillText(timeText, width - textWidth - padding, 17);
    }
  }, [audioData, isRecording, recordingDuration]);

  // Format seconds into mm:ss
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className={`w-full ${className}`}>
      <canvas 
        ref={canvasRef} 
        width={300} 
        height={60} 
        className="w-full h-full"
      />
    </div>
  );
};

export default AudioWaveAnimation; 