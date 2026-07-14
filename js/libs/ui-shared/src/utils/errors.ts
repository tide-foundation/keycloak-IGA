import { NetworkError, type TideProblem } from "@keycloak/keycloak-admin-client";

const ERROR_FIELDS = ["error", "errorMessage"];
const ERROR_DESCRIPTION_FIELD = "error_description";

/**
 * Normalised view of a Tide error, suitable for rendering in the standard
 * error toast / error page. Produced by {@link getTideErrorInfo} from either:
 *
 *  - a `TideError` thrown by `@tidecloak/js` SDK methods,
 *  - a `NetworkError` whose response carried `application/problem+json`,
 *  - a legacy `NetworkError` without a problem body,
 *  - a plain `Error`, a string, or an unknown value.
 *
 * `displayMessage` is always populated; the remaining fields are present
 * only when the source error supplied them.
 */
export type TideErrorInfo = {
  displayMessage: string;
  code?: string;
  traceId?: string;
  source?: string;
  httpStatus?: number;
  problemType?: string;
  messageKey?: string | null;
  messageParams?: unknown;
};

/**
 * Duck-typed check for a `TideError` from `@tidecloak/js`. We deliberately
 * avoid an `import` of the SDK class here to keep the dependency soft and
 * survive any version drift in the SDK package.
 */
function isTideError(error: unknown): error is {
  name: "TideError";
  message: string;
  code: string;
  displayMessage?: string;
  traceId?: string;
  source?: string;
  httpStatus?: number;
  problemType?: string;
  messageKey?: string | null;
  messageParams?: unknown;
} {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const e = error as Record<string, unknown>;
  return e.name === "TideError" && typeof e.code === "string";
}

export function getTideErrorInfo(error: unknown): TideErrorInfo {
  // 1. TideError from @tidecloak/js (duck-typed to avoid a hard import dep).
  if (isTideError(error)) {
    return {
      displayMessage:
        error.displayMessage ?? error.message ?? "Unknown error.",
      code: error.code,
      traceId: error.traceId,
      source: error.source,
      httpStatus: error.httpStatus,
      problemType: error.problemType,
      messageKey: error.messageKey ?? undefined,
      messageParams: error.messageParams,
    };
  }

  // 2. NetworkError carrying a parsed Problem Details body.
  if (error instanceof NetworkError && error.problem) {
    const problem: TideProblem = error.problem;
    const displayMessage =
      problem.detail ??
      problem.title ??
      getNetworkErrorMessage(error.responseData) ??
      error.message ??
      "Unknown error.";
    return {
      displayMessage,
      code: problem.code,
      traceId: problem.traceId,
      source: problem.source,
      httpStatus: problem.status ?? error.response.status,
      problemType: problem.type,
      messageKey: problem.messageKey ?? undefined,
      messageParams: problem.messageParams,
    };
  }

  // 3. NetworkError without a problem body — legacy path.
  if (error instanceof NetworkError) {
    const fallback =
      getNetworkErrorMessage(error.responseData) ??
      error.message ??
      "Network response was not OK.";
    return {
      displayMessage: fallback,
      httpStatus: error.response.status,
    };
  }

  // 4. Any other Error subclass.
  if (error instanceof Error) {
    return { displayMessage: error.message };
  }

  // 5. Raw string.
  if (typeof error === "string") {
    return { displayMessage: error };
  }

  // 6. Unknown.
  return { displayMessage: "Unable to determine error message." };
}

export function getErrorMessage(error: unknown): string {
  return getTideErrorInfo(error).displayMessage;
}

export function getErrorDescription(error: unknown) {
  if (!(error instanceof NetworkError)) {
    return;
  }

  const data = error.responseData;

  return getNetworkErrorDescription(data);
}

export function getNetworkErrorDescription(data: unknown) {
  if (
    typeof data === "object" &&
    data !== null &&
    ERROR_DESCRIPTION_FIELD in data &&
    typeof data[ERROR_DESCRIPTION_FIELD] === "string"
  ) {
    return data[ERROR_DESCRIPTION_FIELD];
  }
}

export function getNetworkErrorMessage(data: unknown) {
  if (typeof data !== "object" || data === null) {
    return;
  }

  for (const key of ERROR_FIELDS) {
    const value = (data as Record<string, unknown>)[key];

    if (typeof value === "string") {
      return value;
    }
  }
}
