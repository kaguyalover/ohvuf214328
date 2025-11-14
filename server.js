const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json());

// ФАЙЛЫ ДАННЫХ
const RATING_FILE = path.join(__dirname, 'data', 'rating.json');
const PROGRESS_FILE = path.join(__dirname, 'data', 'progress.json');

// УСКОРЕННАЯ ЗАГРУЗКА ДАННЫХ
let globalRating = [];
let playerProgress = new Map();

function loadRatingData() {
    try {
        if (fs.existsSync(RATING_FILE)) {
            const data = fs.readFileSync(RATING_FILE, 'utf8');
            const parsed = JSON.parse(data);
            console.log(`📊 Загружено ${parsed.length} игроков из рейтинга`);
            return parsed;
        }
    } catch (error) {
        console.log('❌ Ошибка загрузки рейтинга:', error);
    }
    console.log('📝 Создано новое хранилище рейтинга');
    return [];
}

function loadProgressData() {
    try {
        if (fs.existsSync(PROGRESS_FILE)) {
            const data = fs.readFileSync(PROGRESS_FILE, 'utf8');
            const parsed = JSON.parse(data);
            console.log(`🎮 Загружено прогрессов: ${parsed.length}`);
            
            const progressMap = new Map();
            parsed.forEach(item => {
                if (item.userId && item.gameState) {
                    progressMap.set(item.userId, item);
                }
            });
            return progressMap;
        }
    } catch (error) {
        console.log('❌ Ошибка загрузки прогресса:', error);
    }
    console.log('🎮 Создано новое хранилище прогресса');
    return new Map();
}

function saveRatingData(data) {
    try {
        const dataDir = path.dirname(RATING_FILE);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        
        fs.writeFileSync(RATING_FILE, JSON.stringify(data, null, 2));
        console.log(`💾 Рейтинг сохранен (${data.length} игроков)`);
        return true;
    } catch (error) {
        console.log('❌ Ошибка сохранения рейтинга:', error);
        return false;
    }
}

function saveProgressData(progressMap) {
    try {
        const progressArray = Array.from(progressMap.values());
        
        const dataDir = path.dirname(PROGRESS_FILE);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        
        fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progressArray, null, 2));
        console.log(`💾 Прогресс сохранен (${progressArray.length} игроков)`);
        return true;
    } catch (error) {
        console.log('❌ Ошибка сохранения прогресса:', error);
        return false;
    }
}

// МГНОВЕННАЯ ЗАГРУЗКА ПРИ СТАРТЕ
globalRating = loadRatingData();
playerProgress = loadProgressData();

// АВТО-СОХРАНЕНИЕ КАЖДЫЕ 30 СЕКУНД
setInterval(() => {
    if (globalRating.length > 0) {
        saveRatingData(globalRating);
    }
    if (playerProgress.size > 0) {
        saveProgressData(playerProgress);
    }
}, 30 * 1000);

// === СУЩЕСТВУЮЩИЕ ENDPOINTS ДЛЯ ИГРЫ ===

// УСКОРЕННЫЙ ПОЛУЧЕНИЕ РЕЙТИНГА
app.get('/api/rating', (req, res) => {
    try {
        const sorted = globalRating
            .filter(player => player && player.playerNickname && player.level > 0)
            .sort((a, b) => {
                if (b.level !== a.level) return b.level - a.level;
                return b.experience - a.experience;
            })
            .slice(0, 100);
        
        res.json(sorted);
    } catch (error) {
        console.log('❌ Ошибка получения рейтинга:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// СУПЕР-БЫСТРОЕ ОБНОВЛЕНИЕ РЕЙТИНГА
app.post('/api/update-rating', (req, res) => {
    try {
        const playerData = req.body;
        
        if (!playerData.userId || !playerData.playerNickname) {
            return res.status(400).json({ error: 'Invalid player data' });
        }
        
        console.log(`🔄 Обновление рейтинга: ${playerData.playerNickname} ур.${playerData.level}`);
        
        const existingIndex = globalRating.findIndex(p => p.userId === playerData.userId);
        
        if (existingIndex !== -1) {
            globalRating[existingIndex] = playerData;
        } else {
            globalRating.push(playerData);
        }
        
        // СОХРАНЕНИЕ В ФОНЕ
        setTimeout(() => {
            saveRatingData(globalRating);
        }, 0);
        
        const sorted = globalRating
            .sort((a, b) => {
                if (b.level !== a.level) return b.level - a.level;
                return b.experience - a.experience;
            })
            .slice(0, 100);
        
        res.json(sorted);
        
    } catch (error) {
        console.log('❌ Ошибка обновления рейтинга:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// СОХРАНЕНИЕ ПРОГРЕССА ИГРЫ
app.post('/api/save-progress', (req, res) => {
    try {
        const { userId, gameState } = req.body;
        
        if (!userId || !gameState) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const existingProgress = playerProgress.get(userId);
        const newTimestamp = gameState.lastUpdated || Date.now();
        
        // ПРОВЕРКА КОНФЛИКТА: если на сервере новее данные - отвергаем
        if (existingProgress && existingProgress.gameState.lastUpdated) {
            const existingTimestamp = existingProgress.gameState.lastUpdated;
            
            if (newTimestamp < existingTimestamp) {
                console.log(`⚠️ Конфликт версий: клиент ${newTimestamp}, сервер ${existingTimestamp}`);
                return res.json({ 
                    success: false, 
                    conflict: true,
                    serverVersion: existingProgress.gameState 
                });
            }
        }

        console.log(`💾 Сохранение прогресса: ${userId} (${newTimestamp})`);

        // Валидация данных
        const cleanGameState = {
            money: Math.max(0, Number(gameState.money) || 0),
            unlockedBeds: Math.max(6, Math.min(64, Number(gameState.unlockedBeds) || 6)),
            toolsLevel: Math.max(1, Math.min(16, Number(gameState.toolsLevel) || 1)),
            toolsUnlocked: gameState.toolsUnlocked || {1: true},
            selectedPlant: gameState.selectedPlant || "pink_cherry",
            farmMap: Array.isArray(gameState.farmMap) ? gameState.farmMap : [],
            totalEarned: Math.max(0, Number(gameState.totalEarned) || 0),
            level: Math.max(1, Number(gameState.level) || 1),
            experience: Math.max(0, Number(gameState.experience) || 0),
            lastUpdated: newTimestamp
        };

        // Сохраняем в память
        playerProgress.set(userId, {
            userId: userId,
            gameState: cleanGameState,
            lastUpdated: new Date().toISOString()
        });

        // Фоновое сохранение на диск
        setTimeout(() => {
            saveProgressData(playerProgress);
        }, 0);

        res.json({ success: true, message: 'Progress saved' });
        
    } catch (error) {
        console.log('❌ Ошибка сохранения прогресса:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// ЗАГРУЗКА ПРОГРЕССА ИГРЫ
app.get('/api/load-progress', (req, res) => {
    try {
        const { userId } = req.query;
        
        if (!userId) {
            return res.status(400).json({ error: 'Missing userId' });
        }

        console.log(`📂 Загрузка прогресса: ${userId}`);

        const progress = playerProgress.get(userId);
        
        if (progress && progress.gameState) {
            res.json(progress.gameState);
        } else {
            res.json(null);
        }
        
    } catch (error) {
        console.log('❌ Ошибка загрузки прогресса:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// === АДМИН ENDPOINTS ===

// КОНФИГУРАЦИЯ АДМИНКИ (ТОЛЬКО ПАРОЛЬ)
const ADMIN_PASSWORD = "chE79911001#"; // ЗАМЕНИТЕ на свой пароль!

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

// Аутентификация админа (только по паролю)
app.post('/api/admin/login', (req, res) => {
    try {
        const { password } = req.body;
        
        if (password === ADMIN_PASSWORD) {
            const sessionToken = generateSessionToken();
            adminSessions.set(sessionToken, {
                createdAt: Date.now()
            });
            
            console.log(`🔐 Админ вошел в систему`);
            res.json({ success: true, sessionToken });
        } else {
            console.log('❌ Неудачная попытка входа в админку');
            res.json({ success: false, error: 'Неверный пароль' });
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

// Статус сервера
app.get('/', (req, res) => {
    res.json({ 
        status: 'Cherryty Game Server v4.1 (с админ-панелью)',
        ratingPlayers: globalRating.length,
        progressPlayers: playerProgress.size,
        version: '4.1',
        hosting: 'Railway',
        features: ['rating', 'progress-sync', 'conflict-resolution', 'admin-panel']
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Cherryty Game Server v4.1 запущен на Railway (port ${PORT})`);
    console.log(`📊 Рейтинг: ${globalRating.length} игроков`);
    console.log(`🎮 Прогресс: ${playerProgress.size} сохранений`);
    console.log(`🔐 Админ-панель: ДОСТУПНА (пароль: ${ADMIN_PASSWORD})`);
    console.log(`🔄 Синхронизация: ВКЛЮЧЕНА`);
});
