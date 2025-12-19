/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState, useEffect } from 'react';

interface ApiInfoProps {
    spaceName: string;
    displayName: string;
    username?: string;
}

const ApiInfo: React.FC<ApiInfoProps> = ({ spaceName, displayName, username }) => {
    const [apiKey, setApiKey] = useState<string | null>(null);
    const [endpoint, setEndpoint] = useState<string>(() => {
        return `${window.location.origin}/v1/chat/completions`;
    });
    const [isGenerating, setIsGenerating] = useState(false);
    const [copied, setCopied] = useState<'key' | 'endpoint' | null>(null);

    useEffect(() => {
        // 嘗試從 localStorage 載入已存在的 API key
        const savedKey = localStorage.getItem(`api_key_${spaceName}`);
        if (savedKey) {
            setApiKey(savedKey);
        }
    }, [spaceName]);

    const generateApiKey = async () => {
        setIsGenerating(true);
        try {
            const geminiKey = localStorage.getItem('gemini_api_key');
            if (!geminiKey) {
                alert('請先設定 Gemini API Key');
                return;
            }

            const response = await fetch(`/api/spaces/${encodeURIComponent(spaceName)}/generate-key`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    ...(username ? { 'x-username': username } : {})
                },
                body: JSON.stringify({ displayName, geminiKey })
            });

            if (!response.ok) {
                throw new Error('Failed to generate API key');
            }

            const data = await response.json();
            setApiKey(data.apiKey);
            // 使用相對路徑或當前域名
            const baseUrl = window.location.origin;
            setEndpoint(`${baseUrl}/v1/chat/completions`);
            
            // 保存到 localStorage
            localStorage.setItem(`api_key_${spaceName}`, data.apiKey);
            
        } catch (error) {
            console.error('Failed to generate API key:', error);
            alert('生成 API Key 失敗，請確保 API Server 正在運行 (npm run server)');
        } finally {
            setIsGenerating(false);
        }
    };

    const copyToClipboard = (text: string, type: 'key' | 'endpoint') => {
        navigator.clipboard.writeText(text);
        setCopied(type);
        setTimeout(() => setCopied(null), 2000);
    };

    const curlExample = apiKey ? `curl -X POST ${endpoint} \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gemini-2.5-flash",
    "messages": [
      {"role": "user", "content": "你的問題"}
    ]
  }'` : '';

    return (
        <div className="bg-white border border-gem-mist rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gem-offwhite">OpenAI Compatible API</h3>
                {!apiKey && (
                    <button
                        onClick={generateApiKey}
                        disabled={isGenerating}
                        className="px-3 py-1 text-xs bg-gem-blue text-white rounded hover:bg-blue-600 disabled:opacity-50"
                    >
                        {isGenerating ? '生成中...' : '生成 API Key'}
                    </button>
                )}
            </div>

            {apiKey ? (
                <div className="space-y-3">
                    <div>
                        <label className="block text-xs text-gray-600 mb-1">API Endpoint</label>
                        <div className="flex items-center gap-2">
                            <input
                                type="text"
                                value={endpoint}
                                readOnly
                                className="flex-1 px-3 py-2 text-sm bg-gray-50 border border-gray-300 rounded font-mono"
                            />
                            <button
                                onClick={() => copyToClipboard(endpoint, 'endpoint')}
                                className="px-3 py-2 text-xs bg-gray-100 hover:bg-gray-200 rounded"
                            >
                                {copied === 'endpoint' ? '✓ 已複製' : '複製'}
                            </button>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs text-gray-600 mb-1">API Key</label>
                        <div className="flex items-center gap-2">
                            <input
                                type="password"
                                value={apiKey}
                                readOnly
                                className="flex-1 px-3 py-2 text-sm bg-gray-50 border border-gray-300 rounded font-mono"
                            />
                            <button
                                onClick={() => copyToClipboard(apiKey, 'key')}
                                className="px-3 py-2 text-xs bg-gray-100 hover:bg-gray-200 rounded"
                            >
                                {copied === 'key' ? '✓ 已複製' : '複製'}
                            </button>
                        </div>
                    </div>

                    <details className="mt-3">
                        <summary className="text-xs text-gray-600 cursor-pointer hover:text-gray-800">
                            查看使用範例 (cURL)
                        </summary>
                        <div className="mt-2 relative">
                            <pre className="text-xs bg-gray-900 text-green-400 p-3 rounded overflow-x-auto">
                                <code>{curlExample}</code>
                            </pre>
                            <button
                                onClick={() => copyToClipboard(curlExample, 'endpoint')}
                                className="absolute top-2 right-2 px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-white rounded"
                            >
                                複製
                            </button>
                        </div>
                    </details>

                    <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded text-xs text-blue-800">
                        <p className="font-semibold mb-1">💡 使用提示：</p>
                        <ul className="list-disc list-inside space-y-1 text-blue-700">
                            <li>此 API 完全兼容 OpenAI Chat Completions 格式</li>
                            <li>可以直接用在支援 OpenAI API 的任何工具中</li>
                            <li>自動使用此 Space 的文件進行 RAG 查詢</li>
                        </ul>
                    </div>
                    
                    <div className="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
                        <p className="font-semibold mb-1">🔐 重要說明：</p>
                        <p className="text-yellow-700">
                            所有 Space 共用同一個 Endpoint，<strong>但每個 Space 的 API Key 是唯一的</strong>。
                            Server 會根據 API Key 自動識別並使用對應 Space 的文件庫。
                        </p>
                    </div>
                </div>
            ) : (
                <p className="text-xs text-gray-500">
                    點擊「生成 API Key」來創建一個 OpenAI 兼容的 API 接口
                </p>
            )}
        </div>
    );
};

export default ApiInfo;
