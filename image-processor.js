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
        // createImageBitmap به صورت غیرهمزمان یک ImageBitmap از منبع تصویر ایجاد می‌کند.
        // این روش برای Worker ها بهینه‌تر از new Image() و createObjectURL است.
        createImageBitmap(file)
            .then(bitmap => {
                resolve(bitmap);
            })
            .catch(err => {
                const errorMsg = `Failed to create ImageBitmap for: ${file.name}`;
                console.error(errorMsg, err);
                reject(new Error(errorMsg));
            });

        // نکته: تایم‌اوت دستی معمولاً با createImageBitmap لازم نیست،
        // چون مرورگر مدیریت بهتری روی منابع دارد، اما اگر نیاز بود می‌توان اضافه کرد.
    });
}

/**
 * تغییر اندازه ImageBitmap با استفاده از OffscreenCanvas (مناسب برای Worker)
 * @param {ImageBitmap} bitmap - بیت‌مپ تصویر ورودی
 * @param {number} targetWidth - عرض هدف برای تغییر اندازه
 * @returns {OffscreenCanvas} - کانواس خارج از صفحه حاوی تصویر تغییر اندازه یافته
 */
function resizeImageBitmap(bitmap, targetWidth) {
    // ممکن است تصویر اصلی کوچکتر از عرض هدف باشد، در این صورت بزرگ نمی‌کنیم
    const actualTargetWidth = Math.min(bitmap.width, targetWidth);
    const aspectRatio = bitmap.height / bitmap.width;
    const newHeight = Math.round(actualTargetWidth * aspectRatio);

    // استفاده از OffscreenCanvas به جای document.createElement('canvas') در Worker
    const canvas = new OffscreenCanvas(actualTargetWidth, newHeight);
    const ctx = canvas.getContext('2d');

    // رسم بیت‌مپ روی کانواس خارج از صفحه
    // ctx.imageSmoothingQuality = "high"; // تنظیم کیفیت در صورت نیاز
    ctx.drawImage(bitmap, 0, 0, actualTargetWidth, newHeight);

    // ImageBitmap ها توسط مرورگر مدیریت حافظه می‌شوند.
    // نیازی به revokeObjectURL نیست. می‌توانیم bitmap.close() را فراخوانی کنیم
    // اگر مطمئن باشیم دیگر به آن نیازی نیست، اما معمولا لازم نیست.
    // bitmap.close(); // در صورت نیاز به آزادسازی حافظه زودتر

    return canvas; // برگرداندن OffscreenCanvas
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

    const resizedCanvases = []; // آرایه‌ای برای نگهداری کانواس‌های تغییر اندازه یافته (OffscreenCanvas)
    let totalHeight = 0;
    const totalImages = files.length;
    let processedCount = 0; // شمارنده تصاویر موفق

    // مرحله 1: بارگذاری و تغییر اندازه تصاویر
    for (let i = 0; i < totalImages; i++) {
        const file = files[i];
        // ارسال پیشرفت برای مرحله تغییر اندازه (مثلا 50% اول)
        const progress = (i / totalImages) * 0.5;
        self.postMessage({ type: 'progress', value: progress, status: `در حال تغییر اندازه تصویر ${i + 1} از ${totalImages} (${file.name})` });

        try {
            const bitmap = await loadImageBitmap(file);
            const resizedCanvas = resizeImageBitmap(bitmap, width);
            resizedCanvases.push(resizedCanvas);
            totalHeight += resizedCanvas.height;
            processedCount++;
            // بستن بیت‌مپ اگر دیگر لازم نیست (اختیاری)
             bitmap.close();
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

    // مرحله 2: ایجاد بخش‌ها و فایل زیپ
    const zip = new JSZip();
    const numFullSections = Math.floor(totalHeight / maxHeight);
    const remainingHeight = totalHeight % maxHeight;
    let currentY = 0; // موقعیت عمودی فعلی

    const totalSections = numFullSections + (remainingHeight > 0 ? 1 : 0);
    self.postMessage({ type: 'progress', value: 0.5, status: `در حال ایجاد ${totalSections} بخش...` });

    // ایجاد بخش‌های کامل
    for (let section = 0; section < numFullSections; section++) {
        const sectionProgress = 0.5 + ((section + 1) / totalSections) * 0.5;
        self.postMessage({ type: 'progress', value: sectionProgress, status: `در حال ایجاد بخش ${section + 1} از ${totalSections}` });

        const sectionCanvas = new OffscreenCanvas(width, maxHeight);
        const ctx = sectionCanvas.getContext('2d');
        let drawY = 0; // موقعیت رسم روی بوم بخش فعلی
        let processedHeightInLoop = 0; // ارتفاع پردازش شده در حلقه داخلی

        for (const canvas of resizedCanvases) {
            const sourceYStart = Math.max(0, currentY - processedHeightInLoop);
            const sourceYEnd = Math.min(canvas.height, currentY + maxHeight - processedHeightInLoop);
            const heightToDraw = sourceYEnd - sourceYStart;

            if (heightToDraw > 0 && drawY < maxHeight) {
                const actualDrawHeight = Math.min(heightToDraw, maxHeight - drawY);
                try {
                    ctx.drawImage(
                        canvas, // OffscreenCanvas منبع
                        0, sourceYStart,
                        canvas.width, actualDrawHeight,
                        0, drawY,
                        width, actualDrawHeight
                    );
                    drawY += actualDrawHeight;
                } catch (drawError) {
                     console.error(`Worker: خطا در رسم بخشی از تصویر روی بوم بخش ${section + 1}:`, drawError);
                     self.postMessage({ type: 'error', message: `خطا در حین رسم بخش ${section + 1}` });
                     // شاید بهتر باشد در صورت بروز خطا، کار را متوقف کنیم
                     return;
                }
            }
            processedHeightInLoop += canvas.height;
            if (drawY >= maxHeight) break;
        }

        // تبدیل بوم بخش به Blob با استفاده از convertToBlob (برای OffscreenCanvas)
        const sectionNumber = String(section + 1).padStart(3, '0');
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

        currentY += maxHeight;
         // await new Promise(resolve => setTimeout(resolve, 5)); // تاخیر اختیاری
    }

    // ایجاد بخش آخر (اگر ارتفاع باقی‌مانده وجود دارد)
    if (remainingHeight > 0) {
        const finalSectionIndex = numFullSections;
        self.postMessage({ type: 'progress', value: 1.0, status: `در حال ایجاد بخش نهایی (${finalSectionIndex + 1})` });

        const sectionCanvas = new OffscreenCanvas(width, remainingHeight);
        const ctx = sectionCanvas.getContext('2d');
        let drawY = 0;
        let processedHeightInLoop = 0;

        for (const canvas of resizedCanvases) {
            const sourceYStart = Math.max(0, currentY - processedHeightInLoop);
            // استفاده از remainingHeight به جای maxHeight
            const sourceYEnd = Math.min(canvas.height, currentY + remainingHeight - processedHeightInLoop);
            const heightToDraw = sourceYEnd - sourceYStart;

            if (heightToDraw > 0 && drawY < remainingHeight) {
                const actualDrawHeight = Math.min(heightToDraw, remainingHeight - drawY);
                 try {
                    ctx.drawImage(
                        canvas,
                        0, sourceYStart,
                        canvas.width, actualDrawHeight,
                        0, drawY,
                        width, actualDrawHeight
                    );
                    drawY += actualDrawHeight;
                 } catch (drawError) {
                     console.error(`Worker: خطا در رسم بخشی از تصویر روی بوم بخش نهایی:`, drawError);
                     self.postMessage({ type: 'error', message: `خطا در حین رسم بخش نهایی` });
                     return;
                 }
            }
            processedHeightInLoop += canvas.height;
            if (drawY >= remainingHeight) break;
        }

        // تبدیل بوم بخش نهایی به Blob و افزودن به زیپ
        const sectionNumber = String(finalSectionIndex + 1).padStart(3, '0');
         try {
            const blob = await sectionCanvas.convertToBlob({
                type: `image/${format}`,
                quality: quality
            });
            zip.file(`${sectionNumber}.${format}`, blob);
        } catch (blobError) {
             console.error(`Worker: خطا در ایجاد Blob یا افزودن به زیپ برای بخش نهایی (${sectionNumber}):`, blobError);
             self.postMessage({ type: 'error', message: `خطا در ذخیره بخش نهایی (${sectionNumber}): ${blobError.message}` });
             return;
        }
    }

    // مرحله 3: تولید فایل زیپ نهایی و ارسال به Main Thread
    self.postMessage({ type: 'progress', value: 1.0, status: 'در حال فشرده‌سازی فایل نهایی...' });

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
        const zipFileName = `${safeChapterName}_${width}px.${format}.zip`;

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
