"use client";

import React, { createContext, useContext, useState, FC, PropsWithChildren, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import { LoggedEvent } from "@/app/types";

type EventContextValue = {
  loggedEvents: LoggedEvent[];
  logClientEvent: (eventObj: Record<string, any>, eventNameSuffix?: string) => void;
  logServerEvent: (eventObj: Record<string, any>, eventNameSuffix?: string) => void;
  toggleExpand: (id: number | string) => void;
};

const EventContext = createContext<EventContextValue | undefined>(undefined);

export const EventProvider: FC<PropsWithChildren> = ({ children }) => {
  const [loggedEvents, setLoggedEvents] = useState<LoggedEvent[]>([]);

  const addLoggedEvent = useCallback((direction: "client" | "server", eventName: string, eventData: Record<string, any>) => {
    const id = eventData.event_id || uuidv4();
    const newEvent = {
      id,
      direction,
      eventName,
      eventData,
      timestamp: new Date().toLocaleTimeString(),
      expanded: false,
    };
    
    setLoggedEvents(prev => [...prev, newEvent]);
  }, []);

  const logClientEvent = useCallback((eventObj: Record<string, any>, eventNameSuffix = "") => {
    const name = `${eventObj.type || ""} ${eventNameSuffix || ""}`.trim();
    addLoggedEvent("client", name, eventObj);
  }, [addLoggedEvent]);

  const logServerEvent = useCallback((eventObj: Record<string, any>, eventNameSuffix = "") => {
    const name = `${eventObj.type || ""} ${eventNameSuffix || ""}`.trim();
    addLoggedEvent("server", name, eventObj);
  }, [addLoggedEvent]);

  const toggleExpand = useCallback((id: number | string) => {
    setLoggedEvents(prev =>
      prev.map(log => {
        if (log.id === id) {
          return { ...log, expanded: !log.expanded };
        }
        return log;
      })
    );
  }, []);

  const contextValue = React.useMemo(() => ({
    loggedEvents,
    logClientEvent,
    logServerEvent,
    toggleExpand
  }), [loggedEvents, logClientEvent, logServerEvent, toggleExpand]);

  return (
    <EventContext.Provider value={contextValue}>
      {children}
    </EventContext.Provider>
  );
};

export function useEvent() {
  const context = useContext(EventContext);
  if (!context) {
    throw new Error("useEvent must be used within an EventProvider");
  }
  return context;
}