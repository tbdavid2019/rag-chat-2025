
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { RagStore, Document, QueryResult, SpaceConfig } from '../types';

let ai: GoogleGenAI;
let customApiKey: string | null = null;

export function setApiKey(key: string) {
    console.log('[GeminiService] Setting API Key...');
    customApiKey = key;
    initialize();
    console.log('[GeminiService] API Key set successfully');
}

export function clearApiKey() {
    console.log('[GeminiService] Clearing API Key...');
    customApiKey = null;
    initialize();
}

export function initialize() {
    // Prioritize custom key, then env key.
    // Note: process.env.API_KEY might be empty in some environments.
    const key = customApiKey || process.env.API_KEY;
    if (key) {
        console.log('[GeminiService] Initializing with API Key');
        ai = new GoogleGenAI({ apiKey: key });
        console.log('[GeminiService] GoogleGenAI initialized');
    } else {
        console.warn('[GeminiService] No API Key provided');
    }
}

async function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function checkInitialized() {
    if (!ai) throw new Error("Gemini API Key not set. Please enter your API Key in the top right corner.");
}

export async function listRagStores(): Promise<RagStore[]> {
    checkInitialized();
    console.log('[GeminiService] Fetching RAG stores list...');
    const pager = await ai.fileSearchStores.list();
    console.log('[GeminiService] Pager received:', pager);
    const stores = (pager.page || []).map(s => ({
        name: s.name,
        displayName: s.displayName || s.name
    }));
    console.log(`[GeminiService] Found ${stores.length} RAG stores:`, stores);
    return stores;
}

export async function listDocuments(ragStoreName: string): Promise<Document[]> {
    checkInitialized();
    console.log(`[GeminiService] Fetching documents for store: ${ragStoreName}`);
    const pager = await ai.fileSearchStores.documents.list({ parent: ragStoreName });
    console.log('[GeminiService] Documents pager received:', pager);
    const docs = (pager.page || []).map(d => ({
        name: d.name,
        displayName: d.displayName || d.name
    }));
    console.log(`[GeminiService] Found ${docs.length} documents:`, docs);
    return docs;
}

export async function createRagStore(displayName: string): Promise<string> {
    checkInitialized();
    console.log(`[GeminiService] Creating RAG store: ${displayName}`);
    const ragStore = await ai.fileSearchStores.create({ config: { displayName } });
    if (!ragStore.name) {
        console.error('[GeminiService] Failed to create RAG store: name is missing');
        throw new Error("Failed to create RAG store: name is missing.");
    }
    console.log(`[GeminiService] RAG store created successfully: ${ragStore.name}`);
    return ragStore.name;
}

export async function uploadToRagStore(ragStoreName: string, file: File): Promise<void> {
    checkInitialized();
    console.log(`[GeminiService] Uploading file: ${file.name} to store: ${ragStoreName}`);

    let op = await ai.fileSearchStores.uploadToFileSearchStore({
        file: file,
        fileSearchStoreName: ragStoreName,
        config: {
            displayName: file.name,
        }
    });

    console.log('[GeminiService] Upload initiated, waiting for completion...');
    while (!op.done) {
        await delay(3000);
        op = await ai.operations.get({ operation: op });
        console.log('[GeminiService] Upload in progress...');
    }
    console.log(`[GeminiService] File uploaded successfully: ${file.name}`);
}

// Default config values
export const DEFAULT_MODEL = 'gemini-2.5-flash';
export const DEFAULT_SYSTEM_INSTRUCTION = "DO NOT ASK THE USER TO READ THE MANUAL. Provide a direct answer based on the provided context. Pinpoint the relevant sections.";

export async function fileSearch(ragStoreName: string, query: string, config?: SpaceConfig): Promise<QueryResult> {
    checkInitialized();
    console.log(`[GeminiService] Performing file search in store: ${ragStoreName}`);
    console.log(`[GeminiService] Query: ${query}`);
    console.log(`[GeminiService] Query: ${query}`);

    // Default config if not provided
    const model = (config?.model) || DEFAULT_MODEL;
    const systemInstruction = config?.systemInstruction || DEFAULT_SYSTEM_INSTRUCTION;

    console.log(`[GeminiService] Using model: ${model}`);

    const response: GenerateContentResponse = await ai.models.generateContent({
        model: model,
        contents: query,
        config: {
            systemInstruction: systemInstruction,
            tools: [
                {
                    fileSearch: {
                        fileSearchStoreNames: [ragStoreName]
                    }
                }
            ]
        }
    });
    console.log('[GeminiService] File search completed');

    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    return {
        text: response.text,
        groundingChunks: groundingChunks,
    };
}

export async function updateUsageStats(ragStoreName: string): Promise<void> {
    try {
        await fetch(`/api/spaces/${ragStoreName}/stats/increment`, { method: 'POST' });
    } catch (e) {
        console.error('[GeminiService] Failed to update usage stats', e);
    }
}

export async function generateExampleQuestions(ragStoreName: string): Promise<string[]> {
    checkInitialized();
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: "Review the documents in this store. Generate 4 short, practical, and diverse example questions a user might ask about the content. Return as a JSON array of strings: [\"question1\", \"question2\", ...]",
            config: {
                tools: [
                    {
                        fileSearch: {
                            fileSearchStoreNames: [ragStoreName],
                        }
                    }
                ]
            }
        });

        let jsonText = response.text.trim();
        const jsonMatch = jsonText.match(/```json\n([\s\S]*?)\n```/) || jsonText.match(/\[([\s\S]*?)\]/);

        if (jsonMatch) {
            jsonText = jsonMatch[0].replace(/```json|```/g, '');
        }

        const parsedData = JSON.parse(jsonText);
        return Array.isArray(parsedData) ? parsedData.slice(0, 4) : [];
    } catch (error) {
        console.error("Failed to generate example questions:", error);
        return ["What is the main purpose of this document?", "How do I troubleshoot common issues?", "What are the safety requirements?", "Can you summarize the key features?"];
    }
}

export async function deleteRagStore(ragStoreName: string): Promise<void> {
    checkInitialized();
    await ai.fileSearchStores.delete({
        name: ragStoreName,
        config: { force: true },
    });
}

export async function deleteDocument(ragStoreName: string, documentName: string): Promise<void> {
    checkInitialized();
    await ai.fileSearchStores.documents.delete({
        name: documentName
    });
}
