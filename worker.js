self.onmessage = async (e) => {
    const { images, settings } = e.data;
    let processedImages = [];
    let currentCanvas = null;
    let currentHeight = 0;
    let imageCounter = 1;

    // Helper to send progress
    function sendProgress(percent) {
        self.postMessage({ type: 'progress', data: percent });
    }

    // Helper to send log
    function sendLog(message) {
        self.postMessage({ type: 'log', data: message });
    }

    // Process each image
    for (let i = 0; i < images.length; i++) {
        const imgBlob = images[i];
        sendLog(`در حال پردازش تصویر ${i + 1} از ${images.length}`);
        sendProgress((i / images.length) * 100 * 0.8);

        // Load image
        const img = await createImageBitmap(imgBlob);

        // Resize image to target width while maintaining aspect ratio
        const targetWidth = settings.width;
        const aspectRatio = img.width / img.height;
        const targetHeight = Math.round(targetWidth / aspectRatio);

        let canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        let ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

        let remainingHeight = targetHeight;
        let offsetY = 0;

        while (remainingHeight > 0) {
            if (currentCanvas === null) {
                currentCanvas = document.createElement('canvas');
                currentCanvas.width = targetWidth;
                currentCanvas.height = Math.min(settings.height, remainingHeight);
                currentHeight = currentCanvas.height;
                let currentCtx = currentCanvas.getContext('2d');
                currentCtx.drawImage(canvas, 0, offsetY, targetWidth, currentCanvas.height, 0, 0, targetWidth, currentCanvas.height);
            } else {
                let spaceLeft = settings.height - currentHeight;
                if (spaceLeft > 0) {
                    let heightToAdd = Math.min(spaceLeft, remainingHeight);
                    let currentCtx = currentCanvas.getContext('2d');
                    currentCtx.drawImage(canvas, 0, offsetY, targetWidth, heightToAdd, 0, currentHeight, targetWidth, heightToAdd);
                    currentHeight += heightToAdd;
                }
            }

            if (currentHeight >= settings.height) {
                const format = settings.format === 'jpeg' ? 'image/jpeg' : settings.format === 'webp' ? 'image/webp' : 'image/png';
                const dataUrl = currentCanvas.toDataURL(format, settings.quality);
                const binary = atob(dataUrl.split(',')[1]);
                const array = new Uint8Array(binary.length);
                for (let j = 0; j < binary.length; j++) {
                    array[j] = binary.charCodeAt(j);
                }
                processedImages.push(array);
                sendLog(`تصویر خروجی ${String(imageCounter).padStart(3, '0')} ذخیره شد.`);
                imageCounter++;
                currentCanvas = null;
                currentHeight = 0;
            }

            offsetY += currentHeight;
            remainingHeight -= currentHeight;
        }
    }

    // Save remaining canvas if exists
    if (currentCanvas !== null) {
        const format = settings.format === 'jpeg' ? 'image/jpeg' : settings.format === 'webp' ? 'image/webp' : 'image/png';
        const dataUrl = currentCanvas.toDataURL(format, settings.quality);
        const binary = atob(dataUrl.split(',')[1]);
        const array = new Uint8Array(binary.length);
        for (let j = 0; j < binary.length; j++) {
            array[j] = binary.charCodeAt(j);
        }
        processedImages.push(array);
        sendLog(`تصویر خروجی ${String(imageCounter).padStart(3, '0')} ذخیره شد.`);
    }

    sendProgress(100);
    self.postMessage({ type: 'result', data: processedImages });
};
