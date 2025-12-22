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

    if (!username || !password) {
        return res.status(400).json({ error: 'Missing username or password' });
    }

    const users = readJSONFile(USERS_FILE, { users: {} });
    const user = users.users[username];

    if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValidPassword = bcrypt.compareSync(password, user.password);

    if (!isValidPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }

    console.log(`[Server] User logged in: ${username}`);

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

    const userList = Object.entries(users.users).map(([username, data]) => ({
        username,
        role: data.role,
        spacesCount: (data.spaces || []).length,
        createdAt: data.createdAt
    }));

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

    users.users[username].geminiApiKey = geminiApiKey;
    users.users[username].updatedAt = new Date().toISOString();
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
    const apiKeys = readJSONFile(API_KEYS_FILE, { apiKeys: {} });
    res.json(apiKeys);
});

// ==== Space API ====

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

        // 初始化 Gemini
        const ai = new GoogleGenAI({ apiKey: spaceConfig.geminiKey });

        // 將 OpenAI 格式的 messages 轉換為 Gemini 格式
        const lastMessage = messages[messages.length - 1];
        const query = lastMessage.content;

        // 使用 File Search
        const response = await ai.models.generateContent({
            model: model,
            contents: query,
            config: {
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
