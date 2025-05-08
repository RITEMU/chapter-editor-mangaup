// اضافه کردن JSZip به Worker
importScripts('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.7.1/jszip.min.js');

// دریافت داده‌ها از رابط کاربری
self.onmessage = async (e) => {
    try {
        self.postMessage({ type: 'log', message: 'دریافت داده‌ها از رابط کاربری...' });
        const { files, width, height, quality, format, outputName } = e.data;

        // بررسی صحت داده‌های ورودی
        if (!files || files.length === 0) {
            throw new Error('هیچ فایلی برای پردازش دریافت نشد.');
        }
        if (!width || !height || width <= 0 || height <= 0) {
            throw new Error('ابعاد تصویر نامعتبر است.');
        }
        if (!format || !['jpeg', 'png', 'webp'].includes(format)) {
            throw new Error('فرمت خروجی پشتیبانی نمی‌شود.');
        }
        if (quality < 0 || quality > 1) {
            throw new Error('کیفیت تصویر باید بین 0 و 1 باشد.');
        }

        self.postMessage({ type: 'log', message: 'داده‌های ورودی با موفقیت دریافت و بررسی شدند.' });

        // خواندن فایل‌ها به‌صورت ArrayBuffer
        const images = [];
        self.postMessage({ type: 'log', message: 'شروع بارگذاری تصاویر...' });
        for (let i = 0; i < files.length; i++) {
            try {
                const file = files[i];
                if (!file) {
                    throw new Error(`فایل شماره ${i + 1} نامعتبر است.`);
                }
                self.postMessage({ type: 'log', message: `در حال بارگذاری تصویر ${file.name} (${i + 1}/${files.length})...` });
                const bitmap = await createImageBitmap(file);
                images.push(bitmap);
                self.postMessage({ type: 'log', message: `تصویر ${file.name} با موفقیت بارگذاری شد (${i + 1}/${files.length}).` });
            } catch (error) {
                self.postMessage({ type: 'error', message: `خطا در بارگذاری تصویر شماره ${i + 1}: ${error.message}` });
                throw new Error(`بارگذاری تصویر شماره ${i + 1} ناموفق بود.`);
            }
        }

        // تغییر اندازه تصاویر
        self.postMessage({ type: 'log', message: 'شروع تغییر اندازه تصاویر...' });
        const resizedImages = [];
        for (let i = 0; i < images.length; i++) {
            try {
                const img = images[i];
                const canvas = new OffscreenCanvas(width, width * img.height / img.width);
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    throw new Error(`ایجاد زمینه نقاشی برای تصویر شماره ${i + 1} ناموفق بود.`);
                }
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                resizedImages.push(canvas);
                self.postMessage({ type: 'log', message: `تصویر شماره ${i + 1} با موفقیت تغییر اندازه داده شد.` });
            } catch (error) {
                self.postMessage({ type: 'error', message: `خطا در تغییر اندازه تصویر شماره ${i + 1}: ${error.message}` });
                throw new Error(`تغییر اندازه تصویر شماره ${i + 1} ناموفق بود.`);
            }
        }

        // چسباندن تصاویر
        self.postMessage({ type: 'log', message: 'شروع چسباندن تصاویر...' });
        let totalHeight = 0;
        try {
            totalHeight = resizedImages.reduce((sum, img) => sum + img.height, 0);
            if (totalHeight <= 0) {
                throw new Error('ارتفاع کل تصاویر نامعتبر است.');
            }
            const combinedCanvas = new OffscreenCanvas(width, totalHeight);
            const combinedCtx = combinedCanvas.getContext('2d');
            if (!combinedCtx) {
                throw new Error('ایجاد زمینه نقاشی برای تصویر ترکیبی ناموفق بود.');
            }
            let currentY = 0;
            resizedImages.forEach((canvas, index) => {
                combinedCtx.drawImage(canvas, 0, currentY);
                currentY += canvas.height;
                self.postMessage({ type: 'log', message: `تصویر شماره ${index + 1} به تصویر ترکیبی اضافه شد.` });
            });
            self.postMessage({ type: 'log', message: 'چسباندن تصاویر با موفقیت انجام شد.' });
        } catch (error) {
            self.postMessage({ type: 'error', message: `خطا در چسباندن تصاویر: ${error.message}` });
            throw new Error('چسباندن تصاویر ناموفق بود.');
        }

        // برش تصاویر به ارتفاع مشخص
        self.postMessage({ type: 'log', message: 'شروع برش تصاویر...' });
        const outputImages = [];
        try {
            let startY = 0;
            while (startY < totalHeight) {
                const sliceHeight = Math.min(height, totalHeight - startY);
                const sliceCanvas = new OffscreenCanvas(width, sliceHeight);
                const sliceCtx = sliceCanvas.getContext('2d');
                if (!sliceCtx) {
                    throw new Error(`ایجاد زمینه نقاشی برای برش در موقعیت ${startY} ناموفق بود.`);
                }
                sliceCtx.drawImage(combinedCanvas, 0, startY, width, sliceHeight, 0, 0, width, sliceHeight);
                outputImages.push(sliceCanvas);
                self.postMessage({ type: 'log', message: `برش در موقعیت ${startY} با موفقیت انجام شد.` });
                startY += height;
            }
            if (outputImages.length === 0) {
                throw new Error('هیچ برشی ایجاد نشد.');
            }
            self.postMessage({ type: 'log', message: 'برش تصاویر با موفقیت به پایان رسید.' });
        } catch (error) {
            self.postMessage({ type: 'error', message: `خطا در برش تصاویر: ${error.message}` });
            throw new Error('برش تصاویر ناموفق بود.');
        }

        // تبدیل به فرمت خروجی و ساخت ZIP
        self.postMessage({ type: 'log', message: 'شروع ایجاد فایل خروجی...' });
        try {
            const zip = new JSZip();
            for (let i = 0; i < outputImages.length; i++) {
                try {
                    const canvas = outputImages[i];
                    const blob = await canvas.convertToBlob({ type: `image/${format}`, quality: quality });
                    zip.file(`page_${String(i + 1).padStart(3, '0')}.${format}`, blob);
                    self.postMessage({ type: 'log', message: `صفحه ${i + 1} به فایل ZIP اضافه شد.` });
                } catch (error) {
                    self.postMessage({ type: 'error', message: `خطا در تبدیل صفحه ${i + 1} به Blob: ${error.message}` });
                    throw new Error(`تبدیل صفحه ${i + 1} ناموفق بود.`);
                }
            }

            self.postMessage({ type: 'log', message: 'در حال تولید فایل ZIP...' });
            const zipBlob = await zip.generateAsync({ type: 'blob' });
            const url = URL.createObjectURL(zipBlob);
            self.postMessage({ type: 'log', message: 'فایل ZIP با موفقیت تولید شد.' });

            self.postMessage({
                type: 'result',
                data: { url: url, name: `${outputName}.zip` }
            });
        } catch (error) {
            self.postMessage({ type: 'error', message: `خطا در ایجاد فایل خروجی: ${error.message}` });
            throw new Error('ایجاد فایل خروجی ناموفق بود.');
        }
    } catch (error) {
        self.postMessage({ type: 'error', message: `خطای کلی در پردازش: ${error.message}` });
    }
};
