import { useEffect, useRef } from "react";
import { answerLocalApiRequest, listenLocalApiRequests } from "./api";
import { dispatchLocalApiRequest, type LocalApiHandlers } from "./dispatch";

/**
 * Answers local API requests that the native side forwards to the island window.
 * Listening is cheap; whether the API is on at all is decided natively.
 */
export function useLocalApiBridge(handlers: LocalApiHandlers) {
  const handlersRef = useRef(handlers);

  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  useEffect(() => {
    let didCancel = false;
    let unlisten: (() => void) | null = null;

    void listenLocalApiRequests((request) => {
      void dispatchLocalApiRequest(handlersRef.current, request.method, request.params)
        .then((response) => answerLocalApiRequest(request.id, response))
        .catch((error) => console.error("Failed to answer a local API request", error));
    })
      .then((nextUnlisten) => {
        if (didCancel) {
          nextUnlisten();
        } else {
          unlisten = nextUnlisten;
        }
      })
      .catch((error) => console.error("Failed to listen for local API requests", error));

    return () => {
      didCancel = true;
      unlisten?.();
    };
  }, []);
}
