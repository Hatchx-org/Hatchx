import { completeAuthentication } from "@/lib/auth-completion";

export async function GET(request: Request) {
  return completeAuthentication(request);
}
