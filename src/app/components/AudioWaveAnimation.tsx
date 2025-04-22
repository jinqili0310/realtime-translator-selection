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

  // Initialize audio analyzer
  useEffect(() => {
    // Only run this effect when recording state changes
    if (isRecording) {
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
          analyser.fftSize = 256;
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
          // Fallback to the original animation if we can't access the microphone
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
      
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        // Don't close the context as it might be needed again
        // but do disconnect everything
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
    
    // Continue animation loop
    animationRef.current = requestAnimationFrame(updateAnimation);
  };

  // Drawing function based on canvas and audio data
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bars = 30; // Number of bars in the wave
    const barWidth = canvas.width / bars;
    const barMargin = 2;
    
    // Clear the canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (!isRecording || !audioData) {
      // When not recording, draw a flat line
      ctx.fillStyle = 'rgba(59, 130, 246, 0.5)'; // blue-500 with opacity
      ctx.beginPath();
      ctx.moveTo(0, canvas.height / 2);
      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.5)';
      ctx.stroke();
      return;
    }
    
    // When recording and we have audio data, draw bars based on frequency data
    for (let i = 0; i < bars; i++) {
      const x = i * (barWidth + barMargin);
      
      // Map the frequency data to our number of bars
      const dataIndex = Math.floor(i * (audioData.length / bars));
      
      // Get height from audio data (0-255 range)
      let height;
      
      if (audioData && dataIndex < audioData.length) {
        // Scale the height based on the audio data (0-255)
        // We want values between 20% and 90% of canvas height
        const minHeight = canvas.height * 0.1;  // 10% of height
        const maxHeight = canvas.height * 0.9;  // 90% of height
        
        // Convert the 0-255 range to our desired height range
        height = minHeight + ((audioData[dataIndex] / 255) * (maxHeight - minHeight));
      } else {
        // Fallback if no audio data
        height = canvas.height * 0.5;
      }
      
      const y = (canvas.height - height) / 2;
      
      // Draw the bar with gradient color based on intensity
      const intensity = audioData[dataIndex] / 255; // 0-1 range
      const hue = 360 - (intensity * 60); // Range from red (0) to orange-yellow (60)
      ctx.fillStyle = `hsla(${hue}, 100%, ${50 + (intensity * 25)}%, 0.7)`;
      ctx.fillRect(x, y, barWidth, height);
    }
  }, [audioData, isRecording]);

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