import type { Forecast, ForecastRange } from '../types';
import { request } from './client';

export const getForecast = (range: ForecastRange) => request<Forecast>(`/forecast?range=${range}`);
