import { Request, Response, NextFunction } from 'express';
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
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      next(new BadRequestError('Valid payment amount is required'));
      return;
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

    const dir =
      direction === 'outgoing' || direction === 'incoming' ? direction : 'incoming';

    const doc = await PaymentNotification.create({
      userId: req.userId,
      source,
      title,
      message,
      direction: dir,
      amount: parsedAmount,
      currency,
      transactionId: txId ? txId : undefined,
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

function _inferPaymentDirection(fullTextLower: string): 'incoming' | 'outgoing' {
  return _isSentPayment(fullTextLower) ? 'outgoing' : 'incoming';
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

/** Incoming + outgoing + neutral money movement (we exclude only internal account↔account above). */
function _isPaymentIntent(input: string): boolean {
  return _containsAny(input, [
    // English — received
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
    // English — sent
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
    // Arabic — received
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
    // Arabic — sent
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
    // Palestine Bank / local
    'تحويل بنكي',
    'تحويل دفع لصديق',
    'تم بنجاح',
    'بنجاح',
    'عملية ناجحة',
    'إشعار عملية',
    'اشعار عملية',
    'عملية مالية',
    'شيكل',
    'شيقل',
    'نيس',
    'موبايل',
    'بمبلغ',
    // General
    'payment',
    'transfer',
    'deposit',
    'credited',
    'تحويل',
    'ايداع',
    'حوالة',
    'دفعة',
    'مبلغ',
    'عملية',
    'wallet',
    'محفظة',
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
  amount: number;
  currency?: string;
  transactionId?: string;
  direction: 'incoming' | 'outgoing';
} | null {
  const packageLower = (params.packageName || '').toLowerCase();
  const titleLower = (params.title || '').toLowerCase();
  const messageNormalized = _normalizeDigits(params.message || '');
  const messageLower = messageNormalized.toLowerCase();
  const haystack = `${packageLower} ${titleLower} ${messageLower}`;
  const combinedNormalized = _normalizeDigits(`${params.title || ''}\n${params.message || ''}`);

  if (_isExcludedPackage(packageLower)) return null;
  if (_isFalsePositive(haystack)) return null;

  const combinedLower = combinedNormalized.toLowerCase();
  if (_isInternalAccountTransferOnly(combinedLower)) return null;

  const fullText = `${titleLower} ${messageLower}`;
  if (!_isPaymentIntent(fullText)) return null;

  const direction = _inferPaymentDirection(fullText);

  let amountMatch = _amountRegex.exec(combinedNormalized) ?? _amountRegex.exec(messageNormalized);
  if (!amountMatch) {
    amountMatch = _amountAfterMablagRegex.exec(combinedNormalized) ?? _amountAfterMablagRegex.exec(messageNormalized);
  }
  const amount = amountMatch ? _parseAmount(amountMatch[1]) : null;
  if (amount == null || amount <= 0) return null;

  const source =
    _detectSource(packageLower, titleLower, messageLower, haystack) ||
    _inferSourceFallback(packageLower, messageLower);

  let currency: string | undefined;
  if (amountMatch && amountMatch[2]) {
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
    amount,
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
    const { packageName, title, message, receivedAt } = req.body ?? {};
    if (!packageName || !title || !message) {
      res.status(200).json({ success: false, reason: 'Missing fields' });
      return;
    }

    const received = receivedAt ? new Date(receivedAt) : new Date();

    const parsed = _parseAndroidPaymentNotification({
      packageName: String(packageName),
      title: String(title),
      message: String(message),
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

    const txId = parsed.transactionId ? String(parsed.transactionId).trim().toLowerCase() : '';

    if (txId) {
      const existing = await PaymentNotification.findOne({ userId: req.userId, transactionId: txId });
      if (existing) {
        res.status(201).json({ success: true, data: existing });
        return;
      }
    }

    const created = await PaymentNotification.create({
      userId: req.userId,
      source: parsed.source,
      title: parsed.title,
      message: parsed.message,
      direction: parsed.direction,
      amount: parsed.amount,
      currency: parsed.currency,
      transactionId: txId || undefined,
      receivedAt: received,
    });

    res.status(201).json({ success: true, data: created });
    return;
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
