import createClient from 'openapi-fetch';
import type { paths } from './generated/bff';

export const apiClient = createClient<paths>({ baseUrl: '' });
