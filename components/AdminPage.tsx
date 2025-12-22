import React, { useState, useEffect } from 'react';

interface User {
    username: string;
    role: string;
    spacesCount: number;
    createdAt: string;
}

interface AdminPageProps {
    currentUsername: string;
    onBack: () => void;
}

const AdminPage: React.FC<AdminPageProps> = ({ currentUsername, onBack }) => {
    const [users, setUsers] = useState<User[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showAddUser, setShowAddUser] = useState(false);
    const [newUsername, setNewUsername] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [newRole, setNewRole] = useState<'user' | 'admin'>('user');
    const [error, setError] = useState('');

    useEffect(() => {
        loadUsers();
    }, []);

    const loadUsers = async () => {
        setIsLoading(true);
        try {
            const response = await fetch('/api/admin/users', {
                headers: { 'x-username': currentUsername }
            });

            if (!response.ok) {
                throw new Error('Failed to load users');
            }

            const data = await response.json();
            setUsers(data.users);
        } catch (err) {
            console.error('[Admin] Load users error:', err);
            setError('載入用戶列表失敗');
        } finally {
            setIsLoading(false);
        }
    };

    const handleAddUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        try {
            const response = await fetch('/api/admin/users', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-username': currentUsername
                },
                body: JSON.stringify({
                    username: newUsername,
                    password: newPassword,
                    role: newRole
                })
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to create user');
            }

            console.log('[Admin] User created successfully');
            setShowAddUser(false);
            setNewUsername('');
            setNewPassword('');
            setNewRole('user');
            loadUsers();
        } catch (err: any) {
            console.error('[Admin] Create user error:', err);
            setError(err.message || '創建用戶失敗');
        }
    };

    const handleDeleteUser = async (username: string) => {
        if (!confirm(`確定要刪除用戶 "${username}" 嗎？`)) {
            return;
        }

        try {
            const response = await fetch(`/api/admin/users/${username}`, {
                method: 'DELETE',
                headers: { 'x-username': currentUsername }
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to delete user');
            }

            console.log('[Admin] User deleted successfully');
            loadUsers();
        } catch (err: any) {
            console.error('[Admin] Delete user error:', err);
            alert(err.message || '刪除用戶失敗');
        }
    };

    const handleResetPassword = async (username: string) => {
        const newPassword = prompt(`請輸入 "${username}" 的新密碼：`);
        if (!newPassword || newPassword.trim() === '') {
            return;
        }

        if (newPassword.length < 6) {
            alert('密碼長度至少需要 6 個字符');
            return;
        }

        try {
            const response = await fetch(`/api/admin/users/${username}/reset-password`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'x-username': currentUsername
                },
                body: JSON.stringify({ newPassword })
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to reset password');
            }

            console.log('[Admin] Password reset successfully');
            alert(`用戶 "${username}" 的密碼已成功重設`);
        } catch (err: any) {
            console.error('[Admin] Reset password error:', err);
            alert(err.message || '重設密碼失敗');
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="max-w-6xl mx-auto">
                <div className="bg-white rounded-lg shadow-md p-6 mb-6">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-800">用戶管理</h1>
                            <p className="text-gray-600 mt-1">管理系統用戶和權限</p>
                        </div>
                        <button
                            onClick={onBack}
                            className="px-4 py-2 text-gray-600 hover:text-gray-800"
                        >
                            ← 返回主頁
                        </button>
                    </div>

                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
                            {error}
                        </div>
                    )}

                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-lg font-semibold">用戶列表</h2>
                        <button
                            onClick={() => setShowAddUser(!showAddUser)}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                        >
                            {showAddUser ? '取消' : '+ 新增用戶'}
                        </button>
                    </div>

                    {showAddUser && (
                        <form onSubmit={handleAddUser} className="bg-gray-50 p-4 rounded-lg mb-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                                <input
                                    type="text"
                                    value={newUsername}
                                    onChange={(e) => setNewUsername(e.target.value)}
                                    placeholder="用戶名"
                                    className="px-3 py-2 border rounded-lg"
                                    required
                                />
                                <input
                                    type="password"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    placeholder="密碼"
                                    className="px-3 py-2 border rounded-lg"
                                    required
                                />
                                <select
                                    value={newRole}
                                    onChange={(e) => setNewRole(e.target.value as 'user' | 'admin')}
                                    className="px-3 py-2 border rounded-lg"
                                >
                                    <option value="user">普通用戶</option>
                                    <option value="admin">管理員</option>
                                </select>
                            </div>
                            <button
                                type="submit"
                                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                            >
                                創建用戶
                            </button>
                        </form>
                    )}

                    {isLoading ? (
                        <div className="text-center py-8 text-gray-500">載入中...</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50 border-b">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">用戶名</th>
                                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">角色</th>
                                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">知識空間數量</th>
                                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">創建時間</th>
                                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">操作</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {users.map((user) => (
                                        <tr key={user.username} className="hover:bg-gray-50">
                                            <td className="px-4 py-3 text-sm">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-medium">{user.username}</span>
                                                    {user.username === currentUsername && (
                                                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">你</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-sm">
                                                <span className={`px-2 py-1 rounded text-xs font-medium ${user.role === 'admin'
                                                    ? 'bg-purple-100 text-purple-700'
                                                    : 'bg-gray-100 text-gray-700'
                                                    }`}>
                                                    {user.role === 'admin' ? '管理員' : '普通用戶'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-600">{user.spacesCount}</td>
                                            <td className="px-4 py-3 text-sm text-gray-600">
                                                {new Date(user.createdAt).toLocaleString('zh-TW')}
                                            </td>
                                            <td className="px-4 py-3 text-sm">
                                                {user.username !== currentUsername && (
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() => handleResetPassword(user.username)}
                                                            className="text-blue-600 hover:text-blue-800"
                                                        >
                                                            重設密碼
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteUser(user.username)}
                                                            className="text-red-600 hover:text-red-800"
                                                        >
                                                            刪除
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AdminPage;
