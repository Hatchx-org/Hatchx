"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/client-error-reporting";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { reportClientError(error, "global-error-boundary"); }, [error]);
  return <html lang="en"><body><main style={{maxWidth:560,margin:"80px auto",padding:24,textAlign:"center",fontFamily:"system-ui"}}><h1>Something went wrong</h1><p>The application could not load. The incident was recorded if you were signed in.</p><button type="button" onClick={reset} style={{padding:"10px 18px",borderRadius:999}}>Try again</button></main></body></html>;
}
