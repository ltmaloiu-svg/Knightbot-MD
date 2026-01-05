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
const senderNum = senderId
  .replace(/@.+/, '')   // يحذف @s.whatsapp.net
  .replace(/:.+/, '')   // يحذف أي :device
  .replace(/\D/g, '');  // يحذف أي شيء غير رقم

    // القائمة المصرّح لهم بالاستدعاء (ضع الأرقام بدون + أو مسافات)
    const allowedNumbers = [
      '212650738559',
      '212674751039'
    ];

    if (!allowedNumbers.includes(senderNum)) {
      await sock.sendMessage(chatId, { text: '✋ أنت غير مخوّل لاستخدام هذا الأمر.' }, { quoted: message });
      return;
    }

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
    }

    // جلب بيانات المجموعة والمشاركين
    const metadata = await sock.groupMetadata(chatId);
    const participants = metadata?.participants || [];

    // حفظ نسخة احتياطية من المشاركين (يمكنك استخدامها لاستعادة لاحقاً)
    try {
      const backupDir = path.join(process.cwd(), 'tmp');
      if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
      const backupPath = path.join(backupDir, `finsh_backup_${chatId.replace('@','_')}_${Date.now()}.json`);
      fs.writeFileSync(backupPath, JSON.stringify({ subject: metadata.subject, participants }, null, 2));
      await sock.sendMessage(chatId, { text: `✅ تم أخذ نسخة احتياطية من المشاركين.` }, { quoted: message });
    } catch (err) {
      console.error('Backup failed:', err);
      // لا نوقف التنفيذ إن فشل الحفظ
    }

    // تغيير اسم المجموعة أولاً
    const newSubject = 'ملك┊ᵝ𝑟𝗈𝓀┊セ';
    try {
      await sock.groupUpdateSubject(chatId, newSubject);
      await sock.sendMessage(chatId, { text: `✅ تم تغيير اسم المجموعة إلى: ${newSubject}` });
      // اترك وقتاً بسيطاً قبل الطرد ليأخذ التغيير مفعوله
      await new Promise(res => setTimeout(res, 2000));
    } catch (err) {
      console.error('Failed to change subject:', err);
      await sock.sendMessage(chatId, { text: '⚠️ فشل تغيير اسم المجموعة (تأكد من أن البوت مشرف وله صلاحية تغيير عنوان المجموعة).' });
      // يمكنك اختيار الإيقاف هنا إذا ترغب: return;
      // سأتابع الطرد حتى لو فشل تغيير الاسم (إزالة التعليق إذا تريد الإيقاف)
      // return;
    }

    await sock.sendMessage(chatId, { text: '⏳ جاري طرد الأعضاء... سيتم الاحتفاظ بالأرقام المصرّح بها فقط.' }, { quoted: message });

    // حلق الطرد: استبعاد المصرّح لهم والـ bot نفسه
    for (const p of participants) {
      // p قد يكون كائن participant أو jid string
      const jid = (typeof p === 'string') ? p : (p.id || p.jid || p.participant || '');
      if (!jid) continue;
      const part = ('' + (jid || '')).split(':')[0].split('@')[0];
      const partClean = cleanNumber(part);

      if (allowedNumbers.includes(partClean)) continue; // احتفظ بالمصرّح
      if (jid === botId || jid === (botId && botId.replace('@s.whatsapp.net','@lid'))) continue;

      try {
        await sock.groupParticipantsUpdate(chatId, [jid], 'remove');
        // تأخير لتفادي حدود الخدمة
        await new Promise(res => setTimeout(res, 1500));
      } catch (err) {
        console.error('Failed to remove', jid, err);
        // انتظر أطول إذا فشل ثم استمر
        await new Promise(res => setTimeout(res, 2500));
      }
    }

    await sock.sendMessage(chatId, { text: '✅ اكتمل تنفيذ الأمر.' });

  } catch (error) {
    console.error('Error in finshCommand:', error);
    try { await sock.sendMessage(chatId, { text: '❌ حدث خطأ أثناء تنفيذ الأمر.' }, { quoted: message }); } catch {}
  }
}

module.exports = finshCommand;