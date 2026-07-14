const ERROR_FIELDS = ["error", "errorMessage"];

/**
 * RFC 7807 Problem Details extended with Tide-specific fields.
 *
 * Wire shape produced by ork + tidecloak-idp-extensions when a backend call
 * fails with `Content-Type: application/problem+json`.
 */
export type TideProblem = {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  code?: string;
  traceId?: string;
  source?: string;
  instance?: string;
  messageKey?: string | null;
  messageParams?: unknown;
};

export type NetworkErrorOptions = {
  response: Response;
  responseData: unknown;
  problem?: TideProblem;
};

export class NetworkError extends Error {
  response: Response;
  responseData: unknown;
  /**
   * Populated when the failing response carried `application/problem+json`
   * (or a JSON body containing both `code` and `detail`). Consumers should
   * prefer this when present — it carries the trace id, error code and source
   * needed for the standardised toast UX.
   */
  problem?: TideProblem;

  constructor(message: string, options: NetworkErrorOptions) {
    super(message);
    this.response = options.response;
    this.responseData = options.responseData;
    this.problem = options.problem;
  }
}

export async function fetchWithError(
  input: Request | string | URL,
  init?: RequestInit,
) {
  const response = await fetch(input, init);

  // TIDECLOAK IMPLEMENTATION allow for redirect method
  if (!response.ok  && response.status !== 303) {
    const responseData = await parseResponse(response);
    const problem = extractTideProblem(response, responseData);
    // Prefer the Problem Details `detail` for Error.message so legacy
    // `error.message` consumers still get a meaningful string.
    const message =
      problem?.detail ?? problem?.title ?? getErrorMessage(responseData);
    throw new NetworkError(message, {
      response,
      responseData,
      problem,
    });
  }

  return response;
}

export async function parseResponse(response: Response): Promise<any> {
  if (!response.body) {
    return "";
  }

  const data = await response.text();

  try {
    return JSON.parse(data);
  } catch {
    return data;
  }
}

function getErrorMessage(data: unknown): string {
  if (typeof data !== "object" || data === null) {
    return "Unable to determine error message.";
  }

  for (const key of ERROR_FIELDS) {
    const value = (data as Record<string, unknown>)[key];

    if (typeof value === "string") {
      return value;
    }
  }

  return "Network response was not OK.";
}

/**
 * Extract a {@link TideProblem} from the response if it conforms to either:
 *  - `Content-Type: application/problem+json`, or
 *  - any JSON body containing both `code` and `detail` strings (defensive
 *    fallback for proxies that strip/rewrite the content type).
 */
function extractTideProblem(
  response: Response,
  data: unknown,
): TideProblem | undefined {
  if (typeof data !== "object" || data === null) {
    return undefined;
  }

  const contentType = response.headers.get("Content-Type") ?? "";
  const isProblemJson = contentType
    .toLowerCase()
    .startsWith("application/problem+json");

  const body = data as Record<string, unknown>;
  const hasProblemShape =
    typeof body.code === "string" && typeof body.detail === "string";

  if (!isProblemJson && !hasProblemShape) {
    return undefined;
  }

  const pickString = (key: string): string | undefined =>
    typeof body[key] === "string" ? (body[key] as string) : undefined;

  const status =
    typeof body.status === "number" ? (body.status as number) : response.status;

  return {
    type: pickString("type"),
    title: pickString("title"),
    status,
    detail: pickString("detail"),
    code: pickString("code"),
    traceId: pickString("traceId"),
    source: pickString("source"),
    instance: pickString("instance"),
    messageKey:
      typeof body.messageKey === "string"
        ? (body.messageKey as string)
        : body.messageKey === null
          ? null
          : undefined,
    messageParams: body.messageParams,
  };
}
