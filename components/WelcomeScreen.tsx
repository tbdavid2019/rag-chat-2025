
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useRef } from 'react';
import { RagStore } from '../types';
import Spinner from './Spinner';
import PlusIcon from './icons/PlusIcon';
import TrashIcon from './icons/TrashIcon';

interface WelcomeScreenProps {
    stores: RagStore[];
    onSelectStore: (store: RagStore) => void;
    onDeleteStore: (name: string) => void;
    onCreateStore: (name: string) => void;
    isApiKeySelected: boolean;
    onSelectKey: (key: string) => void;
    isLoading: boolean;
    apiKeyError?: string | null;
    onDisconnect: () => void;
}

const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
    stores, onSelectStore, onDeleteStore, onCreateStore, isApiKeySelected, onSelectKey, isLoading, apiKeyError, onDisconnect
}) => {
    const [newSpaceName, setNewSpaceName] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [apiKeyInput, setApiKeyInput] = useState('');

    const handleCreate = (e: React.FormEvent) => {
        e.preventDefault();
        if (newSpaceName.trim()) {
            onCreateStore(newSpaceName.trim());
            setNewSpaceName('');
            setIsCreating(false);
        }
    };

    const handleApiKeySubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (apiKeyInput.trim()) {
            onSelectKey(apiKeyInput.trim());
        }
    };

    return (
        <div className="max-w-6xl mx-auto p-6 lg:p-12 h-full flex flex-col">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-12 gap-4">
                <div>
                    <h1 className="text-4xl font-bold tracking-tight">Knowledge Space Manager</h1>
                    <p className="text-gem-offwhite/60 mt-2">Manage your RAG documents and persistent chat sessions.</p>
                </div>

                <div className="flex flex-col items-end w-full md:w-auto">
                    {!isApiKeySelected ? (
                        <form onSubmit={handleApiKeySubmit} className="flex gap-2 w-full md:w-auto">
                            <input
                                type="password"
                                placeholder="Paste Gemini API Key here"
                                value={apiKeyInput}
                                onChange={(e) => setApiKeyInput(e.target.value)}
                                className={`px-4 py-2 border rounded-lg focus:ring-2 focus:ring-gem-blue outline-none w-full md:w-64 transition-colors ${apiKeyError ? 'border-red-500 bg-red-50' : 'border-gem-mist'
                                    }`}
                            />
                            <button
                                type="submit"
                                disabled={!apiKeyInput.trim()}
                                className="px-6 py-2 bg-gem-blue hover:bg-blue-600 disabled:bg-gem-mist text-white font-bold rounded-lg transition-colors whitespace-nowrap"
                            >
                                Connect
                            </button>
                        </form>
                    ) : (
                        <div className="flex items-center gap-3">
                            <div className="flex items-center space-x-2 text-gem-teal font-medium bg-gem-teal/10 px-4 py-2 rounded-full">
                                <span className="w-2 h-2 bg-gem-teal rounded-full animate-pulse"></span>
                                <span>API Connected</span>
                            </div>
                            <button
                                onClick={onDisconnect}
                                className="px-3 py-2 text-sm text-gem-offwhite/60 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors border border-transparent hover:border-red-400/30"
                                title="Disconnect / Reset API Key"
                            >
                                Disconnect
                            </button>
                        </div>
                    )}

                    {apiKeyError && !isApiKeySelected && (
                        <div className="mt-4 text-xs text-red-600 font-medium w-full md:w-96 bg-red-50 p-4 rounded-lg border border-red-200 shadow-sm animate-in fade-in slide-in-from-top-2">
                            <div className="flex items-center mb-2 text-red-700 font-bold uppercase tracking-wider text-[10px]">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                                Connection Error
                            </div>
                            <div className="whitespace-pre-wrap leading-relaxed">{apiKeyError}</div>
                        </div>
                    )}
                </div>
            </header>

            <div className="flex-grow grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 overflow-y-auto pb-8">
                {/* Create New Space Card */}
                {isCreating ? (
                    <div className="bg-white border-2 border-gem-blue rounded-xl p-6 shadow-sm flex flex-col">
                        <h3 className="text-lg font-bold mb-4">New Knowledge Space</h3>
                        <form onSubmit={handleCreate} className="space-y-4">
                            <input
                                autoFocus
                                type="text"
                                placeholder="Space Name (e.g., Q1 Reports)"
                                className="w-full px-4 py-2 border border-gem-mist rounded-lg focus:ring-2 focus:ring-gem-blue outline-none"
                                value={newSpaceName}
                                onChange={(e) => setNewSpaceName(e.target.value)}
                            />
                            <div className="flex space-x-2">
                                <button type="submit" className="flex-grow bg-gem-blue text-white py-2 rounded-lg font-bold">Create</button>
                                <button type="button" onClick={() => setIsCreating(false)} className="px-4 py-2 text-gem-offwhite/60">Cancel</button>
                            </div>
                        </form>
                    </div>
                ) : (
                    <button
                        disabled={!isApiKeySelected}
                        onClick={() => setIsCreating(true)}
                        className="bg-gem-blue/5 border-2 border-dashed border-gem-blue/30 rounded-xl p-8 flex flex-col items-center justify-center group hover:bg-gem-blue/10 hover:border-gem-blue transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <div className="w-12 h-12 bg-gem-blue text-white rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                            <PlusIcon />
                        </div>
                        <span className="font-bold text-gem-blue">Create Knowledge Space</span>
                        <p className="text-xs text-gem-blue/60 mt-2">Create a new RAG store for your files</p>
                    </button>
                )}

                {/* Existing Spaces */}
                {isLoading ? (
                    <div className="col-span-full flex justify-center p-12"><Spinner /></div>
                ) : (
                    stores.map(store => {
                        // 移除用戶前綴以顯示友好的名稱
                        const displayName = store.displayName.includes('_')
                            ? store.displayName.split('_').slice(1).join('_')
                            : store.displayName;
                        const shortName = store.name.split('/').pop() || store.name;
                        const friendlyShortName = shortName.includes('_')
                            ? shortName.split('_').slice(1).join('_')
                            : shortName;

                        return (
                            <div key={store.name} className="bg-white border border-gem-mist rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow group relative">
                                <div className="flex items-start justify-between mb-4">
                                    <div className="w-10 h-10 bg-gem-mist/50 rounded-lg flex items-center justify-center">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gem-offwhite/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                                        </svg>
                                    </div>
                                    <button
                                        onClick={() => onDeleteStore(store.name)}
                                        className="text-red-400 hover:text-red-600 p-2 opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <TrashIcon />
                                    </button>
                                </div>
                                <h3 className="font-bold text-xl mb-1 truncate" title={displayName}>{displayName}</h3>
                                <p className="text-sm text-gem-offwhite/40 mb-6 font-mono text-xs">{friendlyShortName}</p>
                                <button
                                    onClick={() => onSelectStore(store)}
                                    className="w-full py-2 bg-gem-mist/50 hover:bg-gem-blue hover:text-white rounded-lg font-bold transition-all"
                                >
                                    Enter Space
                                </button>
                            </div>
                        );
                    })
                )}
            </div>

            {stores.length === 0 && !isLoading && !isCreating && (
                <div className="flex flex-col items-center justify-center py-24 opacity-40">
                    <p className="text-lg">No Knowledge Spaces found.</p>
                    {isApiKeySelected ? (
                        <p className="text-sm">Get started by creating your first space.</p>
                    ) : (
                        <p className="text-sm text-red-400">Please connect your API Key first.</p>
                    )}
                </div>
            )}
        </div>
    );
};

export default WelcomeScreen;
