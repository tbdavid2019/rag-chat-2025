# Changelog

All notable changes to this project will be documented in this file.

## [2026.10.25] - 2026-10-25

### 🛡️ Security & Runtime Upgrade (Node.js 26.12.1 Security Hardening)
- **容器基底升級 Node.js 26 (`node:26.12.1-alpine`)**:
  - `Dockerfile` 多階段構建（builder 與 runner）基底映像全面升級為 `node:26.12.1-alpine`。
  - 全面啟用最新 V8 引擎，具備原生 Type Stripping、低記憶體佔用與更高效的垃圾回收（GC）。
  - 完整防禦 2026-10-21 官方緊急安全性公告（October 2026 Security Releases）：
    - `CVE-2026-111497` (High - Node2Shell)：封堵 Brotli 解碼器越界寫入 RCE 漏洞。
    - `CVE-2026-105482` (High)：封堵 dns.resolve 空字元截斷漏洞。
    - `CVE-2026-105483` / `CVE-2026-106069` (High)：封堵 TLS 憑證主機名檢查繞過漏洞。
    - 底層搭載 OpenSSL 3.5.9 與最新 CA 根憑證。

## [Unreleased] - 2026-01-14

### Added
- **Image Upload Support**: Implemented a workaround to support image indexing by using Gemini 2.5 Flash to automatically generate detailed test descriptions for uploaded images (`.jpg`, `.png`, etc.), enabling text-based retrieval of image content.
- **Dynamic Example Questions**:
    - **Auto-Refresh**: Example questions are now automatically regenerated immediately after new files are uploaded.
    - **Language-Aware**: Questions are generated in the same language as the uploaded documents (e.g., Traditional Chinese for Chinese docs).
- **System Prompt Presets**: Added quick-action buttons in Space Settings (Concise, Detailed, Professional) to easily configure model behavior and tone.
- **MIME Type Handling**: Enhanced `geminiService` to correctly map file extensions to MIME types.

### Fixed
- **File Deletion**: Fixed issues with file deletion "failing silently" by adding:
    - A confirmation dialog (`window.confirm`) in the UI to prevent accidental deletions.
    - Detailed error logging in `geminiService.ts` to capture deletion failures.

### Changed
- Updated `DocumentList` component to filter and accept image file extensions.
- Improved error handling in `deleteDocument` service method.
