# Changelog

All notable changes to this project will be documented in this file.

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
