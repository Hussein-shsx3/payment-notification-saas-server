import { createHash } from 'crypto';
import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { User, PaymentNotification, Notification } from '../models';
import { AuthRequest } from '../types';
import { BadRequestError } from '../utils/errors';

export const createPaymentNotification = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { source, title, message, receivedAt, amount, currency, transactionId, direction } = req.body;
    if (!source || !title || !message) {
      next(new BadRequestError('source, title and message are required'));
      return;
    }
    let parsedAmount: number | null = null;
    if (amount !== undefined && amount !== null && amount !== '') {
      const n = Number(amount);
      if (Number.isFinite(n) && n > 0) parsedAmount = n;
    }

    const received = receivedAt ? new Date(receivedAt) : new Date();
    const user = await User.findById(req.userId).select('_id').lean();
    if (!user) {
      res.status(201).json({ success: true, data: null });
      return;
    }

    const txId = transactionId ? String(transactionId).trim().toLowerCase() : '';
    if (txId) {
      const existing = await PaymentNotification.findOne({ userId: req.userId, transactionId: txId });
      if (existing) {
        res.status(201).json({ success: true, data: existing });
        return;
      }
    }

    const contentHash = _computePaymentContentHash({
      userId: String(req.userId),
      source: String(source),
      message: String(message),
      amount: parsedAmount,
      transactionId: txId || undefined,
      receivedAt: received,
    });
    const existingByContent = await PaymentNotification.findOne({
      userId: req.userId,
      contentHash,
    });
    if (existingByContent) {
      res.status(201).json({ success: true, data: existingByContent });
      return;
    }

    const dir =
      direction === 'outgoing' || direction === 'incoming' || direction === 'unknown'
        ? direction
        : 'unknown';

    const doc = await PaymentNotification.create({
      userId: req.userId,
      source,
      title,
      message,
      direction: dir,
      ...(parsedAmount != null ? { amount: parsedAmount } : {}),
      currency,
      transactionId: txId ? txId : undefined,
      contentHash,
      receivedAt: received,
    });

    res.status(201).json({ success: true, data: doc });
    return;
  } catch (e) {
    next(e);
  }
};

const _amountRegex = new RegExp(
  String.raw`(?<!\d)(\d{1,3}(?:[,\s]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(USD|US\$|ILS|NIS|JOD|JDS|\$|₪|شيكل|شيقل|دولار)?`,
  'i'
);
const _amountAfterMablagRegex = new RegExp(
  String.raw`مبلغ[\s:]*(\d{1,3}(?:[,\s]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)`,
  'i'
);
/** BOP / mobile banking: "بمبلغ 55.00 ILS" */
const _amountAfterBimablagRegex = new RegExp(
  String.raw`بمبلغ[\s:]*(\d{1,3}(?:[,\s]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)`,
  'i'
);
const _transactionIdRegex = new RegExp(
  String.raw`(?:tx(?:n)?|transaction|ref|reference|رقم العملية|رقم المرجع)[\s:#-]*([A-Za-z0-9\-]{4,})`,
  'i'
);
const _senderRegex = new RegExp(
  String.raw`(?:from|sender|from account|مرسل|من)[\s:]*([A-Za-z0-9 _\-]{3,30})`,
  'i'
);

function _containsAny(input: string, terms: string[]): boolean {
  const lower = input.toLowerCase();
  for (const t of terms) {
    if (lower.includes(t.toLowerCase())) return true;
  }
  return false;
}

/** Only internal moves between the user's own accounts — not "new" money from outside. */
function _isInternalAccountTransferOnly(combinedLower: string): boolean {
  const t = combinedLower;
  if (t.includes('بين الحسابات') || t.includes('between accounts')) return true;
  if (t.includes('تحويل بنكي بين الحسابات') || t.includes('تحويل بين الحسابات')) return true;
  return false;
}

/** Card movement alerts (e.g. "حركة على بطاقة رقم … بقيمة") — not stored. */
function _isCardMovementExcluded(combinedLower: string): boolean {
  return combinedLower.includes('حركة على بطاقة');
}

function _normalizeForFingerprint(message: string): string {
  return _normalizeDigits(message).replace(/\s+/g, ' ').trim();
}

function _computePaymentContentHash(params: {
  userId: string;
  source: string;
  message: string;
  amount: number | null | undefined;
  transactionId?: string;
  /** Disambiguates two identical-looking transfers in the same minute (Issue 3). */
  receivedAt: Date;
}): string {
  const tx = (params.transactionId || '').trim().toLowerCase();
  if (tx) return `tx:${tx}`;
  const norm = _normalizeForFingerprint(params.message);
  const minuteBucket = Math.floor(params.receivedAt.getTime() / 60000);
  const amt =
    params.amount != null && Number.isFinite(params.amount) && params.amount > 0
      ? String(params.amount)
      : 'na';
  return createHash('sha256')
    .update(`${params.userId}|${params.source}|${norm}|${amt}|${minuteBucket}`, 'utf8')
    .digest('hex');
}

function _inferPaymentDirection(fullTextLower: string): 'incoming' | 'outgoing' | 'unknown' {
  const sent = _isSentPayment(fullTextLower);
  const inc = _isIncomingIndicators(fullTextLower);
  if (sent && inc) return 'unknown';
  if (sent) return 'outgoing';
  if (inc) return 'incoming';
  return 'unknown';
}

function _normalizeDigits(input: string): string {
  const arabicIndic = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  const easternArabicIndic = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  let out = input;
  for (let i = 0; i < 10; i++) {
    out = out.split(arabicIndic[i]).join(String(i));
    out = out.split(easternArabicIndic[i]).join(String(i));
  }
  return out;
}

function _parseAmount(raw?: string): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let normalized = trimmed.split(' ').join('');

  if (normalized.includes(',') && normalized.includes('.')) {
    if (normalized.lastIndexOf(',') > normalized.lastIndexOf('.')) {
      normalized = normalized.split('.').join('').split(',').join('.');
    } else {
      normalized = normalized.split(',').join('');
    }
  } else if (normalized.includes(',')) {
    const parts = normalized.split(',');
    if (parts.length > 2) {
      normalized = normalized.split(',').join('');
    } else {
      const decimalPart = parts[parts.length - 1];
      normalized =
        decimalPart.length <= 2 ? normalized.split(',').join('.') : normalized.split(',').join('');
    }
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function _detectSource(packageNameLower: string, titleLower: string, messageLower: string, input: string): string | null {
  // Direct app detection
  if (_containsAny(input, ['palpay', 'pal pay', 'بال باي', 'بالباي'])) return 'PalPay';
  if (_containsAny(input, ['jawwal', 'jawwalpay', 'jawwal pay', 'جوال باي', 'جوال'])) return 'Jawwal Pay';
  if (
    _containsAny(input, [
      'palestine bank',
      'bank of palestine',
      'bop',
      'بنك فلسطين',
      'تحويل بنكي',
      'تحويل لصديق',
      'bankofpalestine',
    ])
  ) {
    return 'Palestine Bank';
  }

  const isSmsApp = _containsAny(packageNameLower, [
    'com.google.android.apps.messaging',
    'com.samsung.android.messaging',
    'com.android.mms',
    'com.android.messaging',
    'com.miui.mms',
    'com.huawei.message',
    'com.oneplus.mms',
    'com.coloros.mms',
  ]);

  // Check for Iburaq transfer via SMS
  if (isSmsApp && _containsAny(input, ['iburaq', 'ايبرق', 'البراق'])) {
    return 'Iburaq';
  }

  // Check for bank/payment SMS
  const hasBankHint = _containsAny(`${titleLower} ${messageLower}`, [
    'bank',
    'bop',
    'palestine bank',
    'bank of palestine',
    'bankofpalestine',
    'palpay',
    'jawwal',
    'بنك',
    'فلسطين',
    'مبلغ',
    'حساب',
    'حسابك',
    'رصيد',
    'تحويل',
    'تحويل بنكي',
    'تحويل لصديق',
    'دفعة',
    'ايداع',
    'إيداع',
    'استلام',
    'استقبال',
    'حوالة',
    'استلام',
    'عملية',
    'إشعار',
    'received',
    'credited',
    'deposit',
  ]);

  if (isSmsApp && hasBankHint) return 'SMS Payment';
  return null;
}

/** Stronger cues for money-in (used with sent cues to disambiguate). */
function _isIncomingIndicators(input: string): boolean {
  return _containsAny(input, [
    'received',
    'credited',
    'deposited',
    'you received',
    'payment received',
    'transfer received',
    'incoming',
    'you got',
    'account credited',
    'credit alert',
    'cash in',
    'تم استلام',
    'تم ايداع',
    'تم إيداع',
    'استلمت',
    'وصلك',
    'تم تحويل لك',
    'تم الايداع',
    'تم الإيداع',
    'وردت',
    'تم استقبال',
    'حوالة واردة',
    'حوالة واردة لحسابك',
    'واردة لحسابك',
    'واردة الى حسابك',
    'واردة إلى حسابك',
    'تمت إضافة',
    'تم اضافه',
    'اضافة الى حسابك',
    'إضافة إلى حسابك',
    'تم اضافة',
    'تم إضافة',
    'إشعار إيداع',
    'اشعار ايداع',
    '- wallet',
    'wallet',
    'محفظة',
    'وارد',
    'واردة',
    'للمحفظة',
    'إلى محفظتك',
    'تحويل بنكي',
  ]);
}

function _isSentPayment(input: string): boolean {
  return _containsAny(input, [
    // English - sent/outgoing
    'you sent',
    'you transferred',
    'you paid',
    'sent to',
    'payment to',
    'transfer to',
    'paid to',
    'outgoing transfer',
    'money sent',
    'transaction sent',
    'deducted for',
    'debited for',
    'debited',
    'withdrawal',
    'cash out',
    // Arabic - sent/outgoing
    'تم ارسال',
    'ارسلت',
    'قمت بارسال',
    'تم الدفع لـ',
    'تم الدفع إلى',
    'تم الدفع ل',
    'دفعت',
    'تم خصم لـ',
    'تم التحويل الى',
    'تم التحويل إلى',
    'حولت',
    'ارسال الى',
    'إرسال إلى',
    'حوالة صادرة',
    'صادرة من حسابك',
    'تم سحب',
    'سحب',
    'شراء',
  ]);
}

function _isFalsePositive(input: string): boolean {
  return _containsAny(input, [
    'otp',
    'one-time password',
    'verification code',
    'verify',
    'confirm code',
    'activation code',
    'security code',
    'password reset',
    'login code',
    'رمز التحقق',
    'رمز التأكيد',
    'code:',
    'two-factor',
    'authenticator',
    'signed in from',
    'new device',
  ]);
}

/** Non-bank notifications that often contain digits (games, social, weather). */
/** e.g. "موبايل: تحويل بنكي: … بمبلغ 55.00 ILS" — bank app may use OEM-specific package id. */
function _isPalestineBankTransferLine(fullTextLower: string): boolean {
  return (
    fullTextLower.includes('تحويل بنكي') &&
    (fullTextLower.includes('بمبلغ') || fullTextLower.includes('مبلغ'))
  );
}

function _isLikelyNonPaymentJunk(input: string): boolean {
  const lower = input.toLowerCase();
  return _containsAny(lower, [
    'steps',
    'calories',
    'followers',
    'likes',
    'views',
    'score',
    'level ',
    'weather',
    'youtube',
    'tiktok',
    'instagram',
    'delivery',
    'tracking',
    'promo code',
    'خصم',
    'عرض',
    'طقس',
    'متابع',
    'لعبة',
    'نقاط',
  ]);
}

function _isKnownPaymentAppPackage(packageLower: string): boolean {
  return _containsAny(packageLower, [
    'palpay',
    'com.palpay',
    'net.palpay',
    'ps.palpay',
    'jawwal',
    'jawwalpay',
    'ps.jawwal',
    'com.jawwal',
    'bankofpalestine',
    'bop',
    'com.bop',
    'bop.mobile',
    'bop.ps',
    'ps.bop',
    'albop',
    'efinance',
    'palestinebank',
    'palestine.bank',
    'cash.pal',
    'wallet.ps',
  ]);
}

function _isSmsAppPackage(packageLower: string): boolean {
  return _containsAny(packageLower, [
    'messaging',
    'mms',
    'sms',
    'message',
    'miui.mms',
    'huawei.message',
    'oneplus.mms',
    'coloros.mms',
  ]);
}

/** Strong money cues — aligned with Android [shouldRoughlyLookLikePayment] / SMS+bank path. */
function _hasStrongPaymentSignal(fullTextLower: string): boolean {
  return _containsAny(fullTextLower, [
    'received',
    'credited',
    'deposited',
    'payment received',
    'transfer received',
    'you received',
    'account credited',
    'credit alert',
    'cash in',
    'you sent',
    'you transferred',
    'you paid',
    'sent to',
    'payment to',
    'transfer to',
    'paid to',
    'outgoing transfer',
    'money sent',
    'transaction sent',
    'deducted',
    'debited',
    'withdrawal',
    'cash out',
    'تم استلام',
    'تم ايداع',
    'تم إيداع',
    'استلمت',
    'وصلك',
    'وردت',
    'تم استقبال',
    'حوالة واردة',
    'واردة لحسابك',
    'واردة الى حسابك',
    'واردة إلى حسابك',
    'تم تحويل لك',
    'تم الايداع',
    'تم الإيداع',
    'تمت إضافة',
    'تم اضافه',
    'اضافة الى حسابك',
    'إضافة إلى حسابك',
    'تم اضافة',
    'تم إضافة',
    'إشعار إيداع',
    'اشعار ايداع',
    'تم ارسال',
    'ارسلت',
    'تم الدفع لـ',
    'تم الدفع إلى',
    'تم الدفع ل',
    'دفعت',
    'تم خصم',
    'تم التحويل الى',
    'تم التحويل إلى',
    'حولت',
    'حوالة صادرة',
    'صادرة من حسابك',
    'تم سحب',
    'شراء',
    'تحويل بنكي',
    'تحويل دفع لصديق',
    'عملية ناجحة',
    'إشعار عملية',
    'اشعار عملية',
    'عملية مالية',
    'تم بنجاح',
    'بنجاح',
    'تمت العملية',
    'دفعة',
    'إيداع',
    'ايداع',
    'حسابك',
    'لحسابك',
    'بمبلغ',
    'مبلغ',
    'رصيد',
    'شيكل',
    'شيقل',
    'نيس',
    'payment',
    'transfer',
    'deposit',
    'wallet',
    'محفظة',
  ]);
}

function _hasBankOperationHints(fullTextLower: string): boolean {
  return _containsAny(fullTextLower, [
    'تحويل بنكي',
    'بنك فلسطين',
    'شيكل',
    'شيقل',
    'نيس',
    '₪',
    'ils',
    'nis',
    'jod',
    'usd',
  ]);
}

function _isExcludedPackage(packageNameLower: string): boolean {
  return _containsAny(packageNameLower, [
    'com.whatsapp',
    'org.telegram',
    'com.facebook.orca',
    'com.facebook.katana',
    'com.instagram.android',
    'com.snapchat.android',
    'com.google.android.gm',
    'com.linkedin.android',
  ]);
}

function _inferSourceFallback(packageNameLower: string, messageLower: string): string {
  if (_containsAny(packageNameLower, ['palpay'])) return 'PalPay';
  if (_containsAny(packageNameLower, ['jawwal', 'jawwalpay'])) return 'Jawwal Pay';
  if (_containsAny(packageNameLower, ['bank', 'bop', 'palestine', 'bankofpalestine', 'bop.mobile'])) {
    return 'Palestine Bank';
  }

  const isSmsApp = _containsAny(packageNameLower, [
    'com.google.android.apps.messaging',
    'com.samsung.android.messaging',
    'com.android.mms',
    'com.android.messaging',
    'com.miui.mms',
    'com.huawei.message',
    'com.oneplus.mms',
    'com.coloros.mms',
  ]);
  if (isSmsApp && _containsAny(messageLower, ['iburaq', 'ايبرق', 'البراق'])) return 'Iburaq';
  if (isSmsApp) return 'SMS Payment';
  return 'Other';
}

function _parseAndroidPaymentNotification(params: {
  packageName: string;
  title: string;
  message: string;
  receivedAt: Date;
}): {
  source: string;
  title: string;
  message: string;
  amount: number | null;
  currency?: string;
  transactionId?: string;
  direction: 'incoming' | 'outgoing' | 'unknown';
} | null {
  const packageLower = (params.packageName || '').toLowerCase();
  const messageNormalized = _normalizeDigits(params.message || '');
  const titleLower = _normalizeDigits(params.title || '').toLowerCase();
  const messageLower = messageNormalized.toLowerCase();
  const haystack = `${packageLower} ${titleLower} ${messageLower}`;
  const combinedNormalized = _normalizeDigits(`${params.title || ''}\n${params.message || ''}`);

  if (_isExcludedPackage(packageLower)) return null;
  if (_isFalsePositive(haystack)) return null;
  if (_isLikelyNonPaymentJunk(haystack)) return null;

  const combinedLower = combinedNormalized.toLowerCase();
  if (_isInternalAccountTransferOnly(combinedLower)) return null;
  if (_isCardMovementExcluded(combinedLower)) return null;

  const fullText = `${titleLower} ${messageLower}`;
  const fullTextLower = fullText;

  const knownPayment = _isKnownPaymentAppPackage(packageLower);
  const smsPkg = _isSmsAppPackage(packageLower);
  const strong = _hasStrongPaymentSignal(fullTextLower);
  const bankOpHints = _hasBankOperationHints(fullTextLower);
  const bankKw =
    fullTextLower.includes('bank') ||
    fullTextLower.includes('بنك') ||
    fullTextLower.includes('bop') ||
    fullTextLower.includes('palestine') ||
    fullTextLower.includes('فلسطين') ||
    fullTextLower.includes('jawwal') ||
    fullTextLower.includes('palpay') ||
    fullTextLower.includes('جوال') ||
    fullTextLower.includes('بالباي') ||
    fullTextLower.includes('بال باي') ||
    fullTextLower.includes('ايبرق');
  const iburaq = _containsAny(haystack, ['iburaq', 'ايبرق', 'البراق']);

  if (knownPayment) {
    if (!strong && !bankOpHints) return null;
  } else if (smsPkg && iburaq && strong) {
    // Iburaq SMS rail
  } else if (smsPkg && bankKw && strong) {
    // Generic bank SMS
  } else if (_isPalestineBankTransferLine(fullTextLower) && (strong || bankOpHints)) {
    // BOP mobile template; package name may not match known substrings on some devices
  } else {
    return null;
  }

  const direction = _inferPaymentDirection(fullText);

  let amountMatch = _amountRegex.exec(combinedNormalized) ?? _amountRegex.exec(messageNormalized);
  if (!amountMatch) {
    amountMatch = _amountAfterMablagRegex.exec(combinedNormalized) ?? _amountAfterMablagRegex.exec(messageNormalized);
  }
  if (!amountMatch) {
    amountMatch =
      _amountAfterBimablagRegex.exec(combinedNormalized) ?? _amountAfterBimablagRegex.exec(messageNormalized);
  }
  const parsedAmt = amountMatch ? _parseAmount(amountMatch[1]) : null;
  const resolvedAmount =
    parsedAmt != null && Number.isFinite(parsedAmt) && parsedAmt > 0 ? parsedAmt : null;

  const source =
    _detectSource(packageLower, titleLower, messageLower, haystack) ||
    _inferSourceFallback(packageLower, messageLower);

  let currency: string | undefined;
  if (resolvedAmount != null && amountMatch && amountMatch[2]) {
    const c = amountMatch[2].toUpperCase();
    if (c === '$' || c === 'US$') currency = 'USD';
    else if (c === 'JDS') currency = 'JOD';
    else currency = c;
  }

  const txMatch = _transactionIdRegex.exec(combinedNormalized) ?? _transactionIdRegex.exec(messageNormalized);
  const transactionId = txMatch?.[1];

  return {
    source,
    title: params.title,
    message: messageNormalized,
    amount: resolvedAmount,
    currency,
    transactionId: transactionId || undefined,
    direction,
  };
}

export const capturePaymentNotificationFromAndroid = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { packageName, title, message, receivedAt, notificationKey: notificationKeyRaw } = req.body ?? {};
    const pkg = String(packageName ?? '').trim();
    const titleStr = String(title ?? '').trim();
    const messageStr = String(message ?? '').trim();
    // Banks/wallets often put all text in title OR body only — require package + at least one non-empty line.
    if (!pkg || (!titleStr && !messageStr)) {
      res.status(200).json({ success: false, reason: 'Missing fields' });
      return;
    }

    const received = receivedAt ? new Date(receivedAt) : new Date();
    const notificationKey =
      typeof notificationKeyRaw === 'string' && notificationKeyRaw.trim().length > 0
        ? notificationKeyRaw.trim().slice(0, 512)
        : '';

    const parsed = _parseAndroidPaymentNotification({
      packageName: pkg,
      title: titleStr,
      message: messageStr,
      receivedAt: received,
    });

    if (!parsed) {
      res.status(200).json({ success: true, data: null, reason: 'Not a payment' });
      return;
    }

    const user = await User.findById(req.userId).select('_id').lean();
    if (!user) {
      res.status(201).json({ success: true, data: null });
      return;
    }

    if (notificationKey) {
      const existingByKey = await PaymentNotification.findOne({
        userId: req.userId,
        notificationKey,
      }).lean();
      if (existingByKey) {
        res.status(201).json({ success: true, data: existingByKey });
        return;
      }
    }

    const txId = parsed.transactionId ? String(parsed.transactionId).trim().toLowerCase() : '';

    if (txId) {
      const existing = await PaymentNotification.findOne({ userId: req.userId, transactionId: txId });
      if (existing) {
        res.status(201).json({ success: true, data: existing });
        return;
      }
    }

    const contentHash = _computePaymentContentHash({
      userId: String(req.userId),
      source: parsed.source,
      message: parsed.message,
      amount: parsed.amount,
      transactionId: txId || undefined,
      receivedAt: received,
    });
    const existingByContent = await PaymentNotification.findOne({
      userId: req.userId,
      contentHash,
    });
    if (existingByContent) {
      res.status(201).json({ success: true, data: existingByContent });
      return;
    }

    const created = await PaymentNotification.create({
      userId: req.userId,
      source: parsed.source,
      title: parsed.title,
      message: parsed.message,
      direction: parsed.direction,
      ...(parsed.amount != null ? { amount: parsed.amount } : {}),
      currency: parsed.currency,
      transactionId: txId || undefined,
      contentHash,
      ...(notificationKey ? { notificationKey } : {}),
      receivedAt: received,
    });

    res.status(201).json({ success: true, data: created });
    return;
  } catch (e) {
    next(e);
  }
};

export const getPaymentStats = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = new mongoose.Types.ObjectId(req.userId);
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [lastPayment, agg, daily] = await Promise.all([
      PaymentNotification.findOne({ userId: req.userId }).sort({ receivedAt: -1 }).lean(),
      PaymentNotification.aggregate([
        { $match: { userId } },
        {
          $group: {
            _id: null,
            totalAmount: { $sum: { $ifNull: ['$amount', 0] } },
            count: { $sum: 1 },
            incoming: { $sum: { $cond: [{ $eq: ['$direction', 'incoming'] }, 1, 0] } },
            outgoing: { $sum: { $cond: [{ $eq: ['$direction', 'outgoing'] }, 1, 0] } },
            unknown: { $sum: { $cond: [{ $eq: ['$direction', 'unknown'] }, 1, 0] } },
          },
        },
      ]),
      PaymentNotification.aggregate([
        {
          $match: {
            userId,
            receivedAt: { $gte: thirtyDaysAgo },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$receivedAt' } },
            count: { $sum: 1 },
            sum: { $sum: { $ifNull: ['$amount', 0] } },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    const g = agg[0] as
      | {
          totalAmount: number;
          count: number;
          incoming: number;
          outgoing: number;
          unknown: number;
        }
      | undefined;

    res.json({
      success: true,
      data: {
        lastPayment,
        totalCount: g?.count ?? 0,
        totalAmount: g?.totalAmount ?? 0,
        incomingCount: g?.incoming ?? 0,
        outgoingCount: g?.outgoing ?? 0,
        unknownCount: g?.unknown ?? 0,
        dailyLast30Days: daily.map((d) => ({
          date: d._id as string,
          count: d.count as number,
          sum: d.sum as number,
        })),
      },
    });
  } catch (e) {
    next(e);
  }
};

export const getPaymentNotifications = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit), 10) || 20));
    const skip = (page - 1) * limit;
    const filter: Record<string, unknown> = { userId: req.userId };

    const fromStr = String(req.query.from || '').trim();
    const toStr = String(req.query.to || '').trim();
    if (fromStr || toStr) {
      filter.receivedAt = {};
      if (fromStr) {
        const from = new Date(fromStr);
        if (!isNaN(from.getTime())) (filter.receivedAt as Record<string, Date>).$gte = from;
      }
      if (toStr) {
        const to = new Date(toStr);
        if (!isNaN(to.getTime())) (filter.receivedAt as Record<string, Date>).$lte = to;
      }
    }

    const exportAll = String(req.query.export ?? '').toLowerCase() === 'true';
    if (exportAll) {
      const data = await PaymentNotification.find(filter).sort({ receivedAt: -1 }).limit(5000).lean();
      const total = data.length;
      res.json({
        success: true,
        data: {
          data,
          total,
          page: 1,
          limit: total,
          totalPages: 1,
        },
      });
      return;
    }

    const [data, total] = await Promise.all([
      PaymentNotification.find(filter)
        .sort({ receivedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      PaymentNotification.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: {
        data,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (e) {
    next(e);
  }
};

export const deleteAllPaymentNotifications = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await PaymentNotification.deleteMany({ userId: req.userId });
    res.json({
      success: true,
      data: {
        deletedCount: result.deletedCount ?? 0,
      },
    });
  } catch (e) {
    next(e);
  }
};

export const deletePaymentNotification = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const deleted = await PaymentNotification.findOneAndDelete({
      _id: id,
      userId: req.userId,
    });
    if (!deleted) {
      next(new BadRequestError('Payment notification not found'));
      return;
    }
    res.json({ success: true, data: { deleted: true } });
  } catch (e) {
    next(e);
  }
};

export const updatePaymentNotificationDirection = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const { direction } = req.body ?? {};
    if (direction !== 'incoming' && direction !== 'outgoing' && direction !== 'unknown') {
      next(new BadRequestError('direction must be incoming, outgoing, or unknown'));
      return;
    }
    const updated = await PaymentNotification.findOneAndUpdate(
      { _id: id, userId: req.userId },
      { $set: { direction } },
      { new: true }
    ).lean();
    if (!updated) {
      next(new BadRequestError('Payment notification not found'));
      return;
    }
    res.json({ success: true, data: updated });
  } catch (e) {
    next(e);
  }
};

export const getNotifications = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit), 10) || 20));
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      Notification.find({ userId: req.userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Notification.countDocuments({ userId: req.userId }),
    ]);

    res.json({
      success: true,
      data: {
        data,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (e) {
    next(e);
  }
};

export const markAsRead = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const updated = await Notification.findOneAndUpdate(
      { _id: id, userId: req.userId },
      { isRead: true },
      { new: true }
    );
    if (!updated) {
      next(new BadRequestError('Notification not found'));
      return;
    }
    res.json({ success: true, data: updated });
  } catch (e) {
    next(e);
  }
};
