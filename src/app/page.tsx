import React, { Suspense } from "react";
import { TranscriptProvider } from "@/app/contexts/TranscriptContext";
import { EventProvider } from "@/app/contexts/EventContext";
import AppWrapper from "./AppWrapper";

// Loading component for Suspense fallback
const Loading = () => (
  <div className="flex items-center justify-center h-screen bg-gray-100">
    <div className="text-center">
      <div className="w-16 h-16 border-t-4 border-blue-500 border-solid rounded-full animate-spin mx-auto mb-4"></div>
      <p className="text-gray-700">Loading translator...</p>
    </div>
  </div>
);

export default function Page() {
  return (
    <TranscriptProvider>
      <EventProvider>
        <Suspense fallback={<Loading />}>
          <AppWrapper />
        </Suspense>
      </EventProvider>
    </TranscriptProvider>
  );
}
