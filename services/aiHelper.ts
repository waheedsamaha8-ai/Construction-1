
// This file now aggregates specialized services from the 'ai' directory.
// This preserves backward compatibility for imports throughout the app.

import { marketService } from './ai/market';
import { calculatorService } from './ai/calculator';
import { tipsService } from './ai/tips';
import { consultantService } from './ai/consultant';
import { analysisService } from './ai/analysis';

import { safeGenerateStream, connectLiveApi } from './ai/core';

export const aiHelper = {
    // --- Live API & Streaming ---
    stream: safeGenerateStream,
    connectLiveApi,

    // --- Consultant & Agents ---
    ...consultantService,

    // --- Engineering Tips ---
    ...tipsService,

    // --- Analysis (Images, Docs, Soil, Reports, Audio) ---
    ...analysisService,

    // --- Calculator (Materials & Pricing) ---
    ...calculatorService,

    // --- Market Prices ---
    ...marketService
};
