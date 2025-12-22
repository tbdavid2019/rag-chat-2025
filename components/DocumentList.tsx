
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useRef } from 'react';
import { RagStore, Document } from '../types';
import Spinner from './Spinner';
import UploadIcon from './icons/UploadIcon';
import TrashIcon from './icons/TrashIcon';

interface DocumentListProps {
    selectedStore: RagStore | null;
    documents: Document[];
    isLoading: boolean;
    processingFile: string | null;
    onUpload: (files: File[]) => void;
    onDelete: (docName: string) => void;
}

// Gemini File Search API 支援的所有文件格式
const SUPPORTED_EXTENSIONS = [
    // Documents
    '.pdf', '.doc', '.docx', '.pptx', '.rtf', '.hwp', '.hwpx',
    // Spreadsheets
    '.xls', '.xlsx', '.csv', '.tsv',
    // Text & Markdown
    '.txt', '.md', '.html', '.json',
    // Code files
    '.py', '.js', '.java', '.cpp', '.sql', '.dart', '.ts',
    '.c', '.cs', '.php', '.rb', '.go', '.rs', '.swift', '.kt'
];

const DocumentList: React.FC<DocumentListProps> = ({ selectedStore, documents, isLoading, processingFile, onUpload, onDelete }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const folderInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const files = Array.from(e.target.files).filter(f => {
                const ext = f.name.toLowerCase().substring(f.name.lastIndexOf('.'));
                return SUPPORTED_EXTENSIONS.includes(ext);
            });
            if (files.length > 0) onUpload(files);
        }
    };

    if (!selectedStore) return null;

    return (
        <div className="flex flex-col h-full">
            <div className="mb-6">
                <h2 className="text-lg font-bold mb-4">Documents</h2>
                <div className="grid grid-cols-2 gap-2">
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="flex flex-col items-center justify-center p-3 border border-gem-mist rounded-lg hover:bg-gem-mist/20 transition-colors"
                    >
                        <UploadIcon />
                        <span className="text-[10px] mt-1 font-bold">Files</span>
                    </button>
                    <button
                        onClick={() => folderInputRef.current?.click()}
                        className="flex flex-col items-center justify-center p-3 border border-gem-mist rounded-lg hover:bg-gem-mist/20 transition-colors"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                        </svg>
                        <span className="text-[10px] mt-1 font-bold">Folder</span>
                    </button>
                </div>
                {/* Hidden inputs */}
                <input
                    type="file"
                    multiple
                    ref={fileInputRef}
                    className="hidden"
                    onChange={handleFileChange}
                    accept=".pdf,.doc,.docx,.pptx,.rtf,.hwp,.hwpx,.xls,.xlsx,.csv,.tsv,.txt,.md,.html,.json,.py,.js,.java,.cpp,.sql,.dart,.ts,.c,.cs,.php,.rb,.go,.rs,.swift,.kt"
                />
                <input
                    type="file"
                    // Fixed: Using spread and any cast to bypass TypeScript errors for non-standard attributes webkitdirectory and directory
                    {...({ webkitdirectory: "", directory: "" } as any)}
                    ref={folderInputRef}
                    className="hidden"
                    onChange={handleFileChange}
                />
            </div>

            {isLoading ? (
                <div className="flex justify-center py-4"><Spinner /></div>
            ) : (
                <div className="flex-grow overflow-y-auto space-y-2 pr-1">
                    {documents.map((doc) => (
                        <div key={doc.name} className="p-3 bg-gem-mist/30 border border-gem-mist/50 rounded-lg group">
                            <div className="flex items-start justify-between">
                                <span className="text-sm font-medium break-all line-clamp-2" title={doc.displayName}>{doc.displayName}</span>
                                <button
                                    onClick={() => onDelete(doc.name)}
                                    className="ml-2 text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    <TrashIcon />
                                </button>
                            </div>
                        </div>
                    ))}
                    {documents.length === 0 && (
                        <div className="text-center py-12 opacity-30 italic text-sm">Empty space</div>
                    )}
                </div>
            )}
        </div>
    );
};

export default DocumentList;
