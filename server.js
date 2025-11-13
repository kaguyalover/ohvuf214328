const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json());

const DATA_FILE = path.join(__dirname, 'data', 'rating.json');

// Создаем папку data если нет
if (!fs.existsSync(path.dirname(DATA_FILE))) {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
}

// Загрузка данных из файла
function loadRatingData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const data = fs.readFileSync(DATA_FILE, 'utf8');
            const parsed = JSON.parse(data);
            console.log(`📊 Загружено ${parsed.length} игроков из хранилища`);
            return parsed;
        }
    } catch (error) {
        console.log('❌ Ошибка загрузки данных:', error);
    }
    console.log('📝 Создано новое хранилище рейтинга');
    return [];
}

// Сохранение данных в файл
function saveRatingData(data) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        console.log(`💾 Данные рейтинга сохранены (${data.length} игроков)`);
        return true;
    } catch (error) {
        console.log('❌ Ошибка сохранения данных:', error);
        return false;
    }
}

let globalRating = loadRatingData();

// АВТО-СОХРАНЕНИЕ КАЖДЫЕ 30 СЕКУНД (вместо 2 минут)
setInterval(() => {
    if (globalRating.length > 0) {
        const success = saveRatingData(globalRating);
        if (success) {
            console.log(`🛡️  Авто-сохранение выполнено: ${globalRating.length} игроков`);
        } else {
            console.log('⚠️  Авто-сохранение не удалось');
        }
    } else {
        console.log('ℹ️  Нет данных для авто-сохранения');
    }
}, 30 * 1000); // 30 секунд

// Получить топ-100 игроков
app.get('/api/rating', (req, res) => {
  try {
    console.log(`📡 Запрос рейтинга от ${req.ip}`);
    
    const sorted = globalRating
      .filter(player => player && player.playerNickname && player.level > 0)
      .sort((a, b) => {
        if (b.level !== a.level) return b.level - a.level;
        return b.experience - a.experience;
      })
      .slice(0, 100);
    
    console.log(`📊 Отдаем рейтинг: ${sorted.length} игроков (всего в памяти: ${globalRating.length})`);
    
    // Логируем топ-3 игрока для отладки
    if (sorted.length > 0) {
        console.log('🏆 Топ-3 игрока:');
        sorted.slice(0, 3).forEach((player, index) => {
            console.log(`  ${index + 1}. ${player.playerNickname} - ур. ${player.level} (${player.experience} косточек)`);
        });
    }
    
    res.json(sorted);
  } catch (error) {
    console.log('❌ Ошибка получения рейтинга:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Обновить рейтинг игрока - УЛУЧШЕННАЯ ВЕРСИЯ С ДЕТАЛЬНЫМ ЛОГИРОВАНИЕМ
app.post('/api/update-rating', (req, res) => {
  try {
    const playerData = req.body;
    
    if (!playerData.userId || !playerData.playerNickname) {
      console.log('❌ Неверные данные игрока:', playerData);
      return res.status(400).json({ error: 'Invalid player data' });
    }
    
    console.log(`\n🔄 ОБНОВЛЕНИЕ РЕЙТИНГА ====================`);
    console.log(`👤 Игрок: ${playerData.playerNickname}`);
    console.log(`🆔 ID: ${playerData.userId}`);
    console.log(`⭐ Уровень: ${playerData.level}`);
    console.log(`🦴 Косточки: ${playerData.experience}`);
    console.log(`💰 Всего заработано: ${playerData.totalEarned}`);
    console.log(`📊 До обновления: ${globalRating.length} игроков в памяти`);
    
    const existingIndex = globalRating.findIndex(p => p.userId === playerData.userId);
    
    if (existingIndex !== -1) {
      const oldPlayer = globalRating[existingIndex];
      console.log(`📝 Обновление существующего игрока:`);
      console.log(`   Было: ур. ${oldPlayer.level}, ${oldPlayer.experience} косточек`);
      console.log(`   Стало: ур. ${playerData.level}, ${playerData.experience} косточек`);
      
      globalRating[existingIndex] = playerData;
    } else {
      console.log(`🎉 Новый игрок добавлен в рейтинг`);
      globalRating.push(playerData);
    }
    
    // ПРИНУДИТЕЛЬНОЕ СОХРАНЕНИЕ ПОСЛЕ КАЖДОГО ОБНОВЛЕНИЯ
    console.log(`💾 Принудительное сохранение...`);
    const saveSuccess = saveRatingData(globalRating);
    
    if (!saveSuccess) {
      console.log('⚠️  Внимание: сохранение не удалось!');
    }
    
    // Ограничиваем размер (оставляем топ-200 для буфера)
    if (globalRating.length > 200) {
      const beforeCleanup = globalRating.length;
      globalRating = globalRating
        .sort((a, b) => {
          if (b.level !== a.level) return b.level - a.level;
          return b.experience - a.experience;
        })
        .slice(0, 200);
      console.log(`🧹 Очистка: было ${beforeCleanup}, осталось ${globalRating.length}`);
    }
    
    const sorted = globalRating
      .sort((a, b) => {
        if (b.level !== a.level) return b.level - a.level;
        return b.experience - a.experience;
      })
      .slice(0, 100);
    
    console.log(`✅ Рейтинг обновлен. Всего игроков: ${globalRating.length}`);
    console.log(`📨 Отправляем клиенту топ ${sorted.length} игроков`);
    console.log(`=============================================\n`);
    
    res.json(sorted);
    
  } catch (error) {
    console.log('❌ КРИТИЧЕСКАЯ ОШИБКА обновления рейтинга:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Очистка старых данных (опционально)
app.delete('/api/cleanup', (req, res) => {
  try {
    const oldData = globalRating.length;
    const cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 дней
    
    globalRating = globalRating.filter(player => {
      return new Date(player.lastUpdated) > cutoffDate;
    });
    
    saveRatingData(globalRating);
    
    console.log(`🧹 Очистка: было ${oldData}, стало ${globalRating.length}`);
    res.json({ cleaned: oldData - globalRating.length, remaining: globalRating.length });
  } catch (error) {
    console.log('❌ Ошибка очистки:', error);
    res.status(500).json({ error: 'Cleanup error' });
  }
});

// Статус сервера с детальной информацией
app.get('/', (req, res) => {
  const topPlayers = globalRating
    .sort((a, b) => {
      if (b.level !== a.level) return b.level - a.level;
      return b.experience - a.experience;
    })
    .slice(0, 5);
    
  res.json({ 
    status: 'Cherryty Rating Server is running!',
    players: globalRating.length,
    version: '2.0',
    lastUpdate: new Date().toISOString(),
    topPlayers: topPlayers.map(p => ({
      name: p.playerNickname,
      level: p.level,
      experience: p.experience
    })),
    storage: {
      file: DATA_FILE,
      exists: fs.existsSync(DATA_FILE),
      size: fs.existsSync(DATA_FILE) ? fs.statSync(DATA_FILE).size : 0
    }
  });
});

// Эндпоинт для отладки - получить все данные
app.get('/api/debug', (req, res) => {
  res.json({
    totalPlayers: globalRating.length,
    allPlayers: globalRating,
    fileInfo: {
      path: DATA_FILE,
      exists: fs.existsSync(DATA_FILE),
      lastModified: fs.existsSync(DATA_FILE) ? fs.statSync(DATA_FILE).mtime : null
    }
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🎯 Cherryty rating server v2.0 running on port ${PORT}`);
  console.log(`💾 Хранилище: ${DATA_FILE}`);
  console.log(`🛡️  Авто-сохранение: каждые 30 секунд`);
  console.log(`📊 Загружено игроков: ${globalRating.length}`);
});
