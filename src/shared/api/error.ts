import type { components } from './generated/bff';

export type ApiError = components['schemas']['ApiError'];
type ErrorCode = ApiError['error']['code'];

const statusByCode = {
  INVALID_INPUT: 400,
  FORBIDDEN: 403,
  BOOK_NOT_FOUND: 404,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  UNSUPPORTED_FILTER: 422,
  INTERNAL_ERROR: 500,
  UPSTREAM_FAILURE: 502,
  CATALOG_UNAVAILABLE: 503,
  UPSTREAM_TIMEOUT: 504,
} satisfies Record<ErrorCode, number>;

export class ApiFailure extends Error {
  constructor(readonly code: ErrorCode) {
    super(code);
    this.name = 'ApiFailure';
  }

  get status() {
    return statusByCode[this.code];
  }
}
