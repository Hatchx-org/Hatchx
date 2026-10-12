import { recordServerError } from "@/lib/server-error-reporting";

export async function onRequestError(
  error: unknown,
  request: { path: string; method: string },
  context: { routePath?: string; routeType?: string; routerKind?: string },
) {
  await recordServerError("next-request", error, {
    method: request.method,
    path: request.path?.split("?")[0]?.slice(0, 300),
    route: context.routePath?.slice(0, 300),
    routeType: context.routeType,
    routerKind: context.routerKind,
  });
}
