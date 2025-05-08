// دریافت داده‌ها از رابط کاربری
self.onmessage = async (e) => {
    const { files, width, height, quality, format, outputName } = e.data;

    // لاگ اولیه
    self.postMessage({ type: 'log', message: 'شروع بارگذاری تصاویر...' });

    // خواندن فایل‌ها به‌صورت ArrayBuffer
    const images = [];
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const bitmap = await createImageBitmap(file);
        images.push(bitmap);
        self.postMessage({ type: 'log', message: `تصویر ${file.name} بارگذاری شد (${i + 1}/${files.length})` });
    }

    // تغییر اندازه تصاویر
    self.postMessage({ type: 'log', message: 'تغییر اندازه تصاویر...' });
    const resizedImages = images.map((img) => {
        const canvas = new OffscreenCanvas(width, width * img.height / img.width);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        return canvas;
    });

    // چسباندن تصاویر
    self.postMessage({ type: 'log', message: 'چسباندن تصاویر...' });
    const totalHeight = resizedImages.reduce((sum, img) => sum + img.height, 0);
    const combinedCanvas = new OffscreenCanvas(width, totalHeight);
    const combinedCtx = combinedCanvas.getContext('2d');
    let currentY = 0;
    resizedImages.forEach((canvas) => {
        combinedCtx.drawImage(canvas, 0, currentY);
        currentY += canvas.height;
    });

    // برش تصاویر به ارتفاع مشخص
    self.postMessage({ type: 'log', message: 'برش تصاویر...' });
    const outputImages = [];
    let startY = 0;
    while (startY < totalHeight) {
        const sliceHeight = Math.min(height, totalHeight - startY);
        const sliceCanvas = new OffscreenCanvas(width, sliceHeight);
        const sliceCtx = sliceCanvas.getContext('2d');
        sliceCtx.drawImage(combinedCanvas, 0, startY, width, sliceHeight, 0, 0, width, sliceHeight);
        outputImages.push(sliceCanvas);
        startY += height;
    }

    // تبدیل به فرمت خروجی و ساخت ZIP
    self.postMessage({ type: 'log', message: 'ایجاد فایل خروجی...' });
    const zip = new JSZip();
    for (let i = 0; i < outputImages.length; i++) {
        const canvas = outputImages[i];
        const blob = await canvas.convertToBlob({ type: `image/${format}`, quality: quality });
        zip.file(`page_${String(i + 1).padStart(3, '0')}.${format}`, blob);
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);

    self.postMessage({
        type: 'result',
        data: { url: url, name: `${outputName}.zip` }
    });
};

// اضافه کردن JSZip به Worker
importScripts('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.7.1/jszip.min.js');
