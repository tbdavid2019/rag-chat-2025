
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useEffect, useCallback } from 'react';
import { AppStatus, ChatMessage, RagStore, Document, SpaceConfig } from './types';
import * as geminiService from './services/geminiService';
import Spinner from './components/Spinner';
import WelcomeScreen from './components/WelcomeScreen';
import ProgressBar from './components/ProgressBar';
import ChatInterface from './components/ChatInterface';
import DocumentList from './components/DocumentList';
import ApiInfo from './components/ApiInfo';
import LoginPage from './components/LoginPage';
import AdminPage from './components/AdminPage';
import SpaceSettingsModal from './components/SpaceSettingsModal';

declare global {
    interface AIStudio {
        openSelectKey: () => Promise<void>;
        hasSelectedApiKey: () => Promise<boolean>;
    }
    interface Window {
        aistudio?: AIStudio;
    }
}

// 驗證 Gemini API Key 格式
const isValidApiKeyFormat = (key: string | null | undefined): boolean => {
    if (!key || typeof key !== 'string') return false;
    const trimmed = key.trim();
    // 檢查是否為預設值或空字符串
    if (trimmed === '' || trimmed === 'your-api-key-here') return false;
    // Gemini API keys 通常以 'AI' 開頭，長度約 39 字符
    // 這是一個基本檢查，不保證 key 有效，但可以過濾明顯無效的值
    if (trimmed.length < 20) return false;
    return true;
};

const App: React.FC = () => {
    const [status, setStatus] = useState<AppStatus>(AppStatus.Initializing);
    const [isApiKeySelected, setIsApiKeySelected] = useState(false);
    const [apiKeyError, setApiKeyError] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // 用戶認證狀態
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [currentUser, setCurrentUser] = useState<string | null>(null);
    const [userRole, setUserRole] = useState<string>('user');
    const [showAdminPanel, setShowAdminPanel] = useState(false);

    const [stores, setStores] = useState<RagStore[]>([]);
    const [selectedStore, setSelectedStore] = useState<RagStore | null>(null);
    const [documents, setDocuments] = useState<Document[]>([]);

    const [uploadProgress, setUploadProgress] = useState<{ current: number, total: number, message?: string, fileName?: string } | null>(null);
    const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
    const [isQueryLoading, setIsQueryLoading] = useState(false);
    const [exampleQuestions, setExampleQuestions] = useState<string[]>([]);
    const [isLoadingSpaces, setIsLoadingSpaces] = useState(false);

    // Space Settings State
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
    const [currentSpaceConfig, setCurrentSpaceConfig] = useState<SpaceConfig>({});

    const loadHistory = (storeName: string) => {
        const saved = localStorage.getItem(`rag_history_${storeName}`);
        if (saved) {
            try {
                setChatHistory(JSON.parse(saved));
            } catch (e) {
                console.error("Failed to parse history", e);
                setChatHistory([]);
            }
        } else {
            setChatHistory([]);
        }
    };

    const saveHistory = (storeName: string, history: ChatMessage[]) => {
        localStorage.setItem(`rag_history_${storeName}`, JSON.stringify(history));
    };

    const handleLogin = useCallback((username: string, role: string, spaces: string[], geminiApiKey?: string | null) => {
        console.log(`[App] User logged in: ${username} (${role})`);
        setCurrentUser(username);
        setUserRole(role);
        setIsAuthenticated(true);

        // 如果用戶有儲存的 Gemini API Key，自動設定
        if (geminiApiKey) {
            console.log('[App] Loading user\'s Gemini API Key from backend');
            geminiService.setApiKey(geminiApiKey);
            localStorage.setItem('gemini_api_key', geminiApiKey);
            setIsApiKeySelected(true);
            setStatus(AppStatus.Manager);
            // 刷新 stores - 傳入 username 因為 state 還沒更新
            setTimeout(() => refreshStores(username), 100);
        } else {
            setStatus(AppStatus.Manager);
        }
    }, []);



    const attemptAutoLogin = useCallback(async () => {
        console.log('[App] Attempting auto-login...');
        // Try to detect AI Studio environment
        if (window.aistudio?.hasSelectedApiKey) {
            console.log('[App] Checking AI Studio environment...');
            try {
                const hasKey = await window.aistudio.hasSelectedApiKey();
                if (hasKey) {
                    console.log('[App] AI Studio API key found');
                    setIsApiKeySelected(true);
                    geminiService.initialize();
                    await refreshStores();
                    return true;
                }
            } catch (e) {
                console.warn("[App] Auto-login check failed", e);
            }
        }

        // Try to load API key from .env file
        const envKey = process.env.GEMINI_API_KEY;
        if (isValidApiKeyFormat(envKey)) {
            console.log('[App] Found valid API key in .env file');
            try {
                geminiService.setApiKey(envKey!);
                setIsApiKeySelected(true);
                await refreshStores();
                console.log('[App] Auto-login successful from .env');
                return true;
            } catch (e) {
                console.warn("[App] .env API key failed validation", e);
                setIsApiKeySelected(false);
            }
        }

        // Try to load API key from localStorage
        const savedKey = localStorage.getItem('gemini_api_key');
        if (isValidApiKeyFormat(savedKey)) {
            console.log('[App] Found valid saved API key in localStorage');
            try {
                geminiService.setApiKey(savedKey!);
                setIsApiKeySelected(true);
                await refreshStores();
                console.log('[App] Auto-login successful from localStorage');
                return true;
            } catch (e) {
                console.warn("[App] Saved API key failed validation", e);
                localStorage.removeItem('gemini_api_key');
                setIsApiKeySelected(false);
            }
        }

        console.log('[App] No valid auto-login available');
        setIsApiKeySelected(false);
        return false;
    }, []);

    // Centralized API Error Handler
    const handleApiError = (err: any, context: string) => {
        const msg = err instanceof Error ? err.message : JSON.stringify(err);
        console.error(`API Error [${context}]:`, err);

        // Check for 404 (Not Found - likely invalid project/key), 403 (Permission Denied), or 400 (Invalid Key)
        if (msg.includes('404') || msg.includes('NOT_FOUND') || msg.includes('403') || msg.includes('PERMISSION_DENIED') ||
            msg.includes('400') || msg.includes('INVALID_ARGUMENT') || msg.includes('API key not valid')) {
            setIsApiKeySelected(false);

            // Clean up message for display
            const shortMsg = msg.length > 150 ? msg.substring(0, 150) + '...' : msg;

            setApiKeyError(
                `Connection failed. If you just updated the key, please wait 5 minutes.\n\n` +
                `Troubleshooting:\n` +
                `1. Ensure "Generative Language API" is ENABLED in your Project Library (not just the key).\n` +
                `2. Verify Key Restrictions allow "Generative Language API".\n\n` +
                `Error: ${shortMsg}`
            );
            setStatus(AppStatus.Manager);
        } else {
            // For other errors, we might want to show them but not necessarily disconnect
            // Unless it's critical. For now, let's just log and show a general error if it's a blocking action
            handleError(`Operation failed: ${context}`, err);
        }
    };

    const handleLogout = () => {
        setIsAuthenticated(false);
        setCurrentUser(null);
        setUserRole('user');
        localStorage.removeItem('auth_user');
        localStorage.removeItem('gemini_api_key');
        setApiKeyError(null);
        setIsApiKeySelected(false);
        setStores([]);
        setSelectedStore(null);
        setChatHistory([]);
        geminiService.clearApiKey(); // Clear backend service state
        console.log('[App] User logged out and service state cleared');
        setStatus(AppStatus.Welcome); // Redirect to login page
    };

    const refreshStores = async (usernameOverride?: string) => {
        // 使用傳入的 username 或當前的 currentUser
        const effectiveUsername = usernameOverride || currentUser;
        console.log('[App] Refreshing stores list for user:', effectiveUsername);

        // 如果沒有選中 API Key，不應該嘗試獲取 store
        if (!isApiKeySelected && !localStorage.getItem('gemini_api_key')) {
            console.log('[App] No API key selected, clearing stores.');
            setStores([]);
            return;
        }

        setIsLoadingSpaces(true);
        setApiKeyError(null);
        try {
            // 1. 從 Gemini File Search API 獲取真實的 spaces 列表（這是真相來源）
            const list = await geminiService.listRagStores();
            console.log('[App] Total spaces from Gemini File Search API:', list.length);
            console.log('[App] Gemini spaces:', list.map(s => s.name));

            // 2. 從後端獲取當前用戶的 API keys 和 displayName 映射
            const displayNameMap: Record<string, string> = {};
            let existingApiKeys: Record<string, any> = {};

            try {
                const response = await fetch('/api/spaces/list-with-keys', {
                    headers: effectiveUsername ? { 'x-username': effectiveUsername } : {}
                });
                if (response.ok) {
                    const apiKeysData = await response.json();
                    console.log('[App] Existing API Keys for current user:', Object.keys(apiKeysData.apiKeys || {}).length);
                    existingApiKeys = apiKeysData.apiKeys || {};

                    // 建立 displayName 映射
                    Object.values(existingApiKeys).forEach((keyData: any) => {
                        if (keyData.spaceName && keyData.displayName) {
                            displayNameMap[keyData.spaceName] = keyData.displayName;
                        }
                    });
                }
            } catch (e) {
                console.warn('[App] Failed to fetch API keys:', e);
            }

            // 3. 同步本地 JSON：以 Gemini API 為準
            if (effectiveUsername) {
                try {
                    const geminiSpaceNames = new Set(list.map(s => s.name));

                    // 同步到後端：更新 users.json 和清理 api-keys.json
                    await fetch('/api/spaces/sync', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'x-username': effectiveUsername
                        },
                        body: JSON.stringify({
                            username: effectiveUsername,
                            geminiSpaces: Array.from(geminiSpaceNames)
                        })
                    });
                    console.log('[App] Local JSON synced with Gemini API');
                } catch (e) {
                    console.warn('[App] Failed to sync local JSON:', e);
                }
            }

            // 4. 用後端的 displayName 覆蓋 Gemini 返回的
            list.forEach(store => {
                if (displayNameMap[store.name]) {
                    store.displayName = displayNameMap[store.name];
                }
            });

            // 5. 顯示所有 Gemini 返回的 spaces（已經是當前 API Key 的 spaces）
            setStores(list);
            console.log(`[App] Stores refreshed: ${list.length} spaces found for user ${effectiveUsername}`);
            setStatus(AppStatus.Manager);
        } catch (err) {
            console.error('[App] Failed to refresh stores:', err);
            handleApiError(err, "Fetching Spaces");
        } finally {
            setIsLoadingSpaces(false);
        }
    };

    useEffect(() => {
        const init = async () => {
            await new Promise(r => setTimeout(r, 500));

            // 檢查是否有已登入的用戶
            const savedAuth = localStorage.getItem('auth_user');
            if (savedAuth) {
                try {
                    const authData = JSON.parse(savedAuth);
                    console.log('[App] Found saved auth:', authData);

                    // 先登入用戶狀態
                    handleLogin(
                        authData.username,
                        authData.role,
                        authData.spaces || [],
                        authData.geminiApiKey || null
                    );

                    // 如果用戶有保存的 API Key (在 gemini_key 而不是 auth_user 中)
                    const savedGeminiKey = localStorage.getItem('gemini_api_key');
                    if (savedGeminiKey && isValidApiKeyFormat(savedGeminiKey)) {
                        geminiService.setApiKey(savedGeminiKey);
                        setIsApiKeySelected(true);
                    } else if (authData.geminiApiKey && isValidApiKeyFormat(authData.geminiApiKey)) {
                        // Fallback to auth data key if valid
                        geminiService.setApiKey(authData.geminiApiKey);
                        setIsApiKeySelected(true);
                    } else {
                        // No valid key found
                        setIsApiKeySelected(false);
                        console.log('[App] No valid API key found for auto-login');
                    }

                    return;
                } catch (e) {
                    console.warn('[App] Invalid saved auth', e);
                    localStorage.removeItem('auth_user');
                }
            }

            // 沒有登入，顯示登入頁面
            setStatus(AppStatus.Welcome);
        };
        init();
    }, [handleLogin]);

    const handleError = (message: string, err: any) => {
        console.error(message, err);
        setError(`${message}${err ? `: ${err instanceof Error ? err.message : String(err)}` : ''}`);
        setStatus(AppStatus.Error);
    };

    const handleManualApiKey = async (key: string) => {
        if (!key.trim()) return;
        console.log('[App] Manual API key submitted');
        setApiKeyError(null);
        try {
            const trimmedKey = key.trim();
            geminiService.setApiKey(trimmedKey);
            localStorage.setItem('gemini_api_key', trimmedKey);
            console.log('[App] API key saved to localStorage');

            // 傳送到後端持久化
            if (currentUser) {
                try {
                    const response = await fetch(`/api/users/${currentUser}/gemini-key`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                            'x-username': currentUser
                        },
                        body: JSON.stringify({ geminiApiKey: trimmedKey })
                    });

                    if (response.ok) {
                        console.log('[App] Gemini API key saved to backend');
                    } else if (response.status === 409) {
                        // API Key 已被其他用戶使用
                        const data = await response.json();
                        throw new Error(data.message || '此 API Key 已被其他用戶使用');
                    } else {
                        console.warn('[App] Failed to save API key to backend');
                        const data = await response.json().catch(() => ({}));
                        throw new Error(data.error || 'Failed to save API key');
                    }
                } catch (err) {
                    console.error('[App] Error saving API key to backend:', err);
                    // 清除已設定的 API key
                    geminiService.clearApiKey();
                    localStorage.removeItem('gemini_api_key');
                    setIsApiKeySelected(false);
                    setApiKeyError(err instanceof Error ? err.message : '保存 API Key 失敗');
                    return;
                }
            }

            setIsApiKeySelected(true);
            await refreshStores(currentUser || undefined);
        } catch (err) {
            console.error('[App] Manual API key initialization failed:', err);
            handleApiError(err, "Initialization");
            setIsApiKeySelected(false);
        }
    };

    const handleCreateSpace = async (name: string) => {
        console.log(`[App] Creating new space: ${name}`);
        try {
            setStatus(AppStatus.Uploading);
            setUploadProgress({ current: 0, total: 1, message: "Creating Knowledge Space..." });
            // 添加用戶前綴以實現數據隔離
            const prefixedName = currentUser ? `${currentUser}_${name}` : name;
            console.log(`[App] Creating space with prefix: ${prefixedName}`);
            const storeName = await geminiService.createRagStore(prefixedName);
            console.log(`[App] Space created: ${storeName}`);

            // 自動生成 API key 並更新用戶的 spaces 列表
            try {
                const geminiKey = localStorage.getItem('gemini_api_key');
                if (geminiKey && currentUser) {
                    console.log(`[App] Auto-generating API key for new space: ${storeName}`);
                    const response = await fetch(`/api/spaces/${encodeURIComponent(storeName)}/generate-key`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'x-username': currentUser
                        },
                        body: JSON.stringify({
                            displayName: prefixedName,
                            geminiKey
                        })
                    });

                    if (response.ok) {
                        const data = await response.json();
                        console.log(`[App] API key generated for new space: ${data.apiKey}`);
                        localStorage.setItem(`api_key_${storeName}`, data.apiKey);
                    } else {
                        console.warn('[App] Failed to auto-generate API key for new space');
                    }
                }
            } catch (err) {
                console.warn('[App] Error during auto API key generation:', err);
            }

            await refreshStores();
            const newStore = { name: storeName, displayName: prefixedName };
            handleSelectStore(newStore);
        } catch (err) {
            console.error('[App] Failed to create space:', err);
            handleApiError(err, "Creating Space");
            // If it was a critical API error, handleApiError will switch status to Manager and disconnect
            // If it was a generic error, we might be stuck in Uploading state, so reset to Manager
            if (isApiKeySelected) {
                setStatus(AppStatus.Manager);
            }
        } finally {
            setUploadProgress(null);
        }
    };

    const disconnectApiKey = async () => {
        console.log('[App] Disconnecting API key...');
        localStorage.removeItem('gemini_api_key');

        // 如果是登入用戶，也要清除後端的 key
        if (currentUser) {
            try {
                // 發送空值或特殊值來清除 key
                await fetch(`/api/users/${currentUser}/gemini-key`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-username': currentUser
                    },
                    body: JSON.stringify({ geminiApiKey: null })
                });
                console.log('[App] Backend API key cleared');
            } catch (e) {
                console.warn('[App] Failed to clear backend API key', e);
            }
        }

        setIsApiKeySelected(false);
        setApiKeyError(null);
        setStatus(AppStatus.Manager);
    };

    const handleSelectStore = async (store: RagStore) => {
        console.log(`[App] Selecting store: ${store.displayName} (${store.name})`);
        setSelectedStore(store);
        loadHistory(store.name);
        setStatus(AppStatus.Chatting);
        try {
            const docs = await geminiService.listDocuments(store.name);
            setDocuments(docs);
            console.log(`[App] Loaded ${docs.length} documents`);
            const questions = await geminiService.generateExampleQuestions(store.name);
            setExampleQuestions(questions);
            console.log('[App] Generated example questions:', questions);

            // Fetch Space Config
            try {
                const configRes = await fetch(`/api/spaces/${encodeURIComponent(store.name)}/config`);
                if (configRes.ok) {
                    const config = await configRes.json();
                    setCurrentSpaceConfig(config);
                } else {
                    setCurrentSpaceConfig({});
                }
            } catch (e) {
                console.warn('[App] Failed to fetch space config', e);
                setCurrentSpaceConfig({});
            }
        } catch (err) {
            console.error("[App] Failed to load store details", err);
            handleApiError(err, "Loading Space Details");
        }
    };

    const handleSaveSpaceConfig = async (newConfig: SpaceConfig) => {
        if (!selectedStore) return;
        try {
            await fetch(`/api/spaces/${encodeURIComponent(selectedStore.name)}/config`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newConfig)
            });
            setCurrentSpaceConfig(prev => ({ ...prev, ...newConfig }));
            console.log('[App] Space config saved');
        } catch (e) {
            console.error('[App] Failed to save space config', e);
            throw e;
        }
    };

    const handleUploadFiles = async (files: File[]) => {
        if (!selectedStore) return;
        setStatus(AppStatus.Uploading);
        const total = files.length;
        try {
            for (let i = 0; i < files.length; i++) {
                setUploadProgress({
                    current: i + 1,
                    total,
                    message: "Uploading and indexing...",
                    fileName: files[i].name
                });
                await geminiService.uploadToRagStore(selectedStore.name, files[i]);
            }
            const docs = await geminiService.listDocuments(selectedStore.name);
            setDocuments(docs);
            setStatus(AppStatus.Chatting);
        } catch (err) {
            handleError("Upload failed", err);
        } finally {
            setUploadProgress(null);
        }
    };

    const handleSendMessage = async (message: string) => {
        if (!selectedStore) return;
        console.log(`[App] Sending message: ${message}`);
        const userMsg: ChatMessage = { role: 'user', parts: [{ text: message }] };
        const newHistory = [...chatHistory, userMsg];
        setChatHistory(newHistory);
        saveHistory(selectedStore.name, newHistory);
        setIsQueryLoading(true);

        try {
            console.log('[App] Calling fileSearch...');
            const result = await geminiService.fileSearch(selectedStore.name, message, currentSpaceConfig);
            console.log('[App] fileSearch result:', result);

            if (!result || !result.text) {
                console.error('[App] Empty or invalid result:', result);
                throw new Error('收到空的回應');
            }

            const assistantMsg: ChatMessage = {
                role: 'model',
                parts: [{ text: result.text }],
                groundingChunks: result.groundingChunks
            };
            const finalHistory = [...newHistory, assistantMsg];
            setChatHistory(finalHistory);
            saveHistory(selectedStore.name, finalHistory);

            console.log('[App] Message added to history');

            // Update usage stats
            await geminiService.updateUsageStats(selectedStore.name);
        } catch (err) {
            console.error('[App] Query failed:', err);
            // 添加錯誤訊息到聊天記錄
            const errorMsg: ChatMessage = {
                role: 'model',
                parts: [{ text: `抱歉，查詢時發生錯誤：${err instanceof Error ? err.message : String(err)}` }]
            };
            const errorHistory = [...newHistory, errorMsg];
            setChatHistory(errorHistory);
            saveHistory(selectedStore.name, errorHistory);
        } finally {
            setIsQueryLoading(false);
        }
    };

    const handleDeleteStore = async (name: string) => {
        if (!confirm("Are you sure you want to delete this space and all its documents?")) return;
        try {
            await geminiService.deleteRagStore(name);
            localStorage.removeItem(`rag_history_${name}`);
            refreshStores();
        } catch (err) {
            handleApiError(err, "Deleting Space");
        }
    };

    const renderContent = () => {
        if (status === AppStatus.Initializing) {
            return <div className="flex flex-col items-center justify-center h-screen"><Spinner /><p className="mt-4">Loading Knowledge Manager...</p></div>;
        }

        // 如果顯示管理員面板
        if (showAdminPanel && userRole === 'admin') {
            return <AdminPage currentUsername={currentUser!} onBack={() => setShowAdminPanel(false)} />;
        }

        // 如果未登入，顯示登入頁面
        if (!isAuthenticated) {
            return <LoginPage onLogin={handleLogin} />;
        }

        switch (status) {
            case AppStatus.Manager:
                return (
                    <div>
                        <div className="flex justify-end p-4 bg-white border-b">
                            <div className="flex items-center gap-4">
                                <span className="text-sm text-gray-600">
                                    歡迎, <strong>{currentUser}</strong> ({userRole === 'admin' ? '管理員' : '用戶'})
                                </span>
                                {userRole === 'admin' && (
                                    <button
                                        onClick={() => setShowAdminPanel(true)}
                                        className="px-3 py-1 text-sm bg-purple-600 text-white rounded hover:bg-purple-700"
                                    >
                                        用戶管理
                                    </button>
                                )}
                                <button
                                    onClick={handleLogout}
                                    className="px-3 py-1 text-sm bg-gray-600 text-white rounded hover:bg-gray-700"
                                >
                                    登出
                                </button>
                            </div>
                        </div>
                        <WelcomeScreen
                            stores={stores}
                            onSelectStore={handleSelectStore}
                            onDeleteStore={handleDeleteStore}
                            onCreateStore={handleCreateSpace}
                            isApiKeySelected={isApiKeySelected}
                            onSelectKey={handleManualApiKey}
                            isLoading={isLoadingSpaces}
                            apiKeyError={apiKeyError}
                            onDisconnect={disconnectApiKey}
                        />
                    </div>
                );
            case AppStatus.Uploading:
                return <ProgressBar
                    progress={uploadProgress?.current || 0}
                    total={uploadProgress?.total || 1}
                    message={uploadProgress?.message || "Working..."}
                    fileName={uploadProgress?.fileName}
                />;
            case AppStatus.Chatting:
                return (
                    <div className="flex h-full">
                        <div className="w-80 border-r border-gem-mist bg-gem-slate overflow-y-auto hidden md:block">
                            <div className="p-4 flex flex-col h-full">
                                <button
                                    onClick={async () => {
                                        setIsLoadingSpaces(true);
                                        try {
                                            await refreshStores();
                                        } finally {
                                            setIsLoadingSpaces(false);
                                            setStatus(AppStatus.Manager);
                                        }
                                    }}
                                    className="mb-4 text-sm font-semibold text-gem-blue hover:underline"
                                >
                                    ← Back to Manager
                                </button>

                                {selectedStore && (
                                    <>
                                        <div className="mb-4">
                                            <ApiInfo
                                                spaceName={selectedStore.name}
                                                displayName={selectedStore.displayName}
                                                username={currentUser || undefined}
                                            />
                                        </div>
                                        <button
                                            onClick={() => setIsSettingsModalOpen(true)}
                                            className="w-full mb-4 px-3 py-2 bg-gem-onyx border border-gem-mist text-gem-blue rounded hover:bg-gem-mist/20 text-sm flex items-center justify-center gap-2"
                                        >
                                            <span>⚙️</span> Space Settings
                                        </button>
                                    </>
                                )}
                                <DocumentList
                                    selectedStore={selectedStore}
                                    documents={documents}
                                    isLoading={false}
                                    processingFile={null}
                                    onUpload={handleUploadFiles}
                                    onDelete={async (docName) => {
                                        try {
                                            await geminiService.deleteDocument(selectedStore!.name, docName);
                                            const docs = await geminiService.listDocuments(selectedStore!.name);
                                            setDocuments(docs);
                                        } catch (e) {
                                            const errorMsg = e instanceof Error ? e.message : String(e);
                                            console.error("Delete failed", e);
                                            alert(`Failed to delete document: ${errorMsg}`);
                                        }
                                    }}
                                />
                                <div className="mt-auto pt-4 border-t border-gem-mist">
                                    <button
                                        onClick={() => { if (confirm("Clear chat history?")) { setChatHistory([]); saveHistory(selectedStore!.name, []); } }}
                                        className="w-full py-2 text-xs text-red-500 hover:bg-red-50 rounded"
                                    >
                                        Clear History
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div className="flex-grow">
                            <ChatInterface
                                documentName={selectedStore?.displayName || ''}
                                history={chatHistory}
                                isQueryLoading={isQueryLoading}
                                onSendMessage={handleSendMessage}
                                onNewChat={() => {
                                    setChatHistory([]);
                                    if (selectedStore) {
                                        saveHistory(selectedStore.name, []);
                                    }
                                }}
                                exampleQuestions={exampleQuestions}
                            />
                        </div>
                    </div>
                );
            case AppStatus.Error:
                return (
                    <div className="flex flex-col items-center justify-center h-screen p-8 text-center">
                        <h1 className="text-2xl font-bold text-red-600 mb-4">Error</h1>
                        <p>{error}</p>
                        <div className="flex gap-4 mt-4">
                            <button onClick={() => setStatus(AppStatus.Manager)} className="px-4 py-2 bg-gem-blue text-white rounded">Retry</button>
                            <button onClick={disconnectApiKey} className="px-4 py-2 bg-gray-600 text-white rounded">Reset API Key</button>
                        </div>
                    </div>
                );
            default:
                return <div className="flex items-center justify-center h-screen"><Spinner /></div>;
        }
    };

    return (
        <main className="h-screen bg-gem-onyx text-gem-offwhite">
            {renderContent()}
            {selectedStore && (
                <SpaceSettingsModal
                    isOpen={isSettingsModalOpen}
                    onClose={() => setIsSettingsModalOpen(false)}
                    spaceName={selectedStore.name}
                    displayName={selectedStore.displayName}
                    initialConfig={currentSpaceConfig}
                    onSave={handleSaveSpaceConfig}
                />
            )}
        </main>
    );
};

export default App;
