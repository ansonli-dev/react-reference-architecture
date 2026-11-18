import { expect, type APIRequestContext } from '@playwright/test';
import { javaStubOrigin } from './java-catalog-stub.mjs';

export const firstBookId = '00000000-0000-4000-8000-000000000101';
export const missingBookId = '00000000-0000-4000-8000-000000009999';

type Scenario = {
  mode?: 'failure' | 'broken' | 'unsafe';
  delayMs?: number;
  firstBookStock?: number;
  resetCalls?: boolean;
};
type JavaCall = {
  path: string;
  cookie: string | null;
  authorization: string | null;
};

export async function setJavaScenario(
  request: APIRequestContext,
  scenario: Scenario = {},
) {
  expect(
    (
      await request.put(javaStubOrigin + '/__test/scenario', { data: scenario })
    ).status(),
  ).toBe(204);
}

export async function readJavaCalls(
  request: APIRequestContext,
): Promise<JavaCall[]> {
  return (await request.get(javaStubOrigin + '/__test/calls')).json();
}
