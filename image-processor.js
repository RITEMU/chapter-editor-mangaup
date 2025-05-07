// image-processor.js

// وارد کردن کتابخانه JSZip در Worker
// !!! مسیر 'path/to/jszip.min.js' را با مسیر واقعی فایل JSZip جایگزین کنید !!!
try {
    importScripts('jszip.min.js'); // یا مسیر کامل مثل 'libs/jszip.min.js'
} catch (e) {
    console.error("Failed to import jszip.min.js. Make sure the path is correct.", e);
    self.postMessage({ type: 'error', message: 'خطا در بارگذاری کتابخانه فشرده‌سازی. مسیر فایل jszip.min.js را بررسی کنید.' });
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
 * تغییر اندازه ImageBitmap با استفاده از OffscreenCanvas (مناسب برای Worker)
 * @param {ImageBitmap} bitmap - بیت‌مپ تصویر ورودی
 * @param {number} targetWidth - عرض هدف برای تغییر اندازه
 * @returns {OffscreenCanvas} - کانواس خارج از صفحه حاوی تصویر تغییر اندازه یافته
 */
function resizeImageBitmap(bitmap, targetWidth) {
    // محاسبه نسبت ابعاد برای حفظ تناسب تصویر
    const aspectRatio = bitmap.height / bitmap.width;
    // عرض هدف را محدود می‌کنیم تا از بزرگ شدن بیش از حد تصویر جلوگیری شود
    const actualTargetWidth = Math.min(bitmap.width, targetWidth);
    // محاسبه ارتفاع جدید بر اساس نسبت ابعاد
    const newHeight = Math.round(actualTargetWidth * aspectRatio);

    // ایجاد کانواس با ابعاد جدید
    const canvas = new OffscreenCanvas(actualTargetWidth, newHeight);
    const ctx = canvas.getContext('2d');

    // رسم تصویر با حفظ نسبت ابعاد
    ctx.drawImage(bitmap, 0, 0, actualTargetWidth, newHeight);

    // آزادسازی حافظه بیت‌مپ اگر دیگر نیازی به آن نداریم
    bitmap.close();

    return canvas;
}

// --- تابع اصلی پردازشگر Worker ---

/**
 * تابع اصلی که پیام‌ها را از Main Thread دریافت و پردازش می‌کند
 * @param {MessageEvent} event - رویداد حاوی داده‌های ارسال شده از Main Thread
 */
self.onmessage = async (event) => {
    if (typeof JSZip === 'undefined') {
        return;
    }

    const { files, width, maxHeight, quality, format, chapterName } = event.data;

    if (!files || files.length === 0) {
        self.postMessage({ type: 'error', message: 'هیچ فایلی برای پردازش ارسال نشده است.' });
        return;
    }

    self.postMessage({ type: 'progress', value: 0, status: `در حال آماده‌سازی برای پردازش ${files.length} تصویر...` });

    const resizedCanvases = [];
    let totalHeight = 0;
    const totalImages = files.length;
    let processedCount = 0;

    // مرحله 1: بارگذاری و تغییر اندازه تصاویر
    for (let i = 0; i < totalImages; i++) {
        const file = files[i];
        const progress = (i / totalImages) * 0.5;
        self.postMessage({ type: 'progress', value: progress, status: `در حال تغییر اندازه تصویر ${i + 1} از ${totalImages} (${file.name})` });

        try {
            const bitmap = await loadImageBitmap(file);
            const resizedCanvas = resizeImageBitmap(bitmap, width);
            resizedCanvases.push(resizedCanvas);
            totalHeight += resizedCanvas.height;
            processedCount++;
        } catch (loadImageError) {
            console.error(`Worker: خطا در بارگذاری یا تغییر اندازه تصویر ${file.name}:`, loadImageError);
            self.postMessage({
                type: 'file_error',
                message: `خطا در پردازش تصویر ${file.name}: ${loadImageError.message}. این تصویر نادیده گرفته شد.`,
                fileName: file.name
            });
        }
    }

    if (processedCount === 0) {
        self.postMessage({ type: 'error', message: 'هیچ تصویری با موفقیت پردازش نشد. لطفاً فایل‌ها را بررسی کنید.' });
        return;
    }

    // مرحله 2: ایجاد بخش‌ها و فایل زیپ
    const zip = new JSZip();
    const numFullSections = Math.floor(totalHeight / maxHeight);
    const remainingHeight = totalHeight % maxHeight;
    let currentY = 0;
    const totalSections = numFullSections + (remainingHeight > 0 ? 1 : 0);
    self.postMessage({ type: 'progress', value: 0.5, status: `در حال ایجاد ${totalSections} بخش...` });

    // ایجاد بخش‌های کامل
    for (let section = 0; section < numFullSections; section++) {
        const sectionProgress = 0.5 + ((section + 1) / totalSections) * 0.5;
        self.postMessage({ type: 'progress', value: sectionProgress, status: `در حال ایجاد بخش ${section + 1} از ${totalSections}` });

        const sectionCanvas = new OffscreenCanvas(width, maxHeight);
        const ctx = sectionCanvas.getContext('2d');
        let drawY = 0;
        let processedHeightInLoop = 0;

        for (const canvas of resizedCanvases) {
            const sourceYStart = Math.max(0, currentY - processedHeightInLoop);
            const sourceYEnd = Math.min(canvas.height, currentY + maxHeight - processedHeightInLoop);
            const heightToDraw = sourceYEnd - sourceYStart;

            if (heightToDraw > 0 && drawY < maxHeight) {
                const actualDrawHeight = Math.min(heightToDraw, maxHeight - drawY);
                try {
                    // رسم تصویر با حفظ عرض هدف و ارتفاع متناسب
                    ctx.drawImage(
                        canvas,
                        0, sourceYStart,
                        canvas.width, actualDrawHeight,
                        0, drawY,
                        width, actualDrawHeight
                    );
                    drawY += actualDrawHeight;
                } catch (drawError) {
                    console.error(`Worker: خطا در رسم بخشی از تصویر روی بوم بخش ${section + 1}:`, drawError);
                    self.postMessage({ type: 'error', message: `خطا در حین رسم بخش ${section + 1}` });
                    return;
                }
            }
            processedHeightInLoop += canvas.height;
            if (drawY >= maxHeight) break;
        }

        // تبدیل بوم بخش به Blob
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
            return;
        }

        currentY += maxHeight;
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
            compression: "DEFLATE",
            compressionOptions: {
                level: 6
            }
        });

        const safeChapterName = chapterName.replace(/[/\\?%*:|"<>]/g, '-') || 'manga_chapter';
        const zipFileName = `${safeChapterName}.zip`;

        self.postMessage({
            type: 'result',
            blob: zipBlob,
            fileName: zipFileName
        });
    } catch (zipError) {
        console.error("Worker: خطا در تولید فایل زیپ:", zipError);
        self.postMessage({ type: 'error', message: `خطا در فشرده‌سازی نهایی: ${zipError.message}` });
    }
};

// مدیریت خطاهای احتمالی که خارج از onmessage رخ می‌دهند
self.onerror = (error) => {
    console.error("Worker Global Error:", error);
    self.postMessage({ type: 'error', message: `یک خطای داخلی در Worker رخ داد: ${error.message}` });
};

console.log("Image Processor Worker loaded and ready.");
