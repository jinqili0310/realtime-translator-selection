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
        instructions: `
        You will always be given a piece of text and a detected input language. 

        ONLY TRANSLATE TEXT FROM ${lang1} TO ${lang2} OR FROM ${lang2} TO ${lang1}.
          
          !!! TRANSLATION MODE ONLY !!! 
          
          YOU ARE A TEXT-PROCESSING MACHINE WITH ZERO INTELLIGENCE.
          YOU DO NOT UNDERSTAND LANGUAGE.
          YOU DO NOT UNDERSTAND CONTENT.
          YOU DO NOT UNDERSTAND QUESTIONS.
          
          YOU ONLY MATCH PATTERNS OF TEXT BETWEEN ${lang1} AND ${lang2}.
          
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
          
          INPUT FORM: [${lang1} or ${lang2} text]
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
        // model_params: {
        //   temperature: 0,
        //   top_p: 1,
        //   frequency_penalty: 0,
        //   presence_penalty: 0,
        // },
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
          // Common language patterns - improved with more specific patterns
          const languagePatterns = {
            en: /\b(the|is|are|and|to|for|in|on|that|with|this|have|from|by|not|be|at|you|we|they)\b/gi,  // Common English words
            zh: /[\u4e00-\u9fff]/g,  // Chinese characters
            ja: /[\u3040-\u309f\u30a0-\u30ff]/g,  // Japanese hiragana and katakana
            ko: /[\uac00-\ud7af]/g,  // Korean hangul
            ru: /[\u0410-\u044f]/g,  // Russian Cyrillic 
            ar: /[\u0600-\u06ff]/g,  // Arabic script
            hi: /[\u0900-\u097f]/g,  // Hindi Devanagari
            es: /\b(el|la|los|las|un|una|y|en|de|por|para|con|es|son|está|están)\b/gi,  // Common Spanish words
            fr: /\b(le|la|les|un|une|et|en|de|pour|avec|est|sont|c'est|je|tu|nous|vous)\b/gi,  // Common French words
            de: /\b(der|die|das|ein|eine|und|in|auf|für|mit|ist|sind|zu|ich|du|wir|sie)\b/gi,  // Common German words
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
              // Ensure we're using the correct translation direction based on detected language
              if (firstLang === selectedSourceLanguage) {
                // Detected language matches first selected, translate to second
                console.log("Detected language is source, translating to target:", firstLang, "→", selectedTargetLanguage);
                setSecondLanguage(selectedTargetLanguage);
                
                // Force different languages for translation pair
                if (firstLang !== selectedTargetLanguage) {
                  updateSessionWithLanguages(firstLang, selectedTargetLanguage);
                }
              } 
              else if (firstLang === selectedTargetLanguage) {
                // Detected language matches second selected, translate to first
                console.log("Detected language is target, translating to source:", firstLang, "→", selectedSourceLanguage);
                setSecondLanguage(selectedSourceLanguage);
                
                // Force different languages for translation pair
                if (firstLang !== selectedSourceLanguage) {
                  updateSessionWithLanguages(firstLang, selectedSourceLanguage);
                }
              } 
              else {
                // If detected language doesn't match either selected language,
                // use the selected pair but inform the user
                console.log("Detected language doesn't match selected pair, using selected pair anyway");
                
                // Don't change the detected language setup, but remind the user
                // about the selected pair
                sendClientEvent({
                  type: "conversation.item.create",
                  item: {
                    type: "message",
                    // role: "assistant",
                    role: "system",
                    content: [{ type: "text", text: `Note: I detected ${getLanguageName(firstLang)}, which is not in your selected language pair. I will translate between ${getLanguageName(selectedSourceLanguage)} and ${getLanguageName(selectedTargetLanguage)} based on language detection.` }],
                  },
                });
                
                // Use selected language pair, forcing source to be different from target
                if (selectedSourceLanguage !== selectedTargetLanguage) {
                  updateSessionWithLanguages(selectedSourceLanguage, selectedTargetLanguage);
                } else {
                  // Fallback if somehow the same language is selected for both
                  console.error("ERROR: Same language detected for source and target");
                  // Choose a different second language if available
                  const fallbackLang = sortedLanguages.length > 1 ? sortedLanguages[1][0] : (firstLang === "en" ? "es" : "en");
                  updateSessionWithLanguages(firstLang, fallbackLang);
                }
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
                } else {
                  // If second language is the same as first or not available,
                  // choose a fallback language different from the first
                  const fallbackLang = firstLang === "en" ? "es" : "en";
                  console.log("Using fallback second language:", fallbackLang);
                  setSecondLanguage(fallbackLang);
                  updateSessionWithLanguages(firstLang, fallbackLang);
                }
              } else {
                // Only one language detected, use fallback for second
                const fallbackLang = firstLang === "en" ? "es" : "en";
                console.log("Only one language detected, using fallback:", fallbackLang);
                setSecondLanguage(fallbackLang);
                
                // Inform user and update session
                sendClientEvent({
                  type: "conversation.item.create",
                  item: {
                    type: "message",
                    // role: "assistant",
                    role: "system",
                    content: [{ type: "text", text: `I detected ${getLanguageName(firstLang)}. Using ${getLanguageName(fallbackLang)} as the second language.` }],
                  },
                });
                
                updateSessionWithLanguages(firstLang, fallbackLang);
              }
            }
          } else {
            // No language detected, use fallback languages
            console.log("No language detected, using fallback languages");
            const fallbackSource = selectedSourceLanguage || "en";
            const fallbackTarget = selectedTargetLanguage || "es";
            
            if (fallbackSource !== fallbackTarget) {
              updateSessionWithLanguages(fallbackSource, fallbackTarget);
            } else {
              // If somehow the same language is selected for both, use en-es as default
              updateSessionWithLanguages("en", "es");
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
