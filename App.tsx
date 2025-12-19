
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useEffect, useCallback } from 'react';
import { AppStatus, ChatMessage, RagStore, Document } from './types';
import * as geminiService from './services/geminiService';
import Spinner from './components/Spinner';
import WelcomeScreen from './components/WelcomeScreen';
import ProgressBar from './components/ProgressBar';
import ChatInterface from './components/ChatInterface';
import DocumentList from './components/DocumentList';
import ApiInfo from './components/ApiInfo';
import LoginPage from './components/LoginPage';
import AdminPage from './components/AdminPage';

declare global {
    interface AIStudio {
        openSelectKey: () => Promise<void>;
        hasSelectedApiKey: () => Promise<boolean>;
    }
    interface Window {
        aistudio?: AIStudio;
    }
}

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
            // 刷新 stores
            setTimeout(() => refreshStores(), 100);
        } else {
            setStatus(AppStatus.Manager);
        }
    }, []);

    const handleLogout = useCallback(() => {
        console.log('[App] User logged out');
        localStorage.removeItem('auth_user');
        setCurrentUser(null);
        setUserRole('user');
        setIsAuthenticated(false);
        setShowAdminPanel(false);
        setStatus(AppStatus.Initializing);
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
        if (envKey && envKey !== 'your-api-key-here') {
            console.log('[App] Found API key in .env file');
            try {
                geminiService.setApiKey(envKey);
                setIsApiKeySelected(true);
                await refreshStores();
                console.log('[App] Auto-login successful from .env');
                return true;
            } catch (e) {
                console.warn("[App] .env API key failed", e);
            }
        }
        
        // Try to load API key from localStorage
        const savedKey = localStorage.getItem('gemini_api_key');
        if (savedKey) {
            console.log('[App] Found saved API key in localStorage');
            try {
                geminiService.setApiKey(savedKey);
                setIsApiKeySelected(true);
                await refreshStores();
                console.log('[App] Auto-login successful from localStorage');
                return true;
            } catch (e) {
                console.warn("[App] Saved API key failed", e);
                localStorage.removeItem('gemini_api_key');
            }
        }
        console.log('[App] No auto-login available');
        return false;
    }, []);

    // Centralized API Error Handler
    const handleApiError = (err: any, context: string) => {
        const msg = err instanceof Error ? err.message : JSON.stringify(err);
        console.error(`API Error [${context}]:`, err);

        // Check for 404 (Not Found - likely invalid project/key) or 403 (Permission Denied)
        if (msg.includes('404') || msg.includes('NOT_FOUND') || msg.includes('403') || msg.includes('PERMISSION_DENIED')) {
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

    const refreshStores = async () => {
        console.log('[App] Refreshing stores list...');
        setIsLoadingSpaces(true);
        setApiKeyError(null);
        try {
            const list = await geminiService.listRagStores();
            // 數據隔離：只顯示屬於當前用戶的 spaces
            const userStores = currentUser
                ? list.filter(store => store.name.startsWith(`${currentUser}_`))
                : list;
            setStores(userStores);
            console.log(`[App] Stores refreshed: ${userStores.length} stores found for user ${currentUser}`);
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
                    handleLogin(
                        authData.username, 
                        authData.role, 
                        authData.spaces || [],
                        authData.geminiApiKey || null
                    );
                    
                    // 如果沒有 API Key，嘗試自動登入
                    if (!authData.geminiApiKey) {
                        const autoLoggedIn = await attemptAutoLogin();
                        if (!autoLoggedIn) {
                            setStatus(AppStatus.Manager);
                        }
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
    }, [attemptAutoLogin, handleLogin]);

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
                    } else {
                        console.warn('[App] Failed to save API key to backend');
                    }
                } catch (err) {
                    console.error('[App] Error saving API key to backend:', err);
                }
            }
            
            setIsApiKeySelected(true);
            await refreshStores();
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
            await refreshStores();
            const newStore = { name: storeName, displayName: name };
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
        } catch (err) {
            console.error("[App] Failed to load store details", err);
            handleApiError(err, "Loading Space Details");
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
            const result = await geminiService.fileSearch(selectedStore.name, message);
            console.log('[App] Received response from Gemini');
            const modelMsg: ChatMessage = {
                role: 'model',
                parts: [{ text: result.text }],
                groundingChunks: result.groundingChunks
            };
            const updatedHistory = [...newHistory, modelMsg];
            setChatHistory(updatedHistory);
            saveHistory(selectedStore.name, updatedHistory);
        } catch (err) {
            console.error('[App] Failed to get response:', err);
            const errorMsg: ChatMessage = {
                role: 'model',
                parts: [{ text: "Error fetching response. Please check your connection or API key." }]
            };
            setChatHistory(prev => [...prev, errorMsg]);
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
        // 如果顯示管理員面板
        if (showAdminPanel && userRole === 'admin') {
            return <AdminPage currentUsername={currentUser!} onBack={() => setShowAdminPanel(false)} />;
        }
        
        // 如果未登入，顯示登入頁面
        if (!isAuthenticated) {
            return <LoginPage onLogin={handleLogin} />;
        }
        
        switch (status) {
            case AppStatus.Initializing:
                return <div className="flex flex-col items-center justify-center h-screen"><Spinner /><p className="mt-4">Loading Knowledge Manager...</p></div>;
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
                                <button onClick={async () => { await refreshStores(); setStatus(AppStatus.Manager); }} className="mb-4 text-sm font-semibold text-gem-blue hover:underline">← Back to Manager</button>
                                
                                {selectedStore && (
                                    <ApiInfo 
                                        spaceName={selectedStore.name}
                                        displayName={selectedStore.displayName}
                                        username={currentUser || undefined}
                                    />
                                )}
                                <DocumentList 
                                    selectedStore={selectedStore}
                                    documents={documents}
                                    isLoading={false}
                                    processingFile={null}
                                    onUpload={handleUploadFiles}
                                    onDelete={async (docName) => {
                                        await geminiService.deleteDocument(selectedStore!.name, docName);
                                        const docs = await geminiService.listDocuments(selectedStore!.name);
                                        setDocuments(docs);
                                    }}
                                />
                                <div className="mt-auto pt-4 border-t border-gem-mist">
                                    <button 
                                        onClick={() => { if(confirm("Clear chat history?")) { setChatHistory([]); saveHistory(selectedStore!.name, []); }}}
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
                                onNewChat={async () => { await refreshStores(); setStatus(AppStatus.Manager); }}
                                exampleQuestions={exampleQuestions}
                            />
                        </div>
                    </div>
                );
            case AppStatus.Error:
                return <div className="flex flex-col items-center justify-center h-screen p-8 text-center"><h1 className="text-2xl font-bold text-red-600 mb-4">Error</h1><p>{error}</p><button onClick={() => setStatus(AppStatus.Manager)} className="mt-4 px-4 py-2 bg-gem-blue text-white rounded">Reset</button></div>;
            default:
                return <div className="flex items-center justify-center h-screen"><Spinner /></div>;
        }
    };

    return <main className="h-screen bg-gem-onyx text-gem-offwhite">{renderContent()}</main>;
};

export default App;
