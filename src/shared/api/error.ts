import type { components } from './generated/bff';

export type ApiError = components['schemas']['ApiError'];
type ErrorCode = ApiError['error']['code'];

const statusByCode = {
  INVALID_INPUT: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  EMAIL_UNVERIFIED: 403,
  BOOK_NOT_FOUND: 404,
  RESOURCE_NOT_FOUND: 404,
  CART_EMPTY: 409,
  CART_CHANGED: 409,
  CART_LIMIT: 409,
  INSUFFICIENT_STOCK: 409,
  AMOUNT_OUT_OF_RANGE: 409,
  QUOTE_EXPIRED: 409,
  QUOTE_CONSUMED: 409,
  IDEMPOTENCY_CONFLICT: 409,
  UNSUPPORTED_CURRENCY: 409,
  VERSION_CONFLICT: 409,
  ORDER_STATE_CONFLICT: 409,
  CART_ITEM_PRECONDITION_FAILED: 412,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  UNSUPPORTED_FILTER: 422,
  INTERNAL_ERROR: 500,
  UPSTREAM_FAILURE: 502,
  CATALOG_UNAVAILABLE: 503,
  INTAKE_CLOSED: 503,
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
