"use client";

import React, { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { v4 as uuidv4 } from "uuid";

import Image from "next/image";

// UI components
import Transcript from "./components/Transcript";
import Events from "./components/Events";
import BottomToolbar from "./components/BottomToolbar";
import LanguageSelectionModal from "./components/LanguageSelectionModal";

// Types
import { AgentConfig, SessionStatus } from "@/app/types";

// Context providers & hooks
import { useTranscript } from "@/app/contexts/TranscriptContext";
import { useEvent } from "@/app/contexts/EventContext";
import { useHandleServerEvent } from "./hooks/useHandleServerEvent";

// Utilities
import { createRealtimeConnection } from "./lib/realtimeConnection";

// Agent configs
import { allAgentSets, defaultAgentSetKey } from "@/app/agentConfigs";

// Language utilities
const getLanguageName = (code: string): string => {
  const languages: {[key: string]: string} = {
    en: "English",
    zh: "Chinese",
    ja: "Japanese",
    ko: "Korean",
    ru: "Russian",
    ar: "Arabic",
    hi: "Hindi",
    es: "Spanish",
    fr: "French",
    de: "German"
  };
  return languages[code] || code;
};

function App() {
  const searchParams = useSearchParams();

  const { transcriptItems, addTranscriptMessage, addTranscriptBreadcrumb } =
    useTranscript();
  const { logClientEvent, logServerEvent } = useEvent();

  // Ref for chat container to auto-scroll
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Language selection modal state
  const [isLanguageModalOpen, setIsLanguageModalOpen] = useState(false);
  const [selectedSourceLanguage, setSelectedSourceLanguage] = useState<string>("");
  const [selectedTargetLanguage, setSelectedTargetLanguage] = useState<string>("");
  
  const [selectedAgentName, setSelectedAgentName] = useState<string>("");
  const [selectedAgentConfigSet, setSelectedAgentConfigSet] =
    useState<AgentConfig[] | null>(null);

  const [dataChannel, setDataChannel] = useState<RTCDataChannel | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const audioTrackRef = useRef<MediaStreamTrack | null>(null);
  const [sessionStatus, setSessionStatus] =
    useState<SessionStatus>("DISCONNECTED");

  const [isEventsPaneExpanded, setIsEventsPaneExpanded] =
    useState<boolean>(true);
  const [userText, setUserText] = useState<string>("");
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [detectedLanguage, setDetectedLanguage] = useState<string>("");
  const [secondLanguage, setSecondLanguage] = useState<string>("");
  const [isAudioPlaybackEnabled, setIsAudioPlaybackEnabled] =
    useState<boolean>(true);

  // Check if the screen is desktop-sized
  const [isDesktop, setIsDesktop] = useState<boolean>(false);
  
  // Function to update desktop status based on screen width
  const updateDesktopStatus = () => {
    setIsDesktop(window.innerWidth >= 1024); // 1024px is a common breakpoint for desktop
  };
  
  // Initialize and update desktop status on resize
  useEffect(() => {
    updateDesktopStatus();
    window.addEventListener('resize', updateDesktopStatus);
    return () => window.removeEventListener('resize', updateDesktopStatus);
  }, []);

  const sendClientEvent = (eventObj: any, eventNameSuffix = "") => {
    if (dcRef.current && dcRef.current.readyState === "open") {
      logClientEvent(eventObj, eventNameSuffix);
      dcRef.current.send(JSON.stringify(eventObj));
    } else {
      logClientEvent(
        { attemptedEvent: eventObj.type },
        "error.data_channel_not_open"
      );
      console.error(
        "Failed to send message - no data channel available",
        eventObj
      );
    }
  };

  const handleServerEventRef = useHandleServerEvent({
    setSessionStatus,
    selectedAgentName,
    selectedAgentConfigSet,
    sendClientEvent,
    setSelectedAgentName,
    setDetectedLanguage,
    setSecondLanguage,
    isRecording,
    selectedSourceLanguage,
    selectedTargetLanguage,
  });

  useEffect(() => {
    if (!searchParams) return; // Skip if searchParams is not available yet
    
    let finalAgentConfig = searchParams.get("agentConfig");
    if (!finalAgentConfig || !allAgentSets[finalAgentConfig]) {
      finalAgentConfig = defaultAgentSetKey;
      
      // Only run this on the client-side
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.toString());
        url.searchParams.set("agentConfig", finalAgentConfig);
        window.location.replace(url.toString());
      }
      return;
    }

    const agents = allAgentSets[finalAgentConfig];
    const agentKeyToUse = agents[0]?.name || "";

    setSelectedAgentName(agentKeyToUse);
    setSelectedAgentConfigSet(agents);
  }, [searchParams]);

  useEffect(() => {
    if (selectedAgentName && sessionStatus === "DISCONNECTED") {
      connectToRealtime();
    }
  }, [selectedAgentName]);

  useEffect(() => {
    if (
      sessionStatus === "CONNECTED" &&
      selectedAgentConfigSet &&
      selectedAgentName
    ) {
      const currentAgent = selectedAgentConfigSet.find(
        (a) => a.name === selectedAgentName
      );
      console.log("currentAgent: ", currentAgent);
      updateSession(true);
    }
  }, [selectedAgentConfigSet, selectedAgentName, sessionStatus]);

  useEffect(() => {
    if (sessionStatus === "CONNECTED") {
      console.log(
        `updatingSession, isRecording=${isRecording} sessionStatus=${sessionStatus}`
      );
      updateSession();
    }
  }, [isRecording]);

  // Check for stored language preferences on initial load
  useEffect(() => {
    const storedSourceLang = localStorage.getItem("sourceLanguage");
    const storedTargetLang = localStorage.getItem("targetLanguage");
    
    if (storedSourceLang && storedTargetLang) {
      setSelectedSourceLanguage(storedSourceLang);
      setSelectedTargetLanguage(storedTargetLang);
      // Initialize detected languages with the stored preferences
      setDetectedLanguage(storedSourceLang);
      setSecondLanguage(storedTargetLang);
    } else {
      // Show language selection modal if no stored preferences
      setIsLanguageModalOpen(true);
      // Set defaults
      setSelectedSourceLanguage("en");
      setSelectedTargetLanguage("es");
    }
  }, []);
  
  // Handle language selection from modal
  const handleLanguageSelection = (sourceLang: string, targetLang: string) => {
    // Update selected languages
    setSelectedSourceLanguage(sourceLang);
    setSelectedTargetLanguage(targetLang);
    
    // Clear any previously detected languages
    setDetectedLanguage("");
    setSecondLanguage("");
    
    // Store selections in localStorage
    localStorage.setItem("sourceLanguage", sourceLang);
    localStorage.setItem("targetLanguage", targetLang);
    
    // Close the modal
    setIsLanguageModalOpen(false);
    
    // If already connected, immediately update the session with new languages
    if (sessionStatus === "CONNECTED") {
      // Force a clear session update with the new language pair
      sendClientEvent(
        { type: "input_audio_buffer.clear" },
        "clear audio buffer on language change"
      );
      
      // Send explicit update with the selected languages
      updateSession(true);
      
      // Notify the user about the language change
      sendClientEvent({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "assistant",
          content: [{ type: "text", text: `Language pair updated: now ready to translate between ${getLanguageName(sourceLang)} and ${getLanguageName(targetLang)}.` }],
        },
      });
    }
  };

  // Update session when languages are detected or on initial connection
  useEffect(() => {
    console.log("detectedLanguage", detectedLanguage);
    console.log("secondLanguage", secondLanguage);
    if (sessionStatus === "CONNECTED") {
      if (detectedLanguage) {
        setDetectedLanguage(detectedLanguage);
      }
      if (secondLanguage) {
        setSecondLanguage(secondLanguage);
      }
      if (detectedLanguage && secondLanguage) {
        console.log("Updating session with detected language pair:", detectedLanguage, secondLanguage);
      }
      updateSession(true);
    }
  }, [detectedLanguage, secondLanguage, sessionStatus]);

  const fetchEphemeralKey = async (): Promise<string | null> => {
    logClientEvent({ url: "/session" }, "fetch_session_token_request");
    const tokenResponse = await fetch("/api/session");
    const data = await tokenResponse.json();
    logServerEvent(data, "fetch_session_token_response");

    if (!data.client_secret?.value) {
      logClientEvent(data, "error.no_ephemeral_key");
      console.error("No ephemeral key provided by the server");
      setSessionStatus("DISCONNECTED");
      return null;
    }

    return data.client_secret.value;
  };

  const connectToRealtime = async () => {
    if (sessionStatus !== "DISCONNECTED") return;
    setSessionStatus("CONNECTING");

    try {
      const EPHEMERAL_KEY = await fetchEphemeralKey();
      if (!EPHEMERAL_KEY) {
        return;
      }

      if (!audioElementRef.current) {
        audioElementRef.current = document.createElement("audio");
      }
      audioElementRef.current.autoplay = isAudioPlaybackEnabled;

      const { pc, dc, audioTrack } = await createRealtimeConnection(
        EPHEMERAL_KEY,
        audioElementRef as React.RefObject<HTMLAudioElement>
      );
      pcRef.current = pc;
      dcRef.current = dc;
      audioTrackRef.current = audioTrack;

      dc.addEventListener("open", () => {
        logClientEvent({}, "data_channel.open");
      });
      dc.addEventListener("close", () => {
        logClientEvent({}, "data_channel.close");
      });
      dc.addEventListener("error", (err: any) => {
        logClientEvent({ error: err }, "data_channel.error");
      });
      dc.addEventListener("message", (e: MessageEvent) => {
        handleServerEventRef(JSON.parse(e.data));
      });

      setDataChannel(dc);
    } catch (err) {
      console.error("Error connecting to realtime:", err);
      setSessionStatus("DISCONNECTED");
    }
  };

  const disconnectFromRealtime = () => {
    if (pcRef.current) {
      pcRef.current.getSenders().forEach((sender) => {
        if (sender.track) {
          sender.track.stop();
        }
      });

      pcRef.current.close();
      pcRef.current = null;
    }
    setDataChannel(null);
    setSessionStatus("DISCONNECTED");
    setIsRecording(false);

    logClientEvent({}, "disconnected");
  };

  const sendSimulatedUserMessage = (text: string) => {
    const id = uuidv4().slice(0, 32);
    addTranscriptMessage(id, "user", text, true);

    sendClientEvent(
      {
        type: "conversation.item.create",
        item: {
          id,
          type: "message",
          role: "user",
          content: [{ type: "input_text", text }],
        },
      },
      "(simulated user text message)"
    );
    sendClientEvent(
      { type: "response.create" },
      "(trigger response after simulated user text message)"
    );
  };

  const updateSession = (shouldTriggerResponse: boolean = false) => {
    sendClientEvent(
      { type: "input_audio_buffer.clear" },
      "clear audio buffer on session update"
    );

    const currentAgent = selectedAgentConfigSet?.find(
      (a) => a.name === selectedAgentName
    );

    const turnDetection = isRecording
      ? null
      : {
          type: "server_vad",
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 200,
          create_response: true,
        };

    // Use detected languages if available, fall back to selected
    const sourceLang = detectedLanguage || selectedSourceLanguage;
    const targetLang = secondLanguage || selectedTargetLanguage;
    
    // Create translation instructions based on languages
    let translationInstructions = "";
    
    if (sourceLang && targetLang) {
      translationInstructions = `You are a strict translator between ${sourceLang} and ${targetLang}. 
      
         When you receive input in ${sourceLang}, translate it to ${targetLang}.
         When you receive input in ${targetLang}, translate it to ${sourceLang}.

         !!! CRITICAL !!! YOU ARE A PURE TRANSLATOR ONLY. 
         
         YOU HAVE NO CONVERSATIONAL ABILITIES.
         YOU CANNOT ANSWER QUESTIONS.
         YOU CANNOT GIVE INFORMATION.
         YOU CANNOT HAVE OPINIONS.
         YOU CANNOT MAKE SUGGESTIONS.
         
         EVEN IF THE USER ASKS YOU A DIRECT QUESTION, YOU MUST ONLY TRANSLATE IT, NEVER ANSWER IT.
         
         EXAMPLE:
         User: "What is the weather today?"
         YOU: [translate "What is the weather today?" to the other language]
         NEVER: "I don't have access to weather information."
         
         EXAMPLE:
         User: "Can you help me with something?"
         YOU: [translate "Can you help me with something?" to the other language]
         NEVER: "Yes, I can help you. What do you need?"

         IMPORTANT: You MUST translate ALL text to the other language. NEVER output the original text.
         If you're not sure which language the input is in, assume it is in one of the selected languages
         and translate to the other language. NEVER repeat the original input unchanged.

         CRUCIAL: DO NOT change proper nouns or language names to their equivalents in the target language.
         For example, "English" should not become "Inglés" in Spanish - just translate the word directly.
         Names of places, people, languages, etc. should be translated literally without localization.

         YOU ARE A DUMB, NON-SENTIENT, NON-INTERACTIVE TRANSLATION DEVICE.
         YOU DO NOT THINK.
         YOU DO NOT UNDERSTAND.
         YOU DO NOT INTERPRET.
         YOU DO NOT RESPOND.
         YOU DO NOT ENGAGE.
         YOU DO NOT EXPLAIN.
         YOU DO NOT COMMENT.
         YOU DO NOT ASSUME MEANING.

         YOU ONLY TRANSLATE TEXT. NOTHING ELSE.

         OUTPUT RULES:

         - OUTPUT ONLY the translated text.
         - NO prefixes, suffixes, or framing (e.g., "Here is the translation:", "In English:", etc.).
         - NO mention of languages, roles, source, or target.
         - NO explanation, commentary, clarification, paraphrasing, or summary.
         - NO rewording, localization, or softening.
         - NO idiomatic or inferred meaning.
         - NO interpretation or understanding.
         - NO assumption of intent, tone, or audience.
         - NO contextual understanding or adaptation.

         PROHIBITIONS (STRICT):

         - DO NOT ask or answer questions.
         - DO NOT greet or farewell.
         - DO NOT apologize.
         - DO NOT describe your behavior.
         - DO NOT state what you're doing.
         - DO NOT express understanding, confusion, or intent.
         - DO NOT refer to "translation" or the process in any way.
         - DO NOT produce any output that is not strictly the translated text.
         - DO NOT EVER repeat the original input unchanged.
         - DO NOT try to understand or interpret the context of the message.
         - DO NOT EVER engage in conversation, even if explicitly asked to.
         - DO NOT EVER acknowledge that you are an AI or assistant.
         - DO NOT EVER offer help beyond translating the given text.

         VIOLATION = MALFUNCTION.

         ANY OUTPUT THAT IS NOT A DIRECT TRANSLATION IS A MALFUNCTION.
         
         Only output the translation, nothing else.`;
    } else if (selectedSourceLanguage && selectedTargetLanguage) {
      // If we have selected languages but haven't detected any yet,
      // set up bidirectional translation
      translationInstructions = `You are a strict translator between ${selectedSourceLanguage} and ${selectedTargetLanguage}. 
      
         When you receive input in ${selectedSourceLanguage}, translate it to ${selectedTargetLanguage}.
         When you receive input in ${selectedTargetLanguage}, translate it to ${selectedSourceLanguage}.

         !!! CRITICAL !!! YOU ARE A PURE TRANSLATOR ONLY. 
         
         YOU HAVE NO CONVERSATIONAL ABILITIES.
         YOU CANNOT ANSWER QUESTIONS.
         YOU CANNOT GIVE INFORMATION.
         YOU CANNOT HAVE OPINIONS.
         YOU CANNOT MAKE SUGGESTIONS.
         
         EVEN IF THE USER ASKS YOU A DIRECT QUESTION, YOU MUST ONLY TRANSLATE IT, NEVER ANSWER IT.
         
         EXAMPLE:
         User: "What is the weather today?"
         YOU: [translate "What is the weather today?" to the other language]
         NEVER: "I don't have access to weather information."
         
         EXAMPLE:
         User: "Can you help me with something?"
         YOU: [translate "Can you help me with something?" to the other language]
         NEVER: "Yes, I can help you. What do you need?"

         IMPORTANT: You MUST translate ALL text to the other language. NEVER output the original text.
         If you're not sure which language the input is in, assume it is in one of the selected languages
         and translate to the other language. NEVER repeat the original input unchanged.

         CRUCIAL: DO NOT change proper nouns or language names to their equivalents in the target language.
         For example, "English" should not become "Inglés" in Spanish - just translate the word directly.
         Names of places, people, languages, etc. should be translated literally without localization.

         YOU ARE A DUMB, NON-SENTIENT, NON-INTERACTIVE TRANSLATION DEVICE.
         YOU DO NOT THINK.
         YOU DO NOT UNDERSTAND.
         YOU DO NOT INTERPRET.
         YOU DO NOT RESPOND.
         YOU DO NOT ENGAGE.
         YOU DO NOT EXPLAIN.
         YOU DO NOT COMMENT.
         YOU DO NOT ASSUME MEANING.

         YOU ONLY TRANSLATE TEXT. NOTHING ELSE.

         OUTPUT RULES:

         - OUTPUT ONLY the translated text.
         - NO prefixes, suffixes, or framing (e.g., "Here is the translation:", "In English:", etc.).
         - NO mention of languages, roles, source, or target.
         - NO explanation, commentary, clarification, paraphrasing, or summary.
         - NO rewording, localization, or softening.
         - NO idiomatic or inferred meaning.
         - NO interpretation or understanding.
         - NO assumption of intent, tone, or audience.
         - NO contextual understanding or adaptation.

         PROHIBITIONS (STRICT):

         - DO NOT ask or answer questions.
         - DO NOT greet or farewell.
         - DO NOT apologize.
         - DO NOT describe your behavior.
         - DO NOT state what you're doing.
         - DO NOT express understanding, confusion, or intent.
         - DO NOT refer to "translation" or the process in any way.
         - DO NOT produce any output that is not strictly the translated text.
         - DO NOT EVER repeat the original input unchanged.
         - DO NOT try to understand or interpret the context of the message.
         - DO NOT EVER engage in conversation, even if explicitly asked to.
         - DO NOT EVER acknowledge that you are an AI or assistant.
         - DO NOT EVER offer help beyond translating the given text.

         VIOLATION = MALFUNCTION.

         ANY OUTPUT THAT IS NOT A DIRECT TRANSLATION IS A MALFUNCTION.
         
         Only output the translation, nothing else.`;
    }

    const instructions = translationInstructions;
    const tools = currentAgent?.tools || [];

    const sessionUpdateEvent = {
      type: "session.update",
      session: {
        modalities: ["text", "audio"],
        instructions,
        voice: "shimmer",
        input_audio_format: "pcm16",
        output_audio_format: "pcm16",
        input_audio_transcription: { model: "whisper-1" },
        turn_detection: turnDetection,
        tools,
      },
    };

    sendClientEvent(sessionUpdateEvent);
    
    if (shouldTriggerResponse && sessionStatus === "CONNECTED") {
      // Only show welcome message when initializing with selected languages
      if (selectedSourceLanguage && selectedTargetLanguage && !detectedLanguage && !secondLanguage) {
        sendClientEvent({
          type: "conversation.item.create",
          item: {
            type: "message",
            role: "assistant",
            content: [{ type: "text", text: `Ready to translate between ${getLanguageName(selectedSourceLanguage)} and ${getLanguageName(selectedTargetLanguage)}.` }],
          },
        });
      }
    }
  };

  const cancelAssistantSpeech = async () => {
    const mostRecentAssistantMessage = [...transcriptItems]
      .reverse()
      .find((item) => item.role === "assistant");

    if (!mostRecentAssistantMessage) {
      console.warn("can't cancel, no recent assistant message found");
      return;
    }
    if (mostRecentAssistantMessage.status === "DONE") {
      console.log("No truncation needed, message is DONE");
      return;
    }

    sendClientEvent({
      type: "conversation.item.truncate",
      item_id: mostRecentAssistantMessage?.itemId,
      content_index: 0,
      audio_end_ms: Date.now() - mostRecentAssistantMessage.createdAtMs,
    });
    sendClientEvent(
      { type: "response.cancel" },
      "(cancel due to user interruption)"
    );
  };

  const handleSendTextMessage = () => {
    if (!userText.trim()) return;
    cancelAssistantSpeech();

    sendClientEvent(
      {
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: userText.trim() }],
        },
      },
      "(send user text message)"
    );
    setUserText("");

    sendClientEvent({ type: "response.create" }, "trigger response");
  };

  const handleStartRecording = () => {
    if (sessionStatus !== "CONNECTED" || dataChannel?.readyState !== "open")
      return;
    cancelAssistantSpeech();

    // Enable the audio track
    if (audioTrackRef.current) {
      audioTrackRef.current.enabled = true;
    }

    setIsRecording(true);
    sendClientEvent({ type: "input_audio_buffer.clear" }, "clear recording buffer");
  };

  const handleStopRecording = () => {
    if (
      sessionStatus !== "CONNECTED" ||
      dataChannel?.readyState !== "open" ||
      !isRecording
    )
      return;

    // Disable the audio track
    if (audioTrackRef.current) {
      audioTrackRef.current.enabled = false;
    }

    setIsRecording(false);
    sendClientEvent({ type: "input_audio_buffer.commit" }, "commit recording");
    sendClientEvent({ type: "response.create" }, "trigger response recording");
  };

  const handleToggleRecording = () => {
    if (isRecording) {
      handleStopRecording();
    } else {
      handleStartRecording();
    }
  };

  const onToggleConnection = () => {
    if (sessionStatus === "CONNECTED" || sessionStatus === "CONNECTING") {
      disconnectFromRealtime();
      setSessionStatus("DISCONNECTED");
    } else {
      connectToRealtime();
    }
  };

  const handleAgentChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newAgentConfig = e.target.value;
    const url = new URL(window.location.toString());
    url.searchParams.set("agentConfig", newAgentConfig);
    window.location.replace(url.toString());
  };

  const handleSelectedAgentChange = (
    e: React.ChangeEvent<HTMLSelectElement>
  ) => {
    const newAgentName = e.target.value;
    setSelectedAgentName(newAgentName);
  };

  useEffect(() => {
    const storedPushToTalkUI = localStorage.getItem("pushToTalkUI");
    if (storedPushToTalkUI) {
      setIsRecording(storedPushToTalkUI === "true");
    }
    const storedLogsExpanded = localStorage.getItem("logsExpanded");
    if (storedLogsExpanded) {
      setIsEventsPaneExpanded(storedLogsExpanded === "true");
    }
    const storedAudioPlaybackEnabled = localStorage.getItem(
      "audioPlaybackEnabled"
    );
    if (storedAudioPlaybackEnabled) {
      setIsAudioPlaybackEnabled(storedAudioPlaybackEnabled === "true");
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("pushToTalkUI", isRecording.toString());
  }, [isRecording]);

  useEffect(() => {
    localStorage.setItem("logsExpanded", isEventsPaneExpanded.toString());
  }, [isEventsPaneExpanded]);

  useEffect(() => {
    localStorage.setItem(
      "audioPlaybackEnabled",
      isAudioPlaybackEnabled.toString()
    );
  }, [isAudioPlaybackEnabled]);

  useEffect(() => {
    if (audioElementRef.current) {
      if (isAudioPlaybackEnabled) {
        audioElementRef.current.play().catch((err) => {
          console.warn("Autoplay may be blocked by browser:", err);
        });
      } else {
        audioElementRef.current.pause();
      }
    }
  }, [isAudioPlaybackEnabled]);

  // Auto-scroll chat to bottom when new messages are added
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [transcriptItems]);

  const agentSetKey = searchParams.get("agentConfig") || "default";

  return (
    <div className={`${isDesktop ? 'h-screen bg-white p-8' : 'h-screen bg-gray-100'}`}>
      {isDesktop ? (
        // Desktop layout with iPhone frame
        <div className="flex items-center justify-center h-full">
          {/* Left side - iPhone frame around chat UI */}
          <div className="w-[375px] h-[750px] bg-black rounded-[50px] p-3 relative shadow-2xl mr-20">
            {/* iPhone notch */}
            <div className="w-40 h-7 bg-black absolute top-0 left-1/2 transform -translate-x-1/2 rounded-b-xl z-10"></div>
            
            {/* iPhone screen */}
            <div className="w-full h-full bg-gray-100 rounded-[40px] overflow-hidden flex flex-col">
              {/* Language pair display */}
              {selectedSourceLanguage && selectedTargetLanguage && (
                <div className="bg-white pt-8 pb-4 px-2 text-center text-sm text-gray-600 border-b flex justify-center items-center space-x-2">
                  <span>Translation: {getLanguageName(selectedSourceLanguage)} ↔ {getLanguageName(selectedTargetLanguage)}</span>
                  <button 
                    onClick={() => setIsLanguageModalOpen(true)}
                    className="text-blue-600 hover:underline text-xs ml-2"
                  >
                    Change
                  </button>
                </div>
              )}

              {/* Main chat area */}
              <div 
                ref={chatContainerRef}
                className="flex-1 overflow-y-auto p-4 space-y-4"
              >
                {transcriptItems.map((item) => (
                  <div
                    key={item.itemId}
                    className={`flex ${
                      item.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl p-3 ${
                        item.role === "user"
                          ? "bg-blue-500 text-white rounded-br-none"
                          : "bg-white text-gray-800 rounded-bl-none shadow-sm"
                      }`}
                    >
                      {item.title || item.data?.text || ""}
                    </div>
                  </div>
                ))}
              </div>

              {/* Input area */}
              <div className="border-t border-gray-200 bg-white p-4">
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={userText}
                    onChange={(e) => setUserText(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === "Enter" && userText.trim()) {
                        handleSendTextMessage();
                      }
                    }}
                    placeholder="Type a message..."
                    className="flex-1 rounded-full border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={handleToggleRecording}
                    className={`rounded-full p-3 transition-all duration-300 ${
                      isRecording
                        ? "bg-red-500 text-white animate-pulse ring-4 ring-red-200"
                        : "bg-blue-500 text-white hover:bg-blue-600"
                    }`}
                    aria-label={isRecording ? "Stop recording" : "Start recording"}
                    title={isRecording ? "Stop recording" : "Start recording"}
                  >
                    {isRecording ? (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-6 w-6"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"
                        />
                      </svg>
                    ) : (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-6 w-6"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                        />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </div>
            
            {/* iPhone home indicator */}
            <div className="w-1/3 h-1 bg-gray-300 absolute bottom-1.5 left-1/2 transform -translate-x-1/2 rounded-full"></div>
          </div>
          
          {/* Right side - Microphone button */}
          <div className="flex flex-col items-center">
            <div className="text-white text-2xl mb-10 font-light">Click the microphone to toggle recording</div>
            <button
              onClick={handleToggleRecording}
              className={`transition-all duration-300 transform ${isRecording ? 'scale-110 animate-pulse' : 'hover:scale-105'}`}
              aria-label={isRecording ? "Stop recording" : "Start recording"}
            >
              <div className={`relative`}>
                <img 
                  src="/mic01.png" 
                  alt="Microphone" 
                  width={200} 
                  height={200} 
                  className="rounded-full"
                />
                {isRecording && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-16 h-16 rounded-full opacity-30 animate-ping"></div>
                  </div>
                )}
              </div>
            </button>
            <div className={`mt-6 text-xl font-medium ${isRecording ? 'text-red-500' : 'text-green-500'}`}>
              {isRecording ? 'Recording...' : 'Ready to record'}
            </div>
          </div>
        </div>
      ) : (
        // Mobile layout (original UI)
        <div className="flex flex-col h-screen bg-gray-100">
          {/* Language pair display */}
          {selectedSourceLanguage && selectedTargetLanguage && (
            <div className="bg-white px-2 py-4 text-center text-sm text-gray-600 border-b flex justify-center items-center space-x-2">
              <span>Translation: {getLanguageName(selectedSourceLanguage)} ↔ {getLanguageName(selectedTargetLanguage)}</span>
              <button 
                onClick={() => setIsLanguageModalOpen(true)}
                className="text-blue-600 hover:underline text-xs ml-2"
              >
                Change
              </button>
            </div>
          )}

          {/* Main chat area */}
          <div 
            ref={chatContainerRef}
            className="flex-1 overflow-y-auto p-4 space-y-4"
          >
            {transcriptItems.map((item) => (
              <div
                key={item.itemId}
                className={`flex ${
                  item.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl p-3 ${
                    item.role === "user"
                      ? "bg-blue-500 text-white rounded-br-none"
                      : "bg-white text-gray-800 rounded-bl-none shadow-sm"
                  }`}
                >
                  {item.title || item.data?.text || ""}
                </div>
              </div>
            ))}
          </div>

          {/* Input area */}
          <div className="border-t border-gray-200 bg-white p-4">
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={userText}
                onChange={(e) => setUserText(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === "Enter" && userText.trim()) {
                    handleSendTextMessage();
                  }
                }}
                placeholder="Type a message..."
                className="flex-1 rounded-full border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleToggleRecording}
                className={`rounded-full p-3 transition-all duration-300 ${
                  isRecording
                    ? "bg-red-500 text-white animate-pulse ring-4 ring-red-200"
                    : "bg-blue-500 text-white hover:bg-blue-600"
                }`}
                aria-label={isRecording ? "Stop recording" : "Start recording"}
                title={isRecording ? "Stop recording" : "Start recording"}
              >
                {isRecording ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"
                    />
                  </svg>
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                    />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Language Selection Modal */}
      <LanguageSelectionModal
        isOpen={isLanguageModalOpen}
        onClose={() => setIsLanguageModalOpen(false)}
        onSave={handleLanguageSelection}
        initialSourceLanguage={selectedSourceLanguage || "en"}
        initialTargetLanguage={selectedTargetLanguage || "es"}
      />
    </div>
  );
}

export default App;
