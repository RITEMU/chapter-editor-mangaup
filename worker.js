importScripts('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');

self.onmessage = async (e) => {
    const { files, settings } = e.data;
    const zip = new JSZip();
    let remainingCanvas = null;
    let outputIndex = 1;
    let processedFiles = 0;
    
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        self.postMessage({ type: 'log', data: `در حال پردازش فایل: ${file.name}` });
        
        const bitmap = await createImageBitmap(file);
        let width = bitmap.width;
        let height = bitmap.height;
        
        if (width !== settings.width) {
            const ratio = settings.width / width;
            width = settings.width;
            height = Math.round(height * ratio);
        }
        
        const currentCanvas = new OffscreenCanvas(width, height);
        const ctx = currentCanvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0, width, height);
        bitmap.close();
        
        if (remainingCanvas) {
            const combinedHeight = remainingCanvas.height + height;
            const combinedCanvas = new OffscreenCanvas(width, combinedHeight);
            const combinedCtx = combinedCanvas.getContext('2d');
            combinedCtx.drawImage(remainingCanvas, 0, 0);
            combinedCtx.drawImage(currentCanvas, 0, remainingCanvas.height);
            remainingCanvas = combinedCanvas;
        } else {
            remainingCanvas = currentCanvas;
        }
        
        while (remainingCanvas.height >= settings.height) {
            const chunkCanvas = new OffscreenCanvas(width, settings.height);
            const chunkCtx = chunkCanvas.getContext('2d');
            chunkCtx.drawImage(remainingCanvas, 0, 0, width, settings.height, 0, 0, width, settings.height);
            
            const blob = await chunkCanvas.convertToBlob({
                type: `image/${settings.format}`,
                quality: settings.quality
            });
            zip.file(`${String(outputIndex).padStart(3, '0')}.${settings.format}`, blob);
            outputIndex++;
            
            if (remainingCanvas.height > settings.height) {
                const newRemainingCanvas = new OffscreenCanvas(width, remainingCanvas.height - settings.height);
                const newCtx = newRemainingCanvas.getContext('2d');
                newCtx.drawImage(remainingCanvas, 0, settings.height, width, remainingCanvas.height - settings.height, 0, 0, width, remainingCanvas.height - settings.height);
                remainingCanvas = newRemainingCanvas;
            } else {
                remainingCanvas = null;
            }
        }
        
        processedFiles++;
        const progress = (processedFiles / settings.totalFiles) * 100;
        self.postMessage({ type: 'progress', data: progress });
    }
    
    if (remainingCanvas) {
        const blob = await remainingCanvas.convertToBlob({
            type: `image/${settings.format}`,
            quality: settings.quality
        });
        zip.file(`${String(outputIndex).padStart(3, '0')}.${settings.format}`, blob);
    }
    
    self.postMessage({ type: 'log', data: 'در حال ساخت فایل ZIP...' });
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    self.postMessage({
        type: 'result',
        data: { zipBlob, fileName: settings.outputName }
    });
};
