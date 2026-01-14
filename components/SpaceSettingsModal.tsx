/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState, useEffect } from 'react';
import { SpaceConfig } from '../types';
import { DEFAULT_SYSTEM_INSTRUCTION } from '../services/geminiService';

interface SpaceSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    spaceName: string;
    displayName: string;
    initialConfig: SpaceConfig;
    onSave: (config: SpaceConfig) => Promise<void>;
}

const SUPPORTED_MODELS = [
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
    { value: 'gemini-3-pro-preview', label: 'Gemini 3 Pro (Preview)' }
];

const SpaceSettingsModal: React.FC<SpaceSettingsModalProps> = ({
    isOpen,
    onClose,
    spaceName,
    displayName,
    initialConfig,
    onSave
}) => {
    // If no custom instruction is set, use the default one for display
    const [model, setModel] = useState(initialConfig.model || 'gemini-2.5-flash');
    const [systemInstruction, setSystemInstruction] = useState(initialConfig.systemInstruction || DEFAULT_SYSTEM_INSTRUCTION);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setModel(initialConfig.model || 'gemini-2.5-flash');
            // If the saved config has an instruction, use it. Otherwise use default.
            setSystemInstruction(initialConfig.systemInstruction || DEFAULT_SYSTEM_INSTRUCTION);
        }
    }, [isOpen, initialConfig]);

    if (!isOpen) return null;

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await onSave({
                model,
                // If the user clears the input, we might want to save it as empty string?
                // However, the service layer falls back to default if empty.
                // But for clarity, if it matches default, we can save it or save empty.
                // Let's just save what they typed.
                systemInstruction
            });
            onClose();
        } catch (error) {
            console.error('Failed to save settings:', error);
            alert('Failed to save settings. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-gem-slate border border-gem-mist rounded-lg w-[600px] max-w-[90vw] shadow-xl flex flex-col max-h-[90vh]">
                <div className="p-4 border-b border-gem-mist flex justify-between items-center">
                    <h3 className="font-bold text-lg">Settings: {displayName}</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">✕</button>
                </div>

                <div className="p-6 space-y-6 overflow-y-auto">
                    {/* Usage Stats */}
                    <div className="bg-gem-mist/20 p-4 rounded-lg flex items-center justify-between">
                        <div>
                            <span className="text-sm text-gray-400">Total Interactions</span>
                            <div className="text-2xl font-bold text-gem-blue">{initialConfig.usageCount || 0}</div>
                        </div>
                        <div className="text-right">
                            <span className="text-xs text-gray-500">Last Active</span>
                            <div className="text-sm text-gray-300">
                                {initialConfig.lastActive
                                    ? new Date(initialConfig.lastActive).toLocaleString()
                                    : 'Never'}
                            </div>
                        </div>
                    </div>

                    {/* Model Selection */}
                    <div>
                        <label className="block text-sm font-medium mb-2 text-gem-offwhite">Model</label>
                        <select
                            value={model}
                            onChange={(e) => setModel(e.target.value)}
                            className="w-full bg-gem-onyx border border-gem-mist rounded p-2 text-gem-offwhite focus:border-gem-blue outline-none"
                        >
                            {SUPPORTED_MODELS.map(m => (
                                <option key={m.value} value={m.value}>{m.label}</option>
                            ))}
                        </select>
                        <p className="text-xs text-gray-500 mt-1">Select the Gemini model to use for generating responses.</p>
                    </div>

                    {/* System Prompt */}
                    <div>
                        <div className="flex justify-between items-end mb-2">
                            <label className="block text-sm font-medium text-gem-offwhite">System Prompt (Instructions & Tone)</label>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setSystemInstruction(prev => (prev + "\n\nKeep answers concise and under 100 words.").trim())}
                                    className="text-xs px-2 py-1 bg-gem-mist/20 rounded hover:bg-gem-mist/40 transition-colors"
                                >
                                    +Concise
                                </button>
                                <button
                                    onClick={() => setSystemInstruction(prev => (prev + "\n\nProvide detailed explanations with examples.").trim())}
                                    className="text-xs px-2 py-1 bg-gem-mist/20 rounded hover:bg-gem-mist/40 transition-colors"
                                >
                                    +Detailed
                                </button>
                                <button
                                    onClick={() => setSystemInstruction(prev => (prev + "\n\nMaintain a professional, formal tone.").trim())}
                                    className="text-xs px-2 py-1 bg-gem-mist/20 rounded hover:bg-gem-mist/40 transition-colors"
                                >
                                    +Professional
                                </button>
                                <button
                                    onClick={() => setSystemInstruction(DEFAULT_SYSTEM_INSTRUCTION)}
                                    className="text-xs px-2 py-1 bg-gem-mist/20 rounded hover:bg-red-900/40 text-red-300 transition-colors"
                                >
                                    Reset
                                </button>
                            </div>
                        </div>
                        <textarea
                            value={systemInstruction}
                            onChange={(e) => setSystemInstruction(e.target.value)}
                            className="w-full h-40 bg-gem-onyx border border-gem-mist rounded p-2 text-gem-offwhite focus:border-gem-blue outline-none resize-none font-mono text-sm"
                            placeholder={DEFAULT_SYSTEM_INSTRUCTION}
                        />
                        <p className="text-xs text-gray-500 mt-1">
                            Define how the model should behave, including answer length, tone, and format.
                        </p>
                    </div>
                </div>

                <div className="p-4 border-t border-gem-mist flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded text-gray-300 hover:bg-gem-mist/20 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="px-4 py-2 bg-gem-blue text-white rounded hover:bg-blue-600 transition-colors disabled:opacity-50"
                    >
                        {isSaving ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SpaceSettingsModal;
