"use client";

import React, { useEffect, useState } from "react";

interface LanguageSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (sourceLanguage: string, targetLanguage: string) => void;
  initialSourceLanguage?: string;
  initialTargetLanguage?: string;
}

interface Language {
  code: string;
  name: string;
}

const LANGUAGES: Language[] = [
  { code: "en", name: "English" },
  { code: "zh", name: "Chinese" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
  { code: "ru", name: "Russian" },
  { code: "ar", name: "Arabic" },
  { code: "hi", name: "Hindi" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
];

export default function LanguageSelectionModal({
  isOpen,
  onClose,
  onSave,
  initialSourceLanguage = "en",
  initialTargetLanguage = "es",
}: LanguageSelectionModalProps) {
  const [sourceLanguage, setSourceLanguage] = useState(initialSourceLanguage);
  const [targetLanguage, setTargetLanguage] = useState(initialTargetLanguage);

  useEffect(() => {
    if (isOpen) {
      // Reset to initial values when modal opens
      setSourceLanguage(initialSourceLanguage);
      setTargetLanguage(initialTargetLanguage);
    }
  }, [isOpen, initialSourceLanguage, initialTargetLanguage]);

  if (!isOpen) return null;

  const handleSave = () => {
    if (sourceLanguage === targetLanguage) {
      alert("Please select different languages for source and target");
      return;
    }
    onSave(sourceLanguage, targetLanguage);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-lg p-6 m-4 max-w-sm w-full">
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Select Languages</h2>
          <p className="text-sm text-gray-600 mb-4">
            Choose the two languages you want to translate between. The system will automatically detect which one you&apos;re speaking.
          </p>
          
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              First Language
            </label>
            <select
              value={sourceLanguage}
              onChange={(e) => setSourceLanguage(e.target.value)}
              className="text-black w-full p-2 border border-gray-300 rounded-md bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {LANGUAGES.map((lang) => (
                <option 
                  key={`source-${lang.code}`} 
                  value={lang.code}
                  disabled={lang.code === targetLanguage}
                >
                  {lang.name} {lang.code === targetLanguage ? '(already selected)' : ''}
                </option>
              ))}
            </select>
          </div>
          
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Second Language
            </label>
            <select
              value={targetLanguage}
              onChange={(e) => setTargetLanguage(e.target.value)}
              className="text-black w-full p-2 border border-gray-300 rounded-md bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {LANGUAGES.map((lang) => (
                <option 
                  key={`target-${lang.code}`} 
                  value={lang.code}
                  disabled={lang.code === sourceLanguage}
                >
                  {lang.name} {lang.code === sourceLanguage ? '(already selected)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
        
        <div className="flex justify-end space-x-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-300"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-500 rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
} 