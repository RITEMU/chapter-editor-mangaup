// image-processor.js

// وارد کردن کتابخانه JSZip در Worker
// !!! مسیر 'path/to/jszip.min.js' را با مسیر واقعی فایل JSZip جایگزین کنید !!!
try {
    importScripts('jszip.min.js'); // یا مسیر کامل مثل 'libs/jszip.min.js'
} catch (e) {
    console.error("Failed to import jszip.min.js. Make sure the path is correct.", e);
    // ارسال خطا به main thread در صورت عدم موفقیت در بارگذاری JSZip
    self.postMessage({ type: 'error', message: 'خطا در بارگذاری کتابخانه فشرده‌سازی. مسیر فایل jszip.min.js را بررسی کنید.' });
    // خاتمه دادن به کار Worker چون بدون JSZip نمی‌تواند ادامه دهد
    self.close();
}

// --- توابع کمکی داخل Worker ---

/**
 * بارگذاری یک فایل تصویر با استفاده از createImageBitmap (مناسب برای Worker)
 * @param {File} file - فایل تصویر ورودی
 * @returns {Promise<ImageBitmap>} - قول حاوی ImageBitmap بارگذاری شده
 */
function loadImageBitmap(file) {
    return new Promise((resolve, reject) => {
        createImageBitmap(file)
            .then(bitmap => {
                resolve(bitmap);
            })
            .catch(err => {
                const errorMsg = `Failed to create ImageBitmap for: ${file.name}`;
                console.error(errorMsg, err);
                reject(new Error(errorMsg));
            });
    });
}

/**
 * تغییر اندازه ImageBitmap با حفظ نسبت تصویر با استفاده از OffscreenCanvas (مناسب برای Worker)
 * @param {ImageBitmap} bitmap - بیت‌مپ تصویر ورودی
 * @param {number} targetWidth - عرض هدف برای تغییر اندازه
 * @returns {OffscreenCanvas} - کانواس خارج از صفحه حاوی تصویر تغییر اندازه یافته با حفظ نسبت
 */
function resizeImageBitmap(bitmap, targetWidth) {
    // محاسبه ارتفاع جدید با حفظ نسبت تصویر
    const aspectRatio = bitmap.height / bitmap.width;
    const newHeight = Math.round(targetWidth * aspectRatio); // از targetWidth استفاده کنید

    // استفاده از OffscreenCanvas به جای document.createElement('canvas') در Worker
    const canvas = new OffscreenCanvas(targetWidth, newHeight);
    const ctx = canvas.getContext('2d');

    // رسم بیت‌مپ روی کانواس خارج از صفحه با اندازه جدید
    // ctx.imageSmoothingQuality = "high"; // تنظیم کیفیت در صورت نیاز
    ctx.drawImage(bitmap, 0, 0, targetWidth, newHeight);

    // بیت‌مپ اصلی دیگر لازم نیست
    bitmap.close();

    return canvas; // برگرداندن OffscreenCanvas با اندازه جدید
}


// --- تابع اصلی پردازشگر Worker ---

/**
 * تابع اصلی که پیام‌ها را از Main Thread دریافت و پردازش می‌کند
 * @param {MessageEvent} event - رویداد حاوی داده‌های ارسال شده از Main Thread
 */
self.onmessage = async (event) => {
    // بررسی وجود JSZip پس از importScripts
    if (typeof JSZip === 'undefined') {
         // اگر JSZip بارگذاری نشده باشد، نمی‌توان ادامه داد
         // پیام خطا قبلا ارسال شده است
        return;
    }

    const { files, width, maxHeight, quality, format, chapterName } = event.data;

    if (!files || files.length === 0) {
        self.postMessage({ type: 'error', message: 'هیچ فایلی برای پردازش ارسال نشده است.' });
        return;
    }

     // ارسال پیام شروع پردازش به Main Thread
    self.postMessage({ type: 'progress', value: 0, status: `در حال آماده سازی برای پردازش ${files.length} تصویر...` });

    const resizedImagesData = []; // آرایه‌ای برای نگهداری داده‌های تصاویر تغییر اندازه یافته (کانواس و ارتفاع)
    let totalHeight = 0;
    const totalImages = files.length;
    let processedCount = 0; // شمارنده تصاویر موفق

    // مرحله 1: بارگذاری و تغییر اندازه تصاویر با حفظ نسبت
    for (let i = 0; i < totalImages; i++) {
        const file = files[i];
        // ارسال پیشرفت برای مرحله تغییر اندازه (مثلا 40% اول)
        const progress = (i / totalImages) * 0.4;
        self.postMessage({ type: 'progress', value: progress, status: `در حال تغییر اندازه تصویر ${i + 1} از ${totalImages} (${file.name})` });

        try {
            const bitmap = await loadImageBitmap(file);
            // اطمینان از اینکه عرض هدف از عرض اصلی بزرگتر نیست (اختیاری، بسته به نیاز)
            const actualTargetWidth = Math.min(bitmap.width, width);
            const resizedCanvas = resizeImageBitmap(bitmap, actualTargetWidth);
            resizedImagesData.push({ canvas: resizedCanvas, height: resizedCanvas.height });
            totalHeight += resizedCanvas.height;
            processedCount++;
        } catch (loadImageError) {
            console.error(`Worker: خطا در بارگذاری یا تغییر اندازه تصویر ${file.name}:`, loadImageError);
            // ارسال پیام خطا برای تصویر خاص به Main Thread
            self.postMessage({
                type: 'file_error',
                message: `خطا در پردازش تصویر ${file.name}: ${loadImageError.message}. این تصویر نادیده گرفته شد.`,
                fileName: file.name
            });
            // ادامه به تصویر بعدی
        }
        // افزودن یک تاخیر کوچک برای جلوگیری از اشغال کامل CPU توسط Worker (اختیاری)
        // await new Promise(resolve => setTimeout(resolve, 5));
    }

    // اگر هیچ تصویری با موفقیت پردازش نشد
    if (processedCount === 0) {
        self.postMessage({ type: 'error', message: 'هیچ تصویری با موفقیت پردازش نشد. لطفاً فایل‌ها را بررسی کنید.' });
        return; // پایان کار Worker
    }

    // مرحله 2: ایجاد بخش‌ها از تصاویر تغییر اندازه یافته
    const zip = new JSZip();
    let currentY = 0; // موقعیت عمودی فعلی در کل ارتفاع تصاویر
    let sectionIndex = 0; // ایندکس بخش فعلی

    self.postMessage({ type: 'progress', value: 0.4, status: `در حال ایجاد بخش ها...` });

    while (currentY < totalHeight) {
        sectionIndex++;
        const sectionProgress = 0.4 + ((sectionIndex - 1) / (Math.ceil(totalHeight / maxHeight) || 1)) * 0.5;
        self.postMessage({ type: 'progress', value: sectionProgress, status: `در حال ایجاد بخش ${sectionIndex} از کل` });

        // محاسبه ارتفاع بخش فعلی (حداقل باقی مانده یا maxHeight)
        const currentSectionHeight = Math.min(maxHeight, totalHeight - currentY);

        const sectionCanvas = new OffscreenCanvas(width, currentSectionHeight);
        const ctx = sectionCanvas.getContext('2d');
        let drawY = 0; // موقعیت رسم روی بوم بخش فعلی
        let processedHeightInLoop = 0; // ارتفاع پردازش شده از ابتدای تصاویر در حلقه داخلی

        for (const imageData of resizedImagesData) {
            const imageCanvas = imageData.canvas;
            const imageHeight = imageData.height;

            // محاسبه بخشی از تصویر فعلی که در این بخش قرار می‌گیرد
            const sourceYStart = Math.max(0, currentY - processedHeightInLoop);
            const sourceYEnd = Math.min(imageHeight, currentY + currentSectionHeight - processedHeightInLoop);
            const heightToDraw = sourceYEnd - sourceYStart;

            if (heightToDraw > 0 && drawY < currentSectionHeight) {
                const actualDrawHeight = Math.min(heightToDraw, currentSectionHeight - drawY);
                try {
                    ctx.drawImage(
                        imageCanvas, // OffscreenCanvas منبع
                        0, sourceYStart,
                        imageCanvas.width, actualDrawHeight,
                        0, drawY,
                        width, actualDrawHeight // استفاده از عرض هدف
                    );
                    drawY += actualDrawHeight;
                } catch (drawError) {
                     console.error(`Worker: خطا در رسم بخشی از تصویر روی بوم بخش ${sectionIndex}:`, drawError);
                     self.postMessage({ type: 'error', message: `خطا در حین رسم بخش ${sectionIndex}` });
                     return;
                }
            }
            processedHeightInLoop += imageHeight;
            // اگر بخش فعلی پر شده است، از حلقه داخلی خارج می‌شویم
            if (drawY >= currentSectionHeight) break;
        }

        // تبدیل بوم بخش به Blob و افزودن به زیپ
        const sectionNumber = String(sectionIndex).padStart(3, '0');
        try {
            const blob = await sectionCanvas.convertToBlob({
                type: `image/${format}`,
                quality: quality
            });
            zip.file(`${sectionNumber}.${format}`, blob);
        } catch (blobError) {
             console.error(`Worker: خطا در ایجاد Blob یا افزودن به زیپ برای بخش ${sectionNumber}:`, blobError);
             self.postMessage({ type: 'error', message: `خطا در ذخیره بخش ${sectionNumber}: ${blobError.message}` });
             // توقف پردازش در صورت خطا
             return;
        }

        // به‌روزرسانی موقعیت عمودی برای بخش بعدی
        currentY += currentSectionHeight;

        // افزودن یک تاخیر کوچک برای جلوگیری از اشغال کامل CPU توسط Worker (اختیاری)
        // await new Promise(resolve => setTimeout(resolve, 5));
    }

    // مرحله 3: تولید فایل زیپ نهایی و ارسال به Main Thread
    self.postMessage({ type: 'progress', value: 0.9, status: 'در حال فشرده‌سازی فایل نهایی...' });

    try {
        const zipBlob = await zip.generateAsync({
            type: 'blob',
            compression: "DEFLATE", // الگوریتم فشرده‌سازی
            compressionOptions: {
                level: 6 // سطح فشرده‌سازی (1 تا 9) - 6 معمولا توازن خوبی بین سرعت و حجم دارد
            }
        });

        // ایجاد نام فایل زیپ
        // جایگزینی کاراکترهای نامعتبر در نام فایل
        const safeChapterName = chapterName.replace(/[/\\?%*:|"<>]/g, '-') || 'manga_chapter';
        const zipFileName = `${safeChapterName}.zip`;

        // ارسال Blob نهایی به Main Thread برای دانلود
        self.postMessage({
            type: 'result',
            blob: zipBlob,
            fileName: zipFileName
        });

    } catch (zipError) {
        console.error("Worker: خطا در تولید فایل زیپ:", zipError);
        self.postMessage({ type: 'error', message: `خطا در فشرده‌سازی نهایی: ${zipError.message}` });
    }

    // Worker کار خود را تمام کرده است.
    // نیازی به self.close() نیست مگر اینکه بخواهیم Worker بلافاصله خاتمه یابد.
    // مرورگر معمولاً Worker های بیکار را مدیریت می‌کند.
};

// مدیریت خطاهای احتمالی که خارج از onmessage رخ می‌دهند (مثلا خطای سینتکس در خود Worker)
self.onerror = (error) => {
    console.error("Worker Global Error:", error);
    // ارسال یک پیام خطای عمومی به main thread
    self.postMessage({ type: 'error', message: `یک خطای داخلی در Worker رخ داد: ${error.message}` });
};

console.log("Image Processor Worker loaded and ready."); // برای دیباگ
