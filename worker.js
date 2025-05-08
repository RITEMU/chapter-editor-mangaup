// دریافت داده‌ها از رابط کاربری
self.onmessage = async (e) => {
    const { files, width, height, quality, format, outputName } = e.data;

    // لاگ اولیه
    self.postMessage({ type: 'log', message: 'شروع بارگذاری تصاویر...' });

    // اندازه دسته برای پردازش
    const batchSize = 5;
    const images = [];
    const outputImages = [];
    let currentY = 0;
    let totalHeight = 0;

    // خواندن فایل‌ها به‌صورت دسته‌ای
    for (let i = 0; i < files.length; i += batchSize) {
        const batch = files.slice(i, i + batchSize);
        self.postMessage({ type: 'log', message: `پردازش دسته ${Math.ceil(i / batchSize) + 1} از ${Math.ceil(files.length / batchSize)}` });

        // بارگذاری تصاویر دسته
        const batchImages = [];
        for (let j = 0; j < batch.length; j++) {
            const file = batch[j];
            try {
                const bitmap = await createImageBitmap(file);
                batchImages.push(bitmap);
                self.postMessage({ type: 'log', message: `تصویر ${file.name} بارگذاری شد (${i + j + 1}/${files.length})` });
            } catch (err) {
                self.postMessage({ type: 'log', message: `خطا در بارگذاری تصویر ${file.name}: ${err.message}` });
            }
        }

        // تغییر اندازه تصاویر دسته
        self.postMessage({ type: 'log', message: `تغییر اندازه تصاویر دسته ${Math.ceil(i / batchSize) + 1}` });
        const resizedImages = batchImages.map((img) => {
            try {
                const canvas = new OffscreenCanvas(width, width * img.height / img.width);
                const ctx = canvas.getContext('2d');
                if (!ctx) throw new Error('کانتکست کانواس در دسترس نیست.');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                return canvas;
            } catch (err) {
                self.postMessage({ type: 'log', message: `خطا در تغییر اندازه تصویر: ${err.message}` });
                return null;
            }
        }).filter(img => img !== null);

        // به‌روزرسانی ارتفاع کل
        totalHeight += resizedImages.reduce((sum, img) => sum + img.height, 0);

        // چسباندن تصاویر دسته به یک کانواس موقت
        if (resizedImages.length > 0) {
            const batchHeight = resizedImages.reduce((sum, img) => sum + img.height, 0);
            const batchCanvas = new OffscreenCanvas(width, batchHeight);
            const batchCtx = batchCanvas.getContext('2d');
            let batchY = 0;
            resizedImages.forEach((canvas) => {
                batchCtx.drawImage(canvas, 0, batchY);
                batchY += canvas.height;
            });
            images.push(batchCanvas);
        }
    }

    // چسباندن تمام دسته‌ها به یک کانواس بزرگ
    self.postMessage({ type: 'log', message: 'چسباندن تمام دسته‌ها...' });
    const combinedCanvas = new OffscreenCanvas(width, totalHeight);
    const combinedCtx = combinedCanvas.getContext('2d');
    currentY = 0;
    images.forEach((canvas) => {
        combinedCtx.drawImage(canvas, 0, currentY);
        currentY += canvas.height;
    });

    // برش تصاویر به ارتفاع مشخص
    self.postMessage({ type: 'log', message: 'برش تصاویر...' });
    let startY = 0;
    while (startY < totalHeight) {
        const sliceHeight = Math.min(height, totalHeight - startY);
        try {
            const sliceCanvas = new OffscreenCanvas(width, sliceHeight);
            const sliceCtx = sliceCanvas.getContext('2d');
            sliceCtx.drawImage(combinedCanvas, 0, startY, width, sliceHeight, 0, 0, width, sliceHeight);
            outputImages.push(sliceCanvas);
            startY += height;
        } catch (err) {
            self.postMessage({ type: 'log', message: `خطا در برش تصویر: ${err.message}` });
        }
    }

    // تبدیل به فرمت خروجی و ساخت ZIP
    self.postMessage({ type: 'log', message: 'ایجاد فایل خروجی...' });
    const zip = new JSZip();
    for (let i = 0; i < outputImages.length; i++) {
        try {
            const canvas = outputImages[i];
            const blob = await canvas.convertToBlob({ type: `image/${format}`, quality: quality });
            zip.file(`page_${String(i + 1).padStart(3, '0')}.${format}`, blob);
            self.postMessage({ type: 'log', message: `صفحه ${i + 1} به فایل زیپ اضافه شد.` });
        } catch (err) {
            self.postMessage({ type: 'log', message: `خطا در تبدیل صفحه ${i + 1}: ${err.message}` });
        }
    }

    try {
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(zipBlob);
        self.postMessage({
            type: 'result',
            data: { url: url, name: `${outputName}.zip` }
        });
    } catch (err) {
        self.postMessage({ type: 'log', message: `خطا در ایجاد فایل زیپ: ${err.message}` });
    }
};

// اضافه کردن JSZip به Worker
importScripts('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.7.1/jszip.min.js');
