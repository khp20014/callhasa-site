// sw.js — نسخة آمنة بأسلوب "الشبكة أولاً" (network-first)
// الهدف: منع ظهور صفحة بيضاء عالقة عند تحديث الصفحة (خصوصا في Chrome)،
// عن طريق دائما تفضيل جلب أحدث نسخة من الشبكة أولا، والرجوع للكاش فقط
// لو ما كان فيه اتصال بالإنترنت أصلا (وضع عدم الاتصال).
//
// كل مرة ترفع فيها تحديث جديد لهذا الملف نفسه (sw.js)، غيّر رقم النسخة
// بالأسفل (CACHE_NAME) حتى يجبر كل المتصفحات على حذف الكاش القديم
// والتحديث فورا بدون أي التباس.

const CACHE_NAME = 'ahsa-cc-cache-v4';

// نضيف فقط الصفحة الرئيسية للكاش الاحتياطي (وضع عدم الاتصال).
// أي ملفات إضافية (صور/أيقونات) تقدر تضيفها هنا لاحقا لو احتجت.
const OFFLINE_FALLBACK_URLS = ['./', './index.html'];

// ---------- التثبيت: تجهيز كاش احتياطي بسيط ----------
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(OFFLINE_FALLBACK_URLS).catch(() => {
        // لو فشل تحميل أحد الملفات (مثلا الملف غير موجود)، لا نوقف التثبيت كله
      });
    })
  );
  // يفعّل النسخة الجديدة فورا بدون انتظار إغلاق كل التبويبات المفتوحة
  self.skipWaiting();
});

// ---------- التفعيل: حذف أي كاش قديم من نسخة سابقة ----------
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ---------- الجلب: شبكة أولا، وكاش فقط عند عدم الاتصال ----------
self.addEventListener('fetch', (event) => {
  // Cache API يدعم فقط طلبات GET — أي طلب غير ذلك (POST/HEAD/PUT...) نتركه
  // يمر للشبكة مباشرة بدون أي تدخل من عامل الخدمة، لأن محاولة تخزينه بالكاش
  // تسبب خطأ "Failed to execute 'put' on 'Cache'" في الكونسول.
  if (event.request.method !== 'GET') {
    return; // لا event.respondWith هنا = يمر الطلب للشبكة كأن السيرفس وركر مو موجود
  }

  // مهم جدا: أي طلب لموقع/نطاق خارجي (مثل خدمات تحديد الموقع الجغرافي،
  // أو أي API خارجي) نتركه يمر تمامًا بدون أي تدخل من عامل الخدمة. اعتراض
  // طلبات خارجية غالبا يفشل بسبب قيود CORS، وأي تعامل خاطئ مع هذا الفشل هنا
  // يكسر كود الصفحة اللي ينتظر نتيجة ذلك الطلب (وهذا بالضبط ما كان يسبب
  // بقاء شاشة الدخول ولوحة البيانات مخفيتين معا = صفحة بيضاء بالكامل).
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  // نتعامل فقط مع طلبات التنقل (فتح/تحديث الصفحة نفسها) بأسلوب شبكة أولا،
  // حتى نضمن دائما أحدث نسخة من index.html بدل نسخة مخزنة قديمة.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          // نحدّث الكاش الاحتياطي بأحدث نسخة ناجحة، لاستخدامها لاحقا عند انقطاع النت
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone)).catch(() => {});
          return networkResponse;
        })
        .catch(() => {
          // فشل الاتصال بالشبكة: نرجع لآخر نسخة محفوظة، وإلا لصفحة index.html الاحتياطية
          return caches.match(event.request).then(
            (cached) => cached || caches.match('./index.html')
          );
        })
    );
    return;
  }

  // لباقي الملفات (صور/سكربتات ثابتة) من نفس الموقع فقط: كاش أولا مع تحديث بالخلفية
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone)).catch(() => {});
          return networkResponse;
        })
        .catch(() => cached || Response.error());
      return cached || fetchPromise;
    })
  );
});
