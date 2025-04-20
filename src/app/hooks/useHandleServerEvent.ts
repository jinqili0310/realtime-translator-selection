"use client";

import { ServerEvent, SessionStatus, AgentConfig } from "@/app/types";
import { useTranscript } from "@/app/contexts/TranscriptContext";
import { useEvent } from "@/app/contexts/EventContext";

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

export interface UseHandleServerEventParams {
  setSessionStatus: (status: SessionStatus) => void;
  selectedAgentName: string;
  selectedAgentConfigSet: AgentConfig[] | null;
  sendClientEvent: (eventObj: any, eventNameSuffix?: string) => void;
  setSelectedAgentName: (name: string) => void;
  setDetectedLanguage: (language: string) => void;
  setSecondLanguage: (language: string) => void;
  isRecording: boolean;
  selectedSourceLanguage?: string;
  selectedTargetLanguage?: string;
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
  selectedSourceLanguage,
  selectedTargetLanguage,
}: UseHandleServerEventParams) {
  const {
    transcriptItems,
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

  // Helper function to update session with specified language pair
  const updateSessionWithLanguages = (lang1: string, lang2: string) => {
    sendClientEvent({
      type: "session.update",
      session: {
        modalities: ["text", "audio"],
        instructions: `You are a strict translator between ${lang1} and ${lang2}. 
          When you receive input in ${lang1}, translate it to ${lang2}.
          When you receive input in ${lang2}, translate it to ${lang1}.
          
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
            
            // Always store the detected language for reference
            setDetectedLanguage(firstLang);
            
            // Check if we have a selected language pair
            if (selectedSourceLanguage && selectedTargetLanguage) {
              // If the detected language is one of our selected languages,
              // translate to the other language in the pair
              if (firstLang === selectedSourceLanguage) {
                // Detected language is the first selected language, translate to the second
                console.log("Detected language is source, translating to target:", firstLang, "→", selectedTargetLanguage);
                setSecondLanguage(selectedTargetLanguage);
                
                // Update session with detected language as source, other as target
                updateSessionWithLanguages(firstLang, selectedTargetLanguage);
              } 
              else if (firstLang === selectedTargetLanguage) {
                // Detected language is the second selected language, translate to the first
                console.log("Detected language is target, translating to source:", firstLang, "→", selectedSourceLanguage);
                setSecondLanguage(selectedSourceLanguage);
                
                // Update session with detected language as source, other as target
                updateSessionWithLanguages(firstLang, selectedSourceLanguage);
              } 
              else {
                // If detected language is different from our selected languages,
                // inform the user but still use the selected pair
                console.log("Detected language doesn't match selected pair, using selected pair anyway");
                
                // Don't change the detected language setup, but remind the user
                // about the selected pair
                sendClientEvent({
                  type: "conversation.item.create",
                  item: {
                    type: "message",
                    role: "assistant",
                    content: [{ type: "text", text: `Note: I detected ${getLanguageName(firstLang)}, which is not in your selected language pair. I will translate between ${getLanguageName(selectedSourceLanguage)} and ${getLanguageName(selectedTargetLanguage)} based on language detection.` }],
                  },
                });
                
                // Default to first language as source if detection fails
                updateSessionWithLanguages(selectedSourceLanguage, selectedTargetLanguage);
              }
            } else {
              // If no selected language pair exists, fall back to regular detection logic
              // Find second language (different from first)
              if (sortedLanguages.length > 1) {
                const secondLang = sortedLanguages[1][0];
                console.log("Second detected language:", secondLang);
                if (secondLang && firstLang !== secondLang) {
                  setSecondLanguage(secondLang);
                  
                  // Update session with detected language pair
                  updateSessionWithLanguages(firstLang, secondLang);
                }
              } else {
                // Ask for second language if no selected pair and only one language detected
                sendClientEvent({
                  type: "conversation.item.create",
                  item: {
                    type: "message",
                    role: "assistant",
                    content: [{ type: "text", text: `I detected ${getLanguageName(firstLang)}. Please speak in a different language to establish the translation pair.` }],
                  },
                });
              }
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
          
          // If we already have selected languages, update the session with them immediately
          if (selectedSourceLanguage && selectedTargetLanguage) {
            console.log("Session created with selected language pair:", selectedSourceLanguage, selectedTargetLanguage);
            updateSessionWithLanguages(selectedSourceLanguage, selectedTargetLanguage);
          }
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
