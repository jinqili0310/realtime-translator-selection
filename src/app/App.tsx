"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { v4 as uuidv4 } from "uuid";

import Image from "next/image";
import { motion } from "framer-motion";

// UI components
import Transcript from "./components/Transcript";
import Events from "./components/Events";
import BottomToolbar from "./components/BottomToolbar";
import LanguageSelectionModal from "./components/LanguageSelectionModal";
import AudioWaveAnimation from "./components/AudioWaveAnimation";
import BluetoothDeviceModal from "./components/BluetoothDeviceModal";

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

// Define OverconstrainedError type for use in connecting to devices
class OverconstrainedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OverconstrainedError";
  }
}

// Extend Navigator interface with Web Bluetooth API types
declare global {
  interface Navigator {
    bluetooth?: {
      requestDevice(options: RequestDeviceOptions): Promise<BluetoothDevice>;
      // Add getDevices method to the interface
      getDevices?: () => Promise<Array<{
        id: string;
        name?: string;
        gatt?: any;
        addEventListener: (
          event: string,
          callback: (event: any) => void
        ) => void;
      }>>;
    };
  }

  interface RequestDeviceOptions {
    filters?: Array<{
      services?: BluetoothServiceUUID[];
      name?: string;
      namePrefix?: string;
      manufacturerId?: number;
      serviceData?: BluetoothServiceDataInit;
    }>;
    optionalServices?: BluetoothServiceUUID[];
    acceptAllDevices?: boolean;
  }

  interface BluetoothDevice {
    id: string;
    name?: string;
    gatt?: BluetoothRemoteGATTServer;
    addEventListener(type: string, listener: EventListener): void;
    removeEventListener(type: string, listener: EventListener): void;
  }

  interface BluetoothRemoteGATTServer {
    device: BluetoothDevice;
    connected: boolean;
    connect(): Promise<BluetoothRemoteGATTServer>;
    disconnect(): void;
    getPrimaryService(service: BluetoothServiceUUID): Promise<BluetoothRemoteGATTService>;
    getPrimaryServices(service?: BluetoothServiceUUID): Promise<BluetoothRemoteGATTService[]>;
  }

  interface BluetoothRemoteGATTService {
    device: BluetoothDevice;
    uuid: string;
    getCharacteristic(characteristic: BluetoothCharacteristicUUID): Promise<BluetoothRemoteGATTCharacteristic>;
    getCharacteristics(characteristic?: BluetoothCharacteristicUUID): Promise<BluetoothRemoteGATTCharacteristic[]>;
  }

  interface BluetoothRemoteGATTCharacteristic {
    service: BluetoothRemoteGATTService;
    uuid: string;
    value?: DataView;
    properties: BluetoothCharacteristicProperties;
    readValue(): Promise<DataView>;
    writeValue(value: BufferSource): Promise<void>;
    startNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
    stopNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
    addEventListener(type: string, listener: EventListener): void;
    removeEventListener(type: string, listener: EventListener): void;
  }

  interface BluetoothCharacteristicProperties {
    broadcast: boolean;
    read: boolean;
    writeWithoutResponse: boolean;
    write: boolean;
    notify: boolean;
    indicate: boolean;
    authenticatedSignedWrites: boolean;
    reliableWrite: boolean;
    writableAuxiliaries: boolean;
  }

  type BluetoothServiceUUID = string | number;
  type BluetoothCharacteristicUUID = string | number;
  interface BluetoothServiceDataInit {}
}

// Language utilities
const getLanguageName = (code: string): string => {
  const languages: { [key: string]: string } = {
    English: "English",
    Chinese: "Chinese",
    Japanese: "Japanese",
    Korean: "Korean",
    Russian: "Russian",
    Arabic: "Arabic",
    Hindi: "Hindi",
    Spanish: "Spanish",
    French: "French",
    German: "German",
  };
  return languages[code] || code;
};

// Add the BluetoothStatus component before the App component
const BluetoothStatus = () => {
  return (
    <div className="flex items-center text-white bg-blue-700 px-3 py-1 rounded-full">
      <div className="mr-2 h-2 w-2 rounded-full bg-green-400 animate-pulse"></div>
      <span className="text-sm">Connected</span>
    </div>
  );
};

const BluetoothStatusWithBattery = () => {
  // Determine battery indicator color based on level
  // const getBatteryColor = () => {
  //   if (batteryLevel > 70) return "bg-green-500";
  //   if (batteryLevel > 30) return "bg-yellow-500";
  //   return "bg-red-500";
  // };

  return (
    <div className="flex flex-col items-center">
      <div className="flex items-center text-white bg-blue-700 px-3 py-1 rounded-full mb-1">
        <div className="mr-2 h-2 w-2 rounded-full bg-green-400 animate-pulse"></div>
        <span className="text-sm">Connected</span>
      </div>
      {/* <div className="flex items-center text-xs text-gray-700">
        <div className="flex items-center">
          <div className="w-8 h-4 border border-gray-400 rounded-sm relative mr-1">
            <div
              className={`absolute left-0 top-0 bottom-0 ${getBatteryColor()} rounded-sm`}
              style={{ width: `${batteryLevel}%` }}
            ></div>
            <div className="absolute right-0 transform translate-x-1 top-1/2 -translate-y-1/2 w-1 h-2 bg-gray-400 rounded-r-sm"></div>
          </div>
          <span>{batteryLevel}%</span>
        </div>
      </div> */}
    </div>
  );
};

function App() {
  const searchParams = useSearchParams();

  const { transcriptItems, addTranscriptMessage, addTranscriptBreadcrumb } =
    useTranscript();
  const { logClientEvent, logServerEvent } = useEvent();

  // Ref for chat container to auto-scroll
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Bluetooth device state
  const [showBluetoothModal, setShowBluetoothModal] = useState(false);
  const [availableDevices, setAvailableDevices] = useState<MediaDeviceInfo[]>(
    []
  );
  const [pairedBluetoothDevice, setPairedBluetoothDevice] = useState<any>(null);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [isConnectingBluetooth, setIsConnectingBluetooth] = useState(false);

  // Button state tracking ref - used to track physical button state
  const buttonStateRef = useRef({
    isButtonPressed: false,
    wasRecordingStarted: false
  });

  // Language selection modal state
  const [isLanguageModalOpen, setIsLanguageModalOpen] = useState(false);
  const [selectedSourceLanguage, setSelectedSourceLanguage] =
    useState<string>("");
  const [selectedTargetLanguage, setSelectedTargetLanguage] =
    useState<string>("");

  const [selectedAgentName, setSelectedAgentName] = useState<string>("translator");
  const [selectedAgentConfigSet, setSelectedAgentConfigSet] = useState<
    AgentConfig[] | null
  >(null);

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
  const [detectedLanguage, setDetectedLanguage] = useState<string | null>(null);
  const [secondLanguage, setSecondLanguage] = useState<string | null>(null);
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
    window.addEventListener("resize", updateDesktopStatus);
    return () => window.removeEventListener("resize", updateDesktopStatus);
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
      if (typeof window !== "undefined") {
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

      // If we have a valid agent and selected languages, update its instructions
      if (currentAgent && selectedSourceLanguage && selectedTargetLanguage) {
        // Clone the agent to avoid mutating the original
        const updatedAgent = { ...currentAgent };

        // Check if instructions need to be updated to avoid unnecessary re-renders
        const shouldUpdateInstructions =
          !updatedAgent.instructions.includes(
            `BETWEEN ${selectedSourceLanguage} AND ${selectedTargetLanguage}`
          ) ||
          !updatedAgent.instructions.includes(
            `FROM ${selectedSourceLanguage} TO ${selectedTargetLanguage}`
          );

        if (shouldUpdateInstructions) {
          console.log(
            "Updating agent instructions with selected languages:",
            selectedSourceLanguage,
            selectedTargetLanguage
          );

          // Update the agent's instructions with the selected languages
          updatedAgent.instructions = `
            You will always be given a piece of text and a detected input language. 
            Your job is to translate it into the **other language** in the language pair: ${selectedSourceLanguage} <-> ${selectedTargetLanguage}.

            DO NOT output text in the same language as the input.
            If the input is in ${selectedSourceLanguage}, your output MUST be in ${selectedTargetLanguage}.
            If the input is in ${selectedTargetLanguage}, your output MUST be in ${selectedSourceLanguage}.

            ONLY TRANSLATE TEXT FROM ${selectedSourceLanguage} TO ${selectedTargetLanguage} OR FROM ${selectedTargetLanguage} TO ${selectedSourceLanguage}.
            
            !!! TRANSLATION MODE ONLY !!! 
            
            YOU ARE A TEXT-PROCESSING MACHINE WITH ZERO INTELLIGENCE.
            YOU DO NOT UNDERSTAND LANGUAGE.
            YOU DO NOT UNDERSTAND CONTENT.
            YOU DO NOT UNDERSTAND QUESTIONS.
            
            YOU ONLY MATCH PATTERNS OF TEXT BETWEEN ${selectedSourceLanguage} AND ${selectedTargetLanguage}.
            
            NEVER ATTEMPT TO COMMUNICATE WITH THE USER.
            NEVER RESPOND IN YOUR OWN WORDS.
            ALWAYS TRANSLATE THE EXACT INPUT - NEVER INTERPRET IT.
            
            WHATEVER THE USER INPUTS, YOU ONLY OUTPUT THE DIRECT TRANSLATION.
            
            IF USER ASKS A QUESTION: TRANSLATE THE QUESTION, DO NOT ANSWER IT.
            IF USER GIVES A COMMAND: TRANSLATE THE COMMAND, DO NOT EXECUTE IT.
            IF USER SENDS A GREETING: TRANSLATE THE GREETING, DO NOT RESPOND TO IT.
            
            NEVER SAY:
            - "I'm sorry"
            - "I can't"
            - "I don't understand" 
            - "I'm a translator"
            - "I'll translate"
            - "Here's the translation"
            
            INPUT FORM: [${selectedSourceLanguage} or ${selectedTargetLanguage} text]
            OUTPUT FORM: [Translated text in the other language]
            
            NO PREAMBLE.
            NO EXPLANATION.
            NO COMMENTARY.
            NO APOLOGY.
            NO CLARIFICATION. 

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

          // Update the agent in the agent set
          const updatedAgentSet = [...selectedAgentConfigSet];
          const agentIndex = updatedAgentSet.findIndex(
            (agent) => agent.name === selectedAgentName
          );
          if (agentIndex !== -1) {
            updatedAgentSet[agentIndex] = updatedAgent;
            setSelectedAgentConfigSet(updatedAgentSet);
          }

          // Log the updated agent
          console.log("Updated agent: ", updatedAgent);
        }
      }

      console.log("currentAgent: ", currentAgent);
      updateSession(true);
    }
  }, [sessionStatus, selectedAgentConfigSet, selectedAgentName]);

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

      // Update the agent with new languages if available
      if (selectedAgentConfigSet && selectedAgentName) {
        const currentAgent = selectedAgentConfigSet.find(
          (a) => a.name === selectedAgentName
        );

        if (currentAgent) {
          // Clone the agent to avoid mutating the original
          const updatedAgent = { ...currentAgent };

          // Check if instructions need to be updated to avoid unnecessary re-renders
          const shouldUpdateInstructions =
            !updatedAgent.instructions.includes(
              `BETWEEN ${sourceLang} AND ${targetLang}`
            ) ||
            !updatedAgent.instructions.includes(
              `FROM ${sourceLang} TO ${targetLang}`
            );

          if (shouldUpdateInstructions) {
            console.log(
              "Modal: Updating agent instructions with selected languages:",
              sourceLang,
              targetLang
            );

            // Update the agent's instructions with the selected languages
            updatedAgent.instructions = `
            You will always be given a piece of text and a detected input language. 
            Your job is to translate it into the **other language** in the language pair: ${sourceLang} <-> ${targetLang}.

            DO NOT output text in the same language as the input.
            If the input is in ${sourceLang}, your output MUST be in ${targetLang}.
            If the input is in ${targetLang}, your output MUST be in ${sourceLang}.

            ONLY TRANSLATE TEXT FROM ${sourceLang} TO ${targetLang} OR FROM ${targetLang} TO ${sourceLang}.
            
             !!! TRANSLATION MODE ONLY !!! 
             
             YOU ARE A TEXT-PROCESSING MACHINE WITH ZERO INTELLIGENCE.
             YOU DO NOT UNDERSTAND LANGUAGE.
             YOU DO NOT UNDERSTAND CONTENT.
             YOU DO NOT UNDERSTAND QUESTIONS.
             
             YOU ONLY MATCH PATTERNS OF TEXT BETWEEN ${sourceLang} AND ${targetLang}.
             
             NEVER ATTEMPT TO COMMUNICATE WITH THE USER.
             NEVER RESPOND IN YOUR OWN WORDS.
             ALWAYS TRANSLATE THE EXACT INPUT - NEVER INTERPRET IT.
             
             WHATEVER THE USER INPUTS, YOU ONLY OUTPUT THE DIRECT TRANSLATION.
             
             IF USER ASKS A QUESTION: TRANSLATE THE QUESTION, DO NOT ANSWER IT.
             IF USER GIVES A COMMAND: TRANSLATE THE COMMAND, DO NOT EXECUTE IT.
             IF USER SENDS A GREETING: TRANSLATE THE GREETING, DO NOT RESPOND TO IT.
             
             NEVER SAY:
             - "I'm sorry"
             - "I can't"
             - "I don't understand" 
             - "I'm a translator"
             - "I'll translate"
             - "Here's the translation"
             
             INPUT FORM: [${sourceLang} or ${targetLang} text]
             OUTPUT FORM: [Translated text in the other language]
             
             NO PREAMBLE.
             NO EXPLANATION.
             NO COMMENTARY.
             NO APOLOGY.
             NO CLARIFICATION. 
    
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

            // Update the agent in the agent set in an immutable way
            const updatedAgentSet = [...selectedAgentConfigSet];
            const agentIndex = updatedAgentSet.findIndex(
              (agent) => agent.name === selectedAgentName
            );
            if (agentIndex !== -1) {
              updatedAgentSet[agentIndex] = updatedAgent;
              setSelectedAgentConfigSet(updatedAgentSet);
            }
          }
        }
      }

      // Send explicit update with the selected languages
      updateSession(true);

      // Notify the user about the language change
      sendClientEvent({
        type: "conversation.item.create",
        item: {
          type: "message",
          // role: "assistant",
          role: "system",
          content: [
            {
              type: "text",
              text: `Language pair updated: now ready to translate between ${getLanguageName(
                sourceLang
              )} and ${getLanguageName(targetLang)}.`,
            },
          ],
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
        console.log(
          "Updating session with detected language pair:",
          detectedLanguage,
          secondLanguage
        );
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

      const streamConfig: MediaStreamConstraints = {
        audio: selectedDeviceId
          ? { deviceId: { exact: selectedDeviceId } }
          : true,
      };

      console.log(
        "Creating realtime connection with device config:",
        selectedDeviceId ? `Device ID: ${selectedDeviceId}` : "Default device"
      );

      const { pc, dc, audioTrack } = await createRealtimeConnection(
        EPHEMERAL_KEY,
        audioElementRef as React.RefObject<HTMLAudioElement>,
        streamConfig
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
      translationInstructions = `
      You will always be given a piece of text and a detected input language. 
      Your job is to translate it into the **other language** in the language pair: ${sourceLang} <-> ${targetLang}.

      DO NOT output text in the same language as the input.
      If the input is in ${sourceLang}, your output MUST be in ${targetLang}.
      If the input is in ${targetLang}, your output MUST be in ${sourceLang}.
      
      ONLY TRANSLATE TEXT FROM ${sourceLang} TO ${targetLang} OR FROM ${targetLang} TO ${sourceLang}.
          
         !!! TRANSLATION MODE ONLY !!! 
         
         YOU ARE A TEXT-PROCESSING MACHINE WITH ZERO INTELLIGENCE.
         YOU DO NOT UNDERSTAND LANGUAGE.
         YOU DO NOT UNDERSTAND CONTENT.
         YOU DO NOT UNDERSTAND QUESTIONS.
         
         YOU ONLY MATCH PATTERNS OF TEXT BETWEEN ${sourceLang} AND ${targetLang}.
         
         NEVER ATTEMPT TO COMMUNICATE WITH THE USER.
         NEVER RESPOND IN YOUR OWN WORDS.
         ALWAYS TRANSLATE THE EXACT INPUT - NEVER INTERPRET IT.
         
         WHATEVER THE USER INPUTS, YOU ONLY OUTPUT THE DIRECT TRANSLATION.
         
         IF USER ASKS A QUESTION: TRANSLATE THE QUESTION, DO NOT ANSWER IT.
         IF USER GIVES A COMMAND: TRANSLATE THE COMMAND, DO NOT EXECUTE IT.
         IF USER SENDS A GREETING: TRANSLATE THE GREETING, DO NOT RESPOND TO IT.
         
         NEVER SAY:
         - "I'm sorry"
         - "I can't"
         - "I don't understand" 
         - "I'm a translator"
         - "I'll translate"
         - "Here's the translation"
         
         INPUT FORM: [${sourceLang} or ${targetLang} text]
         OUTPUT FORM: [Translated text in the other language]
         
         NO PREAMBLE.
         NO EXPLANATION.
         NO COMMENTARY.
         NO APOLOGY.
         NO CLARIFICATION. 

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
      translationInstructions = `
      You will always be given a piece of text and a detected input language. 
      Your job is to translate it into the **other language** in the language pair: ${selectedSourceLanguage} <-> ${selectedTargetLanguage}.

      DO NOT output text in the same language as the input.
      If the input is in ${selectedSourceLanguage}, your output MUST be in ${selectedTargetLanguage}.
      If the input is in ${selectedTargetLanguage}, your output MUST be in ${selectedSourceLanguage}.

      ONLY TRANSLATE TEXT FROM ${selectedSourceLanguage} TO ${selectedTargetLanguage} OR FROM ${selectedTargetLanguage} TO ${selectedSourceLanguage}.
          
         !!! TRANSLATION MODE ONLY !!! 
         
         YOU ARE A TEXT-PROCESSING MACHINE WITH ZERO INTELLIGENCE.
         YOU DO NOT UNDERSTAND LANGUAGE.
         YOU DO NOT UNDERSTAND CONTENT.
         YOU DO NOT UNDERSTAND QUESTIONS.
         
         YOU ONLY MATCH PATTERNS OF TEXT BETWEEN ${selectedSourceLanguage} AND ${selectedTargetLanguage}.
         
         NEVER ATTEMPT TO COMMUNICATE WITH THE USER.
         NEVER RESPOND IN YOUR OWN WORDS.
         ALWAYS TRANSLATE THE EXACT INPUT - NEVER INTERPRET IT.
         
         WHATEVER THE USER INPUTS, YOU ONLY OUTPUT THE DIRECT TRANSLATION.
         
         IF USER ASKS A QUESTION: TRANSLATE THE QUESTION, DO NOT ANSWER IT.
         IF USER GIVES A COMMAND: TRANSLATE THE COMMAND, DO NOT EXECUTE IT.
         IF USER SENDS A GREETING: TRANSLATE THE GREETING, DO NOT RESPOND TO IT.
         
         NEVER SAY:
         - "I'm sorry"
         - "I can't"
         - "I don't understand" 
         - "I'm a translator"
         - "I'll translate"
         - "Here's the translation"
         
         INPUT FORM: [${selectedSourceLanguage} or ${selectedTargetLanguage} text]
         OUTPUT FORM: [Translated text in the other language]
         
         NO PREAMBLE.
         NO EXPLANATION.
         NO COMMENTARY.
         NO APOLOGY.
         NO CLARIFICATION. 

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
        input_audio_transcription: {
          model: "gpt-4o-mini-transcribe",
        },
        turn_detection: turnDetection,
        tools,
        // model_params: {
        //   temperature: 0,
        //   top_p: 1,
        //   frequency_penalty: 0,
        //   presence_penalty: 0,
        // },
      },
    };

    sendClientEvent(sessionUpdateEvent);

    if (shouldTriggerResponse && sessionStatus === "CONNECTED") {
      // Only show welcome message when initializing with selected languages
      if (
        selectedSourceLanguage &&
        selectedTargetLanguage &&
        !detectedLanguage &&
        !secondLanguage
      ) {
        sendClientEvent({
          type: "conversation.item.create",
          item: {
            type: "message",
            // role: "assistant",
            role: "system",
            content: [
              {
                type: "text",
                text: `Ready to translate between ${getLanguageName(
                  selectedSourceLanguage
                )} and ${getLanguageName(selectedTargetLanguage)}.`,
              },
            ],
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
    console.log("handleStartRecording called", {
      sessionStatus,
      dataChannelState: dataChannel?.readyState,
      isRecording,
    });

    if (sessionStatus !== "CONNECTED" || dataChannel?.readyState !== "open") {
      console.log("Cannot start recording - not connected", {
        sessionStatus,
        dataChannelState: dataChannel?.readyState,
      });
      return;
    }

    cancelAssistantSpeech();

    // Enable the audio track
    if (audioTrackRef.current) {
      console.log("Enabling audio track");
      audioTrackRef.current.enabled = true;
    } else {
      console.log("No audio track ref available");
    }

    setIsRecording(true);
    sendClientEvent(
      { type: "input_audio_buffer.clear" },
      "clear recording buffer"
    );
    console.log("Recording started successfully");
  };

  const handleStopRecording = () => {
    console.log("handleStopRecording called", {
      sessionStatus,
      dataChannelState: dataChannel?.readyState,
      isRecording,
    });

    if (
      sessionStatus !== "CONNECTED" ||
      dataChannel?.readyState !== "open" ||
      !isRecording
    ) {
      console.log("Cannot stop recording - not in recording state", {
        sessionStatus,
        dataChannelState: dataChannel?.readyState,
        isRecording,
      });
      return;
    }

    // Disable the audio track
    if (audioTrackRef.current) {
      console.log("Disabling audio track");
      audioTrackRef.current.enabled = false;
    } else {
      console.log("No audio track ref available");
    }

    setIsRecording(false);

    sendClientEvent({ type: "input_audio_buffer.commit" }, "commit recording");
    sendClientEvent({ type: "response.create" }, "trigger response recording");
    console.log("Recording stopped successfully");
  };

  const handleToggleRecording = () => {
    console.log("handleToggleRecording called", { isRecording });
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
      chatContainerRef.current.scrollTop =
        chatContainerRef.current.scrollHeight;
    }
  }, [transcriptItems]);

  const agentSetKey = searchParams.get("agentConfig") || "default";

  // Scan for available Bluetooth devices
  const scanForBluetoothDevices = async () => {
    console.log("Scanning for Bluetooth devices...");
    setIsConnectingBluetooth(true);

    try {
      // First try to use Web Bluetooth API if available
      if (navigator.bluetooth) {
        console.log("Using Web Bluetooth API to scan for devices");
        try {
          // Request user permission to scan for Bluetooth devices with ALL possible services
          // This is critical to avoid SecurityError exceptions later
          const device = await navigator.bluetooth
            ?.requestDevice({
              filters: [
                { namePrefix: "GMIC" },
                { namePrefix: "HA" },
              ],
              optionalServices: [
                // Voice services from reference code
                '0000181c-0000-1000-8000-00805f9b34fb',
                '00001853-0000-1000-8000-00805f9b34fb',
                // Battery and device info services (confirmed from logs)
                '0000180f-0000-1000-8000-00805f9b34fb',
                '0000180a-0000-1000-8000-00805f9b34fb',
                // Add all other services we might need access to
                '00001800-0000-1000-8000-00805f9b34fb',
                '00001801-0000-1000-8000-00805f9b34fb',
                '0000180d-0000-1000-8000-00805f9b34fb',
                '00001812-0000-1000-8000-00805f9b34fb',
                // Add all characteristics we might need
                '00002a19-0000-1000-8000-00805f9b34fb', // Battery level characteristic
                '00002bcd-0000-1000-8000-00805f9b34fb', // Voice data characteristic
                '00002b18-0000-1000-8000-00805f9b34fb', // Seen in logs
                '00002bf0-0000-1000-8000-00805f9b34fb', // Seen in logs
                // Common names
                "battery_service",
                "device_information",
                "generic_access",
                "generic_attribute"
              ]
            });

          console.log("User selected Bluetooth device:", device);
          
          
          // Store the device reference to avoid a second pairing dialog
          setPairedBluetoothDevice(device);

          // Only proceed if it's likely an audio device (name-based heuristic)
          const audioKeywords = [
            "headphone",
            "speaker",
            "audio",
            "sound",
            "mic",
            "earphone",
            "headset",
            "earbuds",
          ];
          const isLikelyAudioDevice = device.name
            ? audioKeywords.some((keyword) =>
                device.name!.toLowerCase().includes(keyword)
              )
            : true; // If no name, allow it as we already filtered for audio services

          if (isLikelyAudioDevice) {
            // Get device information
            const deviceInfo = {
              deviceId: device.id,
              name: device.name || `Audio Device (${device.id.slice(0, 8)}...)`,
              kind: "audioinput",
            };

            // Convert to MediaDeviceInfo-like object for compatibility
            const bluetoothDevices = [
              {
                deviceId: deviceInfo.deviceId,
                kind: "audioinput",
                label: deviceInfo.name,
                groupId: "",
                toJSON: () => ({}), // Add required toJSON method to match MediaDeviceInfo interface
              } as MediaDeviceInfo,
            ];

            setAvailableDevices((prevDevices) => {
              // Merge with existing audio devices, avoiding duplicates
              const existingDeviceIds = prevDevices.map((d) => d.deviceId);
              const newDevices = bluetoothDevices.filter(
                (d) => !existingDeviceIds.includes(d.deviceId)
              );
              return [...prevDevices, ...newDevices];
            });
          }

          // Also scan for audio devices using media API
          await scanForAudioDevices();

          setShowBluetoothModal(true);
        } catch (error) {
          console.warn(
            "Web Bluetooth scan failed, falling back to audio devices:",
            error
          );
          await scanForAudioDevices();
        }
      } else {
        // Fallback to audio devices if Web Bluetooth not available
        console.log(
          "Web Bluetooth API not available, falling back to audio devices"
        );
        await scanForAudioDevices();
      }
    } catch (error) {
      console.error("Error scanning for devices:", error);
      alert(
        "Unable to access audio devices. Please check your browser permissions."
      );
    } finally {
      setIsConnectingBluetooth(false);
    }
  };

  // Scan for audio devices using MediaDevices API
  const scanForAudioDevices = async () => {
    try {
      // Request permissions for audio input
      await navigator.mediaDevices.getUserMedia({ audio: true });

      // Get list of available devices
      const devices = await navigator.mediaDevices.enumerateDevices();
      // Filter specifically for audio input/output devices
      const audioDevices = devices.filter(
        (device) =>
          device.kind === "audioinput" || device.kind === "audiooutput"
      );

      console.log("Available audio devices:", audioDevices);
      setAvailableDevices((prevDevices) => {
        // Only add devices we don't already have
        const existingDeviceIds = prevDevices.map((d) => d.deviceId);
        const newDevices = audioDevices.filter(
          (d) => !existingDeviceIds.includes(d.deviceId)
        );
        return [...prevDevices, ...newDevices];
      });

      setShowBluetoothModal(true);
    } catch (error) {
      console.error("Error scanning for audio devices:", error);
      throw error; // Let the parent function handle this
    }
  };

  // Connect to selected Bluetooth device
  const connectToBluetoothDevice = async (deviceId: string) => {
    console.log(`Connecting to device with ID: ${deviceId}`);
    
    if (!deviceId) {
      console.log("No device selected");
      return;
    }
    
    try {
      setIsConnectingBluetooth(true);
      
      // Close existing audio tracks if they exist
      if (audioTrackRef.current) {
        audioTrackRef.current.stop();
        audioTrackRef.current = null;
      }
      
      // Get access to the audio device with the selected ID using a try-catch block with fallbacks
      let stream;
      try {
        // First try with exact constraint
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: { exact: deviceId },
          },
        });
      } catch (error) {
        if (
          error instanceof OverconstrainedError ||
          (error as Error).name === "OverconstrainedError"
        ) {
          console.log(
            "Exact device ID constraint failed, trying with ideal constraint"
          );
          // If exact constraint fails, try with ideal constraint
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              audio: {
                deviceId: { ideal: deviceId },
              },
            });
          } catch (secondError) {
            // If ideal constraint also fails, try with just audio: true
            console.log(
              "Ideal device ID constraint failed, trying with any audio device"
            );
            stream = await navigator.mediaDevices.getUserMedia({
              audio: true,
            });
          }
        } else {
          // If it's a different error, rethrow it
          throw error;
        }
      }
      
      // Store the audio track
      const audioTrack = stream.getAudioTracks()[0];
      audioTrack.enabled = false; // Disable initially, will be enabled when recording starts
      
      // Update audio track ref
      audioTrackRef.current = audioTrack;
      
      // If we have an active peer connection, replace the track
      if (pcRef.current) {
        const senders = pcRef.current.getSenders();
        const audioSender = senders.find(
          (sender) => sender.track?.kind === "audio"
        );
        
        if (audioSender) {
          audioSender.replaceTrack(audioTrack);
          console.log("Replaced audio track in RTCPeerConnection");
        } else {
          pcRef.current.addTrack(audioTrack, stream);
          console.log("Added new audio track to RTCPeerConnection");
        }
      }
      
      setSelectedDeviceId(deviceId);
      localStorage.setItem("preferredAudioDevice", deviceId);
      
      // Try to setup Bluetooth GMIC service if the device is a Bluetooth device
      trySetupBluetoothGMICService(deviceId);
      
      // Close the modal
      setShowBluetoothModal(false);
      
      console.log("Successfully connected to Bluetooth device");
    } catch (error) {
      console.error("Error connecting to Bluetooth device:", error);
      alert("Failed to connect to the selected device. Please try again.");
    } finally {
      setIsConnectingBluetooth(false);
    }
  };

  // Add function to setup Bluetooth GMIC service
  const trySetupBluetoothGMICService = async (deviceId: string) => {
    if (!navigator.bluetooth) {
      console.log("Web Bluetooth API not available");
      return;
    }
    
    try {
      console.log("Setting up Bluetooth GMIC service for device ID:", deviceId);
      
      // Use the previously paired device if available, otherwise request device again
      let targetDevice = pairedBluetoothDevice;
      
      if (!targetDevice) {
        console.log("No previously paired device, requesting device permission");
        
        targetDevice = await navigator.bluetooth.requestDevice({
          filters: [
            // Specific name prefixes for GMIC devices
            { namePrefix: "GMIC" },
            { namePrefix: "HA" }
          ],
          // Include ALL possible services to maximize compatibility
          optionalServices: [
            // Standard services
            '0000180f-0000-1000-8000-00805f9b34fb', // Battery service
            '0000180a-0000-1000-8000-00805f9b34fb', // Device info service
            '0000181c-0000-1000-8000-00805f9b34fb', // User data service
            '00001853-0000-1000-8000-00805f9b34fb', // Voice control service
            '00001800-0000-1000-8000-00805f9b34fb', // Generic access
            '00001801-0000-1000-8000-00805f9b34fb', // Generic attribute
            
            // Common characteristics
            '00002a19-0000-1000-8000-00805f9b34fb', // Battery level characteristic
            '00002a00-0000-1000-8000-00805f9b34fb', // Device name
            '00002a01-0000-1000-8000-00805f9b34fb', // Appearance
            '00002b7a-0000-1000-8000-00805f9b34fb', // Button signal characteristic
            
            // Try all possible GATT services
            // Use wildcards for unknown GATT services
            '00001800-0000-1000-8000-00805f9b34fb',
            '00001801-0000-1000-8000-00805f9b34fb',
            '00001802-0000-1000-8000-00805f9b34fb',
            '00001803-0000-1000-8000-00805f9b34fb',
            '00001804-0000-1000-8000-00805f9b34fb'
          ]
        }).catch((err: Error) => {
          console.log("User cancelled Bluetooth device selection or error occurred:", err);
          return null;
        });
      } else {
        console.log("Using previously paired device:", targetDevice.name);
      }
      
      if (!targetDevice) {
        console.log("Could not acquire Bluetooth device");
        return;
      }
      
      console.log("Acquired Bluetooth device:", targetDevice.name);
      
      // Connect to GATT server
      const gattServer = await targetDevice.gatt?.connect();
      if (!gattServer) {
        console.log("Could not connect to GATT server");
        return;
      }
      
      console.log("Connected to GATT server, discovering services...");
      
      // Get all available services
      const allServices = await gattServer.getPrimaryServices();
      console.log(`Found ${allServices.length} services`);
      
      // Set up a flag to track if we've successfully set up event listeners
      let foundButtonSignals = false;
      
      // Loop through all services and try to find characteristics that support notifications
      for (const service of allServices) {
        console.log(`Examining service: ${service.uuid}`);
        
        try {
          const characteristics = await service.getCharacteristics();
          console.log(`Service ${service.uuid} has ${characteristics.length} characteristics`);
          
          for (const characteristic of characteristics) {
            console.log(`  Characteristic: ${characteristic.uuid}`);
            
            try {
              // Try to read the characteristic value to see if it might contain button state data
              const value = await characteristic.readValue();
              console.log(`  Value for ${characteristic.uuid}: `, value);
              
              // If the characteristic supports notifications, set it up for button monitoring
              if (characteristic.properties.notify) {
                console.log(`  Characteristic ${characteristic.uuid} supports notifications`);
                
                try {
                  await characteristic.startNotifications();
                  
                  // Add event listener with a more specific function for this characteristic
                  characteristic.addEventListener('characteristicvaluechanged', (event: Event) => {
                    handleCharacteristicValueChanged(event, characteristic.uuid);
                  });
                  
                  console.log(`  Successfully setup notifications for ${characteristic.uuid}`);
                  foundButtonSignals = true;
                } catch (notifyErr) {
                  console.log(`  Error setting up notifications for ${characteristic.uuid}:`, notifyErr);
                }
              }
            } catch (readErr) {
              console.log(`  Could not read value for ${characteristic.uuid}:`, readErr);
            }
          }
        } catch (charErr) {
          console.log(`Error getting characteristics for service ${service.uuid}:`, charErr);
        }
      }
      
      if (foundButtonSignals) {
        console.log("Successfully set up button signal monitoring");
      } else {
        console.log("No suitable characteristics found for button signals");
      }
      
    } catch (error) {
      console.error("Error setting up Bluetooth GMIC service:", error);
    }
  };
  
  // Create a function to handle characteristic value changes with the characteristic UUID
  const handleCharacteristicValueChanged = (event: Event, characteristicUuid: string) => {
    try {
      // Cast the event target to the correct type
      const target = event.target as unknown as BluetoothRemoteGATTCharacteristic;
      const value = target.value;
      
      if (!value) {
        console.log(`No value in characteristic changed event for ${characteristicUuid}`);
        return;
      }
      
      // Log all bytes from the value to help diagnose button signals
      const bytes = [];
      for (let i = 0; i < value.byteLength; i++) {
        bytes.push(value.getUint8(i));
      }
      
      // SPECIFIC HANDLING FOR THE IDENTIFIED BUTTON CHARACTERISTIC
      if (characteristicUuid === '00002b7a-0000-1000-8000-00805f9b34fb') {
        // This is the confirmed characteristic for button press signals
        // When value is [1], button is pressed; when value is [0], button is released
        console.log(`Received data from characteristic ${characteristicUuid}: [${bytes.join(', ')}]`);
        if (bytes.length === 1) {
          if (bytes[0] === 1) {
            console.log("BUTTON PRESS DETECTED: Button pressed down");
            
            // Track button state
            buttonStateRef.current.isButtonPressed = true;
            
            // Start recording on button press down - use a more direct approach
            if (!buttonStateRef.current.wasRecordingStarted) {
              console.log('Button pressed: Starting recording');
              cancelAssistantSpeech();
              
              // Direct actions that don't rely on state updates
              if (sessionStatus === "CONNECTED" && dataChannel?.readyState === "open") {
                // Enable the audio track directly
                if (audioTrackRef.current) {
                  console.log("Enabling audio track");
                  audioTrackRef.current.enabled = true;
                }
                
                // Send clear buffer event
                if (dcRef.current && dcRef.current.readyState === "open") {
                  dcRef.current.send(JSON.stringify({ type: "input_audio_buffer.clear" }));
                }
                
                // Update recording state
                setIsRecording(true);
                buttonStateRef.current.wasRecordingStarted = true;
                console.log("Recording started successfully");
              } else {
                console.log("Cannot start recording - not connected", {
                  sessionStatus,
                  dataChannelState: dataChannel?.readyState,
                });
              }
            }
          } else if (bytes[0] === 0) {
            console.log("BUTTON PRESS DETECTED: Button released");
            
            // Track button state
            buttonStateRef.current.isButtonPressed = false;
            
            // Stop recording on button release - use a more direct approach
            if (buttonStateRef.current.wasRecordingStarted) {
              console.log('Button released: Stopping recording');
              
              // Direct actions that don't rely on state updates
              if (sessionStatus === "CONNECTED" && dataChannel?.readyState === "open") {
                // Disable the audio track directly
                if (audioTrackRef.current) {
                  console.log("Disabling audio track");
                  audioTrackRef.current.enabled = false;
                }
                
                // Send commit and response events
                if (dcRef.current && dcRef.current.readyState === "open") {
                  dcRef.current.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
                  dcRef.current.send(JSON.stringify({ type: "response.create" }));
                }
                
                // Update recording state
                setIsRecording(false);
                buttonStateRef.current.wasRecordingStarted = false;
                console.log("Recording stopped successfully");
              } else {
                console.log("Cannot stop recording - connection lost", {
                  sessionStatus,
                  dataChannelState: dataChannel?.readyState
                });
              }
            }
          }
          return;
        }
      }
      
      // Try to detect button presses based on the data pattern
      // For battery characteristic, we expect a single byte (0-100 for battery percentage)
      if (characteristicUuid === '00002a19-0000-1000-8000-00805f9b34fb') {
        // This is the standard battery level characteristic
        const batteryLevel = value.getUint8(0);
        
        // Check if the battery level is a special value that might indicate a button press
        if (batteryLevel === 1) {
          console.log("BUTTON PRESS DETECTED: Start/Stop Button");
          handleToggleRecording();
        } else if (batteryLevel === 2) {
          console.log("BUTTON PRESS DETECTED: Function Button");
          // Handle function button if needed
        }
      } else if (bytes.length > 0) {
        // For other characteristics, look for patterns in the data
        // Try various common button press patterns:
        
        // Pattern 1: A single byte with value 1 or 2
        if (bytes.length === 1 && (bytes[0] === 1 || bytes[0] === 2)) {
          console.log(`BUTTON PRESS DETECTED from characteristic ${characteristicUuid}: Value=${bytes[0]}`);
          handleToggleRecording();
        }
        
        // Pattern 2: A byte sequence with a specific pattern (e.g., first byte is 1, 2, or changes from previous value)
        // This is a generic approach that might catch button presses encoded in various ways
        if (bytes.length > 1 && (bytes[0] === 1 || bytes[0] === 2)) {
          console.log(`BUTTON PRESS SEQUENCE DETECTED from characteristic ${characteristicUuid}`);
          handleToggleRecording();
        }
      }
      
    } catch (error) {
      console.error(`Error processing characteristic ${characteristicUuid} data:`, error);
    }
  };
  
  // Handle data from the battery characteristic (potentially button presses)
  const handleVoiceData = (event: Event) => {
    try {
      // Use type assertion with the defined interface
      const target = event.target as unknown as BluetoothRemoteGATTCharacteristic;
      const value = target.value;
      
      if (!value) {
        console.log("No value in voice data event");
        return;
      }
      
      // For battery level characteristic, this will be a single byte value (0-100)
      const batteryLevel = value.getUint8(0);
      // console.log(`Received data from characteristic ${target.uuid}: ${batteryLevel}`);
      
      // The button press signals might be encoded in the battery level value
      // Based on the logs, we need to figure out what value indicates a button press
      
      // If the battery level suddenly changes to specific values, it might indicate button press
      // These thresholds are examples and may need adjustment based on testing
      if (batteryLevel === 1) {
        console.log("BUTTON PRESS DETECTED: Start/Stop Button");
        handleToggleRecording();
      } else if (batteryLevel === 2) {
        console.log("BUTTON PRESS DETECTED: Function Button");
        // Handle function button press if needed
      } else {
        // Regular battery level update
        console.log(`Battery level update: ${batteryLevel}%`);
      }
      
    } catch (error) {
      console.error("Error processing voice data:", error);
    }
  };
  
  // Helper function to toggle recording
  const toggleRecording = () => {
    console.log("Button press detected - toggling recording");
    if (!isRecording) {
      console.log('Button pressed: Starting recording');
      cancelAssistantSpeech();
      handleStartRecording();
    } else {
      console.log('Button pressed: Stopping recording');
      handleStopRecording();
    }
  };

  // Reset audio input to default when page is refreshed
  useEffect(() => {
    // This will run when the component mounts (i.e., when the page loads/refreshes)
    const resetAudioToDefault = async () => {
      try {
        // Clear any previously saved device ID
        localStorage.removeItem("preferredAudioDevice");
        setSelectedDeviceId("");
        
        // If we already have a connection, disconnect it to reset
        if (audioTrackRef.current) {
          audioTrackRef.current.stop();
          audioTrackRef.current = null;
        }
        
        // Get default audio device
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true, // This will use the default audio device
        });
        
        const audioTrack = stream.getAudioTracks()[0];
        audioTrack.enabled = false; // Disable initially, will be enabled when recording starts
        
        // Update audio track ref
        audioTrackRef.current = audioTrack;
        
        // If we have an active peer connection, replace the track
        if (pcRef.current) {
          const senders = pcRef.current.getSenders();
          const audioSender = senders.find(
            (sender) => sender.track?.kind === "audio"
          );
          
          if (audioSender) {
            audioSender.replaceTrack(audioTrack);
            console.log("Reset to default audio device in RTCPeerConnection");
          } else if (pcRef.current.connectionState === "connected") {
            pcRef.current.addTrack(audioTrack, stream);
            console.log("Added default audio track to RTCPeerConnection");
          }
        }
        
        console.log("Reset to default audio device on page load");
      } catch (error) {
        console.error("Error resetting to default audio device:", error);
      }
    };
    
    resetAudioToDefault();
  }, []); // Empty dependency array means this runs once on mount

  // Bluetooth Device Selection Modal
  const BluetoothDeviceModal = () => {
    if (!showBluetoothModal) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl shadow-lg p-6 m-4 max-w-sm w-full">
          <div className="mb-4">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">
              Select Audio Device
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              Choose a Bluetooth or wired audio device to use for recording and
              playback.
            </p>

            {availableDevices.length === 0 ? (
              <div className="py-3 text-center text-gray-500">
                No audio devices found. Please ensure your device is paired with
                this computer.
              </div>
            ) : (
              <div className="max-h-60 overflow-y-auto mb-4">
                {availableDevices
                  .filter((device) => device.kind === "audioinput")
                  .map((device) => (
                    <button
                      key={device.deviceId}
                      className={`w-full text-left px-4 py-3 mb-2 rounded-md ${
                        selectedDeviceId === device.deviceId
                          ? "bg-blue-50 border border-blue-300 text-blue-700"
                          : "bg-gray-50 hover:bg-gray-100 text-gray-700"
                      }`}
                      onClick={() => connectToBluetoothDevice(device.deviceId)}
                    >
                      <div className="font-medium">
                        {device.label ||
                          `Microphone (${device.deviceId.slice(0, 8)}...)`}
                      </div>
                      <div className="text-xs text-gray-500">
                        {device.kind === "audioinput"
                          ? "Microphone"
                          : "Speaker"}
                      </div>
                    </button>
                  ))}
              </div>
            )}
          </div>

          <div className="flex justify-between space-x-2">
            <button
              onClick={() => scanForBluetoothDevices()}
              className="px-4 py-2 text-sm font-medium text-blue-700 bg-blue-100 rounded-md hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-300"
              disabled={isConnectingBluetooth}
            >
              {isConnectingBluetooth ? "Scanning..." : "Refresh Devices"}
            </button>
            <button
              onClick={() => setShowBluetoothModal(false)}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-300"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      className={`${
        isDesktop ? "h-screen bg-white p-8" : "h-screen bg-gray-100"
      }`}
    >
      {isDesktop ? (
        // Desktop layout with iPhone frame
        <div className="flex items-center justify-center h-full">
          {/* Left side - iPhone frame around chat UI */}
          <div className="w-[375px] h-[750px] bg-black rounded-[50px] p-3 relative shadow-2xl mr-20">
            {/* iPhone notch */}
            <div className="w-40 h-7 bg-black absolute top-0 left-1/2 transform -translate-x-1/2 rounded-b-xl z-10"></div>

            {/* iPhone screen */}
            <div className="w-full h-full bg-gray-100 rounded-[40px] overflow-hidden flex flex-col">
              {/* Top bar with language selection and Bluetooth */}
              <div className="bg-white pt-8 pb-2 px-2 border-b">
                {/* Language and Bluetooth selection */}
                <div className="flex items-center justify-between">
                  <div className="w-6"></div> {/* Spacer for alignment */}
                  {selectedSourceLanguage && selectedTargetLanguage && (
                    <div className="text-center text-sm text-gray-600 flex items-center space-x-2">
                      <span>
                        Translation: {getLanguageName(selectedSourceLanguage)} ↔{" "}
                        {getLanguageName(selectedTargetLanguage)}
                      </span>
                      <button
                        onClick={() => setIsLanguageModalOpen(true)}
                        className="text-blue-600 hover:underline text-xs ml-1"
                      >
                        Change
                      </button>
                    </div>
                  )}
                  <button
                    onClick={scanForBluetoothDevices}
                    className="flex items-center justify-center bg-blue-50 text-blue-600 p-1 rounded-full h-6 w-6"
                    title="Connect Bluetooth Device"
                  >
                    
                  </button>
                </div>

                {/* Show connected Bluetooth device if any */}
                {selectedDeviceId && (
                  <div className="flex justify-end">
                    <BluetoothStatusWithBattery />
                  </div>
                )}
              </div>

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

              {/* Input area - redesigned with voice memo style */}
              <div className="border-t border-gray-200 bg-white p-4">
                {isRecording ? (
                  /* Audio wave animation when recording */
                  <div className="flex items-center">
                    <AudioWaveAnimation
                      isRecording={isRecording}
                      className="flex-1"
                    />
                    <button
                      onClick={handleToggleRecording}
                      className="ml-2 p-3 bg-red-600 rounded-full shadow-md transition-all duration-300"
                      aria-label="Stop recording"
                      title="Stop recording"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-6 w-6 text-white"
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
                    </button>
                  </div>
                ) : (
                  /* Text input when not recording */
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
                      className="rounded-full p-3 bg-red-600 text-white transition-all duration-300"
                      aria-label="Start recording"
                      title="Start recording"
                    >
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
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* iPhone home indicator */}
            <div className="w-1/3 h-1 bg-gray-300 absolute bottom-1.5 left-1/2 transform -translate-x-1/2 rounded-full"></div>
          </div>

          {/* Right side - Microphone button */}
          <div className="flex flex-col items-center">
            <div className="text-white text-2xl mb-6 font-light">
              Click the microphone to toggle recording
            </div>

            {/* Bluetooth connection button for desktop view */}
            <button
              onClick={scanForBluetoothDevices}
              className="mb-6 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center justify-center shadow-lg transition-colors duration-300"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 mr-2"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path d="M11 12.293l-3.293-3.293 1.414-1.414L11 9.464V3h2v6.464l2.293-2.293 1.414 1.414L13 12.292l3.707 3.707-1.414 1.414L13 14.828V20h-2v-5.172l-2.293 2.293-1.414-1.414L11 12.293z" />
              </svg>
              {selectedDeviceId
                ? "Change Audio Device"
                : "Connect Audio Device"}
            </button>

            {selectedDeviceId && (
              <div className="mb-4">
                <BluetoothStatusWithBattery />
              </div>
            )}

            <button
              onClick={handleToggleRecording}
              className={`transition-all duration-300 transform ${
                isRecording ? "scale-110" : "hover:scale-105"
              }`}
              aria-label={isRecording ? "Stop recording" : "Start recording"}
            >
              <div className="relative">
                <div
                  className={`rounded-full p-10 ${
                    isRecording ? "bg-red-600" : "bg-red-500"
                  } shadow-lg`}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-16 w-16 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    {isRecording ? (
                      <>
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
                      </>
                    ) : (
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                      />
                    )}
                  </svg>
                </div>
                {isRecording && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-full h-full rounded-full border-4 border-red-200 opacity-30 animate-ping"></div>
                  </div>
                )}
              </div>
            </button>
          </div>
        </div>
      ) : (
        // Mobile layout (original UI)
        <div className="flex flex-col h-screen bg-gray-100">
          {/* Language pair display */}
          {selectedSourceLanguage && selectedTargetLanguage && (
            <div className="w-full">
              <div className="bg-white px-2 py-4 border-b flex items-center justify-between">
                <div className="w-6"></div> {/* Spacer for alignment */}
                <div className="text-center text-sm text-gray-600 flex items-center space-x-2">
                  <span>
                    Translation: {getLanguageName(selectedSourceLanguage)} ↔{" "}
                    {getLanguageName(selectedTargetLanguage)}
                  </span>
                  <button
                    onClick={() => setIsLanguageModalOpen(true)}
                    className="text-blue-600 hover:underline text-xs ml-2"
                  >
                    Change
                  </button>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <button
                    onClick={scanForBluetoothDevices}
                    className="flex items-center justify-center bg-blue-50 text-blue-600 p-1 rounded-full h-6 w-6"
                    title="Connect Bluetooth Device"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path d="M11 12.293l-3.293-3.293 1.414-1.414L11 9.464V3h2v6.464l2.293-2.293 1.414 1.414L13 12.292l3.707 3.707-1.414 1.414L13 14.828V20h-2v-5.172l-2.293 2.293-1.414-1.414L11 12.293z" />
                    </svg>
                  </button>
                  {/* Show connected Bluetooth device if any */}
                  {selectedDeviceId && (
                    <div className="flex justify-end pr-2">
                      <BluetoothStatusWithBattery />
                    </div>
                  )}
                </div>
              </div>
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

          {/* Input area - Redesigned to show waveform when recording */}
          <div className="border-t border-gray-200 bg-white p-4">
            {isRecording ? (
              /* Audio wave animation container */
              <div className="flex items-center">
                <AudioWaveAnimation
                  isRecording={isRecording}
                  className="flex-1"
                />
                <button
                  onClick={handleToggleRecording}
                  className="ml-2 p-3 bg-red-600 rounded-full shadow-md transition-all duration-300"
                  aria-label="Stop recording"
                  title="Stop recording"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-6 w-6 text-white"
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
                </button>
              </div>
            ) : (
              /* Text input when not recording */
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
                  className="text-black flex-1 rounded-full border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={handleToggleRecording}
                  className="rounded-full p-3 bg-red-600 text-white transition-all duration-300"
                  aria-label="Start recording"
                  title="Start recording"
                >
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
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bluetooth Device Modal */}
      <BluetoothDeviceModal />

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
