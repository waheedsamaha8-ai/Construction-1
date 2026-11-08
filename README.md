<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# مدير مشروعات التشييد برو (Construction Manager Pro)

نظام إدارة المشروعات الهندسي المتكامل مع دعم الذكاء الاصطناعي من Google Gemini.

## التشغيل محلياً (Run Locally)

**المتطلبات:**  Node.js

1. تثبيت الحزم:
   `npm install`

2. إعداد مفتاح الذكاء الاصطناعي:
   - قم بإنشاء ملف باسم `.env` في المجلد الرئيسي للمشروع.
   - أضف مفتاح API الخاص بك من Google AI Studio (يبدأ بـ `AIza...`) بالشكل التالي:
     ```env
     API_KEY=AIzaSyxxxxxxxxxxxxxxxxxxxxxxxxxxxx
     ```
   - يمكنك الحصول على مفتاح مجاني من: [Google AI Studio](https://aistudio.google.com/)

3. تشغيل التطبيق:
   `npm run dev`

## المميزات الرئيسية
- **الذكاء الاصطناعي:** تحليل مستندات، صور، وتقارير تربة باستخدام Gemini 3 Pro.
- **إدارة الملفات:** رفع وتنظيم الملفات وربطها بـ Google Drive.
- **الحاسبة الذكية:** حصر كميات وتسعير بنود فوري.
- **الخرائط:** تتبع مواقع المشاريع الجغرافية.
- **التقارير:** إنشاء تقارير يومية وخطابات رسمية وتصديرها PDF.
