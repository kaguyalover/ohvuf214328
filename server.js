// === ДОБАВЛЯЕМ В server.js ПОСЛЕ СУЩЕСТВУЮЩИХ ENDPOINTS ===

// КОНФИГУРАЦИЯ АДМИНКИ
const ADMIN_PASSWORD = "che79911001#"; // ЗАМЕНИТЕ на свой пароль!
const ADMIN_USER_ID = "tg_455770486"; // ЗАМЕНИТЕ на ваш Telegram ID!

// Хранилище сессий админа
const adminSessions = new Map();

// Генерация токена сессии
function generateSessionToken() {
    return 'admin_' + Math.random().toString(36).substr(2, 16) + '_' + Date.now();
}

// Проверка админской сессии
function verifyAdminSession(sessionToken) {
    if (!sessionToken) return false;
    
    const session = adminSessions.get(sessionToken);
    if (!session) return false;
    
    // Сессия действительна 1 час
    if (Date.now() - session.createdAt > 60 * 60 * 1000) {
        adminSessions.delete(sessionToken);
        return false;
    }
    
    return true;
}

// === АДМИН ENDPOINTS ===

// Аутентификация админа
app.post('/api/admin/login', (req, res) => {
    try {
        const { password, adminId } = req.body;
        
        if (password === ADMIN_PASSWORD && adminId === ADMIN_USER_ID) {
            const sessionToken = generateSessionToken();
            adminSessions.set(sessionToken, {
                adminId: adminId,
                createdAt: Date.now()
            });
            
            console.log(`🔐 Админ вошел в систему: ${adminId}`);
            res.json({ success: true, sessionToken });
        } else {
            console.log('❌ Неудачная попытка входа в админку');
            res.json({ success: false, error: 'Неверный пароль или ID' });
        }
    } catch (error) {
        console.log('❌ Ошибка входа в админку:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Поиск игрока по нику
app.post('/api/admin/search-user', (req, res) => {
    try {
        const { sessionToken, nickname } = req.body;
        
        if (!verifyAdminSession(sessionToken)) {
            return res.status(401).json({ error: 'Сессия истекла' });
        }
        
        if (!nickname || nickname.length < 2) {
            return res.json({ success: false, error: 'Введите ник (минимум 2 символа)' });
        }
        
        // Ищем в рейтинге по нику
        const playerRating = globalRating.find(p => 
            p.playerNickname && p.playerNickname.toLowerCase().includes(nickname.toLowerCase())
        );
        
        if (!playerRating) {
            return res.json({ success: false, error: 'Игрок не найден в рейтинге' });
        }
        
        // Загружаем полный прогресс
        const playerProgressData = playerProgress.get(playerRating.userId);
        
        if (!playerProgressData) {
            return res.json({ success: false, error: 'Прогресс игрока не найден' });
        }
        
        console.log(`🔍 Админ искал игрока: ${nickname}, найден: ${playerRating.playerNickname}`);
        
        res.json({
            success: true,
            player: {
                userId: playerRating.userId,
                nickname: playerRating.playerNickname,
                rating: playerRating,
                progress: playerProgressData.gameState
            }
        });
        
    } catch (error) {
        console.log('❌ Ошибка поиска игрока:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Обновление статистики игрока
app.post('/api/admin/update-stats', (req, res) => {
    try {
        const { sessionToken, userId, updates } = req.body;
        
        if (!verifyAdminSession(sessionToken)) {
            return res.status(401).json({ error: 'Сессия истекла' });
        }
        
        if (!userId || !updates) {
            return res.json({ success: false, error: 'Отсутствуют данные' });
        }
        
        // Валидация данных
        const validatedUpdates = {};
        
        if (updates.level !== undefined) {
            validatedUpdates.level = Math.max(1, Math.min(100, parseInt(updates.level) || 1));
        }
        
        if (updates.money !== undefined) {
            validatedUpdates.money = Math.max(0, parseFloat(updates.money) || 0);
        }
        
        if (updates.experience !== undefined) {
            validatedUpdates.experience = Math.max(0, parseInt(updates.experience) || 0);
        }
        
        if (updates.unlockedBeds !== undefined) {
            validatedUpdates.unlockedBeds = Math.max(6, Math.min(64, parseInt(updates.unlockedBeds) || 6));
        }
        
        if (updates.toolsLevel !== undefined) {
            validatedUpdates.toolsLevel = Math.max(1, Math.min(16, parseInt(updates.toolsLevel) || 1));
        }
        
        // Обновляем прогресс
        const progressData = playerProgress.get(userId);
        if (!progressData) {
            return res.json({ success: false, error: 'Прогресс игрока не найден' });
        }
        
        // Применяем изменения
        Object.assign(progressData.gameState, validatedUpdates);
        
        // Автоматически обновляем toolsUnlocked based on toolsLevel
        if (validatedUpdates.toolsLevel) {
            progressData.gameState.toolsUnlocked = {};
            for (let i = 1; i <= validatedUpdates.toolsLevel; i++) {
                progressData.gameState.toolsUnlocked[i] = true;
            }
        }
        
        progressData.lastUpdated = new Date().toISOString();
        
        // Обновляем рейтинг
        const ratingIndex = globalRating.findIndex(p => p.userId === userId);
        if (ratingIndex !== -1) {
            if (validatedUpdates.level !== undefined) {
                globalRating[ratingIndex].level = validatedUpdates.level;
            }
            if (validatedUpdates.experience !== undefined) {
                globalRating[ratingIndex].experience = validatedUpdates.experience;
            }
            globalRating[ratingIndex].lastUpdated = new Date().toISOString();
        }
        
        // Сохраняем изменения
        saveProgressData(playerProgress);
        saveRatingData(globalRating);
        
        console.log(`✏️ Админ обновил статистику игрока ${userId}:`, validatedUpdates);
        
        res.json({
            success: true,
            message: 'Статистика обновлена',
            updatedStats: validatedUpdates
        });
        
    } catch (error) {
        console.log('❌ Ошибка обновления статистики:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Выход из админки
app.post('/api/admin/logout', (req, res) => {
    const { sessionToken } = req.body;
    
    if (sessionToken) {
        adminSessions.delete(sessionToken);
        console.log('🔒 Админ вышел из системы');
    }
    
    res.json({ success: true });
});
