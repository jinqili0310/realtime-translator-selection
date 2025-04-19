"use client";

import { ServerEvent, SessionStatus, AgentConfig } from "@/app/types";
import { useTranscript } from "@/app/contexts/TranscriptContext";
import { useEvent } from "@/app/contexts/EventContext";
import { useRef } from "react";

export interface UseHandleServerEventParams {
  setSessionStatus: (status: SessionStatus) => void;
  selectedAgentName: string;
  selectedAgentConfigSet: AgentConfig[] | null;
  sendClientEvent: (eventObj: any, eventNameSuffix?: string) => void;
  setSelectedAgentName: (name: string) => void;
  setDetectedLanguage: (language: string) => void;
  setSecondLanguage: (language: string) => void;
  isRecording: boolean;
  shouldForceResponse?: boolean;
}

export function useHandleServerEvent({
  setSessionStatus,
  selectedAgentName,
  selectedAgentConfigSet,
  sendClientEvent,
  setSelectedAgentName,
  setDetectedLanguage,
  setSecondLanguage,
  isRecording,
}: UseHandleServerEventParams) {
  const {
    transcriptItems,
    addTranscriptBreadcrumb,
    addTranscriptMessage,
    updateTranscriptMessage,
    updateTranscriptItemStatus,
  } = useTranscript();

  const { logServerEvent } = useEvent();

  const handleFunctionCall = async (functionCallParams: {
    name: string;
    call_id?: string;
    arguments: string;
  }) => {
    const args = JSON.parse(functionCallParams.arguments);
    const currentAgent = selectedAgentConfigSet?.find(
      (a) => a.name === selectedAgentName
    );

    console.log(`function call: ${functionCallParams.name}`, args);

    if (currentAgent?.toolLogic?.[functionCallParams.name]) {
      const fn = currentAgent.toolLogic[functionCallParams.name];
      const fnResult = await fn(args, transcriptItems);
      console.log(
        `function call result: ${functionCallParams.name}`,
        fnResult
      );

      sendClientEvent({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: functionCallParams.call_id,
          output: JSON.stringify(fnResult),
        },
      });
      sendClientEvent({ type: "response.create" });
    } else if (functionCallParams.name === "transferAgents") {
      const destinationAgent = args.destination_agent;
      const newAgentConfig =
        selectedAgentConfigSet?.find((a) => a.name === destinationAgent) || null;
      if (newAgentConfig) {
        setSelectedAgentName(destinationAgent);
      }
      const functionCallOutput = {
        destination_agent: destinationAgent,
        did_transfer: !!newAgentConfig,
      };
      sendClientEvent({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: functionCallParams.call_id,
          output: JSON.stringify(functionCallOutput),
        },
      });
      console.log(
        `function call: ${functionCallParams.name} response`,
        functionCallOutput
      );
    } else {
      const simulatedResult = { result: true };
      console.log(
        `function call fallback: ${functionCallParams.name}`,
        simulatedResult
      );

      sendClientEvent({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: functionCallParams.call_id,
          output: JSON.stringify(simulatedResult),
        },
      });
      sendClientEvent({ type: "response.create" });
    }
  };

  const handleServerEvent = (serverEvent: ServerEvent) => {
    logServerEvent(serverEvent);

    switch (serverEvent.type) {
      case "session.status": {
        if (serverEvent.session?.status) {
          setSessionStatus(serverEvent.session.status);
        }
        break;
      }

      case "conversation.item.input_audio_transcription.delta": {
        console.log("serverEvent", serverEvent);
        const transcript = serverEvent.delta;
        console.log("transcript", transcript);

        // Only process transcription when recording is active
        if (!isRecording || !transcript) {
          break;
        }

        // Try to detect language from the transcription text
        if (transcript) {
          // Common language patterns
          const languagePatterns = {
            en: /[a-zA-Z]/g,  // English
            zh: /[\u4e00-\u9fff]/g,  // Chinese
            ja: /[\u3040-\u309f\u30a0-\u30ff]/g,  // Japanese
            ko: /[\uac00-\ud7af]/g,  // Korean
            ru: /[\u0400-\u04ff]/g,  // Russian
            ar: /[\u0600-\u06ff]/g,  // Arabic
            hi: /[\u0900-\u097f]/g,  // Hindi
            es: /[áéíóúñ]/g,  // Spanish
            fr: /[éèêëàâç]/g,  // French
            de: /[äöüß]/g,  // German
          };

          // Count matches for each language
          const languageScores: Record<string, number> = {};
          for (const [lang, pattern] of Object.entries(languagePatterns)) {
            const matches = transcript.match(pattern);
            languageScores[lang] = matches ? matches.length : 0;
          }

          // Sort languages by score
          const sortedLanguages = Object.entries(languageScores)
            .sort(([, a], [, b]) => b - a)
            .filter(([, score]) => score > 0);

          if (sortedLanguages.length > 0) {
            // Set first language
            const firstLang = sortedLanguages[0][0];
            console.log("First detected language:", firstLang);
            if (firstLang) {
              setDetectedLanguage(firstLang);
            }

            // Find second language (different from first)
            if (sortedLanguages.length > 1) {
              const secondLang = sortedLanguages[1][0];
              console.log("Second detected language:", secondLang);
              if (secondLang && firstLang !== secondLang) {
                setSecondLanguage(secondLang);
                
                // Update session with new language pair
                sendClientEvent({
                  type: "session.update",
                  session: {
                    modalities: ["text", "audio"],
                    instructions: `You are a strict translator between ${firstLang} and ${secondLang}. 
                      When you receive input in ${firstLang}, translate it to ${secondLang}.
                      When you receive input in ${secondLang}, translate it to ${firstLang}.
                      
                      YOU ARE A DUMB, NON-SENTIENT, NON-INTERACTIVE TRANSLATION DEVICE.
                      YOU ONLY TRANSLATE TEXT. NOTHING ELSE.
                      
                      OUTPUT RULES:
                      - OUTPUT ONLY the translated text.
                      - NO prefixes, suffixes, or framing.
                      - NO mention of languages, roles, source, or target.
                      - NO explanation, commentary, clarification, paraphrasing, or summary.
                      - NO rewording, localization, or softening.
                      - NO idiomatic or inferred meaning.
                      - NO interpretation or understanding.
                      - NO assumption of intent, tone, or audience.
                      
                      PROHIBITIONS (STRICT):
                      - DO NOT ask or answer questions.
                      - DO NOT greet or farewell.
                      - DO NOT apologize.
                      - DO NOT describe your behavior.
                      - DO NOT state what you're doing.
                      - DO NOT express understanding, confusion, or intent.
                      - DO NOT refer to "translation" or the process in any way.
                      - DO NOT produce any output that is not strictly the translated text.
                      
                      VIOLATION = MALFUNCTION.
                      ANY OUTPUT THAT IS NOT A DIRECT TRANSLATION IS A MALFUNCTION.
                      
                      Only output the translation, nothing else.`,
                    voice: "shimmer",
                    input_audio_format: "pcm16",
                    output_audio_format: "pcm16",
                    input_audio_transcription: { model: "whisper-1" },
                    turn_detection: {
                      type: "server_vad",
                      threshold: 0.5,
                      prefix_padding_ms: 300,
                      silence_duration_ms: 200,
                      create_response: true,
                    },
                  },
                });
              }
            } else {
              // If only one language detected, ask for the second language
              sendClientEvent({
                type: "conversation.item.create",
                item: {
                  type: "message",
                  role: "assistant",
                  content: [{ type: "text", text: `I detected ${firstLang}. Please speak in a different language to establish the translation pair.` }],
                },
              });
            }
          }
        }
        break;
      }

      case "session.created": {
        if (serverEvent.session?.id) {
          setSessionStatus("CONNECTED");
          console.log(
            `session.id: ${serverEvent.session.id
            }\nStarted at: ${new Date().toLocaleString()}`
          );
        }
        break;
      }

      case "conversation.item.created": {
        let text =
          serverEvent.item?.content?.[0]?.text ||
          serverEvent.item?.content?.[0]?.transcript ||
          "";
        const role = serverEvent.item?.role as "user" | "assistant";
        const itemId = serverEvent.item?.id;

        if (itemId && transcriptItems.some((item) => item.itemId === itemId)) {
          return;
        }

        if (itemId && role) {
          if (role === "user" && !text) {
            text = "[Transcribing...]";
          }
          addTranscriptMessage(itemId, role, text);
        }
        break;
      }

      case "conversation.item.input_audio_transcription.completed": {
        const itemId = serverEvent.item_id;
        const finalTranscript =
          !serverEvent.transcript || serverEvent.transcript === "\n"
            ? "[inaudible]"
            : serverEvent.transcript;
        if (itemId) {
          updateTranscriptMessage(itemId, finalTranscript, false);
        }
        break;
      }

      case "response.audio_transcript.delta": {
        const itemId = serverEvent.item_id;
        const deltaText = serverEvent.delta || "";
        if (itemId) {
          updateTranscriptMessage(itemId, deltaText, true);
        }
        break;
      }

      case "response.done": {
        if (serverEvent.response?.output) {
          serverEvent.response.output.forEach((outputItem) => {
            if (
              outputItem.type === "function_call" &&
              outputItem.name &&
              outputItem.arguments
            ) {
              handleFunctionCall({
                name: outputItem.name,
                call_id: outputItem.call_id,
                arguments: outputItem.arguments,
              });
            }
          });
        }
        break;
      }

      case "response.output_item.done": {
        const itemId = serverEvent.item?.id;
        if (itemId) {
          updateTranscriptItemStatus(itemId, "DONE");
        }
        break;
      }
    }
  };

  return handleServerEvent;
}
