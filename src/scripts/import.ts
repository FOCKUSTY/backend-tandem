import fs from 'fs';
import bcrypt from 'bcryptjs';
import prisma from '../prisma/index.js';

const data = JSON.parse(fs.readFileSync('result.json', 'utf-8'));

const topicMap: Record<number, string> = {};
let currentTopicId: number | null = null;

for (const msg of data.messages) {
  if (msg.type === 'service' && msg.action === 'topic_created') {
    const topicMsgId = msg.id;
    const topicTitle = msg.title;
    const sectionMap: Record<string, string> = {
      'Правила': 'rules',
      'Важные даты': 'dates',
      'Планы': 'plans',
      'Замечания': 'notes',
      'Вопросы': 'questions',
      'Связь': 'contacts',
      'Определения': 'definitions',
      'Дискасы': 'discasses',
      'Фанфик от Наты': 'fanfics',
      'Навигация': 'navigation'
    };
    const section = sectionMap[topicTitle];
    if (section) {
      topicMap[topicMsgId] = section;
    }
  }
}

async function importData() {
  const existing = await prisma.user.findMany();
  let user: any;
  if (existing.length === 0) {
    const hash1 = await bcrypt.hash('password1', 10);
    const hash2 = await bcrypt.hash('password2', 10);
    await prisma.user.createMany({
      data: [
        { username: 'fockusty', password: hash1, name: 'FOCKUSTY' },
        { username: 'alina', password: hash2, name: 'Шиза ❤️' }
      ]
    });
    user = await prisma.user.findUnique({ where: { username: 'fockusty' } });
  } else {
    user = existing[0];
  }

  for (const msg of data.messages) {
    let section = null;
    if (msg.reply_to_message_id && topicMap[msg.reply_to_message_id]) {
      section = topicMap[msg.reply_to_message_id];
    }
    if (msg.type === 'service' && msg.action === 'topic_created') continue;
    if (!section) continue;

    let content = '';
    if (msg.text_entities) {
      for (const entity of msg.text_entities) {
        if (entity.type === 'plain') content += entity.text;
        else if (entity.type === 'blockquote') content += '> ' + entity.text + '\n';
        else if (entity.type === 'text_link') content += `[${entity.text}](${entity.href})`;
        else if (entity.type === 'italic') content += `*${entity.text}*`;
        else if (entity.type === 'bold') content += `**${entity.text}**`;
        else if (entity.type === 'strikethrough') content += `~~${entity.text}~~`;
        else content += entity.text || '';
      }
    } else if (msg.text) {
      content = typeof msg.text === 'string' ? msg.text : msg.text.map((t: any) => t.text || '').join('');
    }

    if (!content) continue;

    let dateEvent = null;
    if (section === 'dates') {
      const dateMatch = content.match(/^(\d{1,2}\s\w+\s\d{4})/);
      if (dateMatch) {
        const dateStr = dateMatch[1];
        const parsed = new Date(dateStr);
        if (!isNaN(parsed.getTime())) {
          dateEvent = parsed;
          content = content.replace(dateMatch[0], '').trim();
        }
      }
    }

    await prisma.record.create({
      data: {
        userId: user.id,
        section,
        content: content.trim(),
        dateEvent,
      }
    });
  }
  console.log('Импорт завершён!');
}

importData()
  .catch(console.error)
  .finally(() => prisma.$disconnect());