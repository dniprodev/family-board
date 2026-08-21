import { useEffect, useRef } from "react";

type TurnstileOptions = {
  sitekey: string;
  action: string;
  callback: (token: string) => void;
  "error-callback": () => void;
  "expired-callback": () => void;
};

type Turnstile = {
  render(container: HTMLElement, options: TurnstileOptions): string;
  remove(widgetId: string): void;
  reset(widgetId: string): void;
};

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

let turnstileScript: Promise<Turnstile> | null = null;

function loadTurnstile() {
  if (window.turnstile) {
    return Promise.resolve(window.turnstile);
  }

  if (!turnstileScript) {
    turnstileScript = new Promise<Turnstile>((resolve, reject) => {
      const script = document.createElement("script");
      script.async = true;
      script.defer = true;
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
      script.onload = () => {
        if (window.turnstile) {
          resolve(window.turnstile);
        } else {
          reject(new Error("Turnstile did not load"));
        }
      };
      script.onerror = () => reject(new Error("Turnstile could not load"));
      document.head.appendChild(script);
    });
  }

  return turnstileScript;
}

type TurnstileWidgetProps = {
  siteKey: string;
  resetSignal: number;
  onToken: (token: string | null) => void;
  onError: () => void;
};

export function TurnstileWidget({
  siteKey,
  resetSignal,
  onToken,
  onError,
}: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  const onErrorRef = useRef(onError);

  onTokenRef.current = onToken;
  onErrorRef.current = onError;

  useEffect(() => {
    let cancelled = false;

    void loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !containerRef.current) {
          return;
        }

        widgetIdRef.current = turnstile.render(containerRef.current, {
          sitekey: siteKey,
          action: "create-page",
          callback: (token) => onTokenRef.current(token),
          "error-callback": () => onErrorRef.current(),
          "expired-callback": () => onTokenRef.current(null),
        });
      })
      .catch(() => {
        if (!cancelled) {
          onErrorRef.current();
        }
      });

    return () => {
      cancelled = true;
      if (widgetIdRef.current) {
        window.turnstile?.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [siteKey]);

  useEffect(() => {
    if (resetSignal === 0 || !widgetIdRef.current) {
      return;
    }

    window.turnstile?.reset(widgetIdRef.current);
    onTokenRef.current(null);
  }, [resetSignal]);

  return <div aria-label="Verification" ref={containerRef} />;
}
