# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased] - 2026-01-14

### Added
- **Image Upload Support**: Now supports uploading image files (`.jpg`, `.jpeg`, `.png`, `.webp`, `.heic`, `.heif`) to Gemini File Search.
- **System Prompt Presets**: Added quick-action buttons in Space Settings (Concise, Detailed, Professional) to easily configure model behavior and tone.
- **MIME Type Handling**: Enhanced `geminiService` to correctly map file extensions to MIME types, especially for images.

### Fixed
- **File Deletion**: Fixed issues with file deletion "failing silently" by adding:
    - A confirmation dialog (`window.confirm`) in the UI to prevent accidental deletions.
    - Detailed error logging in `geminiService.ts` to capture deletion failures.

### Changed
- Updated `DocumentList` component to filter and accept image file extensions.
- Improved error handling in `deleteDocument` service method.
