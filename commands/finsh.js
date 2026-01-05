// commands/finsh.js
// أمر: .فنش
// يغير اسم المجموعة أولاً ثم يطرد كل الأعضاء عدا الأرقام المصرّح بها.
// يحفظ نسخة احتياطية من المشاركين قبل أي تغيير.

const fs = require('fs');
const path = require('path');
const { channelInfo } = require('../lib/messageConfig') || {}; // استخدم إذا موجود
const isAdmin = require('../lib/isAdmin');

function cleanNumber(num) {
  return ('' + num).replace(/\D/g, '');
}

async function finshCommand(sock, chatId, message) {
  try {
    if (!chatId || !chatId.endsWith('@g.us')) {
      await sock.sendMessage(chatId, { text: 'هذا الأمر يعمل داخل المجموعات فقط.' }, { quoted: message }).catch(()=>{});
      return;
    }

    const senderId = message.key.participant || message.key.remoteJid;
    console.log('DEBUG senderId:', senderId);

    const senderNum = senderId
      .replace(/@.+/, '')
      .replace(/:.+/, '')
      .replace(/\D/g, '');

    console.log('DEBUG senderNum:', senderNum);

    // الأرقام المصرح بها (بدون +، بدون مسافات)
    const allowedNumbers = [
      '212674751039',
      '212650738559'
    ];

    // تحقق من الصلاحية
    const isAllowed = allowedNumbers.some(allowedNum => {
      const cleanAllowed = cleanNumber(allowedNum);
      const cleanSender = cleanNumber(senderNum);

      // تحقق بعدة طرق:
      return cleanSender === cleanAllowed ||                     // مطابقة كاملة
             cleanAllowed.endsWith(cleanSender.slice(-9)) ||    // آخر 9 أرقام
             cleanSender.endsWith(cleanAllowed.slice(-9));      // أو العكس
    });

    if (!isAllowed) {
      await sock.sendMessage(
        chatId,
        { text: '❌ غير مسموح لزنوج باستخدام هذا الأمر.' },
        { quoted: message }
      );
      return;
    }

    console.log('DEBUG: User is allowed to use command');

    // تأكد أن البوت مشرف
    let botId = (sock.user && sock.user.id) ? (sock.user.id.split(':')[0] + '@s.whatsapp.net') : null;
    try {
      const adminCheck = await isAdmin(sock, chatId, botId);
      if (!adminCheck || !adminCheck.isBotAdmin) {
        await sock.sendMessage(chatId, { text: 'يجب أن تجعل البوت مشرفاً (Admin) قبل تنفيذ هذا الأمر.' }, { quoted: message });
        return;
      }
    } catch (e) {
      // في حال isAdmin يرمى استثناء، نظهر تحذيراً لكن نحاول المتابعة بحذر
      console.error('isAdmin check failed:', e);
      await sock.sendMessage(chatId, { text: '⚠️ تحقق من صلاحيات البوت يدوياً.' }, { quoted: message });
      return;
    }

    // جلب بيانات المجموعة والمشاركين
    const metadata = await sock.groupMetadata(chatId);
    const participants = metadata?.participants || [];

    // حفظ نسخة احتياطية من المشاركين (يمكنك استخدامها لاستعادة لاحقاً)
    try {
      const backupDir = path.join(process.cwd(), 'tmp');
      if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
      const backupPath = path.join(backupDir, `finsh_backup_${chatId.replace('@','_')}_${Date.now()}.json`);
      fs.writeFileSync(backupPath, JSON.stringify({ 
        subject: metadata.subject, 
        participants,
        date: new Date().toISOString(),
        chatId: chatId
      }, null, 2));
      await sock.sendMessage(chatId, { text: `✅ تم أخذ نسخة احتياطية العبيد.\n📁 المسار: ${backupPath}` }, { quoted: message });
    } catch (err) {
      console.error('Backup failed:', err);
      await sock.sendMessage(chatId, { text: '⚠️ فشل حفظ النسخة الاحتياطية لكن سأستمر.' }, { quoted: message });
    }

    // تغيير اسم المجموعة أولاً
    const newSubject = 'ملك┊ᵝ𝑟𝗈𝓀┊セ';
    try {
      await sock.groupUpdateSubject(chatId, newSubject);
      await sock.sendMessage(chatId, { text: `✅ تم تغيير اسم المجموعة إلى:\n${newSubject}` });
      // اترك وقتاً بسيطاً قبل الطرد ليأخذ التغيير مفعوله
      await new Promise(res => setTimeout(res, 2000));
    } catch (err) {
      console.error('Failed to change subject:', err);
      await sock.sendMessage(chatId, { text: '⚠️ فشل تغيير اسم المجموعة (تأكد من أن البوت مشرف وله صلاحية تغيير عنوان المجموعة).\nسأستمر في عملية الطرد.' });
    }

    await sock.sendMessage(chatId, { text: '⏳ جاري طرد الزنوج... سيتم الاحتفاظ بالأرقام المصرّح بها فقط.' }, { quoted: message });

    // تحضير قائمة المصرح لهم (بدون 212)
    const allowedWithoutPrefix = allowedNumbers.map(num => num.replace(/^212/, ''));

    // حلق الطرد: استبعاد المصرّح لهم والـ bot نفسه
    let removedCount = 0;
    let errorCount = 0;

    for (const p of participants) {
      // استخراج jid
      const jid = (typeof p === 'string') ? p : (p.id || p.jid || p.participant || '');
      if (!jid) continue;

      // استخراج الرقم
      const part = ('' + (jid || '')).split(':')[0].split('@')[0];
      const partClean = cleanNumber(part);
      const partWithoutPrefix = partClean.replace(/^212/, '');

      // تخطي المصرح لهم
      if (allowedNumbers.includes(partClean) || 
          allowedWithoutPrefix.includes(partWithoutPrefix) ||
          allowedNumbers.some(num => num.endsWith(partWithoutPrefix))) {
        console.log(`Skipping allowed user: ${partClean}`);
        continue;
      }

      // تخطي البوت نفسه
      if (jid === botId || (botId && jid.includes(botId.split('@')[0]))) {
        console.log(`Skipping bot: ${jid}`);
        continue;
      }

      try {
        await sock.groupParticipantsUpdate(chatId, [jid], 'remove');
        removedCount++;
        console.log(`Removed: ${partClean}`);

        // تأخير لتفادي حدود الخدمة
        await new Promise(res => setTimeout(res, 1500));
      } catch (err) {
        console.error(`Failed to remove ${jid}:`, err.message);
        errorCount++;
        // انتظر أطول إذا فشل ثم استمر
        await new Promise(res => setTimeout(res, 2500));
      }
    }

    await sock.sendMessage(chatId, { 
      text: `✅ اكتمل تنفيذ الأمر.\n📊 النتائج:\n• تم طرد: ${removedCount} عضو\n• فشل في طرد: ${errorCount} عضو\n• تم الاحتفاظ بالأرقام المصرح بها.`
    }, { quoted: message });

  } catch (error) {
    console.error('Error in finshCommand:', error);
    try { 
      await sock.sendMessage(chatId, { 
        text: `❌ حدث خطأ أثناء تنفيذ الأمر:\n${error.message}` 
      }, { quoted: message }); 
    } catch {}
  }
}

module.exports = finshCommand;