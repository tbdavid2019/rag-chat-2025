import express from 'express';
import cors from 'cors';
import { GoogleGenAI } from '@google/genai';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// 載入 .env 文件
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// 數據文件路徑
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const API_KEYS_FILE = path.join(DATA_DIR, 'api-keys.json');
const SPACES_CONFIG_FILE = path.join(DATA_DIR, 'spaces-config.json');

// 確保 data 目錄存在
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// 讀取/寫入 JSON 文件的輔助函數
function readJSONFile(filePath, defaultValue = {}) {
    try {
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error(`Error reading ${filePath}:`, error);
    }
    return defaultValue;
}

function writeJSONFile(filePath, data) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error(`Error writing ${filePath}:`, error);
        return false;
    }
}

// 初始化管理員帳號
function initializeAdmin() {
    const users = readJSONFile(USERS_FILE, { users: {} });

    const adminUsername = process.env.ADMIN_USERNAME || 'admin';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

    // 驗證 .env 中的 API Key 是否有效
    const envApiKey = process.env.GEMINI_API_KEY;
    const isValidEnvKey = envApiKey &&
        envApiKey !== 'your-api-key-here' &&
        envApiKey.trim().length > 20;

    if (!users.users[adminUsername]) {
        // 管理員不存在，創建新的
        const hashedPassword = bcrypt.hashSync(adminPassword, 10);
        users.users[adminUsername] = {
            password: hashedPassword,
            role: 'admin',
            spaces: [],
            geminiApiKey: isValidEnvKey ? envApiKey : null,
            createdAt: new Date().toISOString()
        };
        users.lastModified = new Date().toISOString();
        writeJSONFile(USERS_FILE, users);
        console.log(`[Server] Admin user created: ${adminUsername}`);
        if (isValidEnvKey) {
            console.log(`[Server] Admin Gemini API Key loaded from .env`);
        }
    } else {
        // 管理員已存在，檢查密碼是否變更
        const isPasswordMatch = bcrypt.compareSync(adminPassword, users.users[adminUsername].password);

        if (!isPasswordMatch) {
            // .env 中的密碼已變更，更新哈希值
            console.log(`[Server] Admin password changed in .env, updating...`);
            const newHashedPassword = bcrypt.hashSync(adminPassword, 10);
            users.users[adminUsername].password = newHashedPassword;
            users.users[adminUsername].updatedAt = new Date().toISOString();
            users.lastModified = new Date().toISOString();
            writeJSONFile(USERS_FILE, users);
            console.log(`[Server] Admin password updated successfully`);
        }

        // 同步更新 Gemini API Key（只有當 .env 有有效的 key 時）
        if (isValidEnvKey && users.users[adminUsername].geminiApiKey !== envApiKey) {
            users.users[adminUsername].geminiApiKey = envApiKey;
            users.lastModified = new Date().toISOString();
            writeJSONFile(USERS_FILE, users);
            console.log(`[Server] Admin Gemini API Key synced from .env`);
        }
    }
}

// 啟動時初始化
initializeAdmin();

// 儲存每個 space 的 API key 映射（從文件載入）
const apiKeyData = readJSONFile(API_KEYS_FILE, { apiKeys: {} });
const apiKeyStore = new Map(Object.entries(apiKeyData.apiKeys || {}));

app.use(cors());
app.use(express.json());

// 健康檢查
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// ==== 用戶認證 API ====

// 登入
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    console.log(`[Auth] Login attempt for user: ${username}`);

    if (!username || !password) {
        console.log('[Auth] Login failed: Missing credentials');
        return res.status(400).json({ error: 'Missing username or password' });
    }

    const users = readJSONFile(USERS_FILE, { users: {} });
    const user = users.users[username];

    if (!user) {
        console.log(`[Auth] Login failed: User not found - ${username}`);
        return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValidPassword = bcrypt.compareSync(password, user.password);

    if (!isValidPassword) {
        console.log(`[Auth] Login failed: Invalid password for user - ${username}`);
        return res.status(401).json({ error: 'Invalid credentials' });
    }

    console.log(`[Auth] ✓ User logged in: ${username} (role: ${user.role}, spaces: ${(user.spaces || []).length})`);

    res.json({
        username,
        role: user.role,
        spaces: user.spaces || [],
        geminiApiKey: user.geminiApiKey || null
    });
});

// 獲取當前用戶信息
app.get('/api/auth/me', (req, res) => {
    const username = req.headers['x-username'];

    if (!username) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    const users = readJSONFile(USERS_FILE, { users: {} });
    const user = users.users[username];

    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    res.json({
        username,
        role: user.role,
        spaces: user.spaces || [],
        geminiApiKey: user.geminiApiKey || null
    });
});

// ==== 管理員 API ====

// 獲取所有用戶（僅管理員）
app.get('/api/admin/users', (req, res) => {
    const adminUsername = req.headers['x-username'];
    const users = readJSONFile(USERS_FILE, { users: {} });
    const admin = users.users[adminUsername];

    if (!admin || admin.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }

    // 從 api-keys.json 計算每個用戶的 spaces 數量
    const apiKeys = readJSONFile(API_KEYS_FILE, { apiKeys: {} });
    const userSpacesCount = {};

    Object.values(apiKeys.apiKeys || {}).forEach((keyData) => {
        const username = keyData.username;
        if (username) {
            userSpacesCount[username] = (userSpacesCount[username] || 0) + 1;
        }
    });

    const userList = Object.entries(users.users).map(([username, data]) => {
        // Calculate total usage for this user across all their spaces
        let totalUsage = 0;
        const spacesConfig = readJSONFile(SPACES_CONFIG_FILE, { configs: {} });

        if (data.spaces && Array.isArray(data.spaces)) {
            data.spaces.forEach(spaceName => {
                const prefixedSpaceName = `${username}_${spaceName}`;
                // Also check without prefix just in case, but usually it has prefix
                const config = spacesConfig.configs[prefixedSpaceName] || spacesConfig.configs[spaceName];
                if (config && config.usageCount) {
                    totalUsage += config.usageCount;
                }
            });
        }

        return {
            username,
            role: data.role,
            spacesCount: (data.spaces || []).length,
            createdAt: data.createdAt,
            totalUsage
        };
    });

    res.json({ users: userList });
});

// 創建新用戶（僅管理員）
app.post('/api/admin/users', (req, res) => {
    const adminUsername = req.headers['x-username'];
    const { username, password, role = 'user' } = req.body;

    const users = readJSONFile(USERS_FILE, { users: {} });
    const admin = users.users[adminUsername];

    if (!admin || admin.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }

    if (!username || !password) {
        return res.status(400).json({ error: 'Missing username or password' });
    }

    if (users.users[username]) {
        return res.status(409).json({ error: 'User already exists' });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    users.users[username] = {
        password: hashedPassword,
        role,
        spaces: [],
        geminiApiKey: null,
        createdAt: new Date().toISOString()
    };
    users.lastModified = new Date().toISOString();

    writeJSONFile(USERS_FILE, users);
    console.log(`[Server] User created by admin: ${username}`);

    res.json({ message: 'User created successfully', username });
});

// 刪除用戶（僅管理員）
app.delete('/api/admin/users/:username', (req, res) => {
    const adminUsername = req.headers['x-username'];
    const { username } = req.params;

    const users = readJSONFile(USERS_FILE, { users: {} });
    const admin = users.users[adminUsername];

    if (!admin || admin.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }

    if (username === adminUsername) {
        return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    if (!users.users[username]) {
        return res.status(404).json({ error: 'User not found' });
    }

    delete users.users[username];
    users.lastModified = new Date().toISOString();

    writeJSONFile(USERS_FILE, users);
    console.log(`[Server] User deleted by admin: ${username}`);

    res.json({ message: 'User deleted successfully' });
});

// 重設用戶密碼（僅管理員）
app.put('/api/admin/users/:username/reset-password', (req, res) => {
    const adminUsername = req.headers['x-username'];
    const { username } = req.params;
    const { newPassword } = req.body;

    const users = readJSONFile(USERS_FILE, { users: {} });
    const admin = users.users[adminUsername];

    if (!admin || admin.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }

    if (!users.users[username]) {
        return res.status(404).json({ error: 'User not found' });
    }

    if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // 更新密碼
    const hashedPassword = bcrypt.hashSync(newPassword, 10);
    users.users[username].password = hashedPassword;
    users.users[username].updatedAt = new Date().toISOString();
    users.lastModified = new Date().toISOString();

    writeJSONFile(USERS_FILE, users);
    console.log(`[Server] Password reset by admin for user: ${username}`);

    res.json({ message: 'Password reset successfully' });
});

// 更新用戶的 Gemini API Key
app.put('/api/users/:username/gemini-key', (req, res) => {
    const { username } = req.params;
    const { geminiApiKey } = req.body;
    const requestingUser = req.headers['x-username'];

    const users = readJSONFile(USERS_FILE, { users: {} });
    const requester = users.users[requestingUser];

    // 只允許用戶更新自己的 API Key，或管理員更新任何人的
    if (requestingUser !== username && (!requester || requester.role !== 'admin')) {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    if (!users.users[username]) {
        return res.status(404).json({ error: 'User not found' });
    }

    // 檢查該 Gemini API Key 是否已被其他用戶使用
    if (geminiApiKey && geminiApiKey.trim() !== '') {
        for (const [otherUsername, userData] of Object.entries(users.users)) {
            if (otherUsername !== username && userData.geminiApiKey === geminiApiKey) {
                console.log(`[Server] Gemini API key already in use by user: ${otherUsername}`);
                return res.status(409).json({
                    error: 'API key already in use',
                    message: `此 Gemini API Key 已被用戶 "${otherUsername}" 使用，每個 API Key 只能綁定一個帳號。`
                });
            }
        }
    }

    users.users[username].geminiApiKey = geminiApiKey;
    users.users[username].updatedAt = new Date().toISOString();

    // 如果清除 API Key，也清空 spaces 陣列
    if (!geminiApiKey || geminiApiKey === null) {
        console.log(`[Server] Clearing spaces for user ${username} due to API key removal`);
        users.users[username].spaces = [];
    }

    users.lastModified = new Date().toISOString();

    if (writeJSONFile(USERS_FILE, users)) {
        console.log(`[Server] Gemini API key updated for user: ${username}`);
        res.json({ message: 'Gemini API key saved successfully' });
    } else {
        res.status(500).json({ error: 'Failed to save API key' });
    }
});

// 獲取 API Keys 列表（用於前端補充正確的 displayName）
app.get('/api/spaces/list-with-keys', (req, res) => {
    const requestingUser = req.headers['x-username'];
    console.log(`[Spaces] Fetching API keys for user: ${requestingUser}`);

    const allApiKeys = readJSONFile(API_KEYS_FILE, { apiKeys: {} });

    // 只返回當前用戶的 API Keys
    const userApiKeys = {};
    Object.entries(allApiKeys.apiKeys || {}).forEach(([keyId, keyData]) => {
        if (keyData.username === requestingUser) {
            userApiKeys[keyId] = keyData;
        }
    });

    console.log(`[Spaces] Found ${Object.keys(userApiKeys).length} API keys for user: ${requestingUser}`);

    res.json({
        apiKeys: userApiKeys,
        lastModified: allApiKeys.lastModified
    });
});

// ==== Space API ====

// 同步本地 JSON 與 Gemini File Search API（以 Gemini 為準）
app.post('/api/spaces/sync', async (req, res) => {
    const { username, geminiSpaces } = req.body;
    console.log(`[Sync] Syncing spaces for user: ${username}`);

    if (!username) {
        console.log('[Sync] ✗ Not authenticated');
        return res.status(401).json({ error: 'Not authenticated' });
    }

    if (!Array.isArray(geminiSpaces)) {
        console.log('[Sync] ✗ Invalid geminiSpaces format');
        return res.status(400).json({ error: 'Invalid geminiSpaces format' });
    }

    console.log(`[Sync] Gemini returned ${geminiSpaces.length} spaces`);

    try {
        const users = readJSONFile(USERS_FILE, { users: {} });
        const apiKeys = readJSONFile(API_KEYS_FILE, { apiKeys: {} });

        if (!users.users[username]) {
            console.log(`[Sync] ✗ User not found: ${username}`);
            return res.status(404).json({ error: 'User not found' });
        }

        // 1. 建立 Gemini 實際存在的 spaces 集合
        const geminiSpaceSet = new Set(geminiSpaces);
        console.log(`[Sync] Gemini spaces: ${Array.from(geminiSpaceSet).join(', ')}`);

        // 2. 清理 api-keys.json：移除已經不存在於 Gemini 的 spaces
        let apiKeysChanged = false;
        Object.entries(apiKeys.apiKeys || {}).forEach(([keyId, keyData]) => {
            if (keyData.username === username && !geminiSpaceSet.has(keyData.spaceName)) {
                console.log(`[Sync] Removing obsolete API key for deleted space: ${keyData.spaceName}`);
                delete apiKeys.apiKeys[keyId];
                apiKeysChanged = true;
            }
        });

        if (apiKeysChanged) {
            apiKeys.lastModified = new Date().toISOString();
            writeJSONFile(API_KEYS_FILE, apiKeys);
            console.log('[Sync] ✓ API keys cleaned up');
        }

        // 3. 更新 users.json：從 Gemini spaces 中提取簡短名稱（去掉 fileSearchStores/ 前綴）
        const shortSpaceNames = geminiSpaces.map(fullName => {
            // fullName 格式: "fileSearchStores/tatungqa20251222-8pzqxrbtjpxb"
            // 提取後半部分: "tatungqa20251222-8pzqxrbtjpxb"
            return fullName.replace(/^fileSearchStores\//, '');
        });

        users.users[username].spaces = shortSpaceNames;
        users.users[username].updatedAt = new Date().toISOString();
        users.lastModified = new Date().toISOString();
        writeJSONFile(USERS_FILE, users);

        console.log(`[Sync] ✓ User ${username} spaces updated to: ${shortSpaceNames.join(', ')}`);

        res.json({
            message: 'Spaces synced successfully',
            spacesCount: geminiSpaces.length,
            spaces: shortSpaceNames
        });
    } catch (error) {
        console.error('[Sync] ✗ Error syncing spaces:', error);
        res.status(500).json({ error: 'Failed to sync spaces' });
    }
});

// 更新用戶的 spaces 列表
function updateUserSpaces(username, spaceName, action = 'add') {
    const users = readJSONFile(USERS_FILE, { users: {} });
    const user = users.users[username];

    if (!user) return false;

    if (!user.spaces) {
        user.spaces = [];
    }

    if (action === 'add' && !user.spaces.includes(spaceName)) {
        user.spaces.push(spaceName);
    } else if (action === 'remove') {
        user.spaces = user.spaces.filter(s => s !== spaceName);

        // Also cleanup config when deleting space
        const spacesConfig = readJSONFile(SPACES_CONFIG_FILE, { configs: {} });
        const prefixedName = `${username}_${spaceName}`;
        if (spacesConfig.configs[prefixedName]) {
            delete spacesConfig.configs[prefixedName];
            writeJSONFile(SPACES_CONFIG_FILE, spacesConfig);
        }
    }

    users.lastModified = new Date().toISOString();
    return writeJSONFile(USERS_FILE, users);
}

// 生成新的 API key
app.post('/api/spaces/:spaceName/generate-key', (req, res) => {
    const { spaceName } = req.params;
    const { displayName, geminiKey } = req.body;
    const username = req.headers['x-username'];

    if (!spaceName || !geminiKey) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    const apiKey = `grag-${randomUUID()}`;
    const keyData = {
        spaceName,
        displayName,
        geminiKey,
        username: username || 'anonymous',
        createdAt: new Date().toISOString()
    };

    apiKeyStore.set(apiKey, keyData);

    // 保存到文件
    const apiKeysData = readJSONFile(API_KEYS_FILE, { apiKeys: {} });
    apiKeysData.apiKeys[apiKey] = keyData;
    apiKeysData.lastModified = new Date().toISOString();
    writeJSONFile(API_KEYS_FILE, apiKeysData);

    // 更新用戶的 spaces 列表（從 displayName 中提取 space 名稱）
    if (username && displayName) {
        // displayName 格式為 "username_spacename"，需要提取 spacename
        const spaceNameWithoutPrefix = displayName.startsWith(`${username}_`)
            ? displayName.substring(username.length + 1)
            : displayName;

        console.log(`[API Server] Updating user spaces: adding ${spaceNameWithoutPrefix} to ${username}`);
        updateUserSpaces(username, spaceNameWithoutPrefix, 'add');
    }

    console.log(`[API Server] Generated API key for space: ${displayName} (user: ${username || 'anonymous'})`);

    res.json({
        apiKey,
        endpoint: `http://localhost:${PORT}/v1/chat/completions`
    });
});

// OpenAI compatible endpoint
app.post('/v1/chat/completions', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: { message: 'Invalid or missing API key', type: 'invalid_request_error' } });
        }

        const apiKey = authHeader.replace('Bearer ', '');
        const spaceConfig = apiKeyStore.get(apiKey);

        if (!spaceConfig) {
            return res.status(401).json({ error: { message: 'Invalid API key', type: 'invalid_request_error' } });
        }

        const { messages, stream = false, model = 'gemini-2.5-flash', temperature, max_tokens } = req.body;

        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ error: { message: 'Invalid messages format', type: 'invalid_request_error' } });
        }

        console.log(`[API Server] Processing request for space: ${spaceConfig.displayName}`);
        console.log(`[API Server] Received ${messages.length} messages`);

        // 初始化 Gemini
        const ai = new GoogleGenAI({ apiKey: spaceConfig.geminiKey });

        // 將 OpenAI 格式的 messages 轉換為 Gemini 格式
        // OpenAI format: [{ role: 'user'|'assistant'|'system', content: 'text' }]
        // Gemini format: [{ role: 'user'|'model', parts: [{ text: 'text' }] }]

        let geminiContents;
        if (messages.length === 1) {
            // 單一訊息,直接使用字串格式
            geminiContents = messages[0].content;
            console.log(`[API Server] Using single message format`);
        } else {
            // 多輪對話,轉換為 Gemini 格式
            geminiContents = messages
                .filter(msg => msg.role !== 'system')  // 過濾掉 system messages
                .map(msg => ({
                    role: msg.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: msg.content }]
                }));
            console.log(`[API Server] Using multi-turn conversation format with ${geminiContents.length} messages`);
        }

        // 使用 File Search
        // Load the system instruction for this space
        const spacesConfig = readJSONFile(SPACES_CONFIG_FILE, { configs: {} });
        const spaceSettings = spacesConfig.configs[spaceConfig.spaceName] || {};
        const systemInstruction = spaceSettings.systemInstruction; // Can be undefined/null/empty

        if (systemInstruction) {
            console.log(`[API Server] Using custom system instruction for space: ${spaceConfig.spaceName}`);
        }

        const response = await ai.models.generateContent({
            model: model,
            contents: geminiContents,  // 使用完整對話歷史
            config: {
                systemInstruction: systemInstruction, // Pass it here
                tools: [
                    {
                        fileSearch: {
                            fileSearchStoreNames: [spaceConfig.spaceName]
                        }
                    }
                ]
            }
        });

        const responseText = response.text || '';

        // Increment usage stats for this space
        const spaceName = spaceConfig.spaceName;
        // spacesConfig already loaded above


        if (!spacesConfig.configs[spaceName]) {
            spacesConfig.configs[spaceName] = {};
        }

        spacesConfig.configs[spaceName].usageCount = (spacesConfig.configs[spaceName].usageCount || 0) + 1;
        spacesConfig.configs[spaceName].lastActive = new Date().toISOString();
        spacesConfig.lastModified = new Date().toISOString();
        writeJSONFile(SPACES_CONFIG_FILE, spacesConfig);

        // 返回 OpenAI 兼容格式
        const openaiResponse = {
            id: `chatcmpl-${randomUUID()}`,
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: model,
            choices: [
                {
                    index: 0,
                    message: {
                        role: 'assistant',
                        content: responseText
                    },
                    finish_reason: 'stop'
                }
            ],
            usage: {
                prompt_tokens: 0,
                completion_tokens: 0,
                total_tokens: 0
            }
        };

        console.log(`[API Server] Response sent for space: ${spaceConfig.displayName}`);
        res.json(openaiResponse);

    } catch (error) {
        console.error('[API Server] Error:', error);
        res.status(500).json({
            error: {
                message: error.message || 'Internal server error',
                type: 'api_error'
            }
        });
    }
});

// 獲取 space 的 API key
app.get('/api/spaces/:spaceName/api-key', (req, res) => {
    const { spaceName } = req.params;

    // 查找對應的 API key
    for (const [apiKey, config] of apiKeyStore.entries()) {
        if (config.spaceName === spaceName) {
            return res.json({
                apiKey,
                endpoint: `http://localhost:${PORT}/v1/chat/completions`
            });
        }
    }

    res.status(404).json({ error: 'API key not found for this space' });
});

// ==== Space Config API ====
app.get('/api/spaces/:spaceName/config', (req, res) => {
    const { spaceName } = req.params;
    const username = req.headers['x-username'];
    console.log(`[Config] Get config for space: ${spaceName} (user: ${username})`);

    const spacesConfig = readJSONFile(SPACES_CONFIG_FILE, { configs: {} });
    const config = spacesConfig.configs[spaceName] || {
        usageCount: 0,
        model: 'gemini-2.5-flash',
        systemInstruction: ''
    };

    console.log(`[Config] Config retrieved: usageCount=${config.usageCount}, model=${config.model}, systemInstruction=${config.systemInstruction ? config.systemInstruction.substring(0, 50) + '...' : 'EMPTY'}`);

    res.json(config);
});

// Update space config
app.put('/api/spaces/:spaceName/config', (req, res) => {
    const { spaceName } = req.params;
    const { model, systemInstruction } = req.body;

    const spacesConfig = readJSONFile(SPACES_CONFIG_FILE, { configs: {} });

    if (!spacesConfig.configs[spaceName]) {
        spacesConfig.configs[spaceName] = {};
    }

    if (model !== undefined) spacesConfig.configs[spaceName].model = model;
    if (systemInstruction !== undefined) spacesConfig.configs[spaceName].systemInstruction = systemInstruction;

    spacesConfig.lastModified = new Date().toISOString();
    writeJSONFile(SPACES_CONFIG_FILE, spacesConfig);

    res.json({ message: 'Configuration saved', config: spacesConfig.configs[spaceName] });
});

// Increment usage count
app.post('/api/spaces/:spaceName/stats/increment', (req, res) => {
    const { spaceName } = req.params;
    const username = req.headers['x-username'];
    console.log(`[Stats] Increment usage for space: ${spaceName} (user: ${username})`);

    const spacesConfig = readJSONFile(SPACES_CONFIG_FILE, { configs: {} });

    if (!spacesConfig.configs[spaceName]) {
        spacesConfig.configs[spaceName] = {};
    }

    console.log(`[Stats] ✓ Usage count: ${spacesConfig.configs[spaceName].usageCount}`);

    res.json({ message: 'Stats incremented', usageCount: spacesConfig.configs[spaceName].usageCount });
});

// 生產環境：提供前端靜態文件
if (isProduction) {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));

    // 所有非 API 路由返回 index.html（支援 SPA 路由）
    app.use((req, res, next) => {
        // 如果是 API 路由，跳過
        if (req.path.startsWith('/api') || req.path.startsWith('/v1') || req.path === '/health') {
            return next();
        }
        // 其他路由返回 index.html
        res.sendFile(path.join(distPath, 'index.html'));
    });
}

app.listen(PORT, () => {
    console.log(`\n🚀 Server running on http://localhost:${PORT}`);
    if (isProduction) {
        console.log(`📦 Serving static files from dist/`);
    } else {
        console.log(`🔧 Development mode: API only`);
    }
    console.log(`📝 API Endpoint: http://localhost:${PORT}/v1/chat/completions`);
    console.log(`\nExample usage:`);
    console.log(`curl -X POST http://localhost:${PORT}/v1/chat/completions \\`);
    console.log(`  -H "Authorization: Bearer YOUR_API_KEY" \\`);
    console.log(`  -H "Content-Type: application/json" \\`);
    console.log(`  -d '{"messages":[{"role":"user","content":"Hello"}]}'\n`);
});
